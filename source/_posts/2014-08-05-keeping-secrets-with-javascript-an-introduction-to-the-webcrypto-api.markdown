---
layout: post
title: "Keeping secrets with JavaScript: An Introduction to the WebCrypto API"
date: 2014-08-05 19:48
published: false
---

Welcome to the talk.

## To JS Crypto or not to JS Crypto?

This not another talk about the pros and cons of JS crypto.
A lot out there that has been said already, if you want to read it.
All major browser vendors are working on implementing the W3C WebCrypto API.
It will inevitably be a an important part of the future web platform.

Describe how I got here
Describe what to expect
Overview, not go into every detail
I picked good algorithms that you should stick with if you're not familiar
Learning about crypto story
State the goal of the talk
Firefox Eng at day, WebCrypto API in the night
What can you expect to know at the end?
Not a beginner JavaScript talk, I expect you to know promises, etc.

## Let's build a Notes app

Let's start with a simple example, for example a notes app on your Firefox OS device.
We won't talk much about the UI, all of you know what an app like that looks like.

{% codeblock lang:js %}
//< script src="https://mozilla.github.io/localForage/localforage.min.js"/>

var NotesStorage = {
  load: function () {
    return localforage.getItem("notes").then(notes => notes || []);
  },

  save: function (notes) {
    return localforage.setItem("notes", notes);
  }
};
{% endcodeblock %}

Let's directly take a look at the storage.
For simplicity I chose localforage, it's a small wrapper that provides an async
storage with a simple API like localstorage, great for a small example like this.
We can just directly pass the data object to localforage and can use promises
to handle our async stuff.

{% codeblock lang:js %}
var saved = NotesStorage.save([
  {title: "Return $200 to Alice"},
  {title: "Buy soy milk", due: "2014-09-15"},
  {title: "File a bug about that thing that doesn't work"}
]);

saved.then(function () {
  console.log("notes saved");
});
{% endcodeblock %}

This a very simple storage API.
It doesn't care about the format, the Notes app can do whatever it wants.
As maintainers of the storage we do care about multiple things.

## Integrity

At the very bottom we of course care about data integrity.
We don't want to show corrupted data to the user.
We can later go back and implement a system that backs up data in case it
becomes corrupted but for now let's just add an integrity check.

We can use cryptographic hash functions for integrity checking, you might know
that already from when you want to download a big file (say an Ubuntu image).
Most download sites will give you a link to the file and a checksum to
detect corruption after downloading.

{% codeblock lang:js %}
var msg = "The quick brown fox jumps over the lazy dog";

// Convert the given message to a Uint8Array.
var data = new TextEncoder("utf-8").encode(msg);

// Compute a 256-bit digest.
crypto.subtle.digest("SHA-256", data).then(function (digest) {
  console.log(digest);
});

// Output:
// Uint8Array [ 215, 168, 251, 179, 7, 215, 128, 148, 105, 202, 22 more… ]
// (hex = "")
{% endcodeblock %}

As you can see, the WebCrypto API operates on ArrayBuffers, it takes and returns them.
Expensive operations are all async, so implementors can move crypto off the main thread.
Its methods are defined on "window.crypto.subtle".

## var randomBytes = window.crypto.getRandomValues(new Uint8Array(16));

There is a single method not
defined on subtle, it's window.crypto.getRandomValues(), a cryptographically
secure pseudo-random number generator. All of these APIs are available to
Workers as well.

## window.crypto.subtle

As a small anecdote, the WebCrypto spec states that the name "subtle" was
chosen to reflect the fact that many of these algorithms have subtle usage
requirements in order to provide the required algorithmic security guarantees.
I don't know...
If they really wanted to be on the safe side here they could have chosen...

## window.crypto.IKnowWhatIAmDoing.IAcceptTheTermsAndConditions.digest(...)

...but maybe it's a good thing I don't write specs. Anyway now that we know how
to compute SHA-2 hashes, let's use that for our storage example.

{% codeblock lang:js %}
  computeDigest: function (notes) {
    // Convert |notes| to an array of bytes.
    var bytes = new TextDecoder("utf-8").decode(JSON.stringify(notes));

    // Compute the SHA-256 digest for the given data.
    return crypto.subtle.digest("SHA-256", notes);
  },

  save: function (notes) {
    return this.computeDigest(notes).then(function (digest) {
      return Promise.all([
        localforage.setItem("notes", notes),
        localforage.setItem("notes_hash", digest)
      ]);
    });
  }
{% endcodeblock %}

Let's start with the save() method because that's where we have to compute
the digest to store that as well. We first have to convert the given |notes|
to an ArrayBuffer, an array of bytes, because that's what the WebCrypto API
takes and then simply call the digest() method. The promise it returns will
resolve to an ArrayBuffer containing the bytes of the digest. Once we have
data and digest ready to save to disk we're done.

{% codeblock lang:js %}
  compareDigests: function (a, b) {
    a = new Uint8Array(a);
    b = new Uint8Array(b);
    return Array.every(a, (x, i) => x == b[i]);
  },

  load: function () {
    var loadValues = Promise.all([
      localforage.getItem("notes"),
      localforage.getItem("notes_hash")
    ]);

    loadValues.then(function ([notes, notes_hash]) {
      return this.computeDigest(notes).then(function (digest) {
        if (this.compareDigests(notes_hash, digest)) {
          return notes;
        }

        // Integrity check failed.
        localforage.clear();
        return [];
      });
    });
  }
{% endcodeblock %}

When loading data from disk we will first read our notes and the hash we
stored. We compute the digest again and compare it to the digest we stored on
disk. If there are any mismatches we will assume the data is corrupt, wipe the
storage and return an empty list of notes.

This is pretty great, we can now detect *accidental* corruption. But what about
deliberate changes? What keeps someone from changing the data and computing a
digest exactly as we do? Nothing. Alice could trick us into thinking that we owe
her $500. It would be great to somehow combine a secret with a hash function so
that we can prevent deliberate changes...

## Integrity & Authenticity

What we're currently missing is authenticity, i.e. we want our data to be of
undisputed origin or authorship.
