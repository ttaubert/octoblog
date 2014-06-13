---
layout: post
title: "Generating keys using the Web Cryptography API"
date: 2014-06-14 18:00
published: false
---

> This is a multi-part blog post series on the [Web Cryptography API](http://www.w3.org/TR/WebCryptoAPI/):
>
> [→ Part 1: Hashing](/blog/2014/06/hashing-using-the-web-cryptography-api/)  
> [→ Part 2: Hash-based message authentication codes](/blog/2014/06/hash-based-message-authentication-codes-and-the-web-cryptography-api/)  
> [→ Part 3: Password-based key derivation](/blog/2014/06/password-based-key-derivation-using-the-web-cryptography-api/)  
> [→ Part 4: Secret-key encryption](/blog/2014/06/secret-key-encryption-using-the-web-cryptography-api/)  
> [→ Part 5: Key generation](/blog/2014/06/generating-keys-using-the-web-cryptography-api/)

keys live in a worker

public keys are special

getRandomVAlues() works

extractable

never leave the worker using generate key

great thing about the api is that key objects are just a reference

import key might be needed when key data is recvd

While the API in this specification provides a means to protect keys from future access by web applications, it makes no statements as to how the actual keying material will be stored by an implementation. As such, although a key may be inaccessible to web content, it should not be presumed that it is inaccessible to end-users. For example, a conforming user agent may choose to implement key storage by storing key material in plain text on device storage. Although the user agent prevents access to the raw keying material to web applications, any user with access to device storage may be able to recover the key. 
