---
layout: post
title: "Secret-key encryption using the Web Cryptography API"
date: 2014-06-12 21:00
published: false
---

> This is a multi-part blog post series on the [Web Cryptography API](http://www.w3.org/TR/WebCryptoAPI/):
>
> [→ Part 1: Hashing](/blog/2014/06/hashing-using-the-web-cryptography-api/)  
> [→ Part 2: Hash-based message authentication codes](/blog/2014/06/hash-based-message-authentication-codes-and-the-web-cryptography-api/)  
> [→ Part 3: Password-based key derivation](/blog/2014/06/password-based-key-derivation-using-the-web-cryptography-api/)  
> [→ Part 4: Secret-key encryption](/blog/2014/06/secret-key-encryption-using-the-web-cryptography-api/)

The previous post covered [password-based key derivation](/blog/2014/06/password-based-key-derivation-using-the-web-cryptography-api/)
to compute cryptographic keys from low-entropy keys like user-typed passwords.
Using the derived secret key we can not only compute HMACs but also use it for
actual encryption. Let us take a look at how to use
[AES](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard) in
[Galois/Counter Mode](https://en.wikipedia.org/wiki/Galois/Counter_Mode) to
achieve authenticated encryption using the WebCrypto API.

[Authenticated encryption](https://en.wikipedia.org/wiki/Authenticated_encryption)
is the nowadays preferred mode of operation for block ciphers. It provides
integrity, authenticity, and confidentiality; the given data is only decrypted
if its integrity and authenticity can be verified successfully.

## AES-GCM encryption

The Galois/Counter Mode (GCM) is a mode of operation for 128-bit block ciphers
like AES that has been widely adopted because of its efficiency and performance.

{% codeblock lang:js %}
var msg = "The quick brown fox jumps over the lazy dog";
var data = new TextEncoder("utf-8").encode(msg);

// Generate a random 256-bit AES-GCM key.
var promiseKey = window.crypto.subtle.generateKey(
  {name: "AES-GCM", length: 256}, false, ["encrypt", "decrypt"]);
{% endcodeblock %}

For this simple example we ask the WebCrypto API to generate a random AES key
for us. We could as well use the PBKDF2 algorithm's `generateKey()` method
as shown in the [previous post](/blog/2014/06/password-based-key-derivation-using-the-web-cryptography-api/)
to query the user for a password and derive an encryption key from it.

{% codeblock lang:js %}
promiseKey.then(function (key) {
  // Generate a unique 16-byte nonce value.
  var nonce = window.crypto.getRandomValues(new Uint8Array(16));

  // We chose a tag length of 128 bit.
  var algo = {name: "AES-GCM", iv: nonce, tagLength: 128};

  window.crypto.subtle.encrypt(algo, key, data)
    .then(function (ct) {
      console.log(ct);
    });
});

// Output: (will be random because the key and nonce are)
// Uint8Array [ 2, 186, 79, 246, 84, 4, 10, 232, 121, 226, 49 more… ]
{% endcodeblock %}

The variable `ct` will hold the ciphertext. It will have the exact length as
`data` plus the 16-byte tag appended. Note that this encryption mode does not
hide the length of the encrypted data and might thus reveal some information
about the plaintext.

## Choosing good parameters

`nonce` must be a value that is uniquely chosen for each encryption. It is
*your* responsibility to ensure the uniqueness, one could for example use
nonce 1 for the first message, nonce 2 for the second message, etc. When using
128-bit nonces as shown above the risk of collision for randomly generated
nonces is negligible — that means you can use `window.crypto.getRandomValues()`
to generate a new one *every time*.

The authentication strength depends on the length of the authentication tag,
`tagLength` should thus be *at least* 96 bit which is unfortunately not
enforced by the API itself. We chose 128 bit in our example above.

## AES-GCM decryption
