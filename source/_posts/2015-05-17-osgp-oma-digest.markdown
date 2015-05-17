---
layout: post
title: "Understanding the bitwise key recovery attack on OSGP's OMA digest"
date: 2015-05-17 21:33:45 +0200
---

mention paper and that it's not my attack
mention who wrote it

## The OMA digest

link to rust implementation
explain how the digest works
(show in rows of 8 bytes?)

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
