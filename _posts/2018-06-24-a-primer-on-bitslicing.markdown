---
layout: post
title: "Bitslicing 101"
subtitle: "A primer on data orthogonalisation"
date: 2018-06-24T12:19:54+02:00
---

I was recently looking for a resource to brush up on bitsliced implementations
of crypto algorithms. The only material I found was Thomas Pornin's excellent
page on [constante-time crypto](https://www.bearssl.org/constanttime.html#bitslicing).

It's a great overview but omits a few details. For the benefit of future me, as
well as other current and future crypto implementers, I'll seize the chance to
dive a a little deeper and provide further background.

## Bitslicing

Construction of a n-bit processor by
means of n 1-bit processors working in
parallel

This implied a decomposition of all data
and operations into a set of atomic
boolean operations

It consists of dedicating a (virtual)
register to each bit in an orthogonal
representation of the data

The program must be decomposed in
atomic boolean operations

constant execution time
parallelization

## DES and S-Boxes

8 different s-boxes with mapping 6 to 4 bits, each containing 64 4-bit values
a function that takes 6 bits as input and produces 4 bits as output

DES was designed for hardware, slow in software
Dr Eli Biham presented his paper A Fast New DES Implementation in Software
https://link.springer.com/content/pdf/10.1007%2FBFb0052352.pdf

Idea was to use 64-bit processor with 64-bit registers as a SIMD parallel
computer to compute 64 one-bit operations simultaneously

e.g. XOR 64 bit with 64 bits and you get 64 resulting bits

table lookups are very inefficient, since we have  to collect six bits, each
bit from a  different word combine them into one index to the table, and after
the table lookup take the four resultant bits and put each of them in a
different word.

also constant time, but more on that later

can be represented by their logical gate circuit.  In such an implementation
each S  box is typically represented  by about 100 gates, and thus we can
implement an S  box by about 100 instructions

## Bitslicing an S-box

Imagine a 3-to-2-bit S-box represented as a simple lookup table with 8 entries
to substitute a 3-bit number by a 2-bit number, i.e. `0b000` with `0b01`,
`0b001` with `0b00`, etc.

{% codeblock lang:cpp %}
uint8_t SBOX[] = { 1, 0, 2, 3, 2, 3, 1, 0 };
{% endcodeblock %}

To bitslice it we will use three input and two output variables. The width of
these variables determines the number of S-box lookups we can perform at the
same time. 8-bit variables for example would allow 8 computations in parallel.

Now we have almost everything we need to implement our S-box function. With the
signature below we'll be able to process 8 lookups in parallel.

{% codeblock lang:cpp %}
void SBOX(uint8_t a, uint8_t b, uint8_t c, uint8_t* x, uint8_t* y);
{% endcodeblock %}

Need to take a look at multiplexing first.

### Multiplexing

Multiplexer is a fancy word for "data selector". A 2-to-1 multiplexer selects
one of two input bits to forward. A "selector" bit decides which of the two
input bits will retained. In hardware, we can use *AND*, *AND NOT*, and *OR*
gates to implement this. What would this look like in software?

{% codeblock lang:cpp %}
uint8_t mux(uint8_t a, uint8_t b, uint8_t s) {
  return (a & ~s) | (b & s);
}
{% endcodeblock %}

Here we have a software multiplexer that can handle 8 bits in parallel. If the
n-th selector bit is zero we'll take the n-th bit in `a`, if not we'll forward
the n-th bit in `b`.

### Arranging the multiplexers

To compute each output bit separately let's split the SBOX in two, one for the
left and one for the right bit of the above outputs. The input `0b000` would
now yield `0` for the left bit and `1` for the right bit, i.e. `0b01` combined.

{% codeblock lang:cpp %}
uint8_t SBOXL[] = { 0, 0, 1, 1, 1, 1, 0, 0 };
uint8_t SBOXR[] = { 1, 0, 0, 1, 0, 1, 1, 0 };
{% endcodeblock %}

{% img /images/sboxr.png The decision graph for SBOXR(a, b, c) %}

Explain `~0`.

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

Construct SBOXL the same way and combine them to construct SBOX().
We can actually simplify the first S-box quite a bit when both input values
for the last multiplexer are equal.

{% codeblock lang:cpp %}
uint8_t SBOXL(uint8_t a, uint8_t b, uint8_t c) {
  // We can ignore c.

  // 0b000 - 0b011
  uint8_t b0 = mux(0, ~0, b);
  // 0b100 - 0b111
  uint8_t b1 = mux(~0, 0, b);

  return mux(b0, b1, a);
}
{% endcodeblock %}

Probably not a great S-Box, but enough for demonstration purposes.

### Optimizations

The `mux()` function as shown above needs three operations (or gates). Let's
rewrite this function using an XOR gate:

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
  // We can ignore c.

  // 0b000 - 0b011
  uint8_t b0 = ((0 ^ ~0) & b) ^ 0; // mux(0, ~0, b);
  // 0b100 - 0b111
  uint8_t b1 = ((~0 ^ 0) & b) ^ ~0; // mux(~0, 0, b);

  return mux(b0, b1, a);
}
{% endcodeblock %}

