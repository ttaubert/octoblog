---
layout: post
title: "Implementing a Firefox OS lock screen with the Web Cryptography API"
date: 2015-05-01 18:00:00 +0100
---

My colleague [Frederik Braun](https://twitter.com/freddyb) recently took on to
rewrite the module responsible for storing and checking the passcode to
(un)lock your Firefox OS phone. This is a great use case of the
[WebCrypto API](https://dvcs.w3.org/hg/webcrypto-api/raw-file/tip/spec/Overview.html)
in the wild and gives the opportunity to highlight a few important points when using
[password-based key derivation (PBKDF2)](https://en.wikipedia.org/wiki/PBKDF2)
to store passwords.

## The Passcode Module

The API offers the only two operations such a module needs to support: setting
a new passcode and verifying that a given passcode matches the stored one.

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
later - we call `Passcode.store(code)` to write a new code to disk. Later,
`Passcode.verify(code)` will help us determine whether we should unlock the
phone given a user-typed password. Both methods will return a Promise as all
operations exposed by the WebCrypto API are asynchronous.

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

The module should absolutely not store passcodes in the clear. We will use
[PBKDF2](https://en.wikipedia.org/wiki/PBKDF2) to iterate a
[pseudorandom function (PRF)](https://en.wikipedia.org/wiki/Pseudorandom_function_family)
and retrieve a result that *looks random*. An attacker with read access to the
part of the disk storing the user's passcode should not be able to reveal the
original input, assuming limited computational and financial resources.

The function `deriveBits()` is a PRF that takes a passcode and returns a Promise
resolving to a random looking sequence of bytes. To be a little more specific,
it uses PBKDF2 to derive pseudorandom bits.

{% codeblock lang:js %}
function deriveBits(code) {
  // Convert string to a TypedArray.
  let bytes = new TextEncoder("utf-8").encode(code);

  // Create the base key to derive from.
  let importedKey = crypto.subtle.importKey(
    "raw", bytes, "PBKDF2", false, ["deriveBits"]);

  return importedKey.then(key => {
    // Salt length is 64 bits.
    let salt = crypto.getRandomValues(new Uint8Array(8));

    // All required PBKDF2 parameters.
    let params = {name: "PBKDF2", hash: "SHA-1", salt, iterations: 1000};

    // Derive 160 bits using PBKDF2.
    return crypto.subtle.deriveBits(params, key, 160);
  });
}
{% endcodeblock %}

## Choosing PBKDF2 parameters

As you can see above PBKDF2 takes a whole bunch of parameters. Choosing good
values is crucial for the security of our passcode module so it is best to take
a detailed look at every single one of them.

### Select a cryptographic hash function

PBKDF2 is a *big* PRF that iterates a *small* PRF. The small PRF, iterated
multiple times (more on why this is done later), is fixed to be an
[HMAC](https://en.wikipedia.org/wiki/HMAC) construction; you are however
allowed to specify the cryptographic hash function used inside HMAC itself. To
understand why you need to select a hash function it helps to take a look at
HMAC's definition, here with [SHA-1](https://en.wikipedia.org/wiki/SHA-1) at
its core:

{% codeblock lang:text %}
HMAC-SHA-1(k, m) = SHA-1((k ⊕ opad) + SHA-1((k ⊕ ipad) + m))
{% endcodeblock %}

The outer and inner padding `opad` and `ipad` are static values that can be
ignored for our purpose, the important takeaway is that the given hash function
will be called twice combining the message `m` and the key `k`. Whereas HMAC is
usually used for authentication PBKDF2 makes use of its PRF properties, that
means its output is computationally indistinguishable from random.

`deriveBits()` as defined above uses [SHA-1](https://en.wikipedia.org/wiki/SHA-1)
as well, and although it is [considered broken](http://valerieaurora.org/hash.html)
as a [collision-resistant](https://en.wikipedia.org/wiki/Collision_resistance)
hash function it is still a safe building block in the HMAC-SHA-1 construction.
HMAC only relies on a hash function's PRF properties, and while finding SHA-1
collisions is considered feasible it is still believed to be a secure PRF.

That said, it does not hurt to switch to a secure cryptographic hash function
like [SHA-256](https://en.wikipedia.org/wiki/SHA-2). Chrome supports other hash
functions for PBKDF2 today, Firefox unfortunately has to wait for an
[NSS fix](https://bugzil.la/554827) before those can be unlocked for the
WebCrypto API.

### Pass a random salt

The salt is a random component that PBKDF2 feeds into the HMAC function along
with the passcode. This prevents so-called
[rainbow table](https://en.wikipedia.org/wiki/Rainbow_table) attacks where
attackers pre-compute hashes for millions of popular passwords and variations.
Passing a *random* salt requires attackers to prepare such a table for every
possible salt value. The longer the random salt value, the more rainbow tables
to pre-compute. You should pass at least 8 random bytes (64 bits) so an
attacker would have to pre-compute and store 2^64 enormous tables.

The salt is a public value and will be stored in the clear along with the
derived bits. We need the exact same salt to arrive at the exact same derived
bits later again. We will thus have to modify `deriveBits()` to accept the salt
as an argument so that we can either generate a random one or read it from disk.

Rainbow tables today are mainly a thing from the past where password hashes
were small enough to fit the entire output space of a given hash function in
maybe 50 GB. As password hashes became longer people kept using salts because
that was considered good practice, but salts merely protect against a threat
that is largely irrelevant today.

### Specify a number of iterations

As computers became faster and rainbow table attacks infeasible due to the
prevalent use of salts everywhere, attackers started brute-forcing passwords
simply by taking the public salt value and passing that combined with their
guess to the hash function until a match was found. Modern password schemes
thus employ a "work factor" to make hashing millions of password guesses
sufficiently slow.

By specifying a *sufficiently high* number of iterations we can slow down
PBKDF2's inner computation so that an attacker with access to regular hardware
will have to face a massive performance decrease and be able to only try a few
thousand passwords per second instead of millions. Choosing an iteration count
so that PBKDF2 takes 80ms to complete means a simple four-digit number can
still be guessed in roughly 13 minutes, it will take only 7 minutes on average
to find.

For a single-user disk or file encryption it might be acceptable if computing
the password hash takes a few seconds. For a lock screen 300-500ms might be
the upper limit to not interfere with user experience. Take a look at
[this great StackExchange post](http://security.stackexchange.com/questions/3959/recommended-of-iterations-when-using-pkbdf2-sha256/3993#3993)
for more advice on what might be the right number of iterations for your
application and environment.

For a much more secure version the UI should thus allow to not only use
numbers but any number of characters. An additional delay of a few seconds
after a small number of wrong guesses might increase security even more,
assuming the attacker cannot access the PRF output stored on disk.

### Determine the number of bits to derive

PBKDF2 can output an almost arbitrary amount of pseudo-random data. A single
execution yields the number of bits that is equal to the chosen hash function's
output size. If the number of bits to derive exceeds the hash function's output
size PBKDF2 will be repeatedly executed until enough bits have been derived.

Choose 160 bits for SHA-1, 256 bits for SHA-256, and so on. Slowing down the
key derivation even further by requiring more than one round of PBKDF2 will not
increase the security of the lock screen.

## Do not hard-code parameters

Hard-coding PBKDF2's parameters - the name of the hash function to use in the
HMAC construction, and the number of HMAC iterations - might seem a good idea
at first. You could however regret this decision rather sooner than later
should it for example turn out that SHA-1 cannot be considered a secure PRF any
longer, or you need to increase the number of HMAC iterations to keep up with
the latest technological advancements.

To ensure future code can verify old passwords we need to store the parameters
that were passed to PBKDF2 at the time, including the salt. When verifying the
passcode we will read the hash function name, the number of iterations, and the
salt from disk and pass those to `deriveBits()` along with the passcode itself.
The number of bits to derive will simply be the hash function's output size.

{% codeblock lang:js %}
function deriveBits(code, salt, hash, iterations) {
  // Convert string to a TypedArray.
  let bytes = new TextEncoder("utf-8").encode(code);

  // Create the base key to derive from.
  let importedKey = crypto.subtle.importKey(
    "raw", bytes, "PBKDF2", false, ["deriveBits"]);

  return importedKey.then(key => {
    // Returns the output length in bits for the given hash function.
    let hlen = getHashOutputLength(hash);

    // All required PBKDF2 parameters.
    let params = {name: "PBKDF2", hash, salt, iterations};

    // Derive |hlen| bits using PBKDF2.
    return crypto.subtle.deriveBits(params, key, hlen);
  });
}
{% endcodeblock %}

## Storing a new passcode

Now that `deriveBits()`, the heart of the Passcode module, is done implementing
the main API functionality is basically a walk in the park. For the sake of
simplicity we will use [localforage](TODO) as the storage backend. It provides
a simple, asynchronous, and Promise-based key-value store.

{% codeblock lang:js %}
// <script src="localforage.min.js"/>

const HASH = "SHA-1";
const ITERATIONS = 4096;

Passcode.store = function (code) {
  // Generate a new random salt for every new passcode.
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

We generate a new random salt for every new passcode. The derived bits are
stored along with the salt, the hash function name, and the number of
iterations. `HASH` and `ITERATIONS` are constants that provide default values
for our PBKDF2 parameters and can be updated whenever desired. The Promise
returned by `Passcode.store()` will resolve when all values have been
successfully stored in the backend.

## Verifying a given passcode

To verify a passcode all values and parameters stored by `Passcode.store()`
will have to be read from disk and passed to `deriveBits()`. Comparing the
derived bits with the value stored on disk tells whether the passcode is valid.

{% codeblock lang:js %}
Passcode.verify = function (code) {
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

### Should compare() be a constant-time operation?

`compare()` does not *have* to be constant-time. Even if the attacker learns
the first byte of the final digest stored on disk she cannot easily produce
inputs to guess the second byte - the opposite would imply knowing the
pre-images of all those two-byte values. She cannot do better than submitting
simple guesses that become harder the more bytes are known. For a successful
attack all bytes have to be recovered, which in turns means a valid pre-image
for the full final digest needs to be found.

If it makes you feel any better, you can of course implement `compare()` as a
constant-time operation. This might be tricky though given that all modern
JavaScript engines optimize code heavily.

## Conclusion

When using PBKDF2 it is important to select the right values for its parameters
and take upgrading those values in the future into account. As everything in
cryptography, PBKDF2 merely buys you time.

The random salt ensures an attackers needs to spend the same amount of time for
every single device she wants to find the passcode for, and will have to focus
on one device at a time.

number of iterations
A delay would be good if the threat model is an attacker using the device to
brute-force the passcode.
asics fpgas when hash output known hard to beat when storing and verifying the
passcode shouldn't take too long to not interrupt the user.
Should enable passcodes that accept arbitrary long strings with arbitrary
characters. Given the user picks a good password this would make finding the
passcode a lot harder.

The WebCrypto API does unfortunately not support bcrypt or scrypt that can make
finding a passcode with asics or fpgas a lot harder and/or expensive.

Do not forget to have a few peers review your module to check whether you
implemented it securely. If possible sign your lock screen app before deploying.
