---
layout: post
title: "Using the Web Cryptography API to implement the Firefox OS lock screen"
date: 2015-02-01 13:29:09 +0100
---

My colleague [Frederik Braun](https://twitter.com/freddyb), with some feedback
from me, recently took on to rewrite the module responsible for storing and
checking the passcode to (un)lock your Firefox OS phone. It provides a great
example of the WebCrypto API in the wild and gives the opportunity to highlight
a few good practices when using [PBKDF2](TODO) to derive a cryptographic key
from a password typed by the user.

## The Passcode Module

The lock screen application should have a minimalistic API. When setting up the
phone for the first time - or when changing the pass code later - we call
`store(code)` to write a new code to disk. `verify(code)` will later help us
determine whether we should unlock the phone given a user-typed password.
Both methods will return a Promise as all operations in the WebCrypto API are
asynchronous.

{% codeblock lang:js %}
let Passcode = {
  store(code) {
    // ...
  },

  verify(code) {
    // ...
  }
};
{% endcodeblock %}

Storing a new pass code and verifying it is as simple as shown below:

{% codeblock lang:js %}
Passcode.store("1234").then(() => {
  return Passcode.verify("1234");
}).then(valid => {
  console.log(valid);
});

// Output: true
{% endcodeblock %}

## Deriving bits using PBKDF2

The module does not store pass codes in the clear. We will use PBKDF2 to
iterate a cryptographic hash function a few times and retrieve a result that
looks random. An attacker that gained read access to the part of the disk
storing the user's pass code will not be able to determine the input we fed
into the hash function.

{% codeblock lang:js %}
function deriveBits(code) {
  // Convert string to a TypedArray.
  let bytes = new TextEncoder("utf-8").encode(code);

  // Create the base key to derive from.
  let importKey = crypto.subtle.importKey(
    "raw", bytes, "PBKDF2", false, ["deriveBits"])

  // Use 8 random bytes as the salt.
  let salt = crypto.getRandomValues(new Uint8Array(8));

  return importKey.then(pwKey => {
    let params = {
      name: "PBKDF2",
      hash: "SHA-1",
      salt: salt,
      iterations: 1000
    };

    // Derive 160 bits using PBKDF2.
    return crypto.subtle.deriveBits(params, pwKey, 160);
  });
}
{% endcodeblock %}

Deriving bits using PBKDF2 is straightforward but requires passing and
choosing a number of parameters. We will go through all of the parameters one
by one.

### Choosing a cryptographic hash function

PBKDF2 does not only use a hash function but uses HMAC internally. SHA-1 as a
cryptographic hash function is broken and should not be used anymore. As a
building block in the HMAC-SHA-1 construction however we only rely on its PRF
properties. Although finding SHA-1 collisions is considered feasible nowadays
it is still considered a secure PRF.

That said, it does not hurt to switch to a secure cryptogaphic hash function
like SHA-256. Chrome supports other hash functions for PBKDF2 today, Firefox
unfortunately still waits for an NSS fix (bug 554827) before that can be
unlocked for the WebCrypto API.

### Random salt

The salt is a random component that is fed into the HMAC function along with
the pass code inside PBKDF2. Doing so spoils so-called Rainbow-Table attacks
where attackers pre-compute hashes for millions of popular passwords and
variations. Passing a *random* salt that is *sufficiently long* would require
attackers to prepare such a table for every possible salt value.

The salt is a public value and will be stored in the clear along with the
derived key. We need the exact same salt to arrive at the exact same key later
again. We will thus have to modify `deriveBits()` to accept the salt as an
argument so that we can either generate a random one or read it from disk.

Pass at least 8 random bytes (64 bits) as the salt, pre-computing and storing
2^64 huge tables is nothing your average attacker will be able to accomplish.

### Number of iterations

Now that Rainbow-Tables are hopefully worthless, an attacker can concentrate
on brute-forcing the final hash value by combining the public salt value stored
on disk with millions of popular passwords and their variations. If PBKDF2 runs
fast it would allow to search through all those passwords rather quickly.

By specifying a *sufficiently high* number of iterations we can slow down
PBKDF2's inner computation so that an attacker with access to regular hardware
will have to face a massive performance decrease and be able to only try a few
thousand passwords per second instead of millions.

The ideal execution time for one round of PBKDF2 should be ~80ms.

### Number of bits to derive

The number of bits to derive should be chosen according to the hash function
that will be used. The length of the resulting hash digest is the output size
of one execution of PBKDF2. If you derive more bits than the hash function
outputs, PBKDF2 will have to be run again until it derived the desired number
of bits.

Derive 160 bits when using SHA-1, and derive 256 bits when using SHA-256. You
do not want to slow down the key derivation even further by accidentally
requiring more than one round of PBKDF2.

### Do not hard-code parameters

It is tempting to hard-code the name of the hash function, the number of bits
to derive, and the number of HMAC iterations in the code. You will regret this
decision only later when it turns out that maybe SHA-1 is not considered a
secure PRF anymore or you want to increase the number of inner iterations.

Future code can only verify old passwords with old parameters if those
parameters are stored along with the salt and the derived key. When verifying
the pass code we will read the name of the hash function and the number of
iterations from disk. We can defer the number of bits to derive from the hash
function used.

## Deriving bits (pass in parameters)

Let us rewrite `deriveBits()` to accept PBKDF2 parameters as arguments to make
the Passcode module a tad more future-proof:

#### getHashOutputLength(hash)

Returns the digest size in bits for a given hash function. For SHA-1 it returns
160 bits, 256 bits for SHA-256, and so on.

{% codeblock lang:js %}
function deriveBits(code, salt, hash, iterations) {
  // Convert string to TypedArray.
  let bytes = new TextEncoder("utf-8").encode(code);

  // Create the base key to derive from.
  let importKey = crypto.subtle.importKey(
    "raw", bytes, "PBKDF2", false, ["deriveBits"])

  return importKey.then(pwKey => {
    let hlen = getHashOutputLength(hash);
    let params = {name: "PBKDF2", hash, salt, iterations};

    // Derive bits using PBKDF2.
    return crypto.subtle.deriveBits(params, pwKey, hlen);
  });
}
{% endcodeblock %}

## Verifying a given pass code

We are done with `deriveBits()`, the heart of the Passcode module. Implementing
pass code verification is now basically a walk in the park:

#### localforage

A neat little library providing a simple, promise-based API for storing and
retrieving values. Uses IndexedDB as the backend in modern browsers.

#### compare(a, b)

Compares two given typed arrays byte-by-byte and returns true if they are equal.

{% codeblock lang:js %}
// <script src="localforage.min.js"/>

PasscodeHelper.verify = function (code) {
  let loadValues = Promise.all([
    localforage.getItem("digest"),
    localforage.getItem("salt"),
    localforage.getItem("hash"),
    localforage.getItem("iterations")
  ]);

  return loadValues.then(([digest, salt, hash, iterations]) => {
    return deriveBits(code, salt, hash, iterations).then(bits => {
      return compare(bits, digest);
    });
  });
};
{% endcodeblock %}

asdf asdf asdf

### Does compare() have to be a constant-time operation?

No, `compare()` does not have to be constant-time. Even if the attacker learns
the first byte of the final digest stored on disk she cannot easily produce
inputs to guess the second byte - the opposite would imply knowing the
pre-images of all those two-byte values. She cannot do better than submitting
simple guesses that become harder the more bytes are known. For a successful
attack all bytes have to be recovered, which in turns means a valid pre-image
for the full final digest needs to be found.

If it makes you feel any better, you can of course implement `compare()` as a
constant-time operation. This might be tricky though given that all modern
JavaScript engines optimize code heavily.

## Storing a new passcode

asdf asdf

{% codeblock lang:js %}
const HASH = "SHA-1";
const ITERATIONS = 1000;

PasscodeHelper.store = function (code) {
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
