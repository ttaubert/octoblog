---
layout: post
title: "Insecure TLS version fallbacks"
subtitle: "Secure and insecure version fallbacks in TLS"
date: 2016-09-29 15:09:04 +0200
---

A few weeks ago I listened to [Hanno](https://twitter.com/hanno) talk about
[TLS version intolerance](https://www.int21.de/slides/berlinsec-versionintolerance/)
at the Berlin AppSec & Crypto Meetup. With TLS 1.3 just around the corner
there again are growing concerns about buggy TLS stacks found in HTTP
servers, load balancers, firewalls, and similar software and devices.

Abolished in Firefox 37, and Chrome 45/50, browsers might have to bring back
insecure version fallbacks for TLS. This post will explain the difference
between a secure and an insecure version fallback, as well as describe new
downgrade protection mechanisms in TLS 1.3. For that to work though we need
servers to upgrade their TLS stacks.

## What is version intolerance?

Every time there is a new TLS version around the corner, browsers are usually
the fastet to implement and update their deployments. All browsers vendors have
a few people involved in the standardization process of the new protocol version
to give early feedback about implementation issues, and to guide the standard
to avoid existing issues that plague their stacks.

As soon as the spec is finished, and often far before that feat is done, clients
will have been equipped with support for the new TLS protocol version and happily
announce this to any server they connect to. This goes somewhat like this:

> **Client:** Hi! The highest TLS version I support is 1.2.  
> **Server:** Hi! I too support TLS 1.2 so let's use that to communicate.  
> *[TLS 1.2 connection will be established.]*

In this case the highest TLS version supported by the client is 1.2, and so
the server picks that because it supports that as well. Let's see how this
would work if the client supports 1.2 but the server does not:

> **Client:** Hi! The highest TLS version I support is 1.2.  
> **Server:** Hi! I only support TLS 1.1 so let's use that to communicate.  
> *[TLS 1.1 connection will be established.]*

This is how it should work if a client tries to connect with a protocol version
unknown to the server. Should the client insist on any specific version and not
agree with the one picked by the server it will have to terminate the connection.

Unfortunately, there are a few servers and lots of devices out there that
implement TLS version negotiation incorrectly. The conversation does might go
like this:

> **Client:** Hi! The highest TLS version I support is 1.2.  
> **Server:** ALERT! Handshake failure.  
> *[Connection will be terminated.]*

Or:

> **Client:** Hi! The highest TLS version I support is 1.2.  
> **Server:** (I don't know this version so let's just not respond.)  
> *[Connection will hang.]*

## What are version fallbacks?

As browsers want to ship new TLS versions in their clients, enabled by default
to make their users safer, there was a need to handle connections failing due
to version intolerance. The solution was to simply decrease the advertised
version number by one with every failed attempt:

> **Client:** Hi! The highest TLS version I support is 1.2.  
> **Server:** ALERT! Handshake failure. (Or hang.)  
> *[TLS Version fallback to 1.1.]*  
> **Client:** Hi! The highest TLS version I support is 1.1.  
> **Server:** Hi! I support TLS 1.1 so let's use that to communicate.  
> *[TLS 1.1 connection will be established.]*

A client supporting everything from TLS 1.0 to TLS 1.2 will start trying to
establish a 1.2 connection, then a 1.1 connection, and if even that fails 1.0.

## Why are these insecure?

An insecure version fallback is exactly what I described in the previous section.
What makes it insecure is that the connection can be downgraded by a MITM,
by sending alerts to the client, or blocking packets from the server.

In the case of a vulnerability in TLS 1.1 that an attacker wants to exploit, she
could trigger the client's version fallback mechanism and thus force a 1.1
connection, even if both parties support 1.2.

The [POODLE](https://www.openssl.org/~bodo/ssl-poodle.pdf) attack is a great
example where an attacker abuses the version fallback to force an SSL 3.0
connection, and then exploit the vulnerability. Insecure version fallback in
browsers pretty much breaks the actual version negotiation mechanisms. In
response to this browsers vendors disabled version fallbacks to SSLv3, and then
SSLv3 entirely, to prevent even up-to-date clients from being exploited.

Insecure version fallbacks have been disabled since
[Firefox 37](https://bugzilla.mozilla.org/show_bug.cgi?id=1084025) and
[Chrome 50](https://www.chromestatus.com/feature/5685183936200704). Browser
telemetry data showed it was no longer necessary as TLS 1.2 and correct version
negotiation for it were ....

## The TLS_FALLBACK_SCSV cipher suite

You might wonder if there's a *secure* way to do version fallbacks, and other
people did so too. Adam Langley and Bodo Möller proposed a special cipher suite
in [RFC 7507](https://tools.ietf.org/html/rfc7507) that would help a client
detect whether the downgrade was initiated by a MITM.

Whenever the client includes `TLS_FALLBACK_SCSV {0x56, 0x00}` in the list of
cipher suites it supports it signals to the server that it's repeatedly trying
to connect, but this time with a version lower than the highest it supports,
because previous attempts failed. If the server supports a higher version than
advertised by the client, it MUST abort the connection.

The drawback here however is that a client even if it implements fallback with
a Signaling Cipher Suite Value doesn't know whether the server does not support
a TLS version higher, or if it does not implement a TLS_FALLBACK_SCSV check.
Servers using OpenSSL will likely be updated faster than others, device
manufacturers might not deem it important enough to implement and ship updates
for.

## Signatures in TLS 1.2

It's been long known to be problematic that signatures in TLS 1.2 don't cover
the list of cipher suites and other messages sent before server authentication.
They basically only sign the ephemeral DH params sent by the server and include
the `*Hello.random` values to prevent replay attacks:

```text
h = Hash(ClientHello.random + ServerHello.random + ServerParams)
```

Signing at least the list of cipher suites would have helped prevent downgrade
attacks like [FREAK](https://freakattack.com/) and [Logjam](https://weakdh.org/).
TLS 1.3 will sign all messages before server authentication, even though it makes
[Transcript Collision Attacks](http://www.mitls.org/downloads/transcript-collisions.pdf)
easier to mount. With SHA-1 not allowed for signatures that will hopefully not
become a problem anytime soon.

## Downgrade Sentinels in TLS 1.3

With neither the client version nor its cipher suites (for the SCSV) included
in the hash signed by the server's certificate in TLS 1.2, how do you secure
TLS 1.3 against downgrades? Stuff it in `ServerHello.random`.

The TLS WG decided to put static values (sometimes called downgrade sentinels)
into the server's nonce sent with the `ServerHello` message. TLS 1.3 servers
responding to a ClientHello indicating a maximum supported version of TLS 1.2
MUST set the last eight bytes of the nonce to:

```text
0x44 0x4F 0x57 0x4E 0x47 0x52 0x44 0x01
```

If the client advertises a maximum supported version of TLS 1.1 or below the
server SHOULD set the last eight bytes of the nonce to:

```text
0x44 0x4F 0x57 0x4E 0x47 0x52 0x44 0x00
```

A client MUST check if the server nonce ends with any of the two sentinels and
in such a case abort the connection. The problem with this downgrade protection
is that the TLS 1.3 spec here introduces an update to TLS 1.2 and requires
servers and clients to update their implementation.

Unfortunately, this downgrade protection relies on a `ServerKeyExchange`
message being sent and is thus of limited value. Static RSA key exchange
is still valid in TLS 1.2, and unless the server admin disables all
non-forward-secure cipher suites, an attacker simply has to pick the
right one.

## Bring back insecure fallback?

In an effort to both secure all and satisfy technical users browsers will want
to enable TLS 1.3 soon by default. On the other hand, if measurements show
this breaks a significant fractions of TLS handshakes they might decide to
bring back the insecure version fallback.

Insecure because even with TLS 1.3 we only have limited downgrade protection
for forward-secure cipher suites. That is assuming that most servers either
support TLS 1.3 or updated their 1.2 implementations, which is quite unlikely.
TLS_FALLBACK_SCSV if supported by the server will help as long as there are no
attacks tempering with the list of cipher suites.

Let me leave you with a warm feeling and a quote from Adam Langley:

> It's taken about 15 years to get to the point where web browsers don't have
> to work around broken version negotiation in TLS and that's mostly because
> we only have three active versions of TLS. When we try to add a fourth
> (TLS 1.3) in the next year, we'll have to add back the workaround, no doubt.  
> https://www.imperialviolet.org/2016/05/16/agility.html
