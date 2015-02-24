---
layout: post
title: "Implementing a Firefox OS lock screen with the WebCrypto API"
date: 2015-02-25 18:00:00 +0100
---

My colleague [Frederik Braun](https://twitter.com/freddyb) recently took on to
rewrite the module responsible for storing and checking the passcode to
(un)lock your Firefox OS phone. This is a great use case of the
[WebCrypto API](https://dvcs.w3.org/hg/webcrypto-api/raw-file/tip/spec/Overview.html)
in the wild and gives the opportunity to highlight a few good practices when using
[password-based key derivation (PBKDF2)](https://en.wikipedia.org/wiki/PBKDF2)
to store passwords.

In this post I will walk you through the example of writing a Firefox OS module
that can be used to set and verify passcodes.

## The Passcode Module

There are two operations that we need to support: setting a new passcode and
verifying that a given passcode matches the stored one. Our API will be
minimalistic:

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

When setting up the phone for the first time - or when changing the passcode
later - we call `store(code)` to write a new code to disk. `verify(code)` will
later help us determine whether we should unlock the phone given a user-typed
password. Both methods will return a Promise as all operations in the WebCrypto
API are asynchronous.

Storing a new passcode and verifying it is simple:

{% codeblock lang:js %}
Passcode.store("1234").then(() => {
  return Passcode.verify("1234");
}).then(valid => {
  console.log(valid);
});

// Output: true
{% endcodeblock %}

## Make the passcode look "random"

The module must not store passcodes in the clear. We will use PBKDF2 to iterate a
[pseudorandom function (PRF)](https://en.wikipedia.org/wiki/Pseudorandom_function_family)
and retrieve a result that looks random. An attacker with read access to the
part of the disk storing the user's passcode should not be able to reveal the
original input, assuming limited resources.

`deriveBits()` is a PRF that takes a passcode and returns a Promise that then
resolves to a random looking list of bytes. In cryptographic terms: we are
using PBKDF2, a big PRF that internally iterates a small PRF, to derive bits.

{% codeblock lang:js %}
function deriveBits(code) {
  // Convert string to a TypedArray.
  let bytes = new TextEncoder("utf-8").encode(code);

  // Create the base key to derive from.
  let importKey = crypto.subtle.importKey(
    "raw", bytes, "PBKDF2", false, ["deriveBits"])

  return importKey.then(pwKey => {
    let salt = crypto.getRandomValues(new Uint8Array(8));
    let params = {name: "PBKDF2", hash: "SHA-1", salt, iterations: 1000};

    // Derive 160 bits using PBKDF2.
    return crypto.subtle.deriveBits(params, pwKey, 160);
  });
}
{% endcodeblock %}

PBKDF2 takes a whole bunch of parameters and might leave you confused at first.
Choosing good values is crucial for the security of our passcode module so it
is best to take a detailed look at every single one of them.

### Selecting a cryptographic hash function

The PRF used by PBKDF2 internally is an [HMAC](https://en.wikipedia.org/wiki/HMAC)
construction. HMAC is fixed but you are allowed to specify the cryptographic
hash function to use.

The above example uses [SHA-1](https://en.wikipedia.org/wiki/SHA-1), and
although it [considered broken](http://valerieaurora.org/hash.html) as a
[collision-resistant](https://en.wikipedia.org/wiki/Collision_resistance) hash
function it is still safe to use as a building block in the HMAC-SHA-1
construction. We here only rely on its PRF properties, and while finding
collisions is considered feasible nowadays it is still believed to be a secure
PRF.

That said, it does not hurt to switch to a secure cryptographic hash function
like [SHA-256](https://en.wikipedia.org/wiki/SHA-2). Chrome supports other hash
functions for PBKDF2 today, Firefox unfortunately has to wait for an
[NSS fix](https://bugzil.la/554827) before those can be unlocked for the
WebCrypto API.

### Random salt

The salt is a random component that is fed into the HMAC function along with
the passcode inside PBKDF2. This is supposed to prevent so-called
[rainbow table](https://en.wikipedia.org/wiki/Rainbow_table) attacks where
attackers pre-compute hashes for millions of popular passwords and variations.
Passing a *random* salt requires attackers to prepare such a table for every
possible salt value. The longer the random salt value, the more tables to
pre-compute.

The salt is a public value and will be stored in the clear along with the
derived bits. We need the exact same salt to arrive at the exact same bits
later again. We will thus have to modify `deriveBits()` to accept the salt as
an argument so that we can either generate a random one or read it from disk.

You should pass at least 8 random bytes (64 bits) as the salt, pre-computing
and storing 2^64 huge tables is nothing your average attacker will be able to
accomplish.

### Number of iterations

Now that rainbow tables are hopefully worthless, an attacker can concentrate
on brute-forcing the final PRF output by combining the public salt value stored
on disk with millions of popular passwords and their variations. If PBKDF2 runs
fast it would allow to search through all those passwords rather quickly.

By specifying a *sufficiently high* number of iterations we can slow down
PBKDF2's inner computation so that an attacker with access to regular hardware
will have to face a massive performance decrease and be able to only try a few
thousand passwords per second instead of millions. Choosing an iteration count
so that PBKDF2 takes 80ms to complete then a simple four-digit number can still
be guessed in roughly 13 minutes, it will take only 7 minutes on average to
find.

For a much more secure version the UI should thus allow to not only use
numbers but any number of characters. An additional delay of a few seconds
after a small number of wrong guesses might increase security even more,
assuming the attacker cannot access the PRF output stored on disk.

### Number of bits to derive

PBKDF2 allows to derive an almost arbitrary number of bits. A single iteration
will yield a number of bits that is equal to the chosen hash function's output
size. If the number of bits to derive exceeds the hash function's output size
the whole PBKDF2 PRF will be executed until enough bits have been derived.

Choose 160 bits for SHA-1, 256 bits for SHA-256, and so on. Slowing down the
key derivation even further by requiring more than one round of PBKDF2 does not
increase the security of the lock screen.

### Do not hard-code parameters

It seems a good idea to hard-code PBKDF2's parameters - the name of the hash
function to use in the HMAC construction, and the number of HMAC iterations.
You might regret this decision later as soon as it turns out that maybe SHA-1
is not considered a secure PRF anymore or you want to increase the number of
inner iterations as computers and phones get faster quickly.

To ensure that future code can verify old passwords we need to store the
parameters that were passed to PBKDF2 at the time, including the salt. When
verifying the passcode we will read the hash function name, the number of
iterations, and the salt from disk. The number of bits to derive will be the
hash function's output size.

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

## Verifying a given passcode

We are done with `deriveBits()`, the heart of the Passcode module. Implementing
passcode verification is now basically a walk in the park:

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
