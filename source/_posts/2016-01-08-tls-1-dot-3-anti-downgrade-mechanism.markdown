---
layout: post
title: "TLS 1.3 anti-downgrade mechanisms"
subtitle: "Why phasing out legacy crypto is a lot harder than you think"
date: 2016-01-08 07:48:32 -0800
published: false
---

2015 has been the year of the downgrade attacks and now that 2016 has barely
arrived we saw yet another attack with [SLOTH](http://www.mitls.org/downloads/transcript-collisions.pdf).
What all of these have in common that they either use implementation or
protocol flaws to downgrade a connection between two peers perfectly capable
of talking to each other securely, to either an export-grade cipher suite, weak
Diffie-Hellman parameters, or broken hash algorithms.

**The FREAK attack** used an implementation flaw in OpenSSL's state machine

SLOTH is basically an attack directly against a core building block, the HMAC
of the Finished message. Whenever a crypto building block is found to be weak
there's not much more to do than to simply phase it out and remove it. We can
do this for MD5 and TLS 1.2, but could probably not do the same in five years
when we have a full SHA-1 collision (that's probably going to happen this year
though).

no sane client would submit or pick MD5 but as long as it's still an option we
can downgrade to it.

TLS 1.3 includes an anti-downgrade mechanism developed together with the SLOTH
people. TLS will keep evolving, new protocol versions will be safer and support
stronger algorithms.

## The new anti-downgrade mechanism

describe how it works
describe the two special values put in the nonce
why is it put in the nonce?
nonce is signed somehow? need to support tls 1.2
static RSA is not supported per spec

## Why is static RSA not supported?

ba bla...
but what does this mean in general?

## Ineffective protection

the anti-downgrade mechanism doesn't help if we can downgrade any connection
to TLS 1.2 and then simply force a static RSA key exchange. It seems like a
minor exception but not long ago non-forward secure RSA kx were the norm, and
all clients out there support it. To break this cycle we'd have to kill static
RSA by either removing it from all servers, removing it from all clients, or
both.
