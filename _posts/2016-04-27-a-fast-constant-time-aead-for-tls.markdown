---
layout: post
title: "A fast, constant-time AEAD for TLS"
subtitle: "ChaCha20/Poly1305 cipher suites in Firefox 47"
date: 2016-04-29 15:00:00 +0200
---

The only TLS v1.2+ cipher suites with a dedicated AEAD scheme are the ones using
[AES-GCM](https://en.wikipedia.org/wiki/Galois/Counter_Mode), a block cipher
mode that turns AES into an [authenticated cipher](https://en.wikipedia.org/wiki/Authenticated_encryption).
From a cryptographic point of view these are preferable to non-AEAD-based cipher
suites (e.g. the ones with AES-CBC) because getting authenticated encryption
right is hard without using dedicated ciphers.

For CPUs without the [AES-NI instruction set](https://en.wikipedia.org/wiki/AES_instruction_set),
constant-time AES-GCM however is slow and also hard to write and maintain. The
majority of mobile phones, and mostly cheaper devices like tablets and notebooks
on the market thus cannot support efficient and safe AES-GCM cipher suite
implementations.

Even if we ignored all those aforementioned pitfalls we still wouldn't want to
rely on AES-GCM cipher suites as the only good ones available. We need more
diversity. Having widespread support for cipher suites using a second AEAD is
necessary to defend against weaknesses in AES or AES-GCM that may be discovered
in the future.

[ChaCha20](https://en.wikipedia.org/wiki/Salsa20#ChaCha_variant) and
[Poly1305](https://en.wikipedia.org/wiki/Poly1305), a stream cipher and a
message authentication code, were designed with fast and constant-time
implementations in mind. A combination of those two algorithms yields a safe
and efficient AEAD construction, called ChaCha20/Poly1305, which allows TLS
with a negligible performance impact even on low-end devices.

[Firefox 47](https://www.mozilla.org/en-US/firefox/47.0beta/releasenotes/)
will ship with two new ECDHE/ChaCha20 cipher suites as specified in the
[latest draft](https://tools.ietf.org/html/draft-ietf-tls-chacha20-poly1305-04).
We are looking forward to see the adoption of these increase and will, as a
next step, work on prioritizing them over AES-GCM suites on devices not
supporting AES-NI.
