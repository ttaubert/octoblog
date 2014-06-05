---
layout: post
title: "Password-based key derivation using the Web Cryptography API"
date: 2014-06-05 20:00
published: false
---

> This is a multi-part blog post series on the [Web Cryptography API](http://www.w3.org/TR/WebCryptoAPI/):
>
> [→ Part 1: Hashing](/blog/2014/06/hashing-using-the-web-cryptography-api/)  
> [→ Part 2: Hash-based message authentication codes](/blog/2014/06/hash-based-message-authentication-codes-and-the-web-cryptography-api/)  
> [→ Part 3: Password-based key derivation](/blog/2014/06/password-based-key-derivation-using-the-web-cryptography-api/)

We covered [computing hashes](/blog/2014/06/hashing-using-the-web-cryptography-api/)
and [computing hash-based MACs](/blog/2014/06/hashing-using-the-web-cryptography-api/)
in the two previous posts. Using these important cryptographic primitives the
WebCrypto API provides [PBKDF2](https://en.wikipedia.org/wiki/PBKDF2), a
password-based key derivation function that can be used to turn low-entropy
keys like passwords into cryptographic keys.

{% codeblock lang:js %}
var password = "rbW-fk8;#9";

// Convert the given password to a Uint8Array.
var data = new TextEncoder("utf-8").encode(password);

// Import the raw bytes into a WebCrypto Key object.
var promisePasswordKey = window.crypto.subtle.importKey(
  "raw", data, {name: "PBKDF2"}, false, ["deriveKey"]);
{% endcodeblock %}

{% codeblock lang:js %}
var promiseDerivedKey = promisePasswordKey.then(function (pwKey) {
  var algoKDF = {
    name: "PBKDF2",
    hash: {name: "SHA-256"},

    // You should allow at least 2^64 possible variations per password.
    salt: window.crypto.getRandomValues(new Uint8Array(64)),

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
