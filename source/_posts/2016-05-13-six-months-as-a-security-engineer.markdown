---
layout: post
title: "Six months as a Security Engineer"
subtitle: "My work on Mozilla's Security Engineering team"
date: 2016-05-13 18:00:00 +0200
---

It's been a little more than six months since I officially switched to the
Security Engineering team here at Mozilla to work on
[NSS](https://developer.mozilla.org/en-US/docs/Mozilla/Projects/NSS) and
related code. I thought this might be a good time to share what I've been up
to in a short status update:

### Removed SSLv2 code from NSS

NSS contained quite a lot of SSLv2-specific code that was waiting to be removed.
It was not compiled by default so there was no way to enable it in Firefox even
if you wanted to. The removal was rather straightforward as the protocol changed
significantly with v3 and most of the code was well separated. Good riddance.

### Added ChaCha20/Poly1305 cipher suites to Firefox

Adam Langley submitted a patch to bring ChaCha20/Poly1305 cipher suites to NSS
already two years ago but at that time we likely didn't have enough resources
to polish and land it. I picked up where he left and updated it to conform to
the slightly updated specification. [Firefox 47 will ship with two new
ECDHE/ChaCha20 cipher suites enabled](/blog/2016/04/a-fast-constant-time-aead-for-tls/).

### RSA-PSS for TLS v1.3 and the WebCrypto API

Ryan Sleevi, also a while ago, implemented RSA-PSS in `freebl`, the lower
cryptographic layer of NSS. I hooked it up to some more APIs so Firefox can
support RSA-PSS signatures in its WebCrypto API implementation. In NSS itself
we need it to support new handshake signatures in our experimental TLS v1.3
code.

### Improve continuous integration for NSS

Kai Engert from RedHat is currently doing a hell of a job maintaining quite a
few buildbots that run all of our NSS tests whenever someone pushes a new
changeset. Unfortunately the current setup doesn't scale too well and the
machines are old and slow.

Similar to e.g. Travis CI, Mozilla maintains its own continuous integration and
release infrastructure, called [TaskCluster](https://docs.taskcluster.net/).
Using TaskCluster we now have an experimental Docker image that builds NSS/NSPR
and runs all of our 17 (so far) test suites. The turnaround time is already very
promising. This is an ongoing effort, there are lots of things left to do.

### Joined the WebCrypto working group

I've been working on the Firefox WebCrypto API implementation for a while, long
before I switched to the Security Engineering team, and so it made sense to join
the working group to help finalize the specification. I'm unfortunately still
struggling to carve out more time for involvement with the WG than just
attending meetings and representing Mozilla.

### Added HKDF to the WebCrypto API

The main reason the WebCrypto API in Firefox did not support HKDF until recently
is that no one found the time to implement it. I finally did find some time and
brought it to Firefox 46. It is fully compatible to Chrome's implementation
([RFC 5869](https://tools.ietf.org/html/rfc5869)), the WebCrypto specification
still needs to be updated to reflect those changes.

### Added SHA-2 for PBKDF2 in the WebCrypto API

Since we shipped the first early version of the WebCrypto API, SHA-1 was the
only available PRF to be used with PBKDF2. We now support PBKDF2 with SHA-2
PRFs as well.

### Improved the Firefox WebCrypto API threading model

Our initial implementation of the WebCrypto API would naively spawn a new thread
every time a `crypto.subtle.*` method was called. We now use a thread pool per
process that is able to handle all incoming API calls much faster.

### Added WebCrypto API to Workers and ServiceWorkers

After working on this on and off for more than six months, so even before I
officially joined the security engineering team, I managed to finally get it
landed, with a lot of help from Boris Zbarsky who had to adapt our WebIDL code
generation quite a bit. The WebCrypto API can now finally be used from (service)
workers.

## What's next?

In the near future I'll be working further on improving our continuous
integration infrastructure for NSS, and cleaning up the library and its tests.
I will hopefully find the time to write more about it as we progress.
