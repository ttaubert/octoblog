---
layout: post
title: "Bitslicing, An Introduction"
subtitle: "Data Orthogonalisation and Cryptography"
date: 2018-06-27T12:00:00+02:00
---

I recently found myself looking for resources to brush up on bitsliced
implementations of crypto algorithms. There's not a lot out there, aside from
Thomas Pornin's excellent page on [constant-time crypto](https://www.bearssl.org/constanttime.html#bitslicing).
For the benefit of future me (and you), here's a recap.

This post intends to give a brief overview over bitslicing as a technique, not
requiring a cryptographic background. After working through a small example you
should leave with a basic understanding, sufficient to dive into one of the
many papers about fast, constant-time, bitsliced crypto algorithms.

## What is bitslicing?

*Bitslicing* is a term coined by Matthew Kwan. It describes the technique
introduced by Eli Biham in his paper [A Fast New DES Implementation in Software](http://www.cs.technion.ac.il/users/wwwb/cgi-bin/tr-get.cgi/1997/CS/CS0891.pdf),
later improved upon by Kwan's [Reducing the Gate Count of Bitslice DES](http://fgrieu.free.fr/Mattew%20Kwan%20-%20Reducing%20the%20Gate%20Count%20of%20Bitslice%20DES.pdf).

The basic idea is to express a function in terms of single-bit logical
operations - *AND*, *XOR*, *OR*, *NOT*, etc. - as if you were implementing it
in hardware. These operations are then carried out for multiple instances of
the function in parallel, using bitwise operations on a CPU.

In a bitsliced implementation, instead of having a single variable storing a,
say, 8-bit number, you have eight variables (slices). The first storing the
highest bit of the number, the next storing the second highest bit of the number,
and so on. The parallelism is bounded only by the target architecture's register
width.

## What's it good for?

You might ask, justifiably, why would anyone do this? Why would you increase
complexity and code size by bitslicing a perfectly fine function?

Biham was the first to apply bitslicing to [DES](https://en.wikipedia.org/wiki/Data_Encryption_Standard),
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

### Fully Homomorphic Encryption

The last decade brought great advances in the field of Fully Homomorphic
Encryption (FHE), i.e. computation on ciphertexts. If you have a secure crypto
scheme and an efficient [NAND gate](https://en.wikipedia.org/wiki/NAND_gate)
you can use bitslicing to [compute arbitrary functions of encrypted data](https://crypto.stanford.edu/craig/easy-fhe.pdf).

-------------------------------------------------------------------------------

So far, this introduction was rather abstract. Let's work through a simple
example to see how one can go about converting arbitrary functions into
circuits of Boolean gates.

## Bitslicing a small S-box

Imagine a 3-to-2-bit [S-box](https://en.wikipedia.org/wiki/S-box), a component
found in many symmetric encryption algorithms, also called block ciphers.
Naively, this would usually be represented by a lookup table with eight
entries, e.g. `SBOX[0b000] = 0b01`, `SBOX[0b001] = 0b00`, etc.

{% codeblock lang:cpp %}
uint8_t SBOX[] = { 1, 0, 3, 1, 2, 2, 3, 0 };
{% endcodeblock %}

> This AES-inspired S-Box interprets three input bits as a polynomial in
> *GF(2^3)* and computes its inverse *mod P(x) = x^3 + x^2 + 1*, with
> *0^(-1) := 0*. The result plus *(x^2 + 1)* is converted back into bits
> and the MSB is dropped.

You can think of the above S-box's output as being a function of three Boolean
variables, where for instance *f(0,0,0) = 0b01*. Each output bit can be
represented by its own Boolean function, i.e. *f<sub>L</sub>(0,0,0) = 0* and
*f<sub>R</sub>(0,0,0) = 1*.

### LUTs and Multiplexers

If you've dealt with FPGAs before you probably know that these do not actually
implement Boolean gates, but allow Boolean algebra by programming Look-Up-Tables (LUTs).
We can do the reverse and convert our S-box into trees of multiplexers.

[Multiplexer](https://en.wikipedia.org/wiki/Multiplexer) is a fancy word for
*data selector*. A 2-to-1 multiplexer selects one of two input bits. A
*selector* bit decides which of the two inputs will be selected.

{% codeblock lang:cpp %}
bool mux(bool a, bool b, bool s) {
  return s ? b : a;
}
{% endcodeblock %}

Here are the LUTs, or rather truth tables, for the Boolean functions
*f<sub>L</sub>(a,b,c)* and *f<sub>R</sub>(a,b,c)*:

{% codeblock lang:cpp %}
 abc | f_L()     abc | f_R()
-----|-------   -----|-------
 000 | 0         000 | 1
 001 | 0         001 | 0
 010 | 1         010 | 1
 011 | 0         011 | 1
 100 | 1         100 | 0
 101 | 1         101 | 0
 110 | 1         110 | 1
 111 | 0         111 | 0
{% endcodeblock %}

The truth table for *f<sub>L</sub>(a,b,c)* is *(0, 0, 1, 0, 1, 1, 1, 0)* or
*2E<sub>h</sub>*. We can also call this the LUT-mask in the context of an
FPGA. For each output bit of our S-box we need a 3-to-1 multiplexer, and
that in turn can be represented by 2-to-1 multiplexers.

{% img /images/mux.png A 3-to-1 multiplexer with LUT-mask 0x2E %}

### Multiplexers in Software

Let's take the `mux()` function from above and make it constant-time. As stated
earlier, bitslicing is competitive only through parallelization, so, for
demonstration, we'll use `uint8_t` arguments to compute eight calls to
our S-box in parallel.

{% codeblock lang:cpp %}
uint8_t mux(uint8_t a, uint8_t b, uint8_t s) {
  return (a & ~s) | (b & s);
}
{% endcodeblock %}

If the *n*-th bit of `s` is zero it selects the *n*-th bit in `a`, if not it
forwards the *n*-th bit in `b`. The wider the target architecture's registers,
the bigger the theoretical throughput -- assuming the workload can take
advantage of the level of parallelization.

### Implementation [TODO]

{% codeblock lang:cpp %}
uint8_t SBOXL(uint8_t a, uint8_t b, uint8_t c) {
  uint8_t c0 = mux( 0,  0, c);
  uint8_t c1 = mux(~0,  0, c);
  uint8_t c2 = mux(~0, ~0, c);
  uint8_t c3 = mux(~0,  0, c);

  uint8_t b0 = mux(c0, c1, b);
  uint8_t b1 = mux(c2, c3, b);

  return mux(b0, b1, a);
}
{% endcodeblock %}

{% codeblock lang:cpp %}
uint8_t SBOXR(uint8_t a, uint8_t b, uint8_t c) {
  uint8_t c0 = mux(~0,  0, c);
  uint8_t c1 = mux(~0, ~0, c);
  uint8_t c2 = mux( 0,  0, c);
  uint8_t c3 = mux(~0,  0, c);

  uint8_t b0 = mux(c0, c1, b);
  uint8_t b1 = mux(c2, c3, b);

  return mux(b0, b1, a);
}
{% endcodeblock %}

{% codeblock lang:cpp %}
void SBOX(uint8_t a, uint8_t b, uint8_t c, uint8_t* l, uint8_t* r) {
  *l = SBOXL(a, b, c);
  *r = SBOXR(a, b, c);
}
{% endcodeblock %}

2 * 7 * 3 = 42 ops (not counting negation)

### Optimizations

{% codeblock lang:cpp %}
uint8_t SBOX(uint8_t a, uint8_t b, uint8_t c, uint8_t* l, uint8_t* r) {
  uint8_t t0 = ~c & b;
  uint8_t t1 = (0 & ~b) | t0;
  uint8_t t2 = (~0 & ~b) | t0;
  uint8_t t3 = (~c & ~b) | (~0 & b);
  *l = (t1 & ~a) | (t2 & a);
  *r = (t3 & ~a) | (t1 & a);
}
{% endcodeblock %}

14 ops (not counting negation) after manual optimization

* common subexpr elimination
* same inputs a=b
* mux with constants always just one op
* ~0 * x = x
* 0 * x = 0

The `mux()` function currently needs three operations. Let's rewrite it using
an *XOR* gate:

{% codeblock lang:cpp %}
uint8_t mux(uint8_t a, uint8_t b, uint8_t s) {
  uint8_t c = a ^ b;
  return (c & s) ^ a;
}
{% endcodeblock %}

https://en.wikipedia.org/wiki/Boolean_algebra#Laws

{% codeblock lang:cpp %}
void SBOX(uint8_t a, uint8_t b, uint8_t c, uint8_t* l, uint8_t* r) {
  uint8_t t0 = c & b;
  uint8_t t1 = ~c & b;
  uint8_t t3 = t0 ^ ~c;
  uint8_t t4 = t1 ^ ~t0; // hard to optimize
  uint8_t t5 = t3 ^ t1;
  *l = (t4 & a) ^ t1;
  *r = (t5 & a) ^ t3; // 10 ops

  uint8_t t4 = (~c & b) ^ (~c | ~b);
  uint8_t t4 = (~c & b & c) | ((c | ~b) & (~c | ~b))
  uint8_t t4 = (~c * b * c) + ((c + ~b) * (~c + ~b))
  uint8_t t4 = (~c * b * c) + (c*~b + ~b*~c + ~b)
  uint8_t t4 = ~c*~b + c*~b
  uint8_t t4 = ~b // puh

  uint8_t t0 = c & b;
  uint8_t t1 = ~c & b;
  uint8_t t3 = t0 ^ ~c; // hard
  uint8_t t5 = t3 ^ t1;
  *l = (~b & a) ^ t1;
  *r = (t5 & a) ^ t3; // 8 ops

  uint8_t t3 = t0 ^ ~c;
  uint8_t t3 = (c & b) ^ ~c;
  uint8_t t3 = ((c & b) & ~~c) | (~(c & b) & ~c)
  uint8_t t3 = b | ((~c | ~b) & ~c)
  uint8_t t3 = b + ((~c + ~b) * ~c)
  uint8_t t3 = b + ~c + ~b~c
  uint8_t t3 = b + ~c // puh

  uint8_t t1 = ~c & b;
  uint8_t t3 = b | ~c;
  uint8_t t5 = t3 ^ t1;
  *l = (~b & a) ^ t1;
  *r = (t5 & a) ^ t3; // 7 ops
}
{% endcodeblock %}

10 ops (not counting negation, except ~t0) after manual optimization

Let's reduce `SBOXL()` using the following rules:

* Anything *XOR*-ed with itself is always zero.
* Anything *XOR*-ed with zero is just the original value.
* Anything *XOR*-ed with ones is the original value with bits flipped.

------
------
------

### Arranging the multiplexers

To compute each output bit separately let's split the SBOX in two. The input
`0b000` would yield `0` for the left and `1` for the right bit, i.e. `0b01`
combined.

Here's the 3-to-1-bit `SBOXR[]` visualized as a structure resembling a decision
tree. The output bit is selected according to the values of the boolean inputs
`a`, `b`, and `c`.

We can now write a bitsliced `SBOXR()` using `mux()` by following the output
bits in the tree above from left to right. The tree uses 1-bit parameters, we
however use `uint8_t` ones. So instead of `1` we'll use `~0` to get `0b11111111`.

Construct `SBOXL()` the same way. It's a tad simpler because it turns out we
can ignore `c` when both inputs for the last row of multiplexers are equal.
*(It helps to draw the decision tree yourself if you don't follow.)*

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

## Karnaugh Maps
