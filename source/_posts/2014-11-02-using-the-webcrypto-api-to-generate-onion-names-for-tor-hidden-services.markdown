---
layout: post
title: "Using the WebCrypto API to generate .onion names for Tor hidden services"
date: 2014-11-02 16:00
---

You have probably read that
[Facebook unveiled its hidden service](https://www.facebook.com/notes/protect-the-graph/making-connections-to-facebook-more-secure/1526085754298237)
that lets users access their website more safely via Tor. While there are lots
of opinions about whether this is good or bad I think that
the Tor project described best [why that is not as crazy as it seems](https://blog.torproject.org/blog/facebook-hidden-services-and-https-certs).

The most interesting part to me however is that
[Facebook brute-forced a custom hidden service address](https://lists.torproject.org/pipermail/tor-talk/2014-October/035412.html)
as it never occurred to me that this is something you might want to do. Again
ignoring the pros and cons of doing that, investigating the *how* seems like a
fun exercise to get more familiar with the
[WebCrypto API](http://dvcs.w3.org/hg/webcrypto-api/raw-file/tip/spec/Overview.html)
if that is still unknown territory to you.

## How are .onion names created?

[Names for Tor hidden services](https://trac.torproject.org/projects/tor/wiki/doc/HiddenServiceNames)
are meant to be self-authenticating. When creating a hidden service Tor
generates a new 1024 bit [RSA](https://en.wikipedia.org/wiki/RSA_%28cryptosystem%29)
key pair and then computes the [SHA-1](https://en.wikipedia.org/wiki/SHA-1)
digest of the public key. The .onion name will be the
[Base32](http://en.wikipedia.org/wiki/Base32)-encoded first half of that digest.

By using a hash of the public key as the URL to contact a hidden service you
can easily authenticate it and bypass the existing CA structure. This 80 bit
URL is sufficient to prevent collisions, even with
a [birthday attack](http://en.wikipedia.org/wiki/Birthday_attack) (and thus an
entropy of 40 bit) you can only find a *random* collision but not the key pair
matching a specific .onion name.

## Creating custom .onion names

So how did Facebook manage to come up with a public key resulting in
`facebookcorewwwi.onion`? The answer is that they were incredibly lucky.

You can brute-force .onion names matching a specific pattern using tools like
[Shallot](https://github.com/katmagic/Shallot) or
[Scallion](https://github.com/lachesis/scallion). Those will generate key pairs
until they find one resulting in a matching URL. That is usably fast for 1-5
characters. Finding a 6-character pattern takes on average 30 minutes and for
just 7 characters you might need to let it run for a full day.

Coming up with an .onion name *starting with* an 8-character pattern like
`facebook` would thus take even longer or need a lot more resources. As a
[Facebook engineer confirmed](https://lists.torproject.org/pipermail/tor-talk/2014-October/035413.html)
they indeed got extremely lucky: they generated a few keys matching the pattern,
picked the best and then just needed to come up with an explanation for the
`corewwwi` part to let users memorize it better.

Without taking a closer look at "Shallot" or "Scallion" let us go with a naive
approach. We do not *need* to create another tool to find .onion names in the
browser (the existing ones work great) but it is a good opportunity to again
show what you can do with the WebCrypto API in the browser.

## Generating a random .onion name

To generate a random name for a Tor hidden service we first need to generate
a new 1024 bit RSA key just as Tor would do:

{% codeblock lang:js %}
function generateRSAKey() {
  var alg = {
    // This could be any supported RSA* algorithm.
    name: "RSASSA-PKCS1-v1_5",
    // We won't actually use the hash function.
    hash: {name: "SHA-1"},
    // Tor hidden services use 1024 bit keys.
    modulusLength: 1024,
    // We will use a fixed public exponent for now.
    publicExponent: new Uint8Array([0x03])
  };

  return crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
}
{% endcodeblock %}

*generateKey()* returns a Promise that resolves to the new key pair. The second
argument specifies that we want the key to be exportable as we need to do that
in order to check for pattern matches. We will not actually use the key to
*sign* or *verify* data but we need specify valid usages for the public and
private keys.

To check whether a generated public key matches a specific pattern we of course
have to compute the hash for the .onion URL:

{% codeblock lang:js %}
function computeOnionHash(publicKey) {
  // Export the DER encoding of the SubjectPublicKeyInfo structure.
  var promise = crypto.subtle.exportKey("spki", publicKey);

  promise = promise.then(function (spki) {
    // Compute the SHA-1 digest of the SPKI.
    // Skip 22 bytes (the SPKI header) that are ignored by Tor.
    return crypto.subtle.digest({name: "SHA-1"}, spki.slice(22));
  });

  return promise.then(function (digest) {
    // Base32-encode the first half of the digest.
    return base32(digest.slice(0, 10));
  });
}
{% endcodeblock %}

We first use *exportKey()* to get an [SPKI](https://tools.ietf.org/html/rfc5280)
representation of the public key, use *digest()* to compute the SHA-1 digest
of that, and finally pass it to *base32()* to Base32-encode the first half of
that digest.

> Note: *base32()* is an [RFC 3548](https://tools.ietf.org/html/rfc3548)
> compliant Base32 implementation. [chrisumbel/thirty-two](https://github.com/chrisumbel/thirty-two)
> is a good one that unfortunately does not support ArrayBuffers, I will use a
> slightly adapted version of it in the example code.

## Finding a specific .onion name

The only thing missing now is a function that checks for pattern matches and
loops until we found one:

{% codeblock lang:js %}
function findOnionName(pattern) {
  var key;

  // Start by generating a random key pair.
  var promise = generateRSAKey().then(function (pair) {
    key = pair.privateKey;

    // Generate the .onion hash of the public key.
    return computeOnionHash(pair.publicKey);
  });

  return promise.then(function (hash) {
    // Try again if the pattern doesn't match.
    if (!pattern.test(hash)) {
      return findOnionName(pattern);
    }

    // Key matches! Export and format it.
    return formatKey(key).then(function (formatted) {
      return {key: formatted, hash: hash};
    });
  });
}
{% endcodeblock %}

We simply use *generateRSAKey()* and *computeOnionHash()* as defined before.
In case of a pattern match we export the
[PKCS8](http://tools.ietf.org/html/rfc5208) private key information, encode it
as [Base64](https://en.wikipedia.org/wiki/Base64) and format it nicely:

{% codeblock lang:js %}
function formatKey(key) {
  // Export the DER-encoded ASN.1 private key information.
  var promise = crypto.subtle.exportKey("pkcs8", key);

  return promise.then(function (pkcs8) {
    var encoded = base64(pkcs8);

    // Wrap lines after 64 characters.
    var formatted = encoded.match(/.{1,64}/g).join("\n");

    // Wrap the formatted key in a header and footer.
    return "-----BEGIN PRIVATE KEY-----\n" + formatted +
           "\n-----END PRIVATE KEY-----";
  });
}
{% endcodeblock %}

> Note: *base64()* refers to an existing Base64 implementation that can deal with
> ArrayBuffers. [niklasvh/base64-arraybuffer](https://github.com/niklasvh/base64-arraybuffer)
> is a good one that I will use in the example code.

What is logged to the console can be directly used to replace any random key
that Tor has assigned before. Here is how you would use the code we just wrote:

{% codeblock lang:js %}
findOnionName(/ab/).then(function (result) {
  console.log(result.hash + ".onion", result.key);
}, function (err) {
  console.log("An error occurred, please reload the page.");
});
{% endcodeblock %}

The Promise returned by *findOnionName()* will not resolve until a match was
found. When generating lots of keys Firefox currently sometimes fails with a
"transient error" that needs to be investigated. If you want a loop that runs
despite that error you could simply restart the search in the error handler.

{% img /images/onion-console.png Screenshot of the Web Console showing a found .onion name with its key %}

## The code

[https://gist.github.com/ttaubert/389255d724f219f76900](https://gist.github.com/ttaubert/389255d724f219f76900)

Include it in a minimal web site and have the Web Console open. It will run in
Firefox 33+ and Chrome 37+ with the WebCrypto API explicitly enabled (if
necessary).

## The pitfalls

As said before, the approach shown above is quite naive and thus very slow. The
easiest optimization to implement might be to spawn multiple web workers and
let them search in parallel.

We could also speed up finding keys by not regenerating the whole RSA key every
loop iteration but instead increasing the public exponent by 2 (starting from 3)
until we find a match and then check whether that produces a valid key pair.
If it does not we can just continue.

Lastly, the current implementation does not perform any safety checks that Tor
might run on the generated key. All of these points would be great reasons for
a follow-up post.

> **Important**: You should use the keys generated with this code to run a
> hidden service only if you trust the host that serves it. Getting your keys
> off of someone else's web server is a terrible idea. Do not be *that* guy or gal.
