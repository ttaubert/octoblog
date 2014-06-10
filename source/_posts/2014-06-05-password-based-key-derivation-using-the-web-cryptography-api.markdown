---
layout: post
title: "Password-based key derivation using the Web Cryptography API"
date: 2014-06-12 20:00
published: false
---

> This is a multi-part blog post series on the [Web Cryptography API](http://www.w3.org/TR/WebCryptoAPI/):
>
> [→ Part 1: Hashing](/blog/2014/06/hashing-using-the-web-cryptography-api/)  
> [→ Part 2: Hash-based message authentication codes](/blog/2014/06/hash-based-message-authentication-codes-and-the-web-cryptography-api/)  
> [→ Part 3: Password-based key derivation](/blog/2014/06/password-based-key-derivation-using-the-web-cryptography-api/)  
> [→ Part 4: Secret-key encryption](/blog/2014/06/secret-key-encryption-using-the-web-cryptography-api/)

The previous post covered
[computing hash-based MACs](/blog/2014/06/hashing-using-the-web-cryptography-api/).
Using this important cryptographic primitive the WebCrypto API provides
[PBKDF2](https://en.wikipedia.org/wiki/PBKDF2), a password-based key derivation
function that computes cryptographic keys from low-entropy keys like passwords.

## The key derivation

To retrieve a new key we first need to import the given `password` into a
WebCrypto `Key` object. The object is just a reference, the key bits itself
reside in the native crypto worker and are inaccessible from content if
exporting them is not allowed.

{% codeblock lang:js %}
var password = "rbW-fk8;#9";

// Convert the given password to a Uint8Array.
var data = new TextEncoder("utf-8").encode(password);

// Import the raw bytes into a WebCrypto Key object.
var promisePasswordKey = window.crypto.subtle.importKey(
  "raw", data, {name: "PBKDF2"}, false, ["deriveKey"]);
{% endcodeblock %}

The `password` variable's value as seen above would be coming from the user.
Note that per spec you could also use the algorithm's `generateKey()` method
to open a native prompt querying for a password.

{% codeblock lang:js %}
// Opens a native prompt asking to type a password.
var promisePasswordKey = window.crypto.subtle.generateKey(
  {name: "PBKDF2"}, false, ["deriveKey"]);

// Note: Not supported by any browser, yet :(
{% endcodeblock %}

Using the new key the next step is starting the actual key derivation that will
result in a new key usable for cryptographic operations:

{% codeblock lang:js %}
var promiseDerivedKey = promisePasswordKey.then(function (pwKey) {
  var algoKDF = {
    name: "PBKDF2",
    hash: {name: "SHA-256"},

    // You should allow at least 2^64 possible variations per password.
    salt: window.crypto.getRandomValues(new Uint8Array(8)),

    // The more iterations the slower, but also more secure.
    iterations: 100000
  };

  var algoHMAC = {
    name: "HMAC",
    hash: {name: "SHA-256"}
  };

  // Kick off the actual key derivation.
  return window.crypto.subtle.deriveKey(
    algoKDF, pwKey, algoHMAC, false, ["sign", "verify"]);
});
{% endcodeblock %}

## Choosing good parameters

The PBKDF2 algorithm applies the desired hash function to the given password
along with the `salt` value repeatedly. The number of `iterations` should be
chosen such that the work required to derive a key is large enough to
practically slow down password cracking attempts.

The `salt` defends against
[rainbow-table attacks](https://en.wikipedia.org/wiki/Rainbow_table) and means
that multiple passwords have to be tested individually, not all at once.
It should be at least 64 bits long and randomly generated for each password.

## Using the new key

The newly derived key can now be used as a cryptographic key for the
[HMAC](https://en.wikipedia.org/wiki/HMAC) construction as described in the
[previous post](/blog/2014/06/hashing-using-the-web-cryptography-api/):

{% codeblock lang:js %}
var msg = "The quick brown fox jumps over the lazy dog";

// Convert the given message to a Uint8Array.
var data = new TextEncoder("utf-8").encode(msg);

promiseDerivedKey.then(function (key) {
  // Use the key we just derived to compute the HMAC.
  window.crypto.subtle.sign({name: "HMAC"}, key, data)
    .then(function (mac) {
      console.log(mac);
    });
});

// Output: (will be random because the salt is)
// Uint8Array [ 204, 226, 228, 135, 177, 224, 207, 110, 44, 230, 22 more… ]
{% endcodeblock %}

The computed MAC could now be stored along with the authenticated but
unencrypted data on the user's hard disk (e.g. an Indexed DB store). Given
that the user chose a good password it is infeasible for an attacker to compute
a valid MAC for a modified version of the unencrypted data. Using
`window.crypto.subtle.verify()` we can thus ensure authenticity for stored data.

## Encrypting data using derived keys

Computing MACs is a simple example but in the real world we might be interested
in not only integrity and authenticity, but also secrecy.

See my next post about how you can use the WebCrypto API to encrypt data using
the [AES](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard) block
cipher.

[→ Part 4: Secret-key encryption](/blog/2014/06/secret-key-encryption-using-the-web-cryptography-api/)
