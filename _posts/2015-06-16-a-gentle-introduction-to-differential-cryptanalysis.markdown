---
layout: post
title: "A gentle introduction to differential cryptanalysis: a bitwise key recovery attack on OSGP's OMA digest"
date: 2015-06-16 18:00:00 +0200
published: false
---

The recently published attacks on the "OMA digest", a home-brewed MAC
used in the [Open Smart Grid Protocol (OSGP)](https://en.wikipedia.org/wiki/Open_smart_grid_protocol),
provide a nice opportunity for a rather gentle introduction to
[differential cryptanalysis](https://en.wikipedia.org/wiki/Differential_cryptanalysis).
This post will dig into the bitwise key recovery attack described in the paper
["Dumb Crypto in Smart Grids: Practical Cryptanalysis of the Open Smart Grid Protocol"](https://eprint.iacr.org/2015/428.pdf)
published by [Philipp Jovanovic](https://twitter.com/Daeinar) and
[Samuel Neves](https://twitter.com/sevenps).

## Overview of the OMA digest

The OMA digest is a [MAC algorithm](https://en.wikipedia.org/wiki/Message_authentication_code),
a function that takes a key and a message as inputs, and returns an
authentication code. Only someone in possession of the correct key should be
able to compute a valid MAC for any data. If for a given MAC the key or data
differ in only the slightest way the verification must fail in order to detect
attackers tampering with traffic.

Before we can attack an algorithm by cryptanalysis we first have to study and
understand its inner workings, and should ideally have an implementation at
hand to confirm our attack is working. Let us take a high-level look at how OMA
message authentication codes (MACs) are computed:

{% img /images/oma-overview.png 500 OMA digest overview %}

The digest can handle messages of any length and processes them in 144-byte
blocks. If the length of the message is not a multiple of 144 the last block
will be padded with zero bytes. The internal state is initialized to zero and
then together with the key passed to the inner function that computes a MAC for
a single block. After processing the first block the resulting state will be
used as the starting point for the second block. The state will be passed on
until there are no blocks left; the resulting MAC is the final state after
processing the last input block.

An important property of this construction is that the internal state is not
modified before it is returned as the MAC of the given message under the given
key - this will turn out to be very useful later. The next section will take
a closer look at the inner function that updates the internal state given a
single 144-byte block.

## Internals of the OMA digest

As shown above, the first call to the inner function will pass the first
144-byte block, the key, and the 8-byte internal state initialized to zero:

{% img /images/oma-state.png 400 The initial 8-byte internal OMA state %}

The algorithm will then start by combining the first block byte and the first
key bit into `state[7]` and then do the same for the second block byte and the
second key bit with `state[6]`. Once it arrives at `state[0]` it will wrap
around and continue from the right until all block bytes have been merged into
the internal state. With 144 bytes per block each state byte will be updated
exactly 18 times.

The inner function, just as the OMA digest itself, takes a 96-bit key. This
means that while there are 144 bytes in a block we only have 96 key bits to
combine them with. The designers of OMA thus simply chose to reuse the first
half of the key for the last 48 block bytes to arrive at 144 key bits (which
neither adds entropy nor increases the effort needed to recover the key):

{% img /images/oma-key-repeat.png 400 OMA reuses the first 48 key bits %}

We actually need a few more parameters to compute a state byte than just a key
bit and a block byte. In mathematical notation, the function to calculate a new
state byte looks as follows:

{% img /images/oma-update.png 500 TODO %}

The current block byte `z` is added to the state byte `y = state[(j + 1) % 8]`.
If the key bit `k` is one then the negation of adding the position `j` to state
byte `x = state[j]` will be rotated one bit to the *left* and *added* to the
previous sum, if the key bit is zero the negation of `x + j` will be rotated
one bit to the *right* and *subtracted* from the previous sum. All additions
and subtractions are performed on 1-byte unsigned integers and are expected to
properly wrap around when over or underflowing (i.e. addition modulo 2^8).

This is not too hard to implement and a great chance to write some Rust code.
`inner()` works just as described above, it takes the previous state, the key,
and the current block and merges those inputs together to obtain a new
intermediate or final state:

{% codeblock lang:rust %}
const KEY_SIZE: usize = 12;

fn inner(state: [u8; 8], key: &[u8], block: &[u8]) -> [u8; 8] {
  let mut state = state;

  // For each byte in the block...
  for l in 0..144 {
    // Current position in the state, starts from the back.
    let j = (7u8.wrapping_sub(l as u8) % 8) as usize;

    // The current key bit to work with.
    let key_bit = key[(l / 8) % KEY_SIZE] >> (7 - j);

    // The block byte at the given index or 0 if the block is too
    // short. This basically implements zero-padding short blocks.
    let block_byte = if l < block.len() { block[l] } else { 0 };

    // Temp values shared between branches.
    let yz = state[(j + 1) % 8].wrapping_add(block_byte);
    let xj = !state[j].wrapping_add(j as u8);

    // Switch based on key bit.
    state[j] = if key_bit & 1 == 1 {
      yz.wrapping_add(xj.rotate_left(1))
    } else {
      yz.wrapping_sub(xj.rotate_right(1))
    };
  }

  state
}
{% endcodeblock %}

Finally, we add a trait that lets us compute the MAC for a given message
through a convenient API, and thus have a complete OMA digest implementation:

{% codeblock lang:rust %}
const BLOCK_SIZE: usize = 144;

pub trait OMADigest {
  fn oma_digest(&self, key: &[u8]) -> [u8; 8];
}

impl OMADigest for [u8] {
  fn oma_digest(&self, key: &[u8]) -> [u8; 8] {
    // Key must be 96 bits.
    assert_eq!(key.len(), KEY_SIZE);

    // Process each block, carrying over state.
    self.chunks(BLOCK_SIZE).fold([0u8; 8], |state, block| {
      inner(state, key, block)
    })
  }
}

// Usage:
// let mac = b"message".oma_digest(b"Some96BitKey");
{% endcodeblock %}

(Full implementation with tests:
[https://github.com/ttaubert/osgp-oma-digest](https://github.com/ttaubert/osgp-oma-digest).)

Now that you hopefully have a solid understanding of how the OMA digest
computes a MAC from a given key and message we can start to attack it.

## The bitwise key recovery attack

The first attack described in the paper (and the one this post is about) is a
bitwise key recovery attack. Using
[differential cryptanalysis](https://en.wikipedia.org/wiki/Differential_cryptanalysis)
we will trace input differences through the transformations in the inner
function and study how that affects output differences. Exploiting differential
weaknesses in the OMA digest will allow us to recover the secret key used to
compute MACs.

The [adaptive chosen-message attack (ACM)](https://en.wikipedia.org/wiki/Chosen-plaintext_attack)
model, describing a very powerful adversary, allows to obtain a valid
authentication token (the MAC) for arbitrary messages under a secret key. In
the case of the OMA digest this means that an attacker would for example
exploit a protocol that allows to request MACs for data under her control,
computed by the target with the secret key. The "only thing" left then is to
find the secret key.

{% img /images/oma-diff.png 500 Differential attack against OMA %}

We start out with a 144-byte message `m` for which we obtain a MAC `a`. We will
then slightly tweak the original message and send `m'` back to the target to
receive a new MAC `a'` and observe how the injected difference propagated into
the output. As you remember, the OMA digest does not garble its internal state
before returning - this will let us explore output differences easily.

## Injecting and tracing differences

To better explain how to inject and trace input differences we need an
arbitrary message and its associated MAC under some unknown key. Let us take a
look at the last 8 bytes of the message and the 8-byte internal state that
represents the MAC after processing all of the input:

{% img /images/oma-inject1.png 500 An OMA digest example %}

Remember that the state is updated from right-to-left, the last message byte on
the right updates the first state byte on the left. If we now modify the last
byte of the message and inject the difference `0x80` so that `0xf3 ⊕ 0x80 =
0x73` then that will always propagate to the first byte of the internal state
and thus the first byte of the MAC, which is now `0xcb ⊕ 0x80 = 0x4b`:

{% img /images/oma-inject2.png 500 OMA digest with injected difference 0x80 %}

Even if we do not know the secret key we can predict the output, and therefore
create a valid MAC for a message we did not ask the target to authenticate.
This is already proof enough that the OMA digest is not a secure MAC as we just
constructed an [existential forgery](https://en.wikipedia.org/wiki/Digital_signature_forgery#Existential_forgery).

> We actually could have stated the OMA digest is not a secure MAC way earlier:
> if you paid attention above you might have noticed that if the last block is
> shorter than 144 bytes it will need to be padded with zero bytes. This means
> that by obtaining the MAC for some 143-byte message we can construct an
> existential forgery by appending a zero byte, the MAC will validate for both
> messages, and we still know nothing about the key.

## Why does 0x80 always propagate?

TODO

To understand why the difference `0x80` always cleanly propagates from a
message byte to the internal state we should look at the inner function again.
We start by calling `inner()` as usual except that the input byte now carries
the difference. When expanding the function we will replace the negation with
its equivalent operation `FF ⊕`. The addition or subtraction `±` and the
bitwise rotation `r ∈ {1, 7}` depend on the key bit `k`.

We can ... like this:

{% img /images/oma-propagation.png 600 TODO %}

This shows that we can rearrange the algorithm to show that the differential
propagates to the function's value.

This does not work for any value however, `0x80` is a special value for this
function that with probability 1 propagates to the digest's internal state. The
theory behind finding which values are good differentials is very mathematical
and described in the paper
[Efficient Algorithms for Computing Differential Properties of Addition](https://eprint.iacr.org/2001/001.pdf)
by Helger Lipmaa and Shiho Moriai.

## Exploiting leaked key bits

So far we managed to inject a difference into the message and observe the same
difference in the output. As the difference cleanly propagates to the final
state, injecting it into the last 8 message bytes does not help us recover the
key. But what could we learn when computing the last byte of the MAC and we
know that both the previous state byte `state[0]` and its adjacent state byte
`state[1]` carry the difference `0x80`?

{% img /images/oma-inject3.png 500 Exploiting leaked key bits by injecting an input difference %}

If we inject the difference into the 9th-to-last byte of the message every
byte of the MAC will be its original value XOR `0x80`. The first byte of the MAC
however now has a value we cannot easily predict anymore as its value was
computed using the modified internal state from the 9th-to-last computation.
The key bit dependant bitwise rotation `r` can be exploited to learn the value
of the key bit used to calculate the first byte of the MAC.

## XOR-linearizing the state update function

now comes a magic step that might be a little puzzling at first
we will xor linearize the state update function
we will replace addition, subtraction, and negation with XOR operations
if we do that we arrive at the following difference with injection
we replace integer addition with XOR because we need the same operation
no matter what the key bit is
but why can we do that? this equation won't tell us anything interesting
because it is not equivalent to the original equation is it?
you're right, we will indeed receive completely different results
BUT the least significant bit behaves the same for integer addition and XOR
So while all other bits of the resulting difference after injection
can't be used to recover the key bit, the least significant bit of the difference can!

## What difference to inject?

What difference do we need to inject to recover key bits?
0x80 = 0b10000000 = 128
So why is that a good value?
We xor that into the message (previous row)
and arrive at the following equation
now "r" can be either 1 or 7, depending on the key bit
when r=1 we will have (0x80 xor 0x01 = 0x81)
the least significant bit is thus 1
if the key bit is 0 and r=7 we have (0x80 xor 0x40 = 0xC0)
the least significant bit is thus 0
this leak lets us so far recover the last key byte
as the digest output is just the final internal state

## Recover the remaining key bytes

We can inject the difference into earlier message bytes as well
that way there is a time when the internal state would reveal a key bit
the problem is that the state is updated with the remaining message bytes
and the digest output doesn't allow us to recover those key bits
the state update function has one important property though
it is fully reversible (show function)
after injecting the difference into earlier message bytes
we can now reverse the internal state until we arrive at the interesting position
and check the LSB of the output difference to recover the key bit
once we did that for every row of the message
we have the key

## Implementation in Rust

link to implementation in rust
it implements a blackbox that allows CPT attacks
it will generate a random key on instantiation
and return the digest for any given message
this shows that with an initial query and one for every key bit (96)
the whole key can be recovered

## More attacks

I might write about the other attacks mentioned in the paper if I find the time
want to thank the authors for their great paper
