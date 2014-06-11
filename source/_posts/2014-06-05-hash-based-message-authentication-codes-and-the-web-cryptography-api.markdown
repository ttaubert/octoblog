---
layout: post
title: "Hash-based message authentication codes and the Web Cryptography API"
date: 2014-06-12 19:00
published: false
---

> This is a multi-part blog post series on the [Web Cryptography API](http://www.w3.org/TR/WebCryptoAPI/):
>
> [→ Part 1: Hashing](/blog/2014/06/hashing-using-the-web-cryptography-api/)  
> [→ Part 2: Hash-based message authentication codes](/blog/2014/06/hash-based-message-authentication-codes-and-the-web-cryptography-api/)  
> [→ Part 3: Password-based key derivation](/blog/2014/06/password-based-key-derivation-using-the-web-cryptography-api/)  
> [→ Part 4: Secret-key encryption](/blog/2014/06/secret-key-encryption-using-the-web-cryptography-api/)

In the [previous post](/blog/2014/06/hashing-using-the-web-cryptography-api/)
I talked about cryptographic hash functions and how those are exposed by the
[Web Cryptography API](http://www.w3.org/TR/WebCryptoAPI/). Let us now take a
look at
[HMACs](https://en.wikipedia.org/wiki/Hash-based_message_authentication_code),
a cryptographic construction that internally uses hashes to provide integrity
and authenticity.

## Computing HMACs

To compute the HMAC for a given message we need a secret key. We can simply ask
the WebCrypto API to generate a random one for us:

{% codeblock lang:js %}
// Choose HMAC and the desired hash function.
var algo = {name: "HMAC", hash: {name: "SHA-256"}};

// We will use this key to sign and verify.
var usages = ["sign", "verify"];

// Generate a random key.
var promiseKey = window.crypto.subtle.generateKey(algo, false, usages);
{% endcodeblock %}

With `promiseKey` we now have a promise that will resolve to a random 512-bit
(the hash function's block size) key that we can then use to authenticate the
given message:

{% codeblock lang:js %}
var msg = "The quick brown fox jumps over the lazy dog";

// Convert the given message to a Uint8Array.
var data = new TextEncoder("utf-8").encode(msg);

promiseKey.then(function (key) {
  // Use the key we just generated to compute the HMAC.
  window.crypto.subtle.sign({name: "HMAC"}, key, data)
    .then(function (mac) {
      console.log(mac);
    });
});

// Output: (will be random because the key is)
// Uint8Array [ 204, 226, 228, 135, 177, 224, 207, 110, 44, 230, 22 more… ]
{% endcodeblock %}

The given examples work in [Firefox Nightly](http://nightly.mozilla.org/) and
[Chrome Canary](http://www.google.com/chrome/browser/canary.html).

## A note on key lengths

Here is a short reminder of what the HMAC construction looks like:

{% codeblock lang:text %}
HMAC(k, m) = H((k ⊕ opad) | H((k ⊕ ipad) | m))
{% endcodeblock %}

The lengths of the inner and outer paddings `|ipad|` and `|opad|` are exactly
the block size of `H` (64 bytes for SHA-256). In general, to compute `x ⊕ y`
both `x` and `y` must have the same length. To xor the secret key with those
pads we might thus need to pad a given key to the right with zeros if it is
too short.

The most common attack against HMACs is brute force to uncover the secret key
so you should ideally pass a key as long as the hash function's block size to
achieve the largest possible key space. If the given key is longer than the
block size it will be fed into the hash function once before xor-ing. The
minimum recommended key size is the hash function's output size (32 bytes
for SHA-256).

## Verification

The last important step is of course the verification of the MAC. This will
compute an HMAC for the given `data` and `key`, and compare the given and the
computed MAC byte by byte until the very end to prevent timing attacks.

{% codeblock lang:js %}
// This example uses the previously defined data, key, and mac variables.

crypto.subtle.verify({name: "HMAC"}, key, mac, data)
  .then(function (verified) {
    console.log(verified);
  });

// Output:
// true
{% endcodeblock %}

With the secret key it is easy to find out whether someone has tampered with
`data` or `mac` while they were transmitted. Passing all parameters to
`verify()` must now resolve to `false`.

{% codeblock lang:js %}
// Change the first character of the plaintext to a white space.
data[0] = 32;

// The verification must fail now.
crypto.subtle.verify({name: "HMAC"}, key, mac, data)
  .then(function (verified) {
    console.log(verified);
  });

// Output:
// false
{% endcodeblock %}

## HMAC applications

MACs are great when all you need is integrity and authenticity but not
confidentiality, i.e. if you do not care about leaking the message contents but
you do care about the identity of the sender — assuming that only the right
person has the shared secret key.

Keyed-hash message authentication codes are used by
[PBKDF2](https://en.wikipedia.org/wiki/PBKDF2), a key derivation function that
derives keys usable for cryptographic operations from low-entropy keys like
user-typed passwords.

See my next post about how you can use the WebCrypto API to derive
cryptographic keys from unsecure keys using a
[password-based key derivation function](https://en.wikipedia.org/wiki/PBKDF2).

[→ Part 3: Password-based key derivation](/blog/2014/06/password-based-key-derivation-using-the-web-cryptography-api/)
