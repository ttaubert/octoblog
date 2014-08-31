---
layout: post
title: "The Web Cryptography API"
date: 2014-06-13 17:00
published: false
---

> This is a multi-part blog post series on the [Web Cryptography API](http://www.w3.org/TR/WebCryptoAPI/):
>
> [→ Part 1: Hashing](/blog/2014/06/hashing-using-the-web-cryptography-api/)  
> [→ Part 2: Hash-based message authentication codes](/blog/2014/06/hash-based-message-authentication-codes-and-the-web-cryptography-api/)  
> [→ Part 3: Password-based key derivation](/blog/2014/06/password-based-key-derivation-using-the-web-cryptography-api/)  
> [→ Part 4: Secret-key encryption](/blog/2014/06/secret-key-encryption-using-the-web-cryptography-api/)  

Cryptography is coming to the DOM. While there is a lot that can and has
been said about cryptography in an environment running untrusted code (the
browser),
[Mozilla](https://bugzilla.mozilla.org/show_bug.cgi?id=865789),
[Google](https://code.google.com/p/chromium/issues/detail?id=245025), and
[Apple](https://bugs.webkit.org/show_bug.cgi?id=122679) are already working on
implementing the WebCrypto API. It will inevitably be an important part of the
future web.

This series of blog posts will show how the WebCrypto API can be used to
provide integrity, authenticity and confidentiality for any kind of data.
The reader should be somewhat familiar with cryptography, its primitives,
and the terminology around it.

If you want to refresh your cryptography chops, I would really like to encourage
you to join [Dan Boneh's course](https://www.coursera.org/course/crypto) or watch
some of [Christof Paar's lectures](https://www.youtube.com/channel/UC1usFRN4LCMcfIV7UjHNuQg/videos).
Both resources provide great material for beginners as well.
