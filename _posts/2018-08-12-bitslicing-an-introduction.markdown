---
layout: post
title: "Bitslicing, An Introduction"
subtitle: "Data Orthogonalization for Cryptography"
date: 2018-08-12T08:00:00+02:00
---

I recently found myself looking for resources to brush up on bitsliced
implementations of crypto algorithms. To my surprise, there's not a lot out
there, aside from Thomas' excellent page on [constant-time crypto](https://www.bearssl.org/constanttime.html#bitslicing).
For the benefit of future me (and you), here's a recap.

This post intends to give a brief overview over bitslicing as a technique, not
requiring much of a cryptographic background. After working through a small
example you should leave with a basic understanding, sufficient to dive into
one of the many papers about fast, constant-time, bitsliced crypto algorithms.

## What is bitslicing?

*Bitslicing* is a term coined by Matthew Kwan. It describes the now 20-year-old
technique introduced by Eli Biham in his paper [A Fast New DES Implementation in Software](http://www.cs.technion.ac.il/users/wwwb/cgi-bin/tr-get.cgi/1997/CS/CS0891.pdf),
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
a bunch of Boolean gates.

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
We're going to do the reverse and convert our S-box into trees of multiplexers.

[Multiplexer](https://en.wikipedia.org/wiki/Multiplexer) is just a fancy word
for *data selector*. A 2-to-1 multiplexer selects one of two input bits. A
*selector* bit decides which of the two inputs will be selected.

{% codeblock lang:cpp %}
bool mux(bool a, bool b, bool s) {
  return s ? b : a;
}
{% endcodeblock %}

Here are the LUTs, or rather truth tables, for the Boolean functions
*f<sub>L</sub>(a,b,c)* and *f<sub>R</sub>(a,b,c)*:

{% codeblock lang:cpp %}
 abc | SBOX            abc | f_L()         abc | f_R()
-----|------           ----|-------       -----|-------
 000 | 01              000 | 0             000 | 1
 001 | 00              001 | 0             001 | 0
 010 | 11              010 | 1             010 | 1
 011 | 01     --->     011 | 0      +      011 | 1
 100 | 10              100 | 1             100 | 0
 101 | 10              101 | 1             101 | 0
 110 | 11              110 | 1             110 | 1
 111 | 00              111 | 0             111 | 0
{% endcodeblock %}

The truth table for *f<sub>L</sub>(a,b,c)* is *(0, 0, 1, 0, 1, 1, 1, 0)* or
*2E<sub>h</sub>*. We can also call this the LUT-mask in the context of an
FPGA. For each output bit of our S-box we need a 3-to-1 multiplexer, and
that in turn can be represented by 2-to-1 multiplexers.

{% img /images/mux.png A 3-to-1 multiplexer with LUT-mask 0x2E %}

### Multiplexers in Software

Let's take the `mux()` function from above and make it constant-time. As stated
earlier, bitslicing is competitive only through parallelization, so, for
demonstration, we'll use `uint8_t` arguments to compute eight S-box lookups
in parallel.

{% codeblock lang:cpp %}
uint8_t mux(uint8_t a, uint8_t b, uint8_t s) {
  return (a & ~s) | (b & s);
}
{% endcodeblock %}

If the *n*-th bit of `s` is zero it selects the *n*-th bit in `a`, if not it
forwards the *n*-th bit in `b`. The wider the target architecture's registers,
the bigger the theoretical throughput -- assuming the workload can take
advantage of the level of parallelization.

### A first implementation

For a start, the two output bits will be computed separately and then assembled
into the final value returned by `SBOX()`. Each multiplexer in the above diagram
is represented by a `mux()` call. The first four take the LUT-masks
*2E<sub>h</sub>* and *B2<sub>h</sub>* as inputs.

The diagram shows Boolean functions that only work on single-bit parameters.
We use `uint8_t`, so instead of `1` we need to use `~0` to get `0b11111111`.

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

This works just fine. It's a constant-time implementation, immune to cache
timing attacks. Not counting negation of `0`, this takes 42 gates. Assuming,
for the sake of simplicity, that a table lookup is a single-cycle operation,
even fully parallelized this is still about five times slower. If we had a
workflow that allowed for 64 S-Box lookups in parallel, switching to `uint64_t`
would be simple.

### Simplifying the circuit

The current circuit is not minimal. [Circuit minimization](https://en.wikipedia.org/wiki/Logic_optimization#Circuit_minimization_in_Boolean_algebra)
is a field of its own, that I'm not going to touch on here. Let's instead
reduce complexity by following these rules:

* `mux(a, a, s)` reduces to `a`.
* Any `X AND ~0` will always be `X`.
* Anything `AND 0` will always be `0`.
* `mux()` with constant inputs can be reduced to a single `OR`.

Inline the remaining `mux()` calls, eliminate common subexpressions, repeat.

{% codeblock lang:cpp %}
uint8_t SBOX(uint8_t a, uint8_t b, uint8_t c, uint8_t* l, uint8_t* r) {
  uint8_t na = ~a;
  uint8_t nb = ~b;
  uint8_t nc = ~c;

  uint8_t t0 = nc & b;
  uint8_t t2 = nb | t0;
  uint8_t t3 = (nc & nb) | b;

  *l = (t0 & na) | (t2 & a);
  *r = (t3 & na) | (t0 & a);
}
{% endcodeblock %}

We reduced this circuit from 42 to 11 gates. Not bad. There's more we could optimize,
just following the laws of Boolean algebra. But this gets tedious fast.

### A different mux() function

The `mux()` function currently needs three operations. Let's rewrite it using
an *XOR* gate:

{% codeblock lang:cpp %}
uint8_t mux(uint8_t a, uint8_t b, uint8_t s) {
  uint8_t c = a ^ b;
  return (c & s) ^ a;
}
{% endcodeblock %}

This lends itself to sometimes easier optimizations.

Now there still are three gates but it turns out we can reduce in a lot of
cases where we can either precompute `a ^ b` or reuse the result. The last row
of multiplexers always uses constants, so, inlining `mux()` in some places, we
get the following:

Same things as above, replace `mux()`, eliminate comm subexpr.

* Anything *XOR*-ed with itself is always zero.
* Anything *XOR*-ed with zero is just the original value.
* Anything *XOR*-ed with ones is the original value with bits flipped.
* Anything *AND* ones is just the original value.

{% codeblock lang:cpp %}
void SBOX(uint8_t a, uint8_t b, uint8_t c, uint8_t* l, uint8_t* r) {
  uint8_t nc = ~c;

  uint8_t t0 = c & b;
  uint8_t t1 = nc & b;
  uint8_t t3 = t0 ^ nc;
  uint8_t t4 = t1 ^ ~t0;
  uint8_t t5 = t3 ^ t1;

  *l = (t4 & a) ^ t1;
  *r = (t5 & a) ^ t3;
{% endcodeblock %}

11 ops too.

https://en.wikipedia.org/wiki/Boolean_algebra#Laws

{% codeblock lang:cpp %}
void SBOX(uint8_t a, uint8_t b, uint8_t c, uint8_t* l, uint8_t* r) {
  uint8_t na = ~a;
  uint8_t nb = ~b;
  uint8_t nc = ~c;

  uint8_t t0 = nb & a;
  uint8_t t1 = nc & b;
  uint8_t t2 = na & b;
  uint8_t t3 = na & nc;

  *l = t0 | t1;
  *r = t1 | t2 | t3;
}
{% endcodeblock %}

10 ops after manual optimization

VERY tedious and hard, and error-prone. VERY long, probably 60 minutes in total.

## Karnaugh Maps
