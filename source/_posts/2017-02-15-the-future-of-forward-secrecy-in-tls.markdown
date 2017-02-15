---
layout: post
title: "The future of session resumption"
subtitle: "Forward-secure PSK key agreement in TLS 1.3"
date: 2017-02-15 16:00:00 +0100
---

A while ago I wrote about the [state of server-side session resumption implementations](/blog/2014/11/the-sad-state-of-server-side-tls-session-resumption-implementations/) in popular web servers using OpenSSL. Neither Apache, nor Nginx or HAproxy purged stale entries from the session cache or rotated session tickets automatically, potentially harming forward secrecy of resumed TLS session.

Enabling session resumption is an important tool for speeding up websites, especially in a pre-HTTP/2 world where a client may have to open lots of concurrent connections to the same host to quickly render a page. Subresource requests would ideally resume the session that for example a `GET / HTTP/1.1` started.

Let's take a look at what has changed in over two years, and whether configuring session resumption securely has gotten any easier. With the TLS 1.3 spec about to be finalized I will show what the future holds, and how these issues were addressed by the WG.

## What did web servers fix?

Nothing, as far as I'm aware. None of the three web servers mentioned above has taken steps to make it easier to properly configure session resumption. But to be fair, OpenSSL didn't add any new APIs or options to help them either.

All popular TLS 1.2 web servers still don't evict cache entries when they expire, keeping them around until a client tries to resume --- for performance or ease of implementation. They generate a session ticket key at startup and will never automatically rotate it so that admins have to manually reload server configs and provide new keys.

## The Caddy web server

I want to seize the chance and positively highlight the [Caddy](https://caddyserver.com/) web server, a relative newcomer with the advantage of not having any historical baggage, that enables and configures HTTPS by default, including [automatically acquiring and renewing certificates](https://caddyserver.com/docs/automatic-https).

Version 0.8.3 introduced [automatic session ticket key rotation](https://github.com/wmark/caddy/commit/29235390dca843cb50a10bc104565cbeef981586), thereby making session tickets mostly forward secure by replacing the key every ~10 hours. Session cache entries though aren't evicted until access just like with the other web servers.

But even for "traditional" web servers all is not lost. The TLS working group has known about the shortcomings of session resumption for a while and addresses those with the next version of TLS.

## 1-RTT handshakes by default

One of the many great things about [handshakes in TLS 1.3](/blog/2015/11/more-privacy-less-latency-improved-handshakes-in-tls-13/) is that most connections should take only a single round-trip to establish. The client sends one or more `KeyShareEntry` values with the `ClientHello`, and the server responds with a single `KeyShareEntry` for a key exchange with ephemeral keys.

If the client sends no or only unsupported groups, the server will send a `HelloRetryRequest` message with a `NamedGroup` selected from the ones supported by the client. The connection will fall back to two round-trips.

That means you're automatically covered if you enable session resumption only to reduce network latency, a normal handshake is as fast as 1-RTT resumption in TLS 1.2. If you're worried about computational overhead from certificate authentication and key exchange, that still might be a good reason to abbreviate handshakes.

## Pre-shared keys in TLS 1.3

Session IDs and session tickets are obsolete since TLS 1.3. They've been replaced by a more generic [PSK mechanism](https://tlswg.github.io/tls13-spec/#rfc.section.2.2) that allows resuming a session with a previously established shared secret key.

Instead of an ID or a ticket, the client will send an opaque blob it received from the server after a successful handshake in a prior session. That blob might either be an ID pointing to an entry in the server's session cache, or a session ticket encrypted with a key known only to the server.

{% codeblock lang:cpp %}
enum { psk_ke(0), psk_dhe_ke(1), (255) } PskKeyExchangeMode;

struct {
   PskKeyExchangeMode ke_modes<1..255>;
} PskKeyExchangeModes;
{% endcodeblock %}

TLS 1.3 defines two PSK key exchange modes, `psk_ke` and `psk_dhe_ke`. The first defines a key exchange using the previously shared key, that derives a new master secret from only the PSK and the `{Client,Server}Hello` nonces. This basically is as (in)secure as session resumption in TLS 1.2 if the server never rotates keys.

The second `psk_dhe_ke` mode however additionally incorporates a key agreed upon using ephemeral Diffie-Hellman, thereby making it forward secure. This is what your web server should always prefer whenever a client signals support for it.

Note that 0-RTT data cannot be protected by the DHE secret, the early traffic secret is established without any input from the server and thus derived from the PSK only.

## Key rotation still considered useful

In the near future, with one of the more popular web servers, you would still generate a session ticket key only once at startup if you don't spend time on a more complex configuration. Even then, TLS 1.3 session resumption can ensure forward secrecy by mixing the shared (EC)DHE secret into the derived master secret, if the client supports it.

In theory, there should be no valid reason for a web client to be able to complete a TLS 1.3 handshake but not support `psk_dhe_ke`, as ephemeral Diffie-Hellman key exchanges are mandatory. An internal application talking TLS between peers would likely be a legitimate case for not supporting DHE.

So even with TLS 1.3 it will make sense to set up proper session ticket key rotation, in case the odd client supports only `psk_ke`. But it makes sense especially for TLS 1.2, it will be around for probably longer than you can imagine.

Alas, I have no good suggestion for securing a session cache other than setting appropriate lifetimes for cache entries. It's up to web servers to properly evict entries as soon as they expire, not when they get purged due to memory pressure or "expire" when a client tries to resume a session.

The best you can do is to either use only session tickets, or reserve just enough memory so that the session cache turns over about daily. That's of course dependent on the number of visitors, and spikes in those numbers would affect the number of resumed sessions as well. A drop in visits on the other hand could affect forward security.
