---
layout: post
title: "Secret-key encryption using the Web Cryptography API"
date: 2014-06-13 21:00
---

> This is a multi-part blog post series on the [Web Cryptography API](http://www.w3.org/TR/WebCryptoAPI/):
>
> [→ Part 1: Hashing](/blog/2014/06/hashing-using-the-web-cryptography-api/)  
> [→ Part 2: Hash-based message authentication codes](/blog/2014/06/hash-based-message-authentication-codes-and-the-web-cryptography-api/)  
> [→ Part 3: Password-based key derivation](/blog/2014/06/password-based-key-derivation-using-the-web-cryptography-api/)  
> [→ Part 4: Secret-key encryption](/blog/2014/06/secret-key-encryption-using-the-web-cryptography-api/)  

The previous post covered [password-based key derivation](/blog/2014/06/password-based-key-derivation-using-the-web-cryptography-api/)
to compute cryptographic keys from low-entropy keys like user-typed passwords.
This post shows how to use the derived secret key for
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

  // We want a 128-bit tag.
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
enforced by the API itself. We chose 128 bit in the example above.

## AES-GCM decryption

After transmitting `ct` and `nonce` to a different party that shares the secret
`key`, they will want to decrypt the given ciphertext *after* verifying its
authenticity using the appended tag.

{% codeblock lang:js %}
// We know that we have a 128-bit tag.
var algo = {name: "AES-GCM", iv: nonce, tagLength: 128};

window.crypto.subtle.decrypt(algo, key, ct)
  .then(function (ct) {
    console.log(ct);
  });

// Output: "The quick brown fox jumps over the lazy dog" as UTF-8 bytes.
// Uint8Array [ 84, 104, 101, 32, 113, 117, 105, 99, 107, 32, 33 more… ]
{% endcodeblock %}

The verification must fail and the promise reject when the appended tag is
invalid, the data was tampered with, or an incorrect secret key was given.

{% codeblock lang:js %}
// Override the key with a new random value.
key = crypto.getRandomValues(new Uint8Array(32));

window.crypto.subtle.decrypt(algo, key, ct)
  .then(function (ct) {
    // We should not get here as the promise
    // (with high probability) must not resolve.
  }, function () {
    console.log("Given ciphertext is *not* valid under the new key!");
  });

// Output: (Failed decryption with a random key.)
// "Given ciphertext is *not* valid under the new key!"
{% endcodeblock %}

## Putting it all together

With all the examples shown in this and previous posts you should now know
everything to write a simple application that could securely store user data
in an Indexed DB store by asking the user to type password when loading and
saving.

The data would be encrypted, secure against tampering, and authenticated
to come from a party sharing the secret key. It is however *your*
responsibility to harden your application against common and traditional
attacks, such as script injection, by making use of appropriate existing
functionality such as Content Security Policy, Subresource Integrity, and TLS.

## More words of caution

The [WebCrypto spec](http://www.w3.org/TR/WebCryptoAPI/)
itself does not list a number of required algorithms.
The algorithms used in the examples are currently available in Firefox and
Chrome but might not be in the future or other browser.

The API includes cryptographic operations and algorithms which have known
security issues (sometimes only when used inappropriately) and should be used
for interoperability with legacy applications only. You should review the
appropriate cryptographic literature before making use of certain algorithms,
and should avoid attempting to develop new cryptographic protocols whenever
possible.

## End of series

I hope that this blog post series covered the basics of the WebCrypto API well
and that you should now be able to use it for authenticated encryption,
hashing, and authentication in your own apps.

The constraint of sharing a secret key is rather limiting and that is why the
WebCrypto API supports a number of asymmetric encryption algorithms and key
exchanges. Future posts might cover topics like
[RSA](https://en.wikipedia.org/wiki/RSA_%28cryptosystem%29) and
[Diffie-Hellman](https://en.wikipedia.org/wiki/Diffie-Hellman_key_exchange).
