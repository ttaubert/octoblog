---
layout: post
title: "A gentle introduction to differential cryptanalysis: a bitwise key recovery attack on OSGP's OMA digest"
date: 2015-06-01 18:00:00 +0200
---

> 1. [Overview of the OMA digest](#overview)
> 2. [Internals of the OMA digest](#internals)
> 3. [The bitwise key recovery attack](#attack)

The recently published attacks on the "OMA digest", a home-brewed MAC
used in the [Open Smart Grid Protocol (OSGP)](https://en.wikipedia.org/wiki/Open_smart_grid_protocol),
provide a nice opportunity for a rather gentle introduction to
[differential cryptanalysis](https://en.wikipedia.org/wiki/Differential_cryptanalysis).
This post will dig into the bitwise key recovery attack described in the paper
["Dumb Crypto in Smart Grids: Practical Cryptanalysis of the Open Smart Grid Protocol"](https://eprint.iacr.org/2015/428.pdf)
published by [Philipp Jovanovic](https://twitter.com/Daeinar) and
[Samuel Neves](https://twitter.com/sevenps).

## <a name="overview"></a> Overview of the OMA digest

The OMA digest is a [MAC algorithm](https://en.wikipedia.org/wiki/Message_authentication_code),
a function that will take a key and data as inputs. Only someone in possession
of the correct key should be able to compute a valid MAC for any given input.
If the key or data differ in only the slightest way the verification must fail
in order to detect attackers tampering with traffic.

Before we can attack an algorithm by cryptanalysis we first have to study and
understand its inner workings and should ideally have an implementation at hand
to confirm our attack is working. Let us take a high-level look at how OMA
message authentication codes (MACs) are computed:

{% img /images/oma-overview.png 500 OMA digest overview %}

The digest can handle inputs of any length and processes them in 144-byte
blocks. The state is initialized to zero and then together with the key passed
to the inner function that computes a MAC for a single block. After processing
the first block the resulting state will be used as the starting point for the
second block. The state will be passed on until we are out of blocks and the
resulting MAC is the inner state after processing the last input block.

An important property of this construction is that the internal state is not
modified before it is returned as the MAC of the given data under the given
key - this will turn out to be very useful later. The next section will take
a closer look at the inner function that computes MACs for single 144-byte
blocks.

## <a name="internals"></a> Internals of the OMA digest

For the first 144-byte block the internal state is initialized to zero:

{% img /images/oma-state.png 400 The initial 8-byte internal OMA state %}

For subsequent blocks the initial state will simply be the result of processing
the previous block. The algorithm will start by combining the first block byte
and the first key bit into `state[7]` and then do the same for the second block
byte and the second key bit with `state[6]`. Once it arrives at `state[0]` it
will wrap around and continue from the right until all block bytes have been
merged into the internal state.

The inner function, just as the OMA digest itself, takes a 96-bit key. This
means that while there are 144 bytes in a block we only have 96 key bits to
combine them with. The designers of OMA thus simply chose to reuse the first
half of the key for the last 48 block bytes to arrive at 144 key bits (which
neither adds entropy nor increases the effort needed to recover the key):

{% img /images/oma-key-repeat.png 400 OMA reuses the first 48 key bits %}

The function that updates the internal state, given a key bit, a block byte,
and the current position in the internal state, looks as follows:

{% codeblock lang:rust %}
fn update(k, b, j) {
  // k = current key bit (0-1)
  // b = current block byte (0-255)
  // j = current position in the internal state (0-7)

  if k == 1 {
    state[j] = state[(j + 1) % 8] + b + !(state[j] + j) <<< 1
  } else {
    state[j] = state[(j + 1) % 8] + b - !(state[j] + j) >>> 1
  }
}
{% endcodeblock %}

The current block byte is added to the state byte to the right of the current
position in the internal state. If the key bit is one then the negation of
adding the position `j` to the state byte `state[j]` will be rotated one bit to
the *left* and *added* to the previous sum, if the key bit is zero the negation
of `state[j] + j` will be rotated one bit to the *right* and *subtracted* from
the previous sum. All additions and subtractions are performed on 1-byte
unsigned integers and are expected to properly wrap around when over or
underflowing.

In Rust-inspired pseudocode, the full OMA digest implementation:

{% codeblock lang:rust %}
state = [0,0,0,0,0,0,0,0]

// For each 144-byte block of the input...
for block in input.chunks(144) {
  // For each input byte and key bit...
  for n in 0..144 {
    // The current key bit.
    k = key.get_nth_bit(n + 1)

    // The current block byte.
    b = block[n]

    // Current position in the state, starts from the back.
    j = (7 - n) % 8

    // Update the state byte at position |j|.
    update(k, b, j)
  }
}
{% endcodeblock %}

(You can find a real Rust implementation here:
[github.com/ttaubert/osgp-oma-digest](https://github.com/ttaubert/osgp-oma-digest).)

Now that you hopefully have a solid understanding of how the OMA digest
computes a MAC from a given key and data we can start thinking about how to
attack it.

## <a name="attack"></a> The bitwise key recovery attack

The first attack described in the paper (and the one this post is about) is a
bitwise key recovery attack. Using
[differential cryptanalysis](https://en.wikipedia.org/wiki/Differential_cryptanalysis)
we will trace input differences through the transformations in the inner
function shown above, and study how that affects output differences. Exploiting
differential weaknesses in the OMA digest will allow us to recover the secret
key used to compute MACs.

The [chosen-plaintext attack (CPA)](https://en.wikipedia.org/wiki/Chosen-plaintext_attack)
model assumes that an attacker can obtain the encryption of arbitrary plaintexts
under a secret key. In the case of the OMA digest this means that she would for
example exploit a protocol that allows to request MACs for arbitrary data,
computed by the target with the secret key. The "only thing" left then is to
find the secret key.

{% img /images/oma-diff.png 500 Differential attack against OMA %}

We start out with a random 144-byte message `m` for which we obtain a MAC `a`.
We will then slightly tweak the original message and send `m'` back to the
target to receive a new MAC `a'` and observe how the injected difference
propagated into the output. As you remember, the OMA digest does not garble its
internal state before returning - this will let us explore output differences
easily.

## Injecting differences

Show how we would inject a difference
That doesn't help us a lot because we know the difference
We want to gain information about the key
we need the digest to apply key information to our injected difference
the difference in one message byte will propagate to the whole internal state
we can use the nineth iteration to reveal part of the key
as the bitshift operation depends on the value of the key bit used for the message byte

## XOR-linearising the state update function

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
