---
layout: post
title: "Full Handshakes in TLS 1.3 with a Single Round-Trip"
date: 2015-10-28 18:00:00 +0100
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

A full handshake using static RSA is the simplest key exchange we can have in
TLS. After sharing some basic protocol information via the *ClientHello* and
*ServerHello* messages the server sends its certificate in the *Certificate*
message to the client. The *ServerHelloDone* message signals that for now there
will be no further messages sent by the server, it waits for a client response.

{% img /images/tls-hs-static-rsa.png 500 Full Handshake with Static RSA Key Exchange %}

The client then encrypts the so-called premaster secret (a uniform key that will
be used to derive the master secret, which in turns is used to derive communication
keys) with the server's public key as found in the certificate and sends it with the *ClientKeyExchange* message. *ChangeCipherSpec*
signals that from now on messages will be encrypted and so is *Finished*, the
last message containing a MAC of all handshake message to prove to the server
that the client saw the same messages.

The server decrypts the *ClientKeyExchange* message using its certificate's
private key and derives the master secret, and communication keys. It then
switches to encrypted communication and lets the client check the value of its
MAC in the *Finished* message. It takes two round-trips to establish a
connection.

The simplicity of static RSA has a serious drawback: it does not offer [forward secrecy](https://en.wikipedia.org/wiki/Forward_secrecy).
If a passive adversary collects all traffic from visitors to a specific server
then every recorded TLS session can be broken later by stealing the certificates
private key. This key exchange method was thus removed in TLS 1.3.

### Ephemeral Diffie-Hellman Key Exchange

handles DHE and ECDHE
diagram with messages

{% img /images/tls-hs-ecdhe.png 500 Full Handshake with Ephemeral Diffie-Hellman Key Exchange %}

## Abbreviated Handshakes

Already [SSLv2](https://tools.ietf.org/html/draft-hickman-netscape-ssl-00)
stated session identifiers as a way to resume previously established TLS/SSL
sessions. [Session resumption](https://blog.cloudflare.com/tls-session-resumption-full-speed-and-secure/)
is important because a full handshake can be quite expensive: it has a high
latency as it needs two round-trips and involves complex computations that
can affect the server load.

### Resumption with Session IDs

[Session IDs](https://tools.ietf.org/html/rfc5246#appendix-F.1.4), assigned by
the server, are unique identifiers under which both parties store the master
secret and other details of the connection they established. The client may
include this ID in the *ClientHello* message of the next handshake to
short-circuit the negotiation and reuse previous connection parameters.

{% img /images/tls-hs-session-ids.png 500 Abbreviated Handshake with Session IDs %}

If the server is willing and able to resume the session it responds with a
*ServerHello* message including the Session ID given by the client. This
handshake is effectively 1-RTT as the client can send application data
immediately after its *Finished* message.

The downside is that servers with lots of visitors will have to manage big
session caches. A setup involving multiple load-balanced servers will need to
securely synchronize session caches across machines.

### Resumption with Session Tickets

[Session tickets](http://tools.ietf.org/html/rfc5077), created by the server
and stored by the client, are blobs containing all necessary information about
a connection, encrypted by a key only known to the server. If the client
presents this tickets with the *ClientHello* message and can prove that it
knows the master secret stored in the ticket then the session will be resumed.

{% img /images/tls-hs-session-tickets.png 500 Abbreviated Handshake with Session Tickets %}

If the server is willing and able to decrypt the given ticket it responds with
a *ServerHello* message including an empty Session Ticket extension, otherwise
the Session Ticket extension would be omitted completely. As noted above, the
client will start sending application data immediately after the *Finished*
message to achieve 1-RTT.

Using abbreviated handshakes we can establish a secure connection with a single
round-trip and very light computation. Unfortunately this requires that we
rather recently connected to the server before, as session caches usually don't
store data for long. Good server setups will rotate session ticket keys
regularly so even tickets might be invalid on the next visit.

## Full Handshakes in TLS 1.3

backwards compat due to use of hello extensions

### Static RSA Key Exchange

don't exist anymore \o/ no forward secrecy
