---
layout: post
title: "Simple Cryptol specifications"
subtitle: "Exploring formal verification (part 2)"
date: 2017-02-07 16:00:00 +0100
---

> [Part 1: Equivalence proofs with SAW](/blog/2017/01/equivalence-proofs-with-saw/)  
> Part 2: Simple Cryptol specifications  
> [Part 3: Finding and fixing real-world bugs](/blog/2017/06/finding-and-fixing-real-world-bugs/)

In the [previous post](/blog/2017/01/equivalence-proofs-with-saw/) I showed how to prove equivalence of two different implementations of the same algorithm. This post will cover writing an algorithm specification in [Cryptol](http://cryptol.net/) to prove the correctness of a constant-time C/C++ implementation.

Apart from rather simple Cryptol I'm also going to introduce [SAW](http://saw.galois.com/)'s `llvm_verify` function that allows much more complex verification. We need this as our function will not only take scalar inputs but also store the result of the computation using pointer arguments.

## Constant-time multiplication

Part 1 dealt with addition, in part 2 we're going to look at multiplication. Let's implement a function `mul(a, b, *hi, *lo)` that multiplies `a` and `b`, and stores the eight most significant bits of the product in `*hi`, and the eight LSBs in `*lo`.

This time we'll make it run in constant time right away and won't bother implementing a trivial version first. Instead, we will write a Cryptol specification to verify LLVM bitcode afterwards --- you will be amazed how simple that is.

### Some helper functions

The first two functions of our C/C++ implementation will seem familiar if you've read the previous part of the series. `msb` hasn't changed, and `ge` is the negated version of `lt`. `nz` returns `0xff` if the given argument `x` is non-zero, `0` otherwise.

{% codeblock lang:cpp cmul.c https://gist.github.com/ttaubert/c742ba7adf040e14ff21e111a929f5b8#file-cmul-c [gist.github.com/ttaubert/c742ba7adf040e14ff21e111a929f5b8#file-cmul-c] %}
// 0xff if MSB(x) = 1 else 0x00
uint8_t msb(uint8_t x) {
  return 0 - (x >> (8 * sizeof(x) - 1));
}

// 0xff if a >= b else 0x00
uint8_t ge(uint8_t a, uint8_t b) {
  return ~msb(a ^ ((a ^ b) | ((a - b) ^ b)));
}

// 0xff if x > 0 else 0x00
uint8_t nz(uint8_t x) {
  return ~msb(~x & (x - 1));
}

uint8_t add(uint8_t a, uint8_t b, uint8_t *carry) {
  *carry = msb(ge(a, 0 - b) & nz(b)) & 1;
  return a + b;
}
{% endcodeblock %}

Our `add` function that previously dealt with overflows by capping at `UINT8_MAX` is a little more mature now and will set `*carry = 1` when an overflow occurs.

### The core of the algorithm

`mul(a, b, *hi, *lo)`, using all the helper functions we defined above, implements standard long multiplication, i.e. four multiplications per function call. We split the two 8-bit arguments into two 4-bit halves, multiply and add a few times, and then store two 8-bit results at the addresses pointed to by `hi` and `lo`.

{% codeblock lang:cpp cmul.c https://gist.github.com/ttaubert/c742ba7adf040e14ff21e111a929f5b8#file-cmul-c [gist.github.com/ttaubert/c742ba7adf040e14ff21e111a929f5b8#file-cmul-c] %}
void mul(uint8_t a, uint8_t b, uint8_t *hi, uint8_t *lo) {
  uint8_t a1 = a >> 4, a0 = a & 0xf;
  uint8_t b1 = b >> 4, b0 = b & 0xf;
  uint8_t z0 = a0 * b0;
  uint8_t z2 = a1 * b1;

  uint8_t z1, z1carry, carry, trash;
  z1 = add(a0 * b1, a1 * b0, &z1carry);
  *lo = add(z1 << 4, z0, &carry);
  *hi = add(z2, (z1 >> 4) + carry, &trash);
  *hi = add(*hi, z1carry << 4, &trash);
}
{% endcodeblock %}

It's relatively easy to see that `a * b` can be rewritten as `(a1 * 2^4 + a0) * (b1 * 2^4 + b0)`, all four variables being 4-bit integers. After multiplying and rearranging you'll get an equation that's very similar to `mul` above. Here's a [good introduction](http://people.mpi-inf.mpg.de/~mehlhorn/ftp/chapter2A-en.pdf) to computing with long integers if you want to know more.

{% codeblock lang:text %}
$ clang -c -emit-llvm -o cmul.bc cmul.c
{% endcodeblock %}

Compile the code to LLVM bitcode as before so that we can load it into SAW later.

## The Cryptol specification

To automate verification we'll again write a SAW script. It will contain the necessary verification commands and details, as well as a Cryptol specification.

The specification doesn't need to be constant-time, all it needs to be is correct and as simple as possible. We declare a function `mul` taking two 8-bit integers and returning a tuple containing two 8-bit integers. Read the notation `[8]` as "sequence of 8 bits".

{% codeblock lang:saw cmul.saw https://gist.github.com/ttaubert/c742ba7adf040e14ff21e111a929f5b8#file-cmul-saw [gist.github.com/ttaubert/c742ba7adf040e14ff21e111a929f5b8#file-cmul-saw] %}
{% raw %}
m <- llvm_load_module "cmul.bc";

let {{
  mul : [8] -> [8] -> ([8], [8])
  mul a b = (take`{8} prod, drop`{8} prod)
      where prod = (pad a) * (pad b)
            pad x = zero # x
}};
{% endraw %}
{% endcodeblock %}

The built-in function ``take`{n} x`` returns a sequence with only the first `n` items of `x`. ``drop`{n} x`` returns sequence `x` without the first `n` items. `zero` is a special value that has a number of use cases, here it represents a flexible sequence of all zero bits. `#` is the append operator for sequences.

The first line of the definition gives the return value, a tuple with the first and the last 8 bits of `prod`. The Cryptol type system can automatically infer that the variable `prod` must hold a 16-bit sequence if the result of the ``take`{8}`` and ``drop`{8}`` function calls is a sequence of 8 bits each.

`prod` is the result of multiplying the zero-padded arguments `a` and `b`. `zero # x` appends `x` to 8 zero bits, and that number is again determined by the type system. If you want to learn more about the language, take a look at [Programming Cryptol](http://www.cryptol.net/files/ProgrammingCryptol.pdf).

That's about as simple as it gets. We multiply two 8-bit integers and out comes a 16-bit integer, split into two halves. Now let's use the specification to verify our constant-time implementation.

## SAW's llvm_verify function

We will add LLVM SAW instructions to the same file that contains the Cryptol code from above. The `llvm_verify` call here takes module `m`, extracts the symbol `"mul"`, and uses the body given after `do` for verification.

We need to declare all symbolic inputs as given by our C/C++ implementation. With `llvm_var` we tell SAW that `"a"` and `"b"` are 8-bit integer arguments, and map those to the SAW variables `a` and `b`.

The arguments `"hi"` and `"lo"` are declared as pointers to 8-bit integers using `llvm_ptr`. And because we want to dereference the pointers and refer to their values later we declare `"*hi"` and `"*lo"` as 8-bit integers too.

{% codeblock lang:saw cmul.saw https://gist.github.com/ttaubert/c742ba7adf040e14ff21e111a929f5b8#file-cmul-saw [gist.github.com/ttaubert/c742ba7adf040e14ff21e111a929f5b8#file-cmul-saw] %}
{% raw %}
llvm_verify m "mul" [] do {
  a <- llvm_var "a" (llvm_int 8);
  b <- llvm_var "b" (llvm_int 8);

  llvm_ptr "hi" (llvm_int 8);
  hi <- llvm_var "*hi" (llvm_int 8);
  llvm_ptr "lo" (llvm_int 8);
  lo <- llvm_var "*lo" (llvm_int 8);

  let res = {{ mul a b }};
  llvm_ensure_eq "*hi" {{ res.0 }};
  llvm_ensure_eq "*lo" {{ res.1 }};

  llvm_verify_tactic abc;
};
{% endraw %}
{% endcodeblock %}

We specify no constraints for any of the arguments and expect the verification to consider all possible inputs. I will talk a bit more about such constraints and how these are useful in a later post.

With `llvm_ensure_eq` we tell SAW what values we expect *after* symbolic execution. We expect `"*hi"` to be equal to the first 8-bit integer element of the tuple returned by `mul`, and `"*lo"` to be equal to the second 8-bit integer.

`llvm_verify_tactic` chooses UC Berkely's ABC tool again and off we go.

## Verification with SAW

Again, make sure you have `saw` and `z3` in your `$PATH`. If you haven't downloaded the binaries yet, take a look at the early sections of the [previous post](/blog/2017/01/equivalence-proofs-with-saw/).

{% codeblock lang:text %}
$ saw cmul.saw
Loading module Cryptol
Loading file "cmul.saw"
Successfully verified @mul
{% endcodeblock %}

*Successfully verified @mul.* SAW tells us that for all possible inputs `a` and `b`, and actually `hi` and `lo` too, our constant-time C/C++ implementation behaves as stated by the SAW verification script and is thereby equivalent to our Cryptol specification.

## Next: Finding bugs and more LLVM commands

In [the next post](/blog/2017/06/finding-and-fixing-real-world-bugs/) I'm going to introduce and write more Cryptol, talk about specifying constraints on LLVM arguments and return values, and provide an example for finding bugs in a real-world codebase.

And while you wait, why not try your hand at optimizing `mul` to use only three instead of four multiplications with the [Karatsuba algorithm](https://en.wikipedia.org/wiki/Karatsuba_algorithm)? You can reuse the above Cryptol specification to verify you got it right.
