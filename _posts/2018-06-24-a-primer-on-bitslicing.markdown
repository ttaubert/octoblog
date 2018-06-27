---
layout: post
title: "Bitslicing 101"
subtitle: "A primer on data orthogonalisation"
date: 2018-06-27T12:00:00+02:00
---

I recently found myself looking for resources to brush up on bitsliced
implementations of crypto algorithms. There's not a lot out there, aside from
Thomas Pornin's excellent page on [constante-time
crypto](https://www.bearssl.org/constanttime.html#bitslicing). It's a great
overview but omits a few details. For the benefit of future me, and other
current or future crypto implementers, I'll take a stab at a simple yet
comprehensive introduction.

## What is bitslicing?

*Bitslicing* is a term coined by Matthew Kwan. It describes the technique
introduced by Eli Biham's [A Fast New DES Implementation in Software](http://www.cs.technion.ac.il/users/wwwb/cgi-bin/tr-get.cgi/1997/CS/CS0891.pdf),
later improved upon by Kwan's [Reducing the Gate Count of Bitslice DES](http://fgrieu.free.fr/Mattew%20Kwan%20-%20Reducing%20the%20Gate%20Count%20of%20Bitslice%20DES.pdf).

The basic idea is to express a function in terms of single-bit logical
operations - *AND*, *XOR*, *OR*, *NOT*, etc. - as if you were implementing it
in hardware. These operations are then carried out for multiple instances of
the function in parallel, using bitwise operations on a CPU.

{% img /images/slices.png Slicing an 8-bit variable %}

In a bitsliced implementation, instead of having a single variable storing a,
say, 8-bit number, you have eight variables (slices). The first storing the
highest bit of the number, the next storing the second highest bit of the number,
and so on. The parallelism is bounded only by the target architecture's register
width.

## Why the hassle?

You might ask yourself, justifiably, why would anyone do this? Why would you
increase complexity and code size by bitslicing a perfectly fine function?

Biham's was the first to apply bitslicing to [DES](https://en.wikipedia.org/wiki/Data_Encryption_Standard),
a cipher designed to be fast in hardware. It uses eight different 6-to-4-bit
[S-boxes](https://en.wikipedia.org/wiki/S-box), that were usually implemented
as lookup tables. Table lookups in DES however are very inefficient, since one
has to collect six bits, each bit from a different word, combine them into one
index to the table, and afterwards take the four resulting bits and put each of
them in a different word.

### Speed

In classical implementation, these bit permutations would be implemented with a
combination of shifts and masks. In a bitslice representation though, permuting
the bits really just means using the "right" variables in the next step; this is
mere data routing, which is resolved at compile-time, with no cost at runtime.

Additionally, the code is extremely linear so that it usually runs well on
heavily pipelined modern CPUs. It tends to have a low risk of pipeline stalls,
as it's unlikely to suffer from branch misprediction, and plenty of
opportunities for optimal instruction reordering for efficient scheduling of
data accesses.

### Parallelization

With a register width of *n* bits, as long as the bitsliced implementation is no
more than *n* times slower to run a single instance of the cipher, you end up
with a net gain in throughput. This only applies to workloads that allow for
parallelization. CTR and ECB mode always benefit, CBC and CFB mode only when
decrypting.

### Constant execution time

Constant-time, secret independent computation is all the rage in modern applied
cryptography. Bitslicing is interesting because by using only single-bit logical
operations the resulting code is immune to cache and timing-related
[side channel attacks](https://en.wikipedia.org/wiki/Side-channel_attack).

## Bitslicing a simple S-box

Imagine an arbitrary 3-to-2-bit S-box represented by a lookup table with eight
entries to substitute a 3-bit number by a 2-bit number, e.g. `0b000` with `0b01`
or `0b001` with `0b00`.

{% codeblock lang:cpp %}
uint8_t SBOX[] = { 1, 0, 2, 3, 2, 3, 1, 0 };
{% endcodeblock %}

You can think of the above S-box's output as being a function of three boolean
variables, where for instance `SBOX(0,0,0) = 0b01`. To bitslice it we need three
input and two output variables. The width of these variables determines the
number of substitutions we can perform in parallel.

{% codeblock lang:cpp %}
void SBOX(uint8_t a, uint8_t b, uint8_t c, uint8_t* x, uint8_t* y);
{% endcodeblock %}

To implement `SBOX()` with the above signature let's talk about
[multiplexing](https://en.wikipedia.org/wiki/Multiplexer) first.

### Multiplexing

Multiplexer is a fancy word for *data selector*. A 2-to-1 multiplexer selects
one of two input bits. A *selector* bit decides which of the two inputs
will be selected. In hardware, this can be implemented with *AND*, *AND NOT*,
and *OR* gates. What about software?

{% codeblock lang:cpp %}
uint8_t mux(uint8_t a, uint8_t b, uint8_t s) {
  return (a & ~s) | (b & s);
}
{% endcodeblock %}

Here we have a software multiplexer that can handle eight bits in parallel. If
the n-th bit of `s` is zero we'll select the n-th bit in `a`, if not we'll
forward the n-th bit in `b`.

### Arranging the multiplexers

To compute each output bit separately let's split the SBOX in two. The input
`0b000` would yield `0` for the left and `1` for the right bit, i.e. `0b01`
combined.

{% codeblock lang:cpp %}
uint8_t SBOXL[] = { 0, 0, 1, 1, 1, 1, 0, 0 };
uint8_t SBOXR[] = { 1, 0, 0, 1, 0, 1, 1, 0 };
{% endcodeblock %}

Here's the 3-to-1-bit `SBOXR[]` visualized as a structure resembling a decision
tree. The output bit is selected according to the values of the boolean inputs
`a`, `b`, and `c`.

{% img /images/sboxr.png SBOXR(a,b,c) visualized as a decision tree %}

We can now write a bitsliced `SBOXR()` using `mux()` by following the output
bits in the tree above from left to right. The tree uses 1-bit parameters, we
however use `uint8_t` ones. So instead of `1` we'll use `~0` to get `0b11111111`.

{% codeblock lang:cpp %}
uint8_t SBOXR(uint8_t a, uint8_t b, uint8_t c) {
  // 0b000 - 0b001
  uint8_t c00 = mux(~0, 0, c);
  // 0b010 - 0b011
  uint8_t c01 = mux(0, ~0, c);
  // 0b100 - 0b101
  uint8_t c10 = mux(0, ~0, c);
  // 0b110 - 0b111
  uint8_t c11 = mux(~0, 0, c);

  // 0b000 - 0b011
  uint8_t b0 = mux(c00, c01, b);
  // 0b100 - 0b111
  uint8_t b1 = mux(c10, c11, b);

  return mux(b0, b1, a);
}
{% endcodeblock %}

Construct `SBOXL()` the same way. It's a tad simpler because it turns out we
can ignore `c` when both inputs for the last row of multiplexers are equal.
*(It helps to draw the decision tree yourself if you don't follow.)*

{% codeblock lang:cpp %}
uint8_t SBOXL(uint8_t a, uint8_t b, uint8_t c) {
  // 0b000 - 0b011
  uint8_t b0 = mux(0, ~0, b);
  // 0b100 - 0b111
  uint8_t b1 = mux(~0, 0, b);

  return mux(b0, b1, a);
}
{% endcodeblock %}

### Optimizations

The `mux()` function currently needs three operations. Let's rewrite it using
an *XOR* gate:

{% codeblock lang:cpp %}
uint8_t mux(uint8_t a, uint8_t b, uint8_t s) {
  uint8_t c = a ^ b;
  return (c & s) ^ a;
}
{% endcodeblock %}

Now there still are three gates but it turns out we can reduce in a lot of
cases where we can either precompute `a ^ b` or reuse the result. The last row
of multiplexers always uses constants, so, inlining `mux()` in some places, we
get the following:

{% codeblock lang:cpp %}
uint8_t SBOXL(uint8_t a, uint8_t b, uint8_t c) {
  // 0b000 - 0b011
  uint8_t b0 = ((0 ^ ~0) & b) ^ 0; // mux(0, ~0, b);
  // 0b100 - 0b111
  uint8_t b1 = ((~0 ^ 0) & b) ^ ~0; // mux(~0, 0, b);

  return mux(b0, b1, a);
}
{% endcodeblock %}

Let's reduce `SBOXL()` using the following rules:

* Anything *XOR*-ed with itself is always zero.
* Anything *XOR*-ed with zero is just the original value.
* Anything *XOR*-ed with ones is the original value with bits flipped.
* Anything *AND* ones is just the original value.

{% codeblock lang:cpp %}
uint8_t SBOXL(uint8_t a, uint8_t b, uint8_t c) {
  return a ^ b;
}
{% endcodeblock %}

This reduces down to the *XOR* of `a` and `b`. Not a great S-box, I guess.
It'll do for demonstration though. We started with nine operations and brought
that number down to one. We can now do the same for `SBOXR()`:

{% codeblock lang:cpp %}
uint8_t SBOXR(uint8_t a, uint8_t b, uint8_t c) {
  return a ^ b ^ c ^ ~0;
}
{% endcodeblock %}

That's three instead of twenty-one operations. Good. Here's the whole `SBOX()`:

{% codeblock lang:cpp %}
void SBOX(uint8_t a, uint8_t b, uint8_t c, uint8_t* x, uint8_t* y) {
  *x = a ^ b;
  *y = *x ^ c ^ ~0;
}
{% endcodeblock %}

With just three operations we can perform eight S-box lookups in parallel.
That's much better than a simple table lookup, assuming the cipher mode let's
us parallelize the cipher. We could further increase the throughput by using
wider input/output types.
