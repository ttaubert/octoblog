---
layout: post
title: "Bitslicing with Quine-McCluskey"
subtitle: "Data Orthogonalization for Cryptography"
date: 2018-08-25T15:00:00+02:00
---

Part one gave a short introduction of bitslicing as a concept, talked about
its use cases, truth tables, software multiplexers, LUTs, and manual optimization.

The second covered [Karnaugh mapping](https://en.wikipedia.org/wiki/Karnaugh_map),
a visual method to simplify Boolean algebra expressions that takes advantage of
humans’ pattern-recognition capability, but is unfortunately limited to at most
four inputs in its original variant.

Part three will introduce the [Quine-McCluskey algorithm](https://en.wikipedia.org/wiki/Quine%E2%80%93McCluskey_algorithm),
a tabulation method that, in combination with [Petrick's method](https://en.wikipedia.org/wiki/Petrick%27s_method),
can minimize circuits with an arbitrary number of input values. Both are relatively simple to implement in software.

> [Part 1: Bitslicing, An Introduction](/blog/2018/08/bitslicing-an-introduction/)  
> [Part 2: Bitslicing with Karnaugh maps](/blog/2018/08/bitslicing-with-karnaugh-maps/)  
> Part 3: Bitslicing with Quine-McCluskey

## The Quine-McCluskey algorithm

Here is the 3-to-2-bit [S-box](https://en.wikipedia.org/wiki/S-box) from the
previous posts again:

{% codeblock lang:cpp %}
uint8_t SBOX[] = { 1, 0, 3, 1, 2, 2, 3, 0 };
{% endcodeblock %}

Without much ado, we'll jump right in and bitslice functions for both its
output bits in parallel. You'll probably recognize a few similarities to K-maps,
except that the steps are rather mechanical and don't require visual
pattern-recognition abilities.

### Step 1: Listing minterms

The lookup table `SBOX[]` can be expressed as the Boolean functions
*f<sub>L</sub>(a,b,c) and *f<sub>R</sub>(a,b,c). Here are their truth tables,
with each combination of inputs assigned a symbol *m<sub>i</sub>*. Rows
*m<sub>0</sub>-m<sub>7</sub>* will be called *minterms*.

<div class="table-wrapper minterms">
  <table>
    <caption>f<sub>L</sub>(a,b,c)</caption>
    <thead>
      <tr>
        <th></th>
        <th>a</th>
        <th>b</th>
        <th>c</th>
        <th>f<sub>L</sub></th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>m<sub>0</sub></td><td>0</td><td>0</td><td>0</td><td>0</td>
      </tr>
      <tr>
        <td>m<sub>1</sub></td><td>0</td><td>0</td><td>1</td><td>0</td>
      </tr>
      <tr>
        <td>m<sub>2</sub></td><td>0</td><td>1</td><td>0</td><td>1</td>
      </tr>
      <tr>
        <td>m<sub>3</sub></td><td>0</td><td>1</td><td>1</td><td>0</td>
      </tr>
      <tr>
        <td>m<sub>4</sub></td><td>1</td><td>0</td><td>0</td><td>1</td>
      </tr>
      <tr>
        <td>m<sub>5</sub></td><td>1</td><td>0</td><td>1</td><td>1</td>
      </tr>
      <tr>
        <td>m<sub>6</sub></td><td>1</td><td>1</td><td>0</td><td>1</td>
      </tr>
      <tr>
        <td>m<sub>7</sub></td><td>1</td><td>1</td><td>1</td><td>0</td>
      </tr>
    </tbody>
  </table>

  <table>
    <caption>f<sub>R</sub>(a,b,c)</caption>
    <thead>
      <tr>
        <th></th>
        <th>a</th>
        <th>b</th>
        <th>c</th>
        <th>f<sub>R</sub></th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>m<sub>0</sub></td><td>0</td><td>0</td><td>0</td><td>1</td>
      </tr>
      <tr>
        <td>m<sub>1</sub></td><td>0</td><td>0</td><td>1</td><td>0</td>
      </tr>
      <tr>
        <td>m<sub>2</sub></td><td>0</td><td>1</td><td>0</td><td>1</td>
      </tr>
      <tr>
        <td>m<sub>3</sub></td><td>0</td><td>1</td><td>1</td><td>1</td>
      </tr>
      <tr>
        <td>m<sub>4</sub></td><td>1</td><td>0</td><td>0</td><td>0</td>
      </tr>
      <tr>
        <td>m<sub>5</sub></td><td>1</td><td>0</td><td>1</td><td>0</td>
      </tr>
      <tr>
        <td>m<sub>6</sub></td><td>1</td><td>1</td><td>0</td><td>1</td>
      </tr>
      <tr>
        <td>m<sub>7</sub></td><td>1</td><td>1</td><td>1</td><td>0</td>
      </tr>
    </tbody>
  </table>
</div>

We're interested only in the minterms where the function evaluates to `1` and
will ignore all others. Boolean functions can already be constructed with just
those tables. In [Boolean algebra](https://en.wikipedia.org/wiki/Boolean_algebra),
*OR* can be expressed as addition, *AND* as multiplication. The negation of *x*
is represented by *<span style="text-decoration:overline">x</span>*.

<pre>
f<sub>L</sub>(a,b,c) = ∑ m(2,4,5,6)
          = m<sub>2</sub> + m<sub>4</sub> + m<sub>5</sub> + m<sub>6</sub>
          = <span style="text-decoration:overline">a</span>b<span style="text-decoration:overline">c</span> + a<span style="text-decoration:overline">b</span><span style="text-decoration:overline">c</span> + a<span style="text-decoration:overline">b</span>c + ab<span style="text-decoration:overline">c</span>

f<sub>R</sub>(a,b,c) = ∑ m(0,2,3,6)
          = m<sub>0</sub> + m<sub>2</sub> + m<sub>3</sub> + m<sub>6</sub>
          = <span style="text-decoration:overline">a</span><span style="text-decoration:overline">b</span><span style="text-decoration:overline">c</span> + <span style="text-decoration:overline">a</span>b<span style="text-decoration:overline">c</span> + a<span style="text-decoration:overline">b</span><span style="text-decoration:overline">c</span> + ab<span style="text-decoration:overline">c</span>
</pre>

Well, that's a start. Translated into C, these functions would be constant-time
but not even close to minimal.

### Step 2: Little boxes

Now that we have all these minterms, we'll put them in buckets based on the
number of `1`s in their inputs *a*, *b*, and *c*.

<div class="table-wrapper buckets">
  <table>
    <caption>f<sub>L</sub>(a,b,c)</caption>
    <thead>
      <tr>
        <th># of 1s</th>
        <th>minterm</th>
        <th>binary</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td><td>m<sub>2</sub></td><td >010</td>
      </tr>
      <tr>
        <td></td><td>m<sub>4</sub></td><td>100</td>
      </tr>
      <tr>
        <td>2</td><td>m<sub>5</sub></td><td>101</td>
      </tr>
      <tr>
        <td></td><td>m<sub>6</sub></td><td>110</td>
      </tr>
    </tbody>
  </table>

  <table>
    <caption>f<sub>R</sub>(a,b,c)</caption>
    <thead>
      <tr>
        <th># of 1s</th><th>minterm</th><th>binary</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>0</td><td>m<sub>0</sub></td><td>000</td>
      </tr>
      <tr>
        <td>1</td><td>m<sub>2</sub></td><td>010</td>
      </tr>
      <tr>
        <td>2</td><td>m<sub>3</sub></td><td>011</td>
      </tr>
      <tr>
        <td></td><td>m<sub>6</sub></td><td>110</td>
      </tr>
    </tbody>
  </table>
</div>

The reasoning here is the same as the [Gray code](https://en.wikipedia.org/wiki/Gray_code)
ordering for Karnaugh maps. If we start with the minterms in the first bucket *n*,
only bucket *n+1* might contain matching minterms where only a single variable
changes. They can't be in any of the other buckets.

### Step 3: Merging minterms

Why would you even look for pairs of minterms with a one-variable difference?
Because they can be merged to simplify our expression. These combinations are
called *minterms of size 2*.

All minterms have output `1`, so if the only difference is exactly one input
variable, then the output is independent of it. For example, `(a & ~b & c) | (a & b & c)`
can be reduced to just `a & c`, the expression value is independent of *b*.

<div class="table-wrapper buckets size2">
  <table>
    <caption>f<sub>L</sub>(a,b,c)</caption>
    <thead>
      <tr>
        <th># of 1s</th>
        <th>minterm</th>
        <th>binary</th>
        <th colspan="2">size-2</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td><td>m<sub>2</sub></td><td >010</td><td>m<sub>2,6</sub></td><td>—10</td>
      </tr>
      <tr>
        <td></td><td>m<sub>4</sub></td><td>100</td><td>m<sub>4,5</sub></td><td>10—</td>
      </tr>
      <tr>
        <td></td><td></td><td></td><td>m<sub>4,6</sub></td><td>1—0</td>
      </tr>
      <tr>
        <td>2</td><td>m<sub>5</sub></td><td>101</td><td></td><td></td>
      </tr>
      <tr>
        <td></td><td>m<sub>6</sub></td><td>110</td><td></td><td></td>
      </tr>
    </tbody>
  </table>

  <table>
    <caption>f<sub>R</sub>(a,b,c)</caption>
    <thead>
      <tr>
        <th># of 1s</th><th>minterm</th><th>binary</th><th colspan="2">size-2</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>0</td><td>m<sub>0</sub></td><td>000</td><td>m<sub>0,2</sub></td><td>0—0</td>
      </tr>
      <tr>
        <td>1</td><td>m<sub>2</sub></td><td>010</td><td>m<sub>2,3</sub></td><td>01—</td>
      </tr>
      <tr>
        <td></td><td></td><td></td><td>m<sub>2,6</sub></td><td>—10</td>
      </tr>
      <tr>
        <td>2</td><td>m<sub>3</sub></td><td>011</td><td></td><td></td>
      </tr>
      <tr>
        <td></td><td>m<sub>6</sub></td><td>110</td><td></td><td></td>
      </tr>
    </tbody>
  </table>
</div>

Always start with the minterms in the very first bucket at the top of the table.
For every minterm in bucket *n*, we try to find a minterm in bucket *n+1* with a
one-bit difference in the *binary* column. Any matches will be recorded as pairs
and entered into the *size-2* column of bucket *n*.

*m<sub>2</sub>=010* and *m<sub>6</sub>=110* for example differ in only the first
input variable, *a*. They merge into *m<sub>2,6</sub>=—10*, with a dash marking
the position of the irrelevant input bit.

Once all minterms were combined (as far as possible), we'll continue with the
next size. Minterms of size bigger than 1 have dashes for irrelevant input bits
and it's important to treat those as a "third bit value". In other words, their
dashes must be at the same positions, otherwise they can't be merged.

There's nothing left to merge for *f<sub>L</sub>(a,b,c)* as all
its size-2 minterms are in the first bucket. For *f<sub>R</sub>(a,b,c)*, none
of the minterms in the first bucket match any of those in the second bucket,
their dashes are all in different positions.

### Step 4: Prime Implicants

All minterms from the previous step that can't be combined any further are
called *prime implicants*. Entering them into a table let's us check how well
they cover the original minterms determined by step 1.

If any prime implicant is the only one to cover a minterm, it's called an
*essential prime implicant* (marked with an asterisk). It's essential because
it must be included in the resulting minimal form, otherwise we'd miss one of
the input values combinations.

<div class="table-wrapper prime">
  <table>
    <caption>f<sub>L</sub>(a,b,c)</caption>
    <thead>
      <tr>
        <th></th>
        <th>m<sub>2</sub></th>
        <th>m<sub>4</sub></th>
        <th>m<sub>5</sub></th>
        <th>m<sub>6</sub></th>
        <th>abc</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>m<sub>2,6</sub>*</td><td class="essential">x</td><td></td><td></td><td>x</td><td>-10</td>
      </tr>
      <tr>
        <td>m<sub>4,5</sub>*</td><td></td><td>x</td><td class="essential">x</td><td></td><td>10-</td>
      </tr>
      <tr>
        <td>m<sub>4,6</sub>&nbsp;</td><td></td><td>x</td><td></td><td>x</td><td>1-0</td>
      </tr>
    </tbody>
  </table>

  <table>
    <caption>f<sub>R</sub>(a,b,c)</caption>
    <thead>
      <tr>
        <th></th>
        <th>m<sub>0</sub></th>
        <th>m<sub>2</sub></th>
        <th>m<sub>3</sub></th>
        <th>m<sub>6</sub></th>
        <th>abc</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>m<sub>0,2</sub>*</td><td class="essential">x</td><td>x</td><td></td><td></td><td>0-0</td>
      </tr>
      <tr>
        <td>m<sub>2,3</sub>*</td><td></td><td>x</td><td class="essential">x</td><td></td><td>01-</td>
      </tr>
      <tr>
        <td>m<sub>2,6</sub>*</td><td></td><td>x</td><td></td><td class="essential">x</td><td>-10</td>
      </tr>
    </tbody>
  </table>
</div>

Prime implicant *m<sub>2,6</sub>\** on the left for example is the only one that
covers *m<sub>2</sub>*. *m<sub>4,5</sub>\** is the only one that covers
*m<sub>5</sub>*. Not only is *m<sub>4,6</sub>* not essential, but we actually
don't need it at all: *m<sub>4</sub>* and *m<sub>6</sub>* are already covered
by the essential prime implicants. All prime implicants of f<sub>R</sub>(a,b,c)
are essential, so we need all of them.

When bitslicing functions with many input variables it may happen that you are
left with a number of non-essential prime implicants that can be combined in
various ways to cover the missing minterms. [Petrick's method](https://en.wikipedia.org/wiki/Petrick%27s_method)
helps finding a minimum solution. It's tedious to do manually, but relatively
simple to implement in software.

### Step 5: Minimal Forms

We can derive minimal forms of our Boolean functions by looking at the *abc*
column of the essential prime implicants. The input variable marked with a dash
is ignored.

<pre>
f<sub>L</sub>(a,b,c) = m<sub>2,6</sub> + m<sub>4,5</sub> = b<span style="text-decoration:overline">c</span> + a<span style="text-decoration:overline">b</span>
</pre>

The code for `SBOXL()` with 8-bit inputs:

{% codeblock lang:cpp %}
uint8_t SBOXL(uint8_t a, uint8_t b, uint8_t c) {
  return (b & ~c) | (a & ~b);
}
{% endcodeblock %}

*f<sub>R</sub>(a,b,c)*, reduced to the combination of its three essential prime implicants:

<pre>
f<sub>R</sub>(a,b,c) = m<sub>0,2</sub> + m<sub>2,3</sub> + m<sub>2,6</sub> = <span style="text-decoration:overline">a</span><span style="text-decoration:overline">c</span> + <span style="text-decoration:overline">a</span>b + b<span style="text-decoration:overline">c</span>
</pre>

And `SBOXR()` as expected:

{% codeblock lang:cpp %}
uint8_t SBOXR(uint8_t a, uint8_t b, uint8_t c) {
  return (~a & ~c) | (~a & b) | (b & ~c);
}
{% endcodeblock %}

Combining `SBOXL()` and `SBOXR()` yields the familiar version of `SBOX()`, if
we eliminate common subexpressions and take out common factors.

{% codeblock lang:cpp %}
void SBOX(uint8_t a, uint8_t b, uint8_t c, uint8_t* l, uint8_t* r) {
  uint8_t na = ~a;
  uint8_t nb = ~b;
  uint8_t nc = ~c;

  uint8_t t0 = b & nc;
  uint8_t t1 = b | nc;

  *l = (a & nb) | t0;
  *r = (na & t1) | t0;
}
{% endcodeblock %}

## Bitslicing a DES S-box

When I started writing this blog post I thought it would be nice to ditch the
small S-box from the previous posts, and naively bitslice a "real" S-box, like
the ones used in [DES](https://en.wikipedia.org/wiki/Data_Encryption_Standard).

But these are 6-to-4-bit S-boxes, how much more effort can it be? Turns out we
humans are terrible at understanding exponential growth. Here are my intermediate
results after writing frantically for 1-2 hours, trying to bitslice just one of
the output bits:

{% img /images/des-bitslice.jpg Bitslicing one output bit of a DES S-box manually %}

I made a mistake somewhere in the middle and would have had to go back a few
steps or I wouldn't get a minimal solution. I realized that bitslicing a function
with that many input variables manually is way too much effort, it takes too long
and is error-prone.

At the beginning I mentioned that Quine-McCluskey and Petrick's method can be
implemented in software rather easily, so that's what I did instead. I'll
explain how, and what to consider when doing that, in the next post.
