---
layout: post
title: "Bitslicing, An Introduction"
subtitle: "Data Orthogonalization for Cryptography"
date: 2018-08-14T08:00:00+02:00
---

*Bitslicing* is the strategy of implementing arbitrary functions as Boolean
circuits, replacing logic gates by instructions working on registers of several
bits. It enables fast, constant-time implementations of cryptographic algorithms
immune to cache and timing-related side channel attacks.

This post intends to give a brief overview the general technique, not requiring
much of a cryptographic background, and leave you with a basic understanding --
sufficient to dive into one of the many modern bitslicing papers.

## What is bitslicing?

Matthew Kwan coined the term about 20 years ago after seeing Eli Biham present
his paper [A Fast New DES Implementation in Software](http://www.cs.technion.ac.il/users/wwwb/cgi-bin/tr-get.cgi/1997/CS/CS0891.pdf).
He later published [Reducing the Gate Count of Bitslice DES](http://fgrieu.free.fr/Mattew%20Kwan%20-%20Reducing%20the%20Gate%20Count%20of%20Bitslice%20DES.pdf)
showing an even faster DES building on Biham's ideas.

The basic concept is to express a function in terms of single-bit logical
operations -- *AND*, *XOR*, *OR*, *NOT*, etc. -- as if you were implementing a
logic circuit in hardware. These operations are then carried out for multiple
instances of the function in parallel, using bitwise operations on a CPU.

In a bitsliced implementation, instead of having a single variable storing a,
say, 8-bit number, you have eight variables (slices). The first storing the
left-most bit of the number, the next storing the second bit from the left,
and so on. The parallelism is bounded only by the target architecture's register
width.

## What's it good for?

Biham applied bitslicing to [DES](https://en.wikipedia.org/wiki/Data_Encryption_Standard),
a cipher designed to be fast in hardware. It uses eight different [S-boxes](https://en.wikipedia.org/wiki/S-box),
that were usually implemented as lookup tables. Table lookups in DES however are
rather inefficient, since one has to collect six bits from different words,
combine them, and afterwards put each of the four resulting bits in a
different word.

### Speed

In classical implementations, these bit permutations would be implemented with a
combination of shifts and masks. In a bitslice representation though, permuting
bits really just means using the "right" variables in the next step; this is
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

## Bitslicing a small S-box

So far, this introduction was rather abstract. Let's work through a small
example to see how one could go about converting arbitrary functions into
a bunch of Boolean gates.

Imagine a 3-to-2-bit [S-box](https://en.wikipedia.org/wiki/S-box), a component
found in many symmetric encryption algorithms, also called block ciphers.
Naively, this would be represented by a lookup table with eight entries, e.g.
`SBOX[0b000] = 0b01`, `SBOX[0b001] = 0b00`, etc.

{% codeblock lang:cpp %}
uint8_t SBOX[] = { 1, 0, 3, 1, 2, 2, 3, 0 };
{% endcodeblock %}

> *TMI:* This AES-inspired S-Box interprets three input bits as a polynomial in
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
*selector* bit decides which of the two inputs will be passed through.

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
demonstration, we'll use `uint8_t` arguments to later compute eight
S-box lookups in parallel.

{% codeblock lang:cpp %}
uint8_t mux(uint8_t a, uint8_t b, uint8_t s) {
  return (a & ~s) | (b & s);
}
{% endcodeblock %}

If the *n*-th bit of `s` is zero it selects the *n*-th bit in `a`, if not it
forwards the *n*-th bit in `b`. The wider the target architecture's registers,
the bigger the theoretical throughput -- but only if the workload can take
advantage of the level of parallelization.

### A first implementation

The two output bits will be computed separately and then assembled into the
final value returned by `SBOX()`. Each multiplexer in the above diagram is
represented by a `mux()` call. The first four take the LUT-masks
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

That wasn't too hard. `SBOX()` is constant-time and immune to cache timing
attacks. Not counting the negation of constants (`~0`) we have 42 gates in total
and perform eight lookups in parallel.

Assuming, for simplicity, that a table lookup is just one operation, the
bitsliced version is about five times as slow. If we had a workflow that
allowed for 64 parallel S-Box lookups we could achieve eight times the
current throughput by using `uint64_t` variables.

### A better mux() function

`mux()` currently needs three operations. Here's another variant using *XOR*:

{% codeblock lang:cpp %}
uint8_t mux(uint8_t a, uint8_t b, uint8_t s) {
  uint8_t c = a ^ b;
  return (c & s) ^ a;
}
{% endcodeblock %}

Now there still are three gates, but the new version lends itself often to
easier optimization as we might be able to precompute `a ^ b` and reuse the
result.

### Simplifying the circuit

Let's optimize our circuit manually by following these simple rules:

* `mux(a, a, s)` reduces to `a`.
* Any `X AND ~0` will always be `X`.
* Anything `AND 0` will always be `0`.
* `mux()` with constant inputs can be reduced.

Due to our new `mux()` variant there are a few *XOR* to follow as well:

* Any `X XOR X` reduces to `0`.
* Any `X XOR 0`  reduces to `X`.
* Any `X XOR ~0` reduces to `~X`.

Inline the remaining `mux()` calls, eliminate common subexpressions, repeat.

{% codeblock lang:cpp %}
void SBOX(uint8_t a, uint8_t b, uint8_t c, uint8_t* l, uint8_t* r) {
  uint8_t na = ~a;
  uint8_t nb = ~b;
  uint8_t nc = ~c;

  uint8_t t0 = nb & a;
  uint8_t t1 = nc & b;
  uint8_t t2 = b | nc;
  uint8_t t3 = na & t2;

  *l = t0 | t1;
  *r = t1 | t3;
}
{% endcodeblock %}

Using the [laws of Boolean algebra](https://en.wikipedia.org/wiki/Boolean_algebra#Laws)
and the rules formulated above we've reduced the circuit to 9 gates (down from 42!).

## The Minimal Form

Whew, this has gotten long again, glad you're still reading! You will be
delighted to hear that we actually managed to reduce `SBOX()` as far as possible.

Finding the *minimal form* of a Boolean function is an NP-complete problem. Manual
optimization is tedious but doable for a tiny S-box such as the example used in
this post. It will not be as easy for multiple 6-to-4-bit S-boxes (DES) or an
8-to-8-bit one (AES).

There are simpler and faster algorithms you can use to build those circuits, and
deterministic ways to check whether we reached the minimal form. I will
hopefully find the time to cover these in an upcoming post, in the not
too distant future.
