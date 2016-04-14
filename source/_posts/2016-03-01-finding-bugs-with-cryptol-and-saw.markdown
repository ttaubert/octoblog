---
layout: post
title: "Finding bugs with Cryptol and SAW"
subtitle: "Using formal verification for fun and profit"
date: 2016-03-01 12:00:00 +0100
published: false
---

A colleague of mine recently stumbled upon a rather old piece of code in our
code base. After fixing a small issue reported by a static analyzer he went on
and found a few more bugs just by staring at the code for a while.

This post takes said piece of code and pretends we didn't know about any of
these bugs just yet. The goal is to use formal verification to see whether
we could have identified these issues guided by a [Cryptol](http://www.cryptol.net/)
reference implementation and the [Software Analysis Workbench](http://saw.galois.com/).

## The suspect

The piece of code in question is a function that given a UTF-16 string returns
the number of bytes this string will occupy after conversion to UTF-8. One
could use this function for example to determine the size of the target buffer
before converting UTF-16 into UTF-8.

{% codeblock lang:cpp %}
uint32_t utf16_to_utf8_len(uint8_t *buf, uint32_t len)
{
  uint32_t i, out = 0;

  for (i = 0; i < len; i += 2) {
    if (buf[i] == 0x00 && (buf[i+1] & 0x80) == 0x00) {
      out += 1; // One-byte code point.
    } else if (buf[i] < 0x08) {
      out += 2; // Two-byte code point.
    } else if ((buf[i] & 0xDC) == 0xD8) {
      if ((buf[i+2] & 0xDC) == 0xDC && (len - i) > 2) {
        i += 2;
        out += 4; // Surrogate.
      } else {
        return 0; // Invalid encoding.
      }
    } else {
      out += 3; // Three-byte code point.
    }
  }

  return out;
}
{% endcodeblock %}

UTF-16 is an encoding with code units of either 16 or 32 bits length, whereas
UTF-8 is a tad more flexible with code units of 8, 16, 24, or 32 bits.
32-bit code units in UTF-16 are called [surrogate pairs](https://unicodebook.readthedocs.org/unicode_encodings.html#surrogates)
and represent single characters that can't be represented by only 16 bits. We don't
really need to know how these are encoded, properly detecting surrogates is
sufficient.

## The reference implementation

We ignore the C code for now and start with the reference implementation. I'll
try to explain a few things about Cryptol as we go but please refer to the
[documentation](http://www.cryptol.net/files/ProgrammingCryptol.pdf)
if something is unclear.

In general, it might be a good idea to create the reference implementation from
scratch, if possible written by a developer other than the one who wrote or will
write the C implementation. That's basically what happens here, even if I am a
few years late to the party.

### Checking for valid UTF-16

Let's begin with a simple validity check, we want our final function to return
early if it encounters an invalid UTF-16 encoding. All code units are
numerically equal to their corresponding code points, except for the range
[U+D800 to U+DFFF](https://en.wikipedia.org/wiki/UTF-16#U.2BD800_to_U.2BDFFF).
It is used to represent code points from [supplementary planes](https://en.wikipedia.org/wiki/Plane_%28Unicode%29)
by encoding them as two 16-bit units, called surrogate pairs. The first unit is
called the high surrogate, the second the low surrogate. We will use
`is_hi_surrogate` and `is_lo_surrogate` to detect these.

{% codeblock lang:cry %}
is_hi_surrogate x = (x && 0xFC00) == 0xD800
is_lo_surrogate x = (x && 0xFC00) == 0xDC00

check_utf16 xs = if is_lo_surrogate (xs @ 0).0 then False else (ys ! 0)
    where ys = [True] # [ y && check x | x <- xs | y <- ys ]
          check (x, y) = is_hi_surrogate x == is_lo_surrogate y
{% endcodeblock %}

`check_utf16` takes a sequence of tuples with two 16-bit numbers. We have to
check the first member of the first element in the sequence, accessed through
`(xs @ 0).0`, and ensure it is not a low surrogate. Afterwards we can simply
check pairs of 16-bit units. Please note that the pairs overlap, i.e. the UTF-16
sequence `[0x0001, 0x0002, 0x0003]` must be transformed into
`[(0x0001, 0x0002), (0x0002, 0x0003)]` before we can pass it to `check_utf16`.
We'll see how to do that in a minute.

The notation `(ys ! 0)` extracts the last item out of the sequence `ys`, a
recursive sequence that appends to itself until `xs` is out of elements. The
result of calling `check` for every pair is combined with the previous result
and so the last element will have the final result of the fold.

### A sequence of overlapping UTF-16 pairs

In order to convert a sequence of 16-bit integers `xs : [n][16]` into a
sequence of overlapping 16-bit integer pairs `[n]([16], [16])` we add a
function called `pair`:

{% codeblock lang:cry %}
pairs xs = [ (x, y) | x <- take`{back=1} xs | y <- drop`{1} xs ]
{% endcodeblock %}

The built-in functions `take` and `drop` will align the given sequence such that
the first arm of the parallel comprehension lists all elements but the last, and
the second arm lists all but the first element. Both are then zipped into tuples
to achieve the format `check_utf16` requires.

### Counting UTF-8 code units

Our Cryptol function takes a sequence of bytes, to resemble the C implementation
that takes `uint8_t[]`. To get the format that `pairs` expects we will transform
the given input `xs : [n][8]` into a sequence of 16-bit integers `ms : [n][16]`.
The built-in function `join` simply joins sequences and so we can turn two
sequences of 8 bits into a single sequence of 16 bits.

{% codeblock lang:cry %}
utf16_to_utf8_len xs = if check_utf16 ps then (ys ! 0) else 0
    where ys = [0] # [ y + len x | x <- ms | y <- ys ]
          ms = [ join x | x <- groupBy`{2} xs ]
          ps = pairs (ms # [0])

len x = if x < 0x0080 then 1
         | x < 0x0800 then 2
         | is_lo_surrogate x then 0
         | is_hi_surrogate x then 4
           else 3
{% endcodeblock %}

The result of `pairs` is passed to `check_utf16` to bail out early when
encountering an invalid sequence. `utf16_to_utf8_len` then simply sums up the
number of UTF-8 code units per UTF-16 code unit as returned by `len`.
[This table](https://en.wikipedia.org/wiki/Comparison_of_Unicode_encodings#Eight-bit_environments)
provides a nice overview of UTF-8 space requirements for the different code
points.

If you wonder why we append `[0]` to the sequence of 16-bit integers `ms`, just
think about what `pairs` would return for a sequence with only a single element,
i.e. when only two bytes are passed to `utf16_to_utf8_len`.

### Adding a few test vectors

As usual we should add a few test vectors to try and make sure we got everything
right. We need inputs for every possible code unit size and some invalid
sequences as well.

{% codeblock lang:cry %}
property single = [ utf16_to_utf8_len v == e | (v, e) <- vs ] == ~zero
    where vs = [([0x00, 0x01], 1), ([0x00, 0x7F], 1),
                ([0x00, 0x80], 2), ([0x07, 0xFF], 2),
                ([0x80, 0x00], 3), ([0xFF, 0xFF], 3)]

property double = [ utf16_to_utf8_len v == e | (v, e) <- vs ] == ~zero
    where vs = [([0xD8, 0x00, 0xDC, 0x00], 4),
                ([0xDB, 0xFF, 0xDF, 0xFF], 4)]

property wrong = [ utf16_to_utf8_len v == e | (v, e) <- vs ] == ~zero
    where vs = [([0xDC, 0x00, 0xD8, 0x00, 0x00, 0x00], 0),
                ([0xD8, 0x00, 0xDC, 0x00, 0xDC, 0x00], 0)]
{% endcodeblock %}

Fire up the Cryptol REPL, load our file, and prove the properties defined above.

{% codeblock lang:text %}
Cryptol> :l utf16_to_utf8_len.cry
Loading module Cryptol
Loading module Main
Main> :p single
Q.E.D.
Main> :p double
Q.E.D.
Main> :p wrong
Q.E.D.
{% endcodeblock %}

## Proving equivalence with SAW

Now that we have a working reference implementation in Cryptol we can use this
to prove that the existing C implementation is equivalent and produces the same
output for any given input.

Here's a SAW script that uses symbolic execution to generate a model of an LLVM
program. We set up the initial symbolic state and define inputs matching a
length of four bytes for `utf16_to_utf8_len`.

{% codeblock lang:text %}
import "utf16_to_utf8_len.cry";
print "Extracting reference term";
l <- llvm_load_module "utf16_to_utf8_len.bc";

xs <- fresh_symbolic "xs" {| [4][8] |};
let allocs = [ ("buf", 4) ];
let inputs = [ ("*buf", xs, 4) , ("len", {{ "{{ 4:[32]" }} }}, 1) ];

let outputs = [("return", 1)];
t <- llvm_symexec l "utf16_to_utf8_len" allocs inputs outputs true;

thm1 <- abstract_symbolic {{ "{{ t == utf16_to_utf8_len xs" }} }};
prove_print abc thm1;
{% endcodeblock %}

Please check out the [SAW tutorial](http://saw.galois.com/tutorial.html) for
details, for our purposes here it's sufficient to know that this file instructs
SAW to load both the Cryptol and the C implementation (as LLVM byte code) and
then prove that they are equivalent.

Compile *utf16_to_utf8_len.c* to LLVM byte code using clang, and run SAW. It
will either give us a *Valid* if both implementations are the same, or an
*Invalid* if it found an input that makes them behave differently.

{% codeblock lang:text %}
$ clang -c -emit-llvm -o utf16_to_utf8_len.bc utf16_to_utf8_len.c
$ saw utf16_to_utf8_len.saw

Loading module Cryptol
Loading file "utf16_to_utf8_len.saw"
Loading module Main
Extracting reference term

saw: user error (Invalid: [248, 0, 0, 0])
{% endcodeblock %}

## Bug #1: Surrogate detection

`[0xF800, 0x0000]` is the first input that fails. Let's start by writing
a test and determining what return value we expect.

{% codeblock lang:cry %}
property bug1 = utf16_to_utf8_len [0xF8, 0x00, 0x00, 0x00] == 4
{% endcodeblock %}

`0xF800` is represented by three UTF-8 code units as it's not a surrogate and in
the range `[0x0800 .. 0xFFFF]`. Check [Wikipedia](https://en.wikipedia.org/wiki/Comparison_of_Unicode_encodings#Eight-bit_environments)
once more if you want to confirm. `0x0000` will occupy a single code unit.

{% codeblock lang:text %}
Main> :r utf8_len.cry
Loading module Cryptol
Loading module Main
Main> :p bug1
Q.E.D.
{% endcodeblock %}

Passing the byte sequence to the C function we see a return value of `0`. And we
could only see that when the function detects an invalid UTF-16 surrogate pair.
Somehow `0xF800` is misinterpreted as a high surrogate here:

{% codeblock lang:cpp %}
  // ...

    } else if ((buf[i] & 0xDC) == 0xD8) {
      if ((buf[i+2] & 0xDC) == 0xDC && (len - i) > 2) {
        i += 2;
        out += 4; // Surrogate.
      } else {
        return 0; // Invalid encoding.
      }
    } else {

  // ...
{% endcodeblock %}

Let's check the bit mask `0xDC00`. If the first six bits are either `110110` for
`0xD800 + x` or `110111` for `0xDC00 + x` we have surrogate. We thus want a bit
mask starting with `111111` followed by all zeros to detect a high or a low
surrogate. That number though is `0xFC00`, not `0xDC00`. Using the latter as
the bit mask we get false positives for code units with the third bit set to 1,
such as `0xF800 = 1111 1000 0000 0000`. Here's a more visual representation:

{% codeblock lang:text %}
0xD800 = 1101 1000 0000 0000 (high surrogate)
0xDC00 = 1101 1100 0000 0000 (low surrogate)
-----------------------------------------------
0xFC00 = 1111 1100 0000 0000 (correct bit mask)
{% endcodeblock %}

Now that we know what's wrong this should be an easy fix:

{% codeblock lang:diff %}
       out += 2; // Two-byte code point.
-    } else if ((buf[i] & 0xDC) == 0xD8) {
-      if ((buf[i+2] & 0xDC) == 0xDC && (len - i) > 2) {
+    } else if ((buf[i] & 0xFC) == 0xD8) {
+      if ((buf[i+2] & 0xFC) == 0xDC && (len - i) > 2) {
         i += 2;
{% endcodeblock %}

Recompile to get the new byte code and run SAW again.

{% codeblock lang:text %}
saw: user error (Invalid: [220, 0, 0, 0])
{% endcodeblock %}

## Bug #2: Invalid surrogates

`[0xDC, 0x00, 0x00, 0x00]` is the second failure reported by SAW. Here we have
a sequence starting with a low surrogate that should be rejected as invalid.

{% codeblock lang:cry %}
property bug2 = utf16_to_utf8_len [0xDC, 0x00, 0x00, 0x00] == 0
{% endcodeblock %}

Reload and prove the new property:

{% codeblock lang:text %}
Main> :p bug2
Q.E.D.
{% endcodeblock %}

The C implementation however returns `4`, reporting three UTF-8 code units for
the first UTF-16 code unit, because it never checks for leading low surrogates.
Let's just add another branch:

{% codeblock lang:diff %}
         return 0; // Invalid encoding.
       }
+    } else if ((buf[i] & 0xFC) == 0xDC) {
+      return 0; // Invalid encoding.
     } else {
       out += 3; // Three-byte code point.
{% endcodeblock %}

Recompile and run SAW again.

{% codeblock lang:text %}
saw: user error (Invalid: [0, 128, 0, 0])
{% endcodeblock %}

## Bug #3: The wrong byte index

`[0x00, 0x80, 0x00, 0x00]` is the next invalid input. The first code unit is in
the range `[0x0080 .. 0x07FF]` and should occupy two bytes, that's a total of
three.

{% codeblock lang:cry %}
property bug3 = utf16_to_utf8_len [0x00, 0x80, 0x00, 0x00] == 3
{% endcodeblock %}

Cryptol agrees:

{% codeblock lang:text %}
Main> :p bug3
Q.E.D.
{% endcodeblock %}

The C implementation returns the value `2`. So we probably somehow end up in
the first branch, although it should be the second. Staring at the code for a
while we find that it checks the first byte twice, instead of checking the
second byte (or the least significant 8 bits) in the second condition.

{% codeblock lang:diff %}
   for (i = 0; i < len; i += 2) {
-    if (buf[i] == 0x00 && (buf[i] & 0x80) == 0x00) {
+    if (buf[i] == 0x00 && (buf[i+1] & 0x80) == 0x00) {
       out += 1; // One-byte code point.
{% endcodeblock %}

Recompile and rerun SAW.

{% codeblock lang:text %}
saw: user error (Invalid: [0, 0, 216, 0])
{% endcodeblock %}

## Bug #4: Bounds checking

`[0x00, 0x00, 0xD8, 0x00]` is the next failing input. It's a lonely high
surrogate, not followed by a low surrogate, and should be rejected as invalid.

{% codeblock lang:cry %}
property bug4 = utf16_to_utf8_len [0x00, 0x00, 0xD8, 0x00] == 0
{% endcodeblock %}

And indeed it is:

{% codeblock lang:text %}
Main> :p bug4
Q.E.D.
{% endcodeblock %}

So what's going wrong with our C implementation? It does check for high
surrogates not followed by low surrogates, but gets a bounds check wrong. The
high surrogate is the last code unit in the sequence, and accessing `buf[i+2]`
will yield undefined results. The fix is easy, we of course need to check bounds
*before* accessing the buffer.

{% codeblock lang:diff %}
     } else if ((buf[i] & 0xFC) == 0xD8) {
-      if ((buf[i+2] & 0xFC) == 0xDC && (len - i) > 2) {
+      if ((len - i) > 2 && (buf[i+2] & 0xFC) == 0xDC) {
         i += 2;
{% endcodeblock %}

## Formally verified equivalence

After fixing four bugs, recompiling to get the latest byte code, and running
SAW again we finally see the word we wanted to see: `Valid`. We found and fixed
the same four bugs we discovered through manual inspection.

{% codeblock lang:text %}
$ clang -c -emit-llvm -o utf16_to_utf8_len.bc utf16_to_utf8_len.c
$ saw utf16_to_utf8_len.saw

Loading module Cryptol
Loading file "utf16_to_utf8_len.saw"
Loading module Main
Extracting reference term

Valid
{% endcodeblock %}

We can now modify the SAW script and experiment with longer inputs, such as a
sequence of 8 bytes, or 4 UTF-16 code points. It will take a little longer but
still prove our theorem.

## This is great stuff

If you're interested in trying some of this on your own, you can find the code,
the SAW script, and the Cryptol implementation [on GitHub](https://github.com/ttaubert/cryptol-utf16-utf8).

I'm looking forward to Cryptol and SAW growing and maturing in the time to come.
These are great tools for proving the correctness (or at least equivalence) of
sensitive functions and algorithms. I will certainly be on the lookout for more
opportunities to integrate formal verification into our workflows.

Next, I might take a look at the actual UTF-16 to UTF-8 conversion now that we
can determine the target length with some confidence. I will try to find the
time and write about this in a follow-up.
