---
layout: post
title: "TLS version intolerance"
subtitle: "Working around bugs in legacy TLS stacks"
date: 2016-09-30 16:00:00 +0200
---

A few weeks ago I listened to Hanno Böck talk about
[TLS version intolerance](https://www.int21.de/slides/berlinsec-versionintolerance/)
at the Berlin AppSec & Crypto Meetup. With TLS 1.3 just around the corner there
again are growing concerns about faulty TLS stacks found in HTTP servers, load
balancers, routers, firewalls, and similar software and devices.

This post will explain version intolerance, how version fallbacks work and why
they're insecure, as well as describe the downgrade protection mechanisms
available in TLS 1.2 and 1.3. It will end with a look at the future of version
negotiation in TLS and a proposal that aims to prevent similar problems in the
future.

## What is version intolerance?

Every time a new TLS version is specified, browsers usually are the fastet to
implement and update their deployments. Most major browsers vendors have a few
people involved in the standardization process to guide the standard and give
early feedback about implementation issues.

As soon as the spec is finished, and often far before that feat is done, clients
will have been equipped with support for the new TLS protocol version and happily
announce this to any server they connect to:

> **Client:** Hi! The highest TLS version I support is 1.2.  
> **Server:** Hi! I too support TLS 1.2 so let's use that to communicate.  
> *[TLS 1.2 connection will be established.]*

In this case the highest TLS version supported by the client is 1.2, and so
the server picks it because it supports that as well. Let's see what happens
if the client supports 1.2 but the server does not:

> **Client:** Hi! The highest TLS version I support is 1.2.  
> **Server:** Hi! I only support TLS 1.1 so let's use that to communicate.  
> *[TLS 1.1 connection will be established.]*

This too is how it should work if a client tries to connect with a protocol
version unknown to the server. Should the client insist on any specific version
and not agree with the one picked by the server it will have to terminate the
connection.

Unfortunately, there are a few servers and more devices out there that
implement TLS version negotiation incorrectly. The conversation might go
like this:

> **Client:** Hi! The highest TLS version I support is 1.2.  
> **Server:** ALERT! I don't know that version. Handshake failure.  
> *[Connection will be terminated.]*

Or:

> **Client:** Hi! The highest TLS version I support is 1.2.  
> **Server:** TCP FIN! I don't know that version.  
> *[Connection will be terminated.]*

Or even worse:

> **Client:** Hi! The highest TLS version I support is 1.2.  
> **Server:** (I don't know this version so let's just not respond.)  
> *[Connection will hang.]*

The same can happen with the infamous F5 load balancer that can't handle
`ClientHello` messages with a length between 256 and 512 bytes. Other devices
abort the connection when receiving a large `ClientHello` split into multiple
TLS records. TLS 1.3 will likely cause more problems of this kind due to more
extensions with client key shares.

## What are version fallbacks?

As browsers usually want to ship new TLS versions as soon as possible, enabled
by default to keep their users safe, more than a decade ago browsers vendors
saw a need to prevent connection failures due to version intolerance. The easy
solution was to decrease the advertised version number by one with every failed
attempt:

> **Client:** Hi! The highest TLS version I support is 1.2.  
> **Server:** ALERT! Handshake failure. (Or FIN. Or hang.)  
> *[TLS version fallback to 1.1.]*  
> **Client:** Hi! The highest TLS version I support is 1.1.  
> **Server:** Hi! I support TLS 1.1 so let's use that to communicate.  
> *[TLS 1.1 connection will be established.]*

A client supporting everything from TLS 1.0 to TLS 1.2 would start trying to
establish a 1.2 connection, then a 1.1 connection, and if even that failed a
1.0 connection.

## Why are these insecure?

What makes these fallbacks insecure is that the connection can be downgraded by
a MITM, by sending alerts or TCP packets to the client, or blocking packets
from the server. To the client this is indistinguishable from a network error.

In the case of a vulnerability in TLS 1.1 that an attacker wants to exploit, she
could trigger the client's version fallback mechanism and thus force a 1.1
connection, even if both parties support 1.2.

The [POODLE](https://www.openssl.org/~bodo/ssl-poodle.pdf) attack is one
example where an attacker abuses the version fallback to force an SSL 3.0
connection. In response to this browsers vendors disabled version fallbacks to
SSL 3.0, and then SSL 3.0 entirely, to prevent even up-to-date clients from
being exploited. Insecure version fallback in browsers pretty much break the
actual version negotiation mechanisms.

Version fallbacks have been disabled since
[Firefox 37](https://bugzilla.mozilla.org/show_bug.cgi?id=1084025) and
[Chrome 50](https://www.chromestatus.com/feature/5685183936200704). Browser
telemetry data showed it was no longer necessary as after years, TLS 1.2 and
correct version negotiation was deployed widely enough.

## The TLS_FALLBACK_SCSV cipher suite

You might wonder if there's a *secure* way to do version fallbacks, and other
people did so too. Adam Langley and Bodo Möller proposed a special cipher suite
in [RFC 7507](https://tools.ietf.org/html/rfc7507) that would help a client
detect whether the downgrade was initiated by a MITM.

Whenever the client includes `TLS_FALLBACK_SCSV {0x56, 0x00}` in the list of
cipher suites it signals to the server that this is a repeated connection
attempt, but this time with a version lower than the highest it supports,
because previous attempts failed. If the server supports a higher version
than advertised by the client, it MUST abort the connection.

The drawback here however is that a client even if it implements fallback with
a Signaling Cipher Suite Value doesn't know the highest protocol version
supported by the server, and whether it implements a TLS_FALLBACK_SCSV check.
Common web servers will likely be updated faster than others, but router or
load balancer manufacturers might not deem it important enough to implement
and ship updates for.

## Signatures in TLS 1.2

It's been long known to be problematic that signatures in TLS 1.2 don't cover
the list of cipher suites and other messages sent before server authentication.
They sign the ephemeral DH params sent by the server and include the
`*Hello.random` values as nonces to prevent replay attacks:

```text
h = Hash(ClientHello.random + ServerHello.random + ServerParams)
```

Signing at least the list of cipher suites would have helped prevent downgrade
attacks like [FREAK](https://freakattack.com/) and [Logjam](https://weakdh.org/).
TLS 1.3 will sign all messages before server authentication, even though it makes
[Transcript Collision Attacks](http://www.mitls.org/downloads/transcript-collisions.pdf)
somewhat easier to mount. With SHA-1 not allowed for signatures that will
hopefully not become a problem anytime soon.

## Downgrade Sentinels in TLS 1.3

With neither the client version nor its cipher suites (for the SCSV) included
in the hash signed by the server's certificate in TLS 1.2, how do you secure
TLS 1.3 against downgrades like FREAK and Logjam? Stuff a special value into
`ServerHello.random`.

The TLS WG decided to put static values (sometimes called downgrade sentinels)
into the server's nonce sent with the `ServerHello` message. TLS 1.3 servers
responding to a `ClientHello` indicating a maximum supported version of TLS 1.2
MUST set the last eight bytes of the nonce to:

```text
0x44 0x4F 0x57 0x4E 0x47 0x52 0x44 0x01
```

If the client advertises a maximum supported version of TLS 1.1 or below the
server SHOULD set the last eight bytes of the nonce to:

```text
0x44 0x4F 0x57 0x4E 0x47 0x52 0x44 0x00
```

If not connecting with a downgraded version, a client MUST check whether the
server nonce ends with any of the two sentinels and in such a case abort the
connection. The TLS 1.3 spec here introduces an update to TLS 1.2 that requires
servers and clients to update their implementation.

Unfortunately, this downgrade protection relies on a `ServerKeyExchange`
message being sent and is thus of limited value. Static RSA key exchanges
are still valid in TLS 1.2, and unless the server admin disables all
non-forward-secure cipher suites the protection can be bypassed.

## The comeback of insecure fallbacks?

Current measurements show that enabling TLS 1.3 by default would break a
significant fraction of TLS handshakes due to version intolerance. According to
Ivan Ristić, as of July 2016,
[3.2% of servers from the SSL Pulse data set reject TLS 1.3 handshakes](https://blog.qualys.com/ssllabs/2016/08/02/tls-version-intolerance-in-ssl-pulse).

This a very high number and would affect way too many people. Alas, with TLS
1.3 we have only limited downgrade protection for forward-secure cipher
suites. And that is assuming that most servers either support TLS 1.3 or
update their 1.2 implementations. TLS_FALLBACK_SCSV, if supported by the
server, will help as long as there are no attacks tempering with the list
of cipher suites.

The TLS working group has been thinking about how to handle intolerance without
bringing back version fallbacks, and there might be light at the end of the
tunnel.

## Version negotiation with extensions

The next version of the proposed TLS 1.3 spec, draft 16, will introduce a new
version negotiation mechanism based on extensions. The current `ClientHello.version`
field will be frozen to TLS 1.2, i.e. `{3, 3}`, and renamed to `legacy_version`.
Any number greater than that MUST be ignored by servers.

To negotiate a TLS 1.3 connection the protocol now requires the client to send
a `supported_versions` extension. This is a list of versions the client supports,
in preference order, with the most preferred version first. Clients MUST send
this extension as servers are required to negotiate TLS 1.2 if it's not present.
Any to the server unknown version numbers MUST be ignored.

This still leaves potential problems with big `ClientHello` messages or
choking on unknown extensions unaddressed, but according to David Benjamin
[the main problem is `ClientHello.version`](https://www.ietf.org/mail-archive/web/tls/current/msg20679.html).
We will hopefully be able to ship browsers that have TLS 1.3 enabled by default,
without bringing back insecure version fallbacks.

However, it's not unlikely that implementers will screw up even the new version
negotiation mechanism and we'll have similar problems in a few years down the
road.

## GREASE-ing the future

David Benjaming, following Adam Langley's advice to
[*have one joint and keep it well oiled*](https://www.imperialviolet.org/2016/05/16/agility.html),
proposed [GREASE](https://tools.ietf.org/html/draft-davidben-tls-grease-01)
(Generate Random Extensions And Sustain Extensibility), a mechanism to prevent
extensibility failures in the TLS ecosystem.

The heart of the mechanism is to have clients inject "unknown values" into
places where capabilities are advertised by the client, and the best match
selected by the server. Servers MUST ignore unknown values to allow introducing
new capabilities to the ecosystem without breaking interoperability.

These values will be advertised pseudo-randomly to hopefully break misbehaving
servers early in the implementation process. Proposed injection points are
cipher suites, supported groups, extensions, and ALPN identifiers. Should the
server respond with a GREASE value selected in the `ServerHello` message the
client MUST abort the connection.
