---
layout: post
title: "Implementing the Firefox OS lock screen using the WebCrypto API"
date: 2015-02-01 13:29:09 +0100
---

My colleague Frederik Braun recently took on to rewrite the passcode module
storing and checking the passcode that's used for locking and unlocking your
FirefoxOS phone.

It's a great example of using the WebCrypto API on a Firefox OS phone and
provides a few practical PBKDF2 usage advices.

not a 1:1 representation of the patch itself but a simplified version to get
the point across and provide a good example. The post makes heavy use of ES6.

let's start by looking at the basic api

## The basic module

basic module, setPasscode() when a new passcode is set in the settings.
checkPasscode() when unlocking the phone.

{% codeblock lang:js %}
let PasscodeHelper = {
  setPasscode(code) {
    // ...
  },

  checkPasscode(code) {
    // ...
  }
};
{% endcodeblock %}

Here's a simple usage example. It sets passcode and 

{% codeblock lang:js %}
PasscodeHelper.setPasscode("1234").then(() => {
  return PasscodeHelper.checkPasscode("1234");
}).then(valid => {
  console.log(valid);
});

// Output: true
{% endcodeblock %}

## Deriving bits

{% codeblock lang:js %}
function deriveBits(code) {
  // Convert string to TypedArray.
  let bytes = new TextEncoder("utf-8").encode(str);

  // Create the base key to derive from.
  let importKey = crypto.subtle.importKey(
    "raw", bytes, "PBKDF2", false, ["deriveBits"])

  return importKey.then(pwKey => {
    let params = {
      name: "PBKDF2",
      hash: "SHA-1",
      salt: crypto.getRandomValues(new Uint8Array(8)),
      iterations: 1000
    };

    // Derive bits using PBKDF2.
    return crypto.subtle.deriveBits(params, pwKey, 160);
  });
}
{% endcodeblock %}

There are a few issues...

### Choice of hash function

bug 554827

### Random salt

### Number of iterations

### Number of bits to derive

### Should store hash and iterations

## Deriving bits (second try)

{% codeblock lang:js %}
function deriveBits(code, salt, hash, iterations) {
  // Convert string to TypedArray.
  let bytes = new TextEncoder("utf-8").encode(str);

  // Create the base key to derive from.
  let importKey = crypto.subtle.importKey(
    "raw", bytes, "PBKDF2", false, ["deriveBits"])

  return importKey.then(pwKey => {
    // Determine the number of bits the given hash function outputs.
    let hlen = getHashOutputLength(hash);

    // Derive bits using PBKDF2.
    let params = {name: "PBKDF2", hash, salt, iterations};
    return crypto.subtle.deriveBits(params, pwKey, hlen);
  });
}
{% endcodeblock %}

### getHashOutputSize() function

{% codeblock lang:js %}
function getHashOutputLength(hash) {
  switch (hash) {
    case "SHA-1":
      return 160;
    case "SHA-256":
      return 256;
    case "SHA-384":
      return 384;
    case "SHA-512":
      return 512;
    default:
      throw new Error("unknown hash function");
  }
};
{% endcodeblock %}

## checkPasscode() implementation

{% codeblock lang:js %}
// <script src="localforage.min.js"/>

PasscodeHelper.checkPasscode = function (code) {
  let loadValues = Promise.all([
    localforage.getItem("digest"),
    localforage.getItem("salt"),
    localforage.getItem("hash"),
    localforage.getItem("iterations")
  ]);

  return loadValues.then(([digest, salt, hash, iterations]) => {
    return deriveBits(code, salt, hash, iterations);
  }).then(bits => {
    return compare(bits, digest);
  });
};
{% endcodeblock %}

localforage

### compare() function

{% codeblock lang:js %}
function compare(a, b) {
  if (a.byteLength != b.byteLength) {
    return false;
  }

  a = new Uint8Array(a);
  b = new Uint8Array(b);

  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] != b[i]) {
      return false;
    }
  }

  return true;
}
{% endcodeblock %}

### const-time compare

{% codeblock lang:js %}
const HASH = "SHA-1";
const ITERATIONS = 1000;

PasscodeHelper.setPasscode = function (code) {
  let salt = crypto.getRandomValues(new Uint8Array(8));

  return deriveBits(code, salt, HASH, ITERATIONS).then(bits => {
    return Promise.all([
      localforage.setItem("digest", bits),
      localforage.setItem("salt", salt),
      localforage.setItem("hash", HASH),
      localforage.setItem("iterations", ITERATIONS)
    ]);
  });
};
{% endcodeblock %}

## Conclusion

take upgrade into account
security -> 80ms x 10,000 = 13,3h (max) / 6.65h (avg)
faster with a faster device, or even ASICs or FPGAs
would require to know the final hash value, read from the device
with mis-calculated num of iterations, maybe even less time to find key
