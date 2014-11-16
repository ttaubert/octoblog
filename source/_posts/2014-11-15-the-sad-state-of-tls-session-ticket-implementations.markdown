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
compromise forward secrecy. To understand how this can happen and how to avoid
it let us take a closer look at forward secrecy, and the current implementation
of session resumption features.

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

## Apache configuration

Now that we determined how session resumption features should be configured we
should take a look at a popular web servers and proxies to see how and whether
that is supported. We start with Apache.

### Configuring Session IDs

The Apache HTTP Server offers the
[SSLSessionCache directive](httpd.apache.org/docs/trunk/mod/mod_ssl.html#sslsessioncache)
to configure the cache that contains the session IDs of previous TLS sessions
along with their secret state. You should use `shmcb` as the storage type, that is
a high-performance cyclic buffer inside a shared memory segment in RAM.

{% codeblock lang:text %}
SSLSessionCache shmcb:/usr/local/apache/logs/ssl_gcache_data(512000)
{% endcodeblock %}

The example shown above establishes an in-memory cache via the path
`/usr/local/apache/logs/ssl_gcache_data` with a size of 512 KiB. Depending on
the amount of daily visitors the cache size might be too small (i.e. a high
turnover rate) or too big (i.e. a low turnover rate).

We ideally want a cache that turns over daily and there is no really good way
to determine the right session cache size. What we really need is a way to tell
Apache the maximum time an entry is allowed to stay in the cache before it gets
overriden. This must happen regardless of whether the cyclic buffer has actually
cycled around or not and must be a periodic background job to ensure the cache
is purged even when there have not been any requests in a while.

> You might wonder whether the `SSLSessionCacheTimeout` directive can be of any
> help here - unfortunately no. The timeout is only checked when a session ID
> is given at the start of a TLS connection. It does not cause entries to be
> purged from the session cache.

### Configuring Session Tickets

While Apache offers the
[SSLSessionTicketKeyFile directive](httpd.apache.org/docs/trunk/mod/mod_ssl.html#sslsessionticketkeyfile)
to specify a key file that should contain 48 random bytes, it is recommended to
not specify one at all. Apache will simply generate a random key on startup and
use that to encrypt session tickets for as long as it is running.

The good thing about this is that the session ticket key will not touch
persistent storage, the bad thing is that it will never be rotated. Generated
once on startup it is only discarded when Apache restarts. For most of the
servers out there that means they use the same key for months, if not years.

To provide forward secrecy we need to rotate the session ticket key about daily
and current Apache versions provide no way of doing that. The only way to
achieve that might be use a cron job to
[gracefully restart Apache daily](http://mail-archives.apache.org/mod_mbox/httpd-dev/201309.mbox/%3C522339E0.2040005@opensslfoundation.com%3E)
to ensure a new key is generated. That does not sound like a real solution
though.

Changing the key file while Apache is running does not do it either, you would
still need to gracefully restart the service to apply the new key. An do not
forget that if you use a key file it should be stored on a temporary file
system like `tmpfs`.

### Disabling Session Tickets

Although disabling session tickets will undoubtly have a negative performance
impact, for the moment being you will need to do that in order to provide
forward secrecy. The following line will do:

{% codeblock lang:text %}
SSLOpenSSLConfCmd Options -SessionTicket
{% endcodeblock %}

To securely support session resumption via tickets Apache should provide a
configuration directive to specify the maximum lifetime for session ticket
keys, at least if auto-generated on startup. That would allow us to simply
generate a new random key and override the old one daily.

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
