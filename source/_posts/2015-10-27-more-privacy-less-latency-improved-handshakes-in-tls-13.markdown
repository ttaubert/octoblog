---
layout: post
title: "More Privacy, Less Latency - Improved Handshakes in TLS version 1.3"
date: 2015-11-16 16:00:00 +0100
---

> *Up to this writing, TLS v1.3 (draft-11) has not been finalized and the
> proposals presented here might change. I will do my best to update this post
> timely.*

*TLS must be [fast](https://istlsfastyet.com/).* Adoption will greatly benefit
from speeding up the initial handshake that authenticates and secures the
connection. You want to get the protocol out of the way and start delivering
data to visitors as soon as possible. This is crucial if we want the web to
succeed at [deprecating non-secure HTTP](https://blog.mozilla.org/security/2015/04/30/deprecating-non-secure-http/).

Let's start by looking at full handshakes as standardized in
[TLS v1.2](https://tools.ietf.org/html/rfc5246), and then continue to
abbreviated handshakes that decrease connection times for resumed sessions.
Once we understand the current protocol we can proceed to proposals made in
the latest [TLS v1.3 draft](https://tlswg.github.io/tls13-spec/) to achieve
full 1-RTT and even 0-RTT handshakes.

It helps if you already have a rough idea of how TLS and Diffie-Hellman work
as I can't go into every detail. The focus of this post is on comparing current
and future handshakes and I might omit a few technicalities to get basic ideas
across more easily.

## Full TLS 1.2 Handshake (static RSA)

Static RSA is a straightforward key exchange method, available since
[SSLv2](https://tools.ietf.org/html/draft-hickman-netscape-ssl-00). After
sharing basic protocol information via the `ClientHello` and `ServerHello`
messages the server sends its certificate to the client. `ServerHelloDone`
signals that for now there will be no further messages until the client
responds.

{% img /images/tls-hs-static-rsa.png 600 Full TLS v1.2 Handshake with Static RSA Key Exchange (2-RTT) %}

The client then encrypts the so-called premaster secret with the server's
public key found in the certificate and wraps it in a `ClientKeyExchange`
message. `ChangeCipherSpec` signals that from now on messages will be encrypted.
`Finished`, the first message to be encrypted and the client's last message of
the handshake, contains a MAC of all handshake messages exchanged thus far to
prove that both parties saw the same messages, without interference from a MITM.

The server decrypts the premaster secret found in the `ClientKeyExchange`
message using its certificate's private key, and derives the master secret and
communication keys. It then too signals a switch to encrypted communication
and completes the handshake. *It takes two round-trips to establish a
connection.*

**Authentication:** With static RSA key exchanges, the connection is
authenticated by the simple fact that the premaster secret is encrypted with
the server certificate's public key. Only the server in possession of the
private key can decrypt, correctly derive the master secret, and send an
encrypted `Finished` message with the right MAC.

The simplicity of static RSA has a serious drawback: it does not offer
[forward secrecy](https://en.wikipedia.org/wiki/Forward_secrecy). If a passive
adversary records all traffic to a specific server then every recorded TLS
session can be broken later by obtaining the certificate's private key.

*This key exchange method will be [removed in TLS v1.3](https://tlswg.github.io/tls13-spec/#major-differences-from-tls-12).*

## Full TLS 1.2 Handshake (ephemeral DH)

A full handshake using (Elliptic Curve)
[Diffie-Hellman](https://en.wikipedia.org/wiki/Diffie-Hellman_key_exchange) to
exchange ephemeral keys is very similar to the flow of static RSA. The main
difference is that after sending the certificate the server will also send a
`ServerKeyExchange` message. This message contains either the parameters of a
DH group or of an elliptic curve, paired with an ephemeral public key computed
by the server.

{% img /images/tls-hs-ecdhe.png 600 Full TLS v1.2 Handshake with Ephemeral Diffie-Hellman Key Exchange (2-RTT) %}

The client too computes an ephemeral public key compatible with the given
parameters and sends it to the server. Knowing their private keys and the other
party's public key both sides should now share the same premaster secret and
can derive a shared master secret.

**Authentication:** With (EC)DH key exchanges it's still the certificate that
is signed by a CA and then hopefully trusted by the client. To authenticate the
connection the server will sign the parameters contained in `ServerKeyExchange`
with the certificate's private key. The client verifies the signature with the
certificate's public key and only then proceeds with the handshake.

## Abbreviated Handshakes in TLS 1.2

Already [SSLv2](https://tools.ietf.org/html/draft-hickman-netscape-ssl-00)
stated session identifiers as a way to resume previously established TLS/SSL
sessions. [Session resumption](https://blog.cloudflare.com/tls-session-resumption-full-speed-and-secure/)
is important because a full handshake can be quite expensive: it has a high
latency as it needs two round-trips and involves rather expensive computations
that can affect the machine load and take some time to complete.

**[Session IDs](https://tools.ietf.org/html/rfc5246#appendix-F.1.4)**, assigned
by the server, are unique identifiers under which both parties store the master
secret and other details of the connection they established. The client may
include this ID in the `ClientHello` message of the next handshake to
short-circuit the negotiation and reuse previous connection parameters.

{% img /images/tls-hs-session-ids.png 600 Abbreviated Handshake with Session IDs (1-RTT) %}

If the server is willing and able to resume the session it responds with a
`ServerHello` message including the Session ID given by the client. This
handshake is effectively 1-RTT as the client can send application data
immediately after the `Finished` message.

Sites with lots of visitors will have to manage and secure big session caches,
or risk pushing out saved sessions too quickly. A setup involving multiple
load-balanced servers will need to securely synchronize session caches across
machines. The forward secrecy of a connection is bounded by how long session
information is retained on servers.

**[Session tickets](http://tools.ietf.org/html/rfc5077)**, created by the server
and stored by the client, are blobs containing all necessary information about
a connection, encrypted by a key only known to the server. If the client
presents this tickets with the `ClientHello` message and can prove that it
knows the master secret stored in the ticket then the session will be resumed.

{% img /images/tls-hs-session-tickets.png 600 Abbreviated Handshake with Session Tickets (1-RTT) %}

If the server is willing and able to decrypt the given ticket it responds with
a `ServerHello` message including an empty Session Ticket extension, otherwise
the extension would be omitted completely. As with session IDs, the client will
start sending application data immediately after the `Finished` message to
achieve 1-RTT.

To not affect the forward secrecy provided by (EC)DHE suites session ticket
keys should be rotated periodically, otherwise stealing the ticket key would
allow recovering recorded sessions later. In a setup with multiple load-balanced
servers the main challenge here is to securely generate, rotate, and
synchronize keys across machines.

**Authentication:** Both session resumption mechanisms retain the client's and
server's authentication states as established in the session's initial handshake.
Neither the server nor the client have to send and verify certificates a second
time, and thus can reduce connection times significantly, especially when
dealing with RSA certificates.

## Full Handshakes in TLS 1.3

The first good news about handshakes in TLS v1.3 is that static RSA key
exchanges are no longer supported. Great! That means we can start with full
handshakes using forward-secure Diffie-Hellman.

Another important change is the removal of the `ChangeCipherSpec` protocol
(yes, it's actually a protocol, not a message). With TLS v1.3 every message
sent after `ServerHello` is encrypted with the so-called
[ephemeral secret](https://tlswg.github.io/tls13-spec/#key-schedule) to lock
out passive adversaries very early in the game. `EncryptedExtensions` carries
Hello extension data that must be encrypted because it's not needed to set up
secure communication.

{% img /images/tls13-hs-ecdhe.png 600 Full TLS v1.3 Handshake with Ephemeral Diffie-Hellman Key Exchange (1-RTT) %}

The probably most important change with regard to 1-RTT is the removal of the
`ServerKeyExchange` and `ClientKeyExchange` messages. The DH parameters and
public keys are now sent in special *KeyShare* extensions, a new type of
extension to be included in the `ServerHello` and `ClientHello` messages.
Moving this data into Hello extensions keeps the handshake compatible with TLS
v1.2 as it doesn't change the order of messages.

The client sends a list of *KeyShare* values, a value consisting of a named
(EC)DH group and an ephemeral public key. If the server accepts it must respond
with one of the proposed groups and its own public key. If the server does not
support any of the given key shares the client may try again with a different
configuration or abort.

**Authentication:** The Diffie-Hellman parameters itself aren't signed anymore,
authentication will be a tad more explicit in TLS v1.3. The server sends a
`CertificateVerify` message that contains a MAC of all handshake message
exchanged so far, signed with the certificate's private key. The client then
simply verifies the signature with the certificate's public key.

## Session Resumption in TLS 1.3 (PSK)

Session resumption via identifiers and tickets is obsolete in TLS v1.3.
Both methods are replaced by a [pre-shared key (PSK) mode](https://tlswg.github.io/tls13-spec/#rfc.section.6.2.3).
A PSK is established on a previous connection after the handshake is completed,
and can then be presented by the client on the next visit.

{% img /images/tls13-hs-resumption.png 600 Session Resumption / PSK Mode in TLS v1.3 (1-RTT) %}

The client sends one or more *PSK identities* as opaque blobs of data. They can
be database lookup keys (similar to Session IDs), or self-encrypted and
self-authenticated values (similar to Session Tickets). If the server accepts
one of the given PSK identities it replies with the one it selected. The
*KeyShare* extension is sent to allow servers to ignore PSKs and fall back to
a full handshake.

Forward secrecy can be maintained by limiting the lifetime of PSK identities
sensibly. Clients and servers may also choose an (EC)DHE cipher suite for PSK
handshakes to provide forward secrecy for every connection, not just the whole
session.

**Authentication:** As in TLS v1.2, the client's and server's authentication
states are retained and both parties don't need to exchange and verify
certificates again. A regular PSK handshake initiating a new session, instead
of resuming, omits certificates completely.

Session resumption still allows significantly faster handshakes when using RSA
certificates and can prevent user-facing client authentication dialogs on
subsequent connections. However, the fact that it requires a single round-trip
just like a full handshake might make it less appealing, especially if you
have an ECDSA or EdDSA certificate and do not require client authentication.

## Zero-RTT Handshakes in TLS 1.3

TLS v1.3 enables full 1-RTT handshakes when connecting to a server the very
first time. But can we do even better?

The current draft of the specification contains a proposal to let clients
encrypt application data and include it in their first flights. On a previous
connection, after the handshake completes, the server would send a
`ServerConfiguration` message that the client can use for
[0-RTT handshakes](https://tlswg.github.io/tls13-spec/#zero-rtt-exchange)
on subsequent connections. The configuration includes the configuration
identifier, the server's semi-static (EC)DH parameters, an expiration date,
and other data.

{% img /images/tls13-hs-zero-rtt.png 600 TLS v1.3 0-RTT Handshake %}

With the very first TLS record the client sends its `ClientHello` and, changing
the order of messages, directly appends application data (e.g. `GET / HTTP/1.1`).
Everything after the `ClientHello` will be encrypted with the
[static secret](https://tlswg.github.io/tls13-spec/#key-schedule), derived from
the client's ephemeral *KeyShare* and the semi-static DH parameters given in
the server's configuration.

The server, if able and willing to decrypt, responds with its default set of
messages and immediately appends the contents of the requested resource. *That's
the same round-trip time as for an unencrypted HTTP request.* All communication
following the `ServerHello` will again be encrypted with the ephemeral secret,
derived from the client's *and* server's ephemeral key shares. After exchanging
`Finished` messages traffic will be encrypted with keys derived from the master
secret.

### Security of 0-RTT Handshakes

At first glance, 0-RTT mode seems similar to session resumption or PSK, and you
might wonder why one wouldn't merge these mechanisms. The differences however
are subtle but important, and the security properties of 0-RTT handshakes are
weaker than those for other kinds of TLS data:

**1.** To protect against replay attacks the server must incorporate a *server
random* into the master secret. That is unfortunately not possible before the
first round-trip and so the poor server can't easily tell whether it's a valid
request or an attacker replaying a recorded conversation. Replay protection
will be in place again after the `ServerHello` message is sent.

**2.** The semi-static DH share given in the server configuration, used to
derive the static secret and encrypt first flight data, defies forward secrecy.
We need at least one round-trip to establish the ephemeral secret. As
configurations are shared between clients, and recovering the server's DH share
becomes more attractive, expiration dates should be limited sensibly. The
maximum allowed validity is 7 days.

**3.** If the server's DH share is compromised a MITM can tamper with the
0-RTT data sent by the client, without being detected. This does not extend to
the full session as the client can retrospectively authenticate the server via
the remaining handshake messages.

### Defending against Replay Attacks

Thwarting replay attacks without input from the server is fundamentally very
expensive. It's important to understand that this is a generic problem, not an
issue with TLS in particular, so unfortunately one can't just borrow another
protocol's 0-RTT model and put that into TLS.

It is possible to have servers keep a list of every *ClientRandom* they have
received in a given time window. Upon receiving a `ClientHello` the server
checks its list and rejects replays if necessary. This list must be globally
and temporally consistent as there are
[possible attack vectors](https://www.ietf.org/mail-archive/web/tls/current/msg15594.html)
due to TLS' reliable delivery guarantee if an attacker can force a server to
lose its state, as well as with multiple servers in loosely-synchronized data
centers.

Maintaing a consistent global state is possible, but only in some limited
circumstances, namely for very sophisticated operators or situations where
there is a single server with good state management. We will need something
better.

### Removing Anti-Replay Guarantee

A possible solution might be a TLS stack API to let applications designate
certain data as replay-safe, for example `GET / HTTP/1.1` assuming that GET
requests against a given resource are idempotent.

{% codeblock lang:js %}
let c = new TLSConnection(...);
c.setReplayable0RTTData("GET /....");
c.connect();
{% endcodeblock %}

Applications can, before opening the connection, specify replayable 0-RTT data
to send on the first flight. If the server ignores the given 0-RTT data, the
TLS stack automatically replays it after the first round-trip.

### Removing Reliable Delivery Guarantee

Another way of achieving the same outcome would be a TLS stack API that
again lets applications designate certain data as replay-safe, but does *not
automatically* replay if the server ignores it. The application can decide to
do this manually if necessary.

{% codeblock lang:js %}
let c = new TLSConnection(...);
c.setUnreliable0RTTData("GET /....");
c.connect();

if (c.delivered0RTTData()) {
  // Things are cool.
} else {
  // Try to figure out whether to replay or not.
}
{% endcodeblock %}

Both of these APIs are early proposals and the final version of the
specification might look very different from what we can see above. Though, as
0-RTT handshakes are a charter goal, the working group will very likely find a
way to make them work.

## Conclusion (TODO)

TLS v1.3 will bring major improvements to handshakes. All information that's
not needed to set up a secure channel will be encrypted as early as possible
and make TLS handshakes a lot more private. Clients will need only a single
round-trip to establish a secure and authenticated connection to server they
never spoke to before.

Static RSA mode will no longer be available to enable forward secrecy by
default. The two session resumption standards are merged into a single PSK mode
which will allow to streamline implementations.

The proposed 0-RTT mode is promising, for custom application communication
based on TLS but also for browsers, where a `GET /` request to your favorite
news page (given most of them would support HTTPS) will deliver content
blazingly fast as if no TLS was involved.

Securing 0-RTT is still in draft. There will likely be changes and proposed
APIs. Future looks interesting.
