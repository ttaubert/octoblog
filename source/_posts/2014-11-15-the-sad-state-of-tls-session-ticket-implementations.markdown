---
layout: post
title: "The sad state of server-side TLS Session Resumption implementations"
date: 2014-11-17 18:00
---

The probably oldest complaint about TLS is that its handshake is slow and
together with the transport encryption has a lot of CPU overhead. This
certainly [is not true anymore](https://istlsfastyet.com/) if configured
correctly (even if [some companies](http://techblog.netflix.com/2014/10/message-security-layer-modern-take-on.html)
still do not want to hear that).

One of the most important features to provide a great user experience for
visitors accessing your site via TLS is session resumption.
[Session resumption](https://en.wikipedia.org/wiki/Transport_Layer_Security#Resumed_TLS_handshake)
is the general idea of avoiding a full TLS handshake by storing the secret
information of previous sessions and reusing those when connecting to a host
the next time.

Enabling session resumption in web servers and proxies can however easily
compromise (Perfect) Forward Secrecy. To understand how this can happen and how
to avoid it let us take a closer look at PFS, and the current implementation of
session resumption features.

## What is (Perfect) Forward Secrecy?

[(Perfect) Forward Secrecy](https://en.wikipedia.org/wiki/Perfect_forward_secrecy)
is an important part of modern TLS setups. The core of it is to use ephemeral
(short-lived) keys for key exchange so that an attacker gaining access to a
server cannot use any of the keys found there to decrypt past TLS sessions they
may have recorded.

We must not use the server's RSA key pair whose public key is contained in the
certificate for key exchanges if we want PFS. This key pair is long-lived and
will most likely outlive certificate expiration dates as you would just use the
same key pair to generate a new certificate after the current expired. In case
the server is compromised it would be far too easy to determine the location of
the private key on disk or in memory and use it to decrypt past TLS sessions.

Using [Diffie-Hellman](https://en.wikipedia.org/wiki/Diffie%E2%80%93Hellman_key_exchange)
key exchanges where key generation is *a lot* cheaper we can use a key pair
exactly once and discard it afterwards. An attacker with access to the server
can still compromise the authentication part as shown above and {M,W}ITM
everything from here on using the certificate's private key but past TLS
session are inaccessible.

## How can Session Resumption compromise PFS?

TLS provides two session resumption features: Session IDs and Session Tickets.
To better understand how those can be attacked it is worth to look at them in
more detail.

### Session IDs

In a full handshake the server sends a *Session ID* as part of the "hello"
message. On a subsequent connection the client can use this session ID and
pass it to the server when connecting. Because both the server and the client
have saved the last session's "secret state" under the session ID they can
simply resume the TLS session where they left off.

To support session resumption via session IDs the server must obviously maintain
a cache that maps past session IDs to the sessions' secret states. The cache
itself is the main weak spot, stealing the cache contents allows to decrypt all
sessions whose session IDs are contained in it.

The forward secrecy of a connection is thus bounded by how long the session
information is retained on the server. Ideally, your server would use a
medium-sized cache that is purged daily. Purging your cache might however not
help if the cache itself lives on a persistent storage as it might be feasible
to restore deleted data from it. An in-memory storage should be more resistant
to these kind of attacks if turns over about once a day.

### Session Tickets

The second mechanism to resume a TLS session are
[Session Tickets](http://tools.ietf.org/html/rfc5077). This extension transmits
the server's secret state to the client, encrypted with a key only known to the
server. That ticket key is protecting the TLS connection now and in the future
and is the weak spot an attacker will target.

We ideally want the same secrecy bounds for Session Tickets as for Session IDs.
To achieve this we want to ensure that the key used to encrypt the tickets is
rotated about daily. It should just as the session cache not live on a
persistent storage to prevent leaving any traces.

Now that we determined how session resumption features should be configured we
should take a look at a popular web servers and proxies to see how and whether
that is supported.

## Configuring the Apache HTTP Server

httpd.apache.org/docs/trunk/mod/mod_ssl.html#sslsessionticketkeyfile

### Disabling Session Tickets for Apache

SSLOpenSSLConfCmd Options -SessionTicket

## Configuring Nginx

nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_session_ticket_key
http://forum.nginx.org/read.php?2,229538,230872#msg-230872
might be fixable due config reload

### Disabling Session Tickets for Nginx

ssl_session_tickets off

only versions greater than 1.4?

## Configuring HAproxy

https://github.com/blog/1734-improving-our-ssl-setup

### Disabling Session Tickets for HAproxy

## multiple web servers / sharing keys

https://blog.twitter.com/2013/forward-secrecy-at-twitter
https://www.imperialviolet.org/2013/06/27/botchingpfs.html

## The way forward
