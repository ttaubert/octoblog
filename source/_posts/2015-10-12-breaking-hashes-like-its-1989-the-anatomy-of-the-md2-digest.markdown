---
layout: post
title: "Breaking hashes like it's 1989 - The Anatomy of the MD2 digest"
date: 2015-10-10 18:00:00 +0200
published: false
---

With a [SHA-1 freestart collision](https://sites.google.com/site/itstheshappening/)
in the news, describing a quite sophisticated cryptanalytical attack against
the digest, let's step back a few years. To somewhat simpler times, before
most people used the SHA family of ciphers. The
[MD2 Message-Digest Algorithm](https://en.wikipedia.org/wiki/MD2_%28cryptography%29),
published in 1989, was part of TLS prior to version 1.1, and used in PKIs to
sign certificates. It's considered broken since at least 2004 and was
[retired](http://tools.ietf.org/html/rfc6149) in 2011.

## Compression Functions

If you never heard about cryptographic hash function constructions before, it
helps to knows that most use a
[compression function](https://en.wikipedia.org/wiki/One-way_compression_function)
that transforms two fixed-length inputs into a fixed-length output. Each input
block is combined with the current internal state until there are no input
blocks left, the result is the digest.

{% img /images/compression-functions.png 600 Hash and compression functions (simplified overview) %}

The compression function *c* takes two 128-bit inputs and compresses them to
a single 128-bit output. Assuming we have a function `compress()` that
takes a state/IV and a message block, we would end up with this Rust code:

{% codeblock lang:rust %}
fn digest(msg: &[u8]) -> [u8; 16] {
  fn compress(state: &[u8], block: &[u8]) -> [u8; 16] { ... }

  let iv = [0u8; 16];
  let blocks = msg.chunks(16);

  blocks.fold(iv, |state, block| compress(&state, block))
}
{% endcodeblock %}

## MD2 - A short timeline

MD2 is not a straight
[Merkle–Damgård construction](https://en.wikipedia.org/wiki/Merkle-Damgard),
where the collision-resistance of the algorithm is based on the theory that the
compression function itself is collision-resistant (and one-way). Instead of an
MD-compliant padding scheme, MD2 computes a non-linear checksum over the whole
input and feeds it to the compression function as the last block.

This checksum saved MD2's butt for quite a while. Already in 1997,
[Rogier and Chauvaud showed](http://dl.acm.org/citation.cfm?id=263096) that the
compression function is not collision-resistant, but they were unable to extend
the attack to the full MD2. Even the best known attack requires ~2^63
compression function evalutions, not a huge improvement over the
birthday attack with ~2^65 evaluations.

A [preimage attack](http://www.ssi.gouv.fr/archive/fr/sciences/fichiers/lcr/mu04c.pdf)
with complexity 2^104 was found in 2004,
[by 2008 improved](http://eprint.iacr.org/2008/089.pdf) to 2^73, and that was
pretty much the begin of the end of MD2 for use in PKIs. But even before it was
already superseded by other cryptographic hash functions as its performance
couldn't compete with modern designs. Though as with SHA-1, certificates with
MD2 signatures did unfortunately not disappear from one day to the other.

## Collision-Resistance and the Birthday Attack

> *A cryptographic hash function with an n-bit output is considered broken when
> collisions can be found in time significantly less than O(1.25 * sqrt(2^n)),
> i.e. the complexity of the generic birthday attack.*

Finding a collision for MD2 means determining two distinct input values `a`
and `b` that result in the same output digest such that `md2(a) = md2(b)`.
Of course you could simply feed random input values to `md2()` until you hit
a collision, this attack works for every hash function but takes some time.

Guided by our intuition we would think that an n-bit digest and thus 2^n
possible outputs would require a lot of evaluations until we find a collision,
that's after all 2^128 possible digests for MD2. Yet, per the
[birthday paradox](https://en.wikipedia.org/wiki/Birthday_problem) we on
average, and with high probability, will only need to generate 1.25 * sqrt(2^n)
random inputs.

As the [birthday attack](https://en.wikipedia.org/wiki/Birthday_attack) is a
generic attack that works against every hash function it gives a lower bound
on the output size of a secure cryptographic hash function. That's another
reason why MD2 wouldn't have survived much longer, SHA-1 with a 160-bit
output will take roughly 2^80 evaluations to find a collision and that's
probably as low as you want to go.

## One-way functions and Preimage Resistance

> *A cryptographic hash function with an n-bit output is considered broken when
> (second) preimages can be found in time significantly less than O(2^n), i.e.
> the complexity of the brute-force attack.*

Cryptographically secure hash functions must be one-way, that is it should be
infeasible to find the input value associated with a given output value. For
MD2, finding the preimage of `x` means finding `a` such that `md2(a) = x`.

Finding a second preimage of `md2(a) = x` means finding `b ≠ a` such that
`md2(a) = md2(b) = x`. This is somewhat similar to finding a collision,
however it is a specific collision. One that fulfills the above equation
for a given input value.

## Let's go find some collisions

If you made it until here (*yay!*) you deserve to know how we can find
collisions in MD2's compression function. The first attack is described in
Rogier and Chauvaud's 1997 paper ["MD2 is not Secure Without the Checksum Byte"](http://dl.acm.org/citation.cfm?id=263096).
To understand how it works we need a good understanding of MD2's compression
function.

### The compression function's setup

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec a diam lectus. Sed sit amet ipsum mauris. Maecenas congue ligula ac quam viverra nec consectetur ante hendrerit. Donec et mollis dolor. Praesent et diam eget libero egestas mattis sit amet vitae augue. Nam tincidunt congue enim, ut porta lorem lacinia consectetur.

{% img /images/md2-compression1.png 500 TODO %}

Donec ut libero sed arcu vehicula ultricies a non tortor. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aenean ut gravida lorem. Ut turpis felis, pulvinar a semper sed, adipiscing id dolor. Pellentesque auctor nisi id magna consequat sagittis.

### The transformation

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec a diam lectus. Sed sit amet ipsum mauris. Maecenas congue ligula ac quam viverra nec consectetur ante hendrerit. Donec et mollis dolor. Praesent et diam eget libero egestas mattis sit amet vitae augue.

{% codeblock lang:rust %}
fn compress(state: &[u8], msg: &[u8]) -> [u8; 16] {
  /* ... */

  let mut v: [u8; 48] = /* (see above) */;
  let mut t = 0u8;

  /* 18 rounds of transformations */
  for i in 0..18 {
    for j in 0..v.len() {
      v[j] ^= SBOX[t];
      t = v[j];
    }

    // Addition modulo 256.
    t = t.wrapping_add(i);
  }

  /* ... */
}
{% endcodeblock %}

Donec ut libero sed arcu vehicula ultricies a non tortor. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aenean ut gravida lorem. Ut turpis felis, pulvinar a semper sed, adipiscing id dolor. Pellentesque auctor nisi id magna consequat sagittis.

Mention `SBOX` and refer to https://github.com/ttaubert/rust-md2-sbox
