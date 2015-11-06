---
layout: post
title: "More Privacy, Less Latency - Improved Handshakes in TLS version 1.3"
date: 2015-11-09 18:00:00 +0100
---

> *Up to this writing, TLS v1.3 (draft-10) has not been finalized and the
> proposals presented here might change, as they already did multiple times
> since first versions. I will do my best to update this post timely.*

*TLS must be [fast](https://istlsfastyet.com/).* Adoption will greatly benefit
from speeding up the initial handshake that authenticates and secures the
connection. You want to get the protocol out of your way and start delivering
data to visitors as soon as possible. This is crucial if we want the web to
succeed at [deprecating non-secure HTTP](https://blog.mozilla.org/security/2015/04/30/deprecating-non-secure-http/).

Let's start by looking at the full handshake as standardized in
[TLS v1.2](https://tools.ietf.org/html/rfc5246), and then continue to
abbreviated handshakes that decrease connection times for resumed sessions.
Once we understand the current protocol we can proceed to proposals made in
the latest [TLS v1.3 draft](https://tlswg.github.io/tls13-spec/) to achieve
full 1-RTT and even 0-RTT handshakes.

It helps if you already have a rough idea of how TLS and Diffie-Hellman works
as I can't go into too much detail here. The focus of this post is to compare
current and future handshakes and I might omit a few technicalities to get
basic ideas across more easily.

## Full TLS 1.2 Handshake (static RSA)

Static RSA is a straightforward key exchange method, available since
[SSLv2](https://tools.ietf.org/html/draft-hickman-netscape-ssl-00). After
sharing basic protocol information via the `ClientHello` and `ServerHello`
messages the server sends its certificate to the client. The `ServerHelloDone`
message at the end of the record signals that for now there will be no further
messages until the client responds.

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
session can be broken later by obtaining the certificate's private key. *This
key exchange method will be [removed in TLS v1.3](https://tlswg.github.io/tls13-spec/#major-differences-from-tls-12).*

## Full TLS 1.2 Handshake (ephemeral DH)

A full handshake using ephemeral (Elliptic Curve)
[Diffie-Hellman](https://en.wikipedia.org/wiki/Diffie-Hellman_key_exchange) to
exchange keys is very similar to the flow of static RSA. The main difference is
that after sending the certificate the server will also send a `ServerKeyExchange`
message. This message contains either the parameters of a DH group or of an
elliptic curve, paired with an ephemeral public key computed by the server.

{% img /images/tls-hs-ecdhe.png 600 Full TLS v1.2 Handshake with Ephemeral Diffie-Hellman Key Exchange (2-RTT) %}

The client too computes an ephemeral public key compatible with the given
parameters and sends it to the server. Knowing their private keys and the other
party's public key both sides should now share the same premaster secret and
can derive a shared master secret.

**Authentication:** With (EC)DH key exchanges it's still the certificate that
is signed by a CA and then hopefully trusted by the client. To authenticate the
connection the server will sign the parameters contained in the
`ServerKeyExchange` message with the certificate's private key. The client
verifies the signature with the certificate's public key and only then proceeds
with the handshake.

## Abbreviated Handshakes in TLS 1.2

Already [SSLv2](https://tools.ietf.org/html/draft-hickman-netscape-ssl-00)
stated session identifiers as a way to resume previously established TLS/SSL
sessions. [Session resumption](https://blog.cloudflare.com/tls-session-resumption-full-speed-and-secure/)
is important because a full handshake can be quite expensive: it has a high
latency as it needs two round-trips and involves rather expensive computations
that can affect the machine load.

**[Session IDs](https://tools.ietf.org/html/rfc5246#appendix-F.1.4)**, assigned
by the server, are unique identifiers under which both parties store the master
secret and other details of the connection they established. The client may
include this ID in the `ClientHello` message of the next handshake to
short-circuit the negotiation and reuse previous connection parameters.

{% img /images/tls-hs-session-ids.png 600 Abbreviated Handshake with Session IDs (1-RTT) %}

If the server is willing and able to resume the session it responds with a
`ServerHello` message including the Session ID given by the client. This
handshake is effectively 1-RTT as the client can send application data
immediately after the `Finished` message, in the same TLS record.

The downside is that servers with lots of visitors will have to manage big
session caches, or risk pushing out saved sessions too quickly. A setup
involving multiple load-balanced servers will need to securely synchronize
session caches across machines.

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
time, and thus can reduce connection times significantly, especially when using
RSA certificates.

## Full Handshakes in TLS 1.3

An important change with regard to handshakes in TLS v1.3 is that static RSA
key exchanges are no longer supported. Great! That means we can directly start
by looking at full handshakes using forward-secure Diffie-Hellman.

Another important change is the removal of the `ChangeCipherSpec` protocol
(yes, it's actually a protocol, not a message). With TLS v1.3 every message
sent after `ServerHello` is encrypted with the so-called
[ephemeral secret](https://tlswg.github.io/tls13-spec/#key-schedule). This
locks out passive adversaries very early in the game. `EncryptedExtensions` is
added to carry Hello extension data that can be encrypted because it's not
needed to set up secure communication.

{% img /images/tls13-hs-ecdhe.png 600 Full TLS v1.3 Handshake with Ephemeral Diffie-Hellman Key Exchange (1-RTT) %}

The probably most important change with regard to 1-RTT is the removal of the
`ServerKeyExchange` and `ClientKeyExchange` messages. The DH parameters and
public keys are now sent in special *KeyShare* extensions, a new type of
extension to be included in the `ServerHello` and `ClientHello` messages.
Moving this data into Hello extensions keeps the handshake compatible with TLS
v1.2 clients as it doesn't change the order of messages.

The client sends a list of *KeyShare* values, a value consisting of a named
(EC)DH group and an ephemeral public value. If the server accepts it must
respond with one of the proposed groups and its own public value. If the server
does not support any of the given key shares the client may try again with a
different configuration or abort.

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

{% img /images/tls13-hs-resumption.png 600 Session Resumption in TLS v1.3 (1-RTT) %}

The client sends one or more *PSK identities* as opaque blobs of data. They can
be database lookup keys (similar to Session IDs), or self-encrypted and
self-authenticated values (similar to Session Tickets). If the server accepts
one of the given PSK identities it replies with the one it selected. The
*KeyShare* extension is sent to allow servers to ignore PSKs and fall back to
a full handshake.

Forward secrecy can be maintained by limiting the lifetime of PSK identities
sensibly. Clients may also choose an (EC)DHE cipher suite for PSK handshakes
to provide forward secrecy for every connection, not just the whole session.

**Authentication:** As in TLS v1.2, the client's and server's authentication
states are retained and both parties don't need to exchange and verify
certificates again. A regular PSK handshake initiating a new session omits
certificates completely.

Session resumption still allows significantly faster handshakes when using RSA
certificates and can prevent user-facing client authentication dialogs on
subsequent connections. However, the fact that it requires a single round-trip
just like a full handshake might make it less appealing, especially if you
have an ECDSA certificate and do not require client authentication.

## 0-RTT Handshakes in TLS 1.3

TLS v1.3 will enable 1-RTT handshakes, even when connecting to a server the
very first time. But can we do even better?

The current draft of the spec contains a proposal to let clients encrypt data
on their first flights. After a successful handshake the server would send a
`ServerConfiguration` message that the client can use in the future to skip
handshake negotiation and also allow 0-RTT handshakes. The configuration
includes things as the configuration identifier, the server's semi-static
(EC)DH parameters, and an expiration date.

{% img /images/tls13-hs-zero-rtt.png 600 TLS v1.3 0-RTT Handshake %}

With the very first TLS record, the client can send its Hello, encrypt the rest
of the communication, and send a `GET / HTTP/1.0`. The server, if able and
willing to decrypt, responds with its default set of messages but can
immediately answer with the contents of the requested resource. That handshake
didn't need a single round-trip! (well the client data)

TODO: mention the static secret and the ephemeral secret after the finished message

Now at first, this might seem very similar to session resumption and you might
ask why one wouldn't merge these two mechanisms. The differences however are
subtle but important, and the security properties of 0-RTT handshakes are
weaker than those for other kinds of TLS data:

**1.** When resuming a session in PSK mode the server gets the chance to
incorporate the *server random* into the master secret. The server random is
a random string of bytes meant to protect the server from replay attacks. The
poor server can't tell whether it's a valid request or an attacker replaying
parts of a recorded conversation. Subsequent flights will have the usual Replay protection will be active after the
server's first flight has reached the client and the master secret was updated.

**2.** The semi-static DH share given in the server configuration defies fwd
secrecy. A little bit like with session resumption but configurations will
likely be shared between multiple clients and it makes sense to keep them
valid longer.

**3.** If the server key is compromised, the attacker can tamper with the 0-RTT
data without detection.

The second issue can be addressed by reasonably limiting the lifetimes of
server configurations. If you expire them after a day by default it means that
regular visitors would each day have to do one full 1-RTT handshake before they
could do 0-RTT ones for 24h.

TODO: the client data is protected by the static secret.
TODO: the server data is protected by the ephemeral secret.

---

Defending against replay attacks without the server random is a tad harder. One
option is for the server to keep track of all client key shares and reject any
that it has already seen. That's what [QUIC](https://en.wikipedia.org/wiki/QUIC)
does, the server maintains an anti-replay window and keeps a list of client
nonces, indexed by a server-provided token.

It's important to understand that this is a generic issue, not an
issue with TLS in particular, so it's not like there's some other
0-RTT model we can lift and put into TLS that would solve the problem.

---

There are a number of basic ways to address this issue, but I think
the main plausible[0] ones are:

1. Keep the server state globally consistent and also temporally
   consistent so that replays can always be detected.

2. Remove the TLS anti-replay guarantee for the data sent in the first
   flight and tell applications to only send data there that can
   tolerate being replayed.

3. Remove the TLS reliable delivery guarantee for the data sent in
   the first flight, so that the stack doesn't automatically replay it.

The first of these options (global state) is possible, but only in
some limited circumstances, namely very sophisticated operators and/or
situations where there's really only one server which has good state
management. An example of the latter is WebRTC, where the server can
have a different anti-replay context for each connection.

The other two options clearly require a separate API to handle this
special first-flight data and would require applications to handle it
separately. So, for instance, in option 2, you would have something
like:

    c = new TLSConnection(...)
    c.setReplayable0RTTData("GET /....")
    c.connect();

And in the case of option 3 you would have something like:

    c = new TLSConnection(...)
    c.setUnreliable0RTTData("GET /....")
    c.connect()
    if (c.delivered0RTTData()) {
       // Things are cool
    } else {
       // Try to figure out whether to replay or not
    }
    
So in the former case, the choice of replay is in the TLS
stack's hands but in the latter in the application's hands.

I would expect them to have relatively similar impacts on the wire,
namely applications would self-designate certain data as replay-safe
(e.g., HTTP GETs) and would send it in the first flight and then
either let the stack retransmit (option 2) or retransmit themselves
(option 3). This isn't that odd, since, as AGL observes, browsers
already routinely retry some HTTP requests that appear to fail even for
ordinary TLS (i.e., no HTTP response was received) so in those cases
they have already circumvented the anti-replay guarantees supplied by
TLS, but of course that's different from having TLS give up those
guarantees.

I get the sense from the discussion that people have different takes
on #2 and #3.  Do we really need to decide here?  Can we offer TLS
APIs the choice?  Some might even choose to implement both models and
kick the can even further down the road.  I don't actually see any
problem with that.

(TODO: use present tense, not "will" or "will be", to describe 1.3 changes)
