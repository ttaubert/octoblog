---
layout: post
title: "Full Handshakes in TLS 1.3 with a Single Round-Trip"
date: 2015-10-27 18:00:00 +0100
published: false
---

> *Up to this writing TLS 1.3 has not been finalized and the proposal
> presented here might change, as it already did multiples times since the
> first version of the draft.*

*TLS must be [fast](https://istlsfastyet.com/).* Adoption will greatly benefit
from speeding up the initial handshake that authenticates and secures the
connection. You want to get the protocol out of your way and start delivering
data to visitors as soon as possible. This is crucial if we want the web to
succeed at [deprecating non-secure HTTP](https://blog.mozilla.org/security/2015/04/30/deprecating-non-secure-http/).

Let's start by taking a look at the full handshake as standardized in
[TLS 1.2](https://tools.ietf.org/html/rfc5246), and then continue to
abbreviated handshakes that decrease connection times for resumed sessions.
Once we have a good understanding of the current protocol we can proceed to
the proposal made in the latest [TLS 1.3 draft](https://tlswg.github.io/tls13-spec/)
to achieve full 1-RTT handshakes.

## Full Handshakes in TLS 1.2

Let's take a look at the latest version of TLS. A full handshake is the
negotiation at the beginning of a new HTTPS connection when this is the first
time the user visits a web server.

### Static RSA Key Exchange

diagram with messages

### Ephemeral Diffie-Hellman Key Exchange

handles DHE and ECDHE
diagram with messages

## Abbreviated Handshakes

Already [SSLv2](https://tools.ietf.org/html/draft-hickman-netscape-ssl-00)
stated session identifiers as a way to resume previously established TLS/SSL
sessions. [Session resumption](https://blog.cloudflare.com/tls-session-resumption-full-speed-and-secure/)
is important because a full handshake can be quite expensive: it has a high
latency as it needs two round-trips and involves complex computations that
can affect the server load.

**[Session IDs](https://tools.ietf.org/html/rfc5246#appendix-F.1.4)**, assigned
by the server, are unique identifiers under which both parties store the master
secret and other details of the connection they established. The client may
include this ID in the *ClientHello* message of the next handshake to
short-circuit the negotiation and reuse previous connection parameters.

The downside is that servers with lots of visitors will have to manage big
session caches. A setup involving multiple load-balanced servers will need to
securely synchronize session caches across machines.

**[Session tickets](http://tools.ietf.org/html/rfc5077)**, created by the
server and stored by the client, are blobs containing all necessary information
about a connection, encrypted by a key only known to the server. If the client
presents this tickets with the *ClientHello* message and can prove that it
knows the master secret stored in the ticket then the session will be resumed.

Using abbreviated handshakes we can establish a secure connection with a single
round-trip and very light computation. Unfortunately this requires that we
rather recently connected to the server before, as session caches usually don't
store data for long. Good server setups will rotate session ticket keys
regularly so even tickets might be invalid on the next visit.

## Full Handshakes in TLS 1.3

backwards compat due to use of hello extensions

### Static RSA Key Exchange

don't exist anymore \o/ no forward secrecy
