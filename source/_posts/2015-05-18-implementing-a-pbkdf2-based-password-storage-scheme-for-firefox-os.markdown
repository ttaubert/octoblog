---
layout: post
title: "Implementing a PBKDF2-based password storage scheme for Firefox OS"
date: 2015-05-18 14:00:00 +0100
---

My esteemed colleague [Frederik Braun](https://frederik-braun.com/) recently
took on to rewrite the module responsible for storing and checking passcodes
that unlock Firefox OS phones. While we are still working on actually landing
it in [Gaia](https://developer.mozilla.org/en-US/Firefox_OS/Platform/Gaia) I
wanted to seize the chance to talk about this great use case of the
[WebCrypto API](https://dvcs.w3.org/hg/webcrypto-api/raw-file/tip/spec/Overview.html)
in the wild and highlight a few important points when using
[password-based key derivation (PBKDF2)](https://en.wikipedia.org/wiki/PBKDF2)
to store passwords.

## The Passcode Module

Let us take a closer look at not the verbatim implementation but at a slightly
simplified version. The API offers the only two operations such a module needs
to support: setting a new passcode and verifying that a given passcode matches
the stored one.

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
later - we call `Passcode.store()` to write a new code to disk.
`Passcode.verify()` will help us determine whether we should unlock the phone.
Both methods return a Promise as all operations exposed by the WebCrypto API
are asynchronous.

{% codeblock lang:js %}
Passcode.store("1234").then(() => {
  return Passcode.verify("1234");
}).then(valid => {
  console.log(valid);
});

// Output: true
{% endcodeblock %}

## Make the passcode look "random"

The module should *absolutely not* store passcodes in the clear. We will use
[PBKDF2](https://en.wikipedia.org/wiki/PBKDF2) as a
[pseudorandom function (PRF)](https://en.wikipedia.org/wiki/Pseudorandom_function_family)
to retrieve a result that *looks random*. An attacker with read access to the
part of the disk storing the user's passcode should not be able to recover the
original input, assuming limited computational resources.

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
    // Salt should be at least 64 bits.
    let salt = crypto.getRandomValues(new Uint8Array(8));

    // All required PBKDF2 parameters.
    let params = {name: "PBKDF2", hash: "SHA-1", salt, iterations: 5000};

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
will be called twice, combining the message `m` and the key `k`. Whereas HMAC
is usually used for authentication PBKDF2 makes use of its PRF properties, that
means its output is computationally indistinguishable from random.

`deriveBits()` as defined above uses [SHA-1](https://en.wikipedia.org/wiki/SHA-1)
as well, and although it is [considered broken](http://valerieaurora.org/hash.html)
as a [collision-resistant](https://en.wikipedia.org/wiki/Collision_resistance)
hash function it is still a safe building block in the HMAC-SHA-1 construction.
HMAC only relies on a hash function's PRF properties, and while finding SHA-1
collisions is considered feasible it is still believed to be a secure PRF.

That said, it would not hurt to switch to a secure cryptographic hash function
like [SHA-256](https://en.wikipedia.org/wiki/SHA-2). Chrome supports other hash
functions for PBKDF2 today, Firefox unfortunately has to wait for an
[NSS fix](https://bugzil.la/554827) before those can be unlocked for the
WebCrypto API.

### Pass a random salt

The salt is a random component that PBKDF2 feeds into the HMAC function along
with the passcode. This prevents an attacker from simply computing the hashes
of for example all 8-character combinations of alphanumerics (~5.4 PetaByte of
storage for SHA-1) and use a huge
[lookup table](https://en.wikipedia.org/wiki/Lookup_table) to quickly reverse
a given password hash. Specify 8 random bytes as the salt and the poor attacker
will have to suddenly compute (and store!) 2^64 of those lookup tables and face
8 additional random characters in the input. Even without the salt the effort
to create even one lookup table would be hard to justify because chances are
high you cannot reuse it to attack another target, they might be using a
different hash function or combine two or more of them.

The same goes for [Rainbow Tables](https://en.wikipedia.org/wiki/Rainbow_table).
A random salt included with the password would have to be incorporated
when precomputing the hash chains and the attacker is back to square one where
she has to compute a Rainbow Table for every possible salt value. That certainly
works ad-hoc for a single salt value but preparing and storing 2^64 of those
tables is impossible.

The salt is public and will be stored in the clear along with the derived bits.
We need the exact same salt to arrive at the exact same derived bits later
again. We thus have to modify `deriveBits()` to accept the salt as an argument
so that we can either generate a random one or read it from disk.

{% codeblock lang:js %}
function deriveBits(code, salt) {
  // Convert string to a TypedArray.
  let bytes = new TextEncoder("utf-8").encode(code);

  // Create the base key to derive from.
  let importedKey = crypto.subtle.importKey(
    "raw", bytes, "PBKDF2", false, ["deriveBits"]);

  return importedKey.then(key => {
    // All required PBKDF2 parameters.
    let params = {name: "PBKDF2", hash: "SHA-1", salt, iterations: 5000};

    // Derive 160 bits using PBKDF2.
    return crypto.subtle.deriveBits(params, key, 160);
  });
}
{% endcodeblock %}

Keep in mind though that Rainbow tables today are mainly a thing from the past
where password hashes were smaller and [shittier](http://en.wikipedia.org/wiki/LM_hash).
Salts are the bare minimum a good password storage scheme needs, but they
merely protect against a threat that is largely irrelevant today.

### Specify a number of iterations

As computers became faster and Rainbow Table attacks infeasible due to the
prevalent use of salts everywhere, people started attacking password hashes
with dictionaries, simply by taking the public salt value and passing that
combined with their educated guess to the hash function until a match was found.
Modern password schemes thus employ a "work factor" to make hashing millions of
password guesses unbearably slow.

By specifying a *sufficiently high* number of iterations we can slow down
PBKDF2's inner computation so that an attacker will have to face a massive
performance decrease and be able to only try a few thousand passwords per
second instead of millions.

For a single-user disk or file encryption it might be acceptable if computing
the password hash takes a few seconds; for a lock screen 300-500ms might be
the upper limit to not interfere with user experience. Take a look at
[this great StackExchange post](http://security.stackexchange.com/questions/3959/recommended-of-iterations-when-using-pkbdf2-sha256/3993#3993)
for more advice on what might be the right number of iterations for your
application and environment.

A much more secure version of a lock screen would allow to not only use four
digits but any number of characters. An additional delay of a few seconds
after a small number of wrong guesses might increase security even more,
assuming the attacker cannot access the PRF output stored on disk.

### Determine the number of bits to derive

PBKDF2 can output an almost arbitrary amount of pseudo-random data. A single
execution yields the number of bits that is equal to the chosen hash function's
output size. If the desired number of bits exceeds the hash function's output
size PBKDF2 will be repeatedly executed until enough bits have been derived.

{% codeblock lang:js %}
function getHashOutputLength(hash) {
  switch (hash) {
    case "SHA-1":   return 160;
    case "SHA-256": return 256;
    case "SHA-384": return 384;
    case "SHA-512": return 512;
  }

  throw new Error("Unsupported hash function");
}
{% endcodeblock %}

Choose 160 bits for SHA-1, 256 bits for SHA-256, and so on. Slowing down the
key derivation even further by requiring more than one round of PBKDF2 will not
increase the security of the password storage.

## Do not hard-code parameters

Hard-coding PBKDF2 parameters - the name of the hash function to use in the
HMAC construction, and the number of HMAC iterations - is tempting at first.
We however need to be flexible if for example it turns out that SHA-1 can no
longer be considered a secure PRF, or you need to increase the number of
iterations to keep up with faster hardware.

To ensure future code can verify old passwords we store the parameters that
were passed to PBKDF2 at the time, including the salt. When verifying the
passcode we will read the hash function name, the number of iterations, and the
salt from disk and pass those to `deriveBits()` along with the passcode itself.
The number of bits to derive will be the hash function's output size.

{% codeblock lang:js %}
function deriveBits(code, salt, hash, iterations) {
  // Convert string to a TypedArray.
  let bytes = new TextEncoder("utf-8").encode(code);

  // Create the base key to derive from.
  let importedKey = crypto.subtle.importKey(
    "raw", bytes, "PBKDF2", false, ["deriveBits"]);

  return importedKey.then(key => {
    // Output length in bits for the given hash function.
    let hlen = getHashOutputLength(hash);

    // All required PBKDF2 parameters.
    let params = {name: "PBKDF2", hash, salt, iterations};

    // Derive |hlen| bits using PBKDF2.
    return crypto.subtle.deriveBits(params, key, hlen);
  });
}
{% endcodeblock %}

## Storing a new passcode

Now that we are done implementing `deriveBits()`, the heart of the Passcode
module, completing the API is basically a walk in the park. For the sake of
simplicity we will use [localforage](https://mozilla.github.io/localForage/)
as the storage backend. It provides a simple, asynchronous, and Promise-based
key-value store.

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

## What about bcrypt or scrypt?

Both [bcrypt](https://en.wikipedia.org/wiki/Bcrypt) and
[scrypt](https://en.wikipedia.org/wiki/Scrypt) are probably better alternatives
to PBKDF2. Bcrypt automatically embeds the salt and cost factor into its output,
most APIs are clever enough to parse and use those parameters when verifying a
given password.

Scrypt implementations can usually securely generate a random salt, that is one
less thing for you to care about. The most important aspect of scrypt though is
that it allows consuming a lot of memory when computing the password hash which
makes cracking passwords using ASICs or FPGAs close to impossible.

The Web Cryptography API does unfortunately support neither of the two
algorithms and currently there are no proposals to add those. In the case of
scrypt it might also be somewhat controversial to allow a website to consume
arbitrary amounts of memory.
