---
layout: post
title: "Password-based key derivation using the Web Cryptography API"
date: 2014-06-05 18:00
published: false
---

{% codeblock lang:js %}
var password = "rbW-fk8;#9";

// Convert the given password to a Uint8Array.
var data = new TextEncoder("utf-8").encode(password);

// TODO
var promisePasswordKey = window.crypto.subtle.importKey(
  "raw", data, {name: "PBKDF2"}, false, ["deriveKey"]);
{% endcodeblock %}

{% codeblock lang:js %}
var promiseDerivedKey = promisePasswordKey.then(function (pwKey) {
  var algoKDF = {
    name: "PBKDF2",
    hash: {name: "SHA-256"},

    // The salt should allow 2^64 possible variations per password.
    salt: window.crypto.getRandomValues(new Uint8Array(64)),

    // The more iterations the slower, but also more secure.
    iterations: 100000
  };

  var algoHMAC = {
    name: "HMAC",
    hash: {name: "SHA-256"}
  };

  return window.crypto.subtle.deriveKey(
    algoKDF, pwKey, algoHMAC, false, ["sign", "verify"]);
});
{% endcodeblock %}