Anything XOR'ed by zero is just the other operand's value. Anything XOR'ed by
one is a bit flip. Anything AND one is just the operand's value. Anything XOR'ed
by itself is just zero. Let's reduce `SBOXL()`:

{% codeblock lang:cpp %}
uint8_t SBOXL(uint8_t a, uint8_t b, uint8_t c) {
  return a ^ b;
}
{% endcodeblock %}

This reduces down to the XOR of `a` and `b`. Not a great S-box but yeah.

We started with only nine operations - as we could already ignore the `c`
parameter due to the structure of the S-box - and brought that number down
to 1. We could now do the same for `SBOXR()` of course.

{% codeblock lang:cpp %}
uint8_t SBOXR(uint8_t a, uint8_t b, uint8_t c) {
  uint8_t bc = b ^ c;
  return mux(bc ^ ~0, bc, a);
}
{% endcodeblock %}

That's five instead of twenty-one operations.
The whole S-box...

{% codeblock lang:cpp %}
void SBOX(uint8_t a, uint8_t b, uint8_t c, uint8_t* x, uint8_t* y) {
  *x = a ^ b;
  uint8_t bc = b ^ c;
  *y = mux(bc ^ ~0, bc, a);
}
{% endcodeblock %}

With 6 operations we can compute 8 S-box lookups in parallel. Using `uint64_t`
we could improve the throughput by a factor of 8x.

Better S-box...

Rearrange the bits to get even lower?

## Bitslicing a DES S-box

Here's the first S-Box of DES. It's a simple lookup table with 64 entries to
substitute a 6-bit number by a 4-bit number, e.g. `0b000000 = 0` with
`0b1110 = 14`, `0b000001 = 1` with `0b0100 = 4`, etc.

{% codeblock lang:cpp %}
uint8_t SBOX1[] = {
  14,  4, 13,  1,  2, 15, 11,  8,  3, 10,  6, 12,  5,  9,  0,  7,
   0, 15,  7,  4, 14,  2, 13,  1, 10,  6, 12, 11,  9,  5,  3,  8,
   4,  1, 14,  8, 13,  6,  2, 11, 15, 12,  9,  7,  3, 10,  5,  0,
  15, 12,  8,  2,  4,  9,  1,  7,  5, 11,  3, 14, 10,  0,  6, 13
};
{% endcodeblock %}

{% codeblock lang:cpp %}
uint8_t SBOXL(uint8_t a, uint8_t b, uint8_t c) {
  if (a == 0) {
    if (b == 0) {
      if (c == 0) {
        return 0; // 0b000
      } else {
        return 0; // 0b001
      }
    } else {
      if (c == 0) {
        return 1; // 0b010
      } else {
        return 1; // 0b011
      }
    }
  } else {
    if (b == 0) {
      if (c == 0) {
        return 1; // 0b100
      } else {
        return 1; // 0b101
      }
    } else {
      if (c == 0) {
        return 0; // 0b110
      } else {
        return 0; // 0b111
      }
    }
  }
}
{% endcodeblock %}
