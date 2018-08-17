---
layout: post
title: "Bitslicing with Karnaugh maps"
subtitle: "Data Orthogonalization for Cryptography"
date: 2018-08-16T09:41:05+02:00
---

*Bitslicing*, in cryptography, is the technique of converting arbitrary
functions into logic circuits, thereby enabling fast, constant-time
implementations of cryptographic algorithms immune to cache and
timing-related side channel attacks.

My last post [Bitslicing, An Introduction](/blog/2018/08/bitslicing-an-introduction/)
showed how to convert an S-box function into thruth tables, then into a tree of
multiplexers, and finally how to find the lowest possible gate count through
manual optimization.

Today's post will focus on a simpler and faster way to achieve this. A
[Karnaugh map](https://en.wikipedia.org/wiki/Karnaugh_map) is a method of
simplifying Boolean algebra expressions by taking advantage of humans'
pattern-recognition capability. In short, we'll bitslice an S-box using K-maps.

## A tiny S-box

Here again is the 3-to-2-bit [S-box](https://en.wikipedia.org/wiki/S-box)
function from the previous post.

{% codeblock lang:cpp %}
uint8_t SBOX[] = { 1, 0, 3, 1, 2, 2, 3, 0 };
{% endcodeblock %}

> This AES-inspired S-box interprets three input bits as a polynomial in
> *GF(2^3)* and computes its inverse *mod P(x) = x^3 + x^2 + 1*, with
> *0^(-1) := 0*. The result plus *(x^2 + 1)* is converted back into bits
> and the MSB is dropped.

This S-box can be represented as a function of three Boolean variables, where
*f(0,0,0) = 0b01*, *f(0,0,1) = 0b00*, *f(0,1,0) = 0b11*, etc. Each output bit
can be represented by its own Boolean function where *f<sub>L</sub>(0,0,0) = 0*
and *f<sub>R</sub>(0,0,0) = 1*, *f<sub>L</sub>(0,0,1) = 0* and
*f<sub>R</sub>(0,0,1) = 0*, ...

### A truth table per output bit

Each output bit has its own Boolean function, and therefore also its own thruth
table. Here are the truth tables for the Boolean functions *f<sub>L</sub>(a,b,c)*
and *f<sub>R</sub>(a,b,c)*:

{% codeblock lang:cpp %}
 abc | SBOX            abc | f_L()         abc | f_R()
-----|------          -----|-------       -----|-------
 000 | 01              000 | 0             000 | 1
 001 | 00              001 | 0             001 | 0
 010 | 11              010 | 1             010 | 1
 011 | 01     --->     011 | 0      +      011 | 1
 100 | 10              100 | 1             100 | 0
 101 | 10              101 | 1             101 | 0
 110 | 11              110 | 1             110 | 1
 111 | 00              111 | 0             111 | 0
{% endcodeblock %}

Whereas previously at this point we built a tree of multiplexers out of each
truth table, we'll now build a Karnaugh map (K-map) per output bit.

## Karnaugh Maps

The values of *f<sub>L</sub>(a,b,c)* and *f<sub>R</sub>(a,b,c)* are transferred
onto a two-dimensional grid with the cells ordered in [Gray code](https://en.wikipedia.org/wiki/Gray_code).
Each cell position represents one possible combination of input bits, while each
cell value represents the value of the output bit.

{% img /images/kmaps.png Two K-maps, one for each of the two Boolean functions %}

The row and column indices *(a)* and *(b || c)* are ordered in Gray code rather
than binary numerical order to ensure only a single variable changes between
each pair of adjacent cells. Otherwise, products of predicates
(`A & B`, `A & C`, ...) would scatter.

These products are what you want to spot to get a minimum length representation
of the truth function. If the output bit is the same at two adjacent cells,
then it's independent of one of the two input variables, because
`(A & ~B) | (A & B) = A`.

### Building groups

The heart of simplifying Boolean expressions via K-maps is building groups of
adjacent cells with the output equal to `1`. [The rules](http://www.ee.surrey.ac.uk/Projects/Labview/minimisation/karrules.html) are as follows:

* Groups are rectangles of *2^n* cells with output value `1`.
* Groups may not include cells with output value `0`.
* Each cell with output value `1` must be in at least one group.
* Groups may be horizontal or vertical, not diagonal.
* Each group should be as large as possible.
* There should be as few groups as possible.
* Groups may overlap.

{% img /images/kmaps.gif Animation: Building groups on the two K-maps %}

With our small K-maps this is simple enough. We first spot all cells with
output value `1`. We then form a *<span style="color:#c62817">red</span>* group
for the two horizontal groups of size *2^1*. The two vertical groups are marked
with *<span style="color:#118730">green</span>*, also of size *2^1*.

On *f<sub>R</sub>*'s K-map on the right, the *<span style="color:#c62817">red</span>*
and *<span style="color:#118730">green</span>* group overlap. As per the rules
above, that's perfectly fine. The cell at `abc=110` can't be without a group
and we're instructed to form the largest groups possible, so they overlap.

But wait, you say, what's going on with the *<span style="color:#1167bd">blue</span>* rectangle in the K-map for
*f<sub>R</sub>*?

### Wrapping around

A somewhat unexpected property of K-maps is that groups in them can wrap around

{% img /images/kmaps-rotate.gif Animation: Rotating the right K-map %}

Image the torus, or imagine just rotating the table with different values for the columns/rows, they're definitely adjacent.

Groups may wrap around the table. The leftmost cell in a row may be grouped with the rightmost cell and the top cell in a column may be grouped with the bottom cell. 

## A bitsliced SBOX() function

Sollte der Term noch nicht minimal sein, ist eine weitere Vereinfachung durch Anwenden des Distributivgesetzes (Ausklammern) möglich.

## end

It would also have been possible to derive this simplification by carefully applying the axioms of boolean algebra, but the time it takes to do that grows exponentially with the number of terms. 
