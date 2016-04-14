---
layout: post
title: "Six months on the Security Engineering team"
date: 2016-04-14 15:49:08 +0200
---

It's been roughly six months now that I officially switched to the security
engineering team at Mozilla and I get paid to work on
[NSS](https://developer.mozilla.org/en-US/docs/Mozilla/Projects/NSS) and other
related things. I thought this might be a good time to share what I've been up
to in a short status update.

## Work on NSS (our crypto library)

### Hooked up RSA-PSS

A while ago, Ryan Sleevi implemented RSA-PSS in `freebl`, the lower
cryptographic layer in NSS, and to use it in Firefox we had to hook it up to
some more APIs. That was one of the first patches I landed so that PSS
signatures are now available to our in-progress TLS v1.3 implementation.

### Removed SSLv2 code

NSS contained quite a lot of SSLv2-specific code not compiled by default, and
thus without a way to switch it on in Firefox. As the protocol changed heavily
with v3 the code was rather separated and not too hard to remove. It's gone for
good.

### Added ChaCha20/Poly1305 cipher suites

Roughly two years ago, when Adam Langley submitted a patch to add
ChaCha20/Poly1305 to NSS, we likely didn't have enough resources to bring it
in. I picked up where he left, updated it to conform with the slightly-changed
specification, and landed it. Firefox 47 will ship with the two new cipher
suites enabled.

### Became an NSS peer

As with everything at Mozilla, you don't get access to a repository just by
being paid to work on it. You have to earn access by contributing, and that's
what I did. After people got tired of having to land patches for me I finally
became a peer and started reviewing patches myself.

### Better continuous integration

NSS currently isn't as well integrated with our infrastructure as it could be
and so we're also working on fixing that. For a start we have a few docker
images that build NSS/NSPR on Linux in different configurations and run our
test suites. Later this year we plan to split the test suites into multiple
tasks for more granularity when things fail.

## Work on the WebCrypto API

### Joined the WG

I was working on Firefox' WebCrypto API implementation for a while now, long
before I switched to the security engineering team and it made sense to join
the working group to try and help finalize the specfication as good as possible.

### Added RSA-PSS and HKDF

After finishing plumbing for RSA-PSS to use it in TLS v1.3 we could finally
also expose it to the WebCrypto API. Another algorithm we haven't found the
time to implement was HKDF, but which is now also available. It is fully
compatible to Chrome's implementation ([RFC 5869](https://tools.ietf.org/html/rfc5869)),
the WebCrypto specification still needs updating here.

### Added SHA-2 for PBKDF2

For quite a while SHA-1 was the only available PRF to be used with PBKDF2.
I fixed that so the WebCrypto API can expose PBKDF2 with SHA-2 PRFs as well.

### Improve threading model

The initial implementation of the WebCrypto API would naively spawn a new thread
every time a `crypto.subtle.*` method was called. Our implementation now uses a
thread pool per process that handles all incoming API calls much faster.

### Support Workers and ServiceWorkers

After working on this on and off for more than six months I managed to finally
get this landed, with a lot of help from bz who had to adapt our WebIDL code
generation. The WebCrypto API can now finally be used from (service) workers.
