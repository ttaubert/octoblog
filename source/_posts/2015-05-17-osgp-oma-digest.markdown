---
layout: post
title: "A gentle introduction to differential cryptanalysis: a bitwise key recovery attack on OSGP's OMA digest"
date: 2015-06-01 18:00:00 +0200
---

The recently published attacks on the "OMA digest", a home-brewed
[message authentication code (MAC)](https://en.wikipedia.org/wiki/Message_authentication_code)
used in the [Open Smart Grid Protocol (OSGP)](https://en.wikipedia.org/wiki/Open_smart_grid_protocol),
provide a nice opportunity for a rather gentle introduction to
[differential cryptanalysis](https://en.wikipedia.org/wiki/Differential_cryptanalysis).
This post will dig into the bitwise key recovery attack described in the paper
["Dumb Crypto in Smart Grids: Practical Cryptanalysis of the Open Smart Grid Protocol"](https://eprint.iacr.org/2015/428.pdf)
published by [Philipp Jovanovic](https://twitter.com/Daeinar) and
[Samuel Neves](https://twitter.com/sevenps). You will soon see that "Don't
invent your own crypto" is the probably safest advice for most of us.

## Internals of the OMA digest

The OMA digest can handle inputs of any length but processes them in 144-byte
blocks. The key length must be exactly 12 bytes (96 bit). While iterating
over all given input bytes one at a time it maintains an 8-byte state that will
eventually be the resulting output:

{% img /images/oma-draft1.jpg The 8-byte internal OMA state %}

For the first 144-byte block, the state is initialized to zero. For subsequent
blocks the initial state will simply be the result of processing the previous
block.  The algorithm will start by merging the first block byte and the first
key bit into `a7` and then do the same for the second block byte and the second
key bit with `a6`. Once it arrives at `a0` it will simply wrap around and
continue from the right again.

If you paid attention above you might have noticed that while there are 144
input bytes we only have 96 key bits to combine them with. The designers of OMA
thus simply chose to reuse the first half of the key for the last 48 input
bytes to arrive at 144 key bits:

{% img /images/oma-draft2.jpg 400 OMA reuses the first 48 key bits %}

The function that combines the input byte with the key bit looks as follows,
where `j` is the current position in the internal state:

{% codeblock lang:js %}
fn combine(ibyte, kbit, j) {
  if (kbit == 1) {
    state[(j + 1) % 8] + ibyte + (!(state[j] + j) <<< 1)
  } else {
    state[(j + 1) % 8] + ibyte - (!(state[j] + j) >>> 1)
  }
}
{% endcodeblock %}

https://github.com/ttaubert/osgp-oma-digest

## The key recovery attack

bitwise key recovery
differential cryptanalysis
we inject a difference into the digest to extract information
can simply inject information by modifying the message itself
how can we read the output to find the diff between original and modified output?
OMA simply outputs the internal state at the end
can use that to explore the differences

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
