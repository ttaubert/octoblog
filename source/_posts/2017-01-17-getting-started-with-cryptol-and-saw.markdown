---
layout: post
title: "Finding bugs with Cryptol and SAW"
subtitle: "Part 2: Verifying a C++ implementation against a Cryptol specification"
date: 2017-01-21 16:00:00 +0100
---

> [Part 1: Equivalence proofs with SAW](#)  
> Part 2: Verifying a C++ implementation against a Cryptol specification  
> [Part 3: Equivalence proofs with SAW](#)

In the [previous post](#) I showed how to prove the equivalence of two different C++ implementations of the same algorithm. This post covers writing an algorithm specification in Cryptol and using that to prove the correctness of a constant-time C++ implementation.

Apart from rather simple Cryptol I'm also going to introduce SAW's `llvm_verify` function that allows much more complex verification. Our function will not only take scalar arguments but also store the result of the computation in pointers passed to it.

## Constant-time multiplication

In part 1 we implemented addition, in part 2 we're going to look at multiplication. Let's implement a function `mul(a, b, *hi, *lo)` that multiplies `a` and `b`, and stores the eight most significant bits of the product in `*hi`, and the eight LSBs in `*lo`.

This time we'll make it run in constant time from the beginning and won't bother with implementing a simpler version in C++. Instead, we will write a Cryptol specification afterwards, and you will be amazed at how simple that is.

But let's start with our C++ implementation. The first two function will seem familiar if you've read the previous part of the series. `msb` hasn't changed, and `ge` is the negated version of `le`. `nz` returns `0xff` if the given argument `x` is non-zero, `0` otherwise.

{% codeblock lang:cpp %}
uint8_t msb(uint8_t x) {
  return 0 - (x >> (8 * sizeof(x) - 1));
}

uint8_t ge(uint8_t a, uint8_t b) {
  return ~msb(a ^ ((a ^ b) | ((a - b) ^ b)));
}

uint8_t nz(uint8_t x) {
  return ~msb(~x & (x - 1));
}
{% endcodeblock %}

Our `add` function that previously dealt with overflows by capping at `UINT8_MAX` is a little more mature now and will set `*carry = 1` when an overflow occurs.

{% codeblock lang:cpp %}
uint8_t add(uint8_t a, uint8_t b, uint8_t *carry) {
  *carry = msb(ge(a, 0 - b) & nz(b)) & 1;
  return a + b;
}
{% endcodeblock %}

Now comes the actual `mul` function using all the helper functions we defined above. It implements standard long multiplication, i.e. four multiplications per function call. We split the two 8-bit arguments into two 4-bit halves, multiply and add a few times, and then assign the 16-bit result to the given pointers `*hi` and `*lo`.

{% codeblock lang:cpp %}
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

It's relatively easy to see that `a * b` can be rewritten as `(a1 * 2^4 + a0) * (b1 * 2^4 + b0)`. After multiplying and rearranging you'll get an equation that's very similar to `mul` above. Here's a [good introduction](http://people.mpi-inf.mpg.de/~mehlhorn/ftp/chapter2A-en.pdf) to computing with long integers if you want to know more.

{% codeblock lang:text %}
$ clang -c -emit-llvm -o cmul.bc cmul.c
{% endcodeblock %}

Compile the code to LLVM bitcode as before so that we can load it into SAW when we finished writing our specification.

## The Cryptol reference implementation

The prove our Cryptol specification equal to the C++ implementation we again need a SAW script. This time it won't contain only verification details, but also Cryptol code. The first thing we do is load our bitcode into the module variable `m`.

{% codeblock lang:saw %}
m <- llvm_load_module "cmul.bc";
{% endcodeblock %}

Now comes the interesting part, our first Cryptol implementation. The specification doesn't need to be constant-time, all it needs to be is correct and as simple as possible. We declare a function `mul` taking two 8-bit integers and returning a tuple containing two 8-bit integers. Read the notation `[8]` as "sequence of 8 single bits".

The built-in function ``take`{n} x`` returns a sequence with the first `n` items of `x`. ``drop`{n} x`` returns a sequence with the first `n` items of `x` dropped. `zero` is a special value that has a number of use cases, here it represents a flexible sequence of all zero bits. `#` is the append operator for sequences.

{% codeblock lang:saw %}
{% raw %}
let {{
  mul : [8] -> [8] -> ([8], [8])
  mul a b = (take`{8} prod, drop`{8} prod)
      where prod = (pad a) * (pad b)
            pad x = zero # x
}};
{% endraw %}
{% endcodeblock %}

The first line of the definition gives the return value, a tuple with the first and the last 8 bits of `prod`. The Cryptol type system can automatically infer that the variable `prod` must hold a 16-bit sequence if the result of the ``take`{8}`` and ``drop`{8}`` function calls is a sequence of 8 bits.

`prod` is the result of multiplying the zero-padded arguments `a` and `b`. `zero # x` means it appends `x` to 8 zero bits, and it again knows that number from the type system. If you want to learn more about Cryptol, take a look at [Programming Cryptol](http://www.cryptol.net/files/ProgrammingCryptol.pdf).

That's as simple as it gets. We multiply two 8-bit integers and out comes a 16-bit integer, split into two halves. Now let's use the specification to verify our constant-time implementation.

## Proving equivalence

{% codeblock lang:saw %}
{% raw %}
time (llvm_verify m "mul" [] do {
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
});
{% endraw %}
{% endcodeblock %}

## Verification

{% codeblock lang:text %}
$ saw cmul.saw
Loading module Cryptol
Loading file "cmul.saw"
Successfully verified @mul
Time: 14.257227s
{% endcodeblock %}

## TODO

It implements a constant-time version of the [Karatsuba algorithm](https://en.wikipedia.org/wiki/Karatsuba_algorithm).
