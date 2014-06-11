---
layout: post
title: "Hashing using the Web Cryptography API"
date: 2014-06-12 18:00
published: false
---

> This is a multi-part blog post series on the [Web Cryptography API](http://www.w3.org/TR/WebCryptoAPI/):
>
> [→ Part 1: Hashing](/blog/2014/06/hashing-using-the-web-cryptography-api/)  
> [→ Part 2: Hash-based message authentication codes](/blog/2014/06/hash-based-message-authentication-codes-and-the-web-cryptography-api/)  
> [→ Part 3: Password-based key derivation](/blog/2014/06/password-based-key-derivation-using-the-web-cryptography-api/)  
> [→ Part 4: Secret-key encryption](/blog/2014/06/secret-key-encryption-using-the-web-cryptography-api/)

Let us start exploring the WebCrypto API with a very simple example — hashing.
[Cryptographic hash functions](https://en.wikipedia.org/wiki/Cryptographic_hash_function)
are an important building block of popular and secure cryptographic constructions.

## Computing a message digest

The WebCrypto API exposes two main interfaces,
[Crypto](https://dvcs.w3.org/hg/webcrypto-api/raw-file/tip/spec/Overview.html#crypto-interface)
provided by `window.crypto` and
[SubtleCrypto](https://dvcs.w3.org/hg/webcrypto-api/raw-file/tip/spec/Overview.html#subtlecrypto-interface)
provided by `window.crypto.subtle`.

{% codeblock lang:js %}
var msg = "The quick brown fox jumps over the lazy dog";

// Convert the given message to a Uint8Array.
var data = new TextEncoder("utf-8").encode(msg);

// Compute a 256-bit digest.
window.crypto.subtle.digest({name: "SHA-256"}, data)
  .then(function (digest) {
    console.log(digest);
  });

// Output:
// Uint8Array [ 215, 168, 251, 179, 7, 215, 128, 148, 105, 202, 22 more… ]
{% endcodeblock %}

The `window.crypto.subtle.digest()` method returns a Promise that will resolve
to a `Uint8Array` containing the 32-byte message digest for the given message.
Computing 384-bit or 512-bit SHA-2 hashes is equally easy:

{% codeblock lang:js %}
// Compute a 384-bit digest.
window.crypto.subtle.digest({name: "SHA-384"}, data)
  .then(function (digest) {
    console.log(digest);
  });

// Compute a 512-bit digest.
window.crypto.subtle.digest({name: "SHA-512"}, data)
  .then(function (digest) {
    console.log(digest);
  });

// Output:
// Uint8Array [ 202, 115, 127, 16, 20, 164, 143, 76, 11, 109, 38 more… ]
// Uint8Array [ 7, 229, 71, 217, 88, 111, 106, 115, 247, 63, 54 more… ]
{% endcodeblock %}

The given examples work in [Firefox Nightly](http://nightly.mozilla.org/) and
[Chrome Canary](http://www.google.com/chrome/browser/canary.html). If you want
to give [WebKit Nightly](http://nightly.webkit.org/) a try, you will have to
use `window.crypto.webkitSubtle` for now and find a UTF-8 encoder as it does
unfortunately not support the `TextEncoder` API.

## A DOM API that uses promises?

Yes! I think this is a great part of spec. It further promotes the use of
[Promises](https://github.com/domenic/promises-unwrapping) and provides another
incentive for browser vendors to implement and ship them. Cryptographic
operations can be rather expensive and you would not want to let them block
the UI thread. Making the WebCrypto API asynchronous thus allows implementors
to move all crypto operations to a worker thread. Returning a promise that
resolves when that operation has finished or failed is a great way to make an
easy to work with API.

## Applications for hash functions

You can use cryptographic hash functions to uniquely identify files, to index
data in hash tables or as checksums to detect *accidental* corruption. Hash
functions by themselves provide only integrity but not authenticity as anyone
could just change the message and compute a new hash for it.

Cryptographically secure hash functions are the basis of HMACs, a message
authentication code that can be used to both provide integrity and
authenticity at the same time.

See my next post about how you can use the WebCrypto API to compute
[hash-based message authentication codes (HMACs)](https://en.wikipedia.org/wiki/Hash-based_message_authentication_code).

[→ Part 2: Hash-based message authentication codes](/blog/2014/06/hash-based-message-authentication-codes-and-the-web-cryptography-api/)  
