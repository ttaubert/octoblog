---
layout: post
title: "The sad state of server-side TLS Session Resumption implementations"
date: 2014-11-17 18:00
---

The probably oldest complaint about TLS is that its handshake is slow and
together with the transport encryption has a lot of CPU overhead. This
certainly [is not true anymore](https://istlsfastyet.com/) if configured
correctly.

One of the most important features to improve user experience for visitors
accessing your site via TLS is session resumption.
[Session resumption](http://vincent.bernat.im/en/blog/2011-ssl-session-reuse-rfc5077.html)
is the general idea of avoiding a full TLS handshake by storing the secret
information of previous sessions and reusing those when connecting to a host
the next time. This drastically reduces latency and CPU usage.

Enabling session resumption in web servers and proxies can however easily
[compromise forward secrecy](https://media.blackhat.com/us-13/US-13-Daigniere-TLS-Secrets-WP.pdf).
To find out why having a de-factor standard TLS library (i.e. OpenSSL) can be a
bad thing and how to avoid
[botching PFS](https://www.imperialviolet.org/2013/06/27/botchingpfs.html)
let us take a closer look at forward secrecy, and the current state of
server-side implementation of session resumption features.

## What is (Perfect) Forward Secrecy?

[(Perfect) Forward Secrecy](https://en.wikipedia.org/wiki/Perfect_forward_secrecy)
is an important part of modern TLS setups. The core of it is to use ephemeral
(short-lived) keys for key exchange so that an attacker gaining access to a
server cannot use any of the keys found there to decrypt past TLS sessions they
may have recorded previously.

We must not use a server's RSA key pair, whose public key is contained in the
certificate, for key exchanges if we want PFS. This key pair is long-lived and
will most likely outlive certificate expiration dates as you would just use the
same key pair to generate a new certificate after the current expired. In case
the server is compromised it would be far too easy to determine the location of
the private key on disk or in memory and use it to decrypt recorded TLS
sessions from the past.

Using [Diffie-Hellman](https://en.wikipedia.org/wiki/Diffie%E2%80%93Hellman_key_exchange)
key exchanges where key generation is *a lot* cheaper we can use a key pair
exactly once and discard it afterwards. An attacker with access to the server
can still compromise the authentication part as shown above and MITM
everything from here on using the certificate's private key, but past TLS
sessions stay protected.

## How can Session Resumption botch PFS?

TLS provides two session resumption features: Session IDs and Session Tickets.
To better understand how those can be attacked it is worth looking at them in
more detail.

### Session IDs

In a full handshake the server sends a *Session ID* as part of the "hello"
message. On a subsequent connection the client can use this session ID and
pass it to the server when connecting. Because both server and client have
saved the last session's "secret state" under the session ID they can simply
resume the TLS session where they left off.

To support session resumption via session IDs the server must maintain a cache
that maps past session IDs to those sessions' secret states. The cache itself
is the main weak spot, stealing the cache contents allows to decrypt all
sessions whose session IDs are contained in it.

The forward secrecy of a connection is thus bounded by how long the session
information is retained on the server. Ideally, your server would use a
medium-sized cache that is purged daily. Purging your cache might however not
help if the cache itself lives on a persistent storage as it might be feasible
to restore deleted data from it. An in-memory storage should be more resistant
to these kind of attacks if it turns over about once a day and ensures old data
is overridden properly.

### Session Tickets

The second mechanism to resume a TLS session are
[Session Tickets](http://tools.ietf.org/html/rfc5077). This extension transmits
the server's secret state to the client, encrypted with a key only known to the
server. That ticket key is protecting the TLS connection now and in the future
and is the weak spot an attacker will target.

The client will store its secret information for a TLS session along with the
ticket received from the server. By transmitting that ticket back to the server
at the beginning of the next TLS connection both parties can resume their
previous session, given that the server can still access the secret key that
was used to encrypt.

We ideally want the same secrecy bounds for Session Tickets as for Session IDs.
To achieve this we need to ensure that the key used to encrypt tickets is
rotated about daily. It should just as the session cache not live on a
persistent storage to not leave any trace.

## Apache configuration

Now that we determined how we ideally want session resumption features to be
configured we should take a look at a popular web servers and load balancers to
see whether that is supported, starting with Apache.

### Configuring the Session Cache

The Apache HTTP Server offers the
[SSLSessionCache directive](http://httpd.apache.org/docs/trunk/mod/mod_ssl.html#sslsessioncache)
to configure the cache that contains the session IDs of previous TLS sessions
along with their secret state. You should use `shmcb` as the storage type, that is
a high-performance cyclic buffer inside a shared memory segment in RAM. It will
be shared between all threads or processes and allow session resumption no
matter which of those handles the visitor's request.

{% codeblock lang:text %}
SSLSessionCache shmcb:/path/to/ssl_gcache_data(512000)
{% endcodeblock %}

The example shown above establishes an in-memory cache via the path
`/path/to/ssl_gcache_data` with a size of 512 KiB. Depending on
the amount of daily visitors the cache size might be too small (i.e. have a
high turnover rate) or too big (i.e. have a low turnover rate).

We ideally want a cache that turns over daily and there is no really good way
to determine the right session cache size. What we really need is a way to tell
Apache the maximum time an entry is allowed to stay in the cache before it gets
overridden. This must happen regardless of whether the cyclic buffer has
actually cycled around yet and must be a periodic background job to ensure the
cache is purged even when there have not been any requests in a while.

> You might wonder whether the `SSLSessionCacheTimeout` directive can be of any
> help here - unfortunately no. The timeout is only checked when a session ID
> is given at the start of a TLS connection. It does not cause entries to be
> purged from the session cache.

### Configuring Session Tickets

While Apache offers the
[SSLSessionTicketKeyFile directive](http://httpd.apache.org/docs/trunk/mod/mod_ssl.html#sslsessionticketkeyfile)
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
though and nothing ensures the old key is properly overridden.

Changing the key file while Apache is running does not do it either, you would
still need to gracefully restart the service to apply the new key. An do not
forget that if you use a key file it should be stored on a temporary file
system like `tmpfs`.

### Disabling Session Tickets

Although disabling session tickets will undoubtedly have a negative performance
impact, for the moment being you will need to do that in order to provide
forward secrecy:

{% codeblock lang:text %}
SSLOpenSSLConfCmd Options -SessionTicket
{% endcodeblock %}

> [Ivan Ristic adds](https://www.reddit.com/r/netsec/comments/2mkupe/the_sad_state_of_serverside_tls_session/)
> that to disable session tickets for Apache using `SSLOpenSSLConfCmd`, you have
> to be running OpenSSL 1.0.2 which has not been released yet. If you want to
> disable session tickets with earlier OpenSSL versions, Ivan
> [has a few patches](https://github.com/ivanr/bulletproof-tls/tree/master/apache)
> for the Apache 2.2.x and Apache 2.4.x branches.

To securely support session resumption via tickets Apache should provide a
configuration directive to specify the maximum lifetime for session ticket
keys, at least if auto-generated on startup. That would allow us to simply
generate a new random key and override the old one daily.

## Nginx configuration

Another very popular web server is Nginx. Let us see how that compares to
Apache when it comes to setting up session resumption.

### Configuring the Session Cache

Nginx offers the [ssl_session_cache directive](http://nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_session_cache)
to configure the TLS session cache. The type of the cache should be `shared` to
share it between multiple workers:

{% codeblock lang:text %}
ssl_session_cache shared:SSL:10m;
{% endcodeblock %}

The above line establishes an in-memory cache with a size of 10 MB. We again
have no real idea whether 10 MB is the right size for the cache to turn over
daily. Just as Apache, Nginx should provide a configuration directive to allow
cache entries to be purged automatically after a certain time. Any entries not
purged properly could simply be read from memory by an attacker with full
access to the server.

> You guessed right, the `ssl_session_timeout` directive again only applies
> when trying to resume a session at the beginning of a connection. Stale
> entries will not be removed automatically after they time out.

### Configuring Session Tickets

Nginx allows to specify a session ticket file using the
[ssl_session_ticket_key directive](http://nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_session_ticket_key),
and again you are probably better off by not specifying one and having the
service generate a random key on startup. The session ticket key will never be
rotated and might be used to encrypt session tickets for months, if not years.

Nginx, too, provides no way to automatically rotate keys. Reloading its
configuration daily using a cron job [might work](http://forum.nginx.org/read.php?2,229538,230872#msg-230872)
but does not come close to a real solution either.

### Disabling Session Tickets

The best you can do to provide forward secrecy to visitors is thus again switch
off session ticket support until a proper solution is available.

{% codeblock lang:text %}
ssl_session_tickets off;
{% endcodeblock %}

## HAproxy configuration

HAproxy, a popular load balancer, suffers from basically the same problems as
Apache and Nginx. All of them rely on OpenSSL's TLS implementation.

### Configuring the Session Cache

The size of the session cache can be set using the
[tune.ssl.cachesize directive](http://cbonte.github.io/haproxy-dconv/configuration-1.5.html#3.2-tune.ssl.cachesize)
that accepts a number of "blocks". The HAproxy documentation tries to be helpful
and explain how many blocks would be needed per stored session but we again
cannot ensure an at least daily turnover. We would need a directive to
automatically purge entries just as for Apache and Nginx.

> And yes, the `tune.ssl.lifetime` directive does not affect how long entries
> are persisted in the cache.

### Configuring Session Tickets

HAproxy does not allow configuring session ticket parameters. It implicitly
supports this feature because OpenSSL enables it by default. HAproxy will thus
always generate a session ticket key on startup and use it to encrypt tickets
for the whole lifetime of the process.

A graceful daily restart of HAproxy *might* be the only way to trigger key
rotation. This is a *pure assumption* though, please do your own testing before
using that in production.

### Disabling Session Tickets

You can disable session ticket support in HAproxy using the
[no-tls-tickets directive](http://cbonte.github.io/haproxy-dconv/configuration-1.5.html#no-tls-tickets):

{% codeblock lang:text %}
ssl-default-bind-options no-sslv3 no-tls-tickets
{% endcodeblock %}

> A previous version of the post said it would be impossible to deactivate
> session tickets. Thanks to the HAproxy team for correcting me!

## Session Resumption with multiple servers

If you have multiple web servers that act as front-ends for a fleet of back-end
servers you will unfortunately not get away with not specifying a session ticket
key file and a dirty hack that reloads the service configuration at midnight.

Sharing a session cache between multiple machines using memcached is possible
but using session tickets you "only" have to share one or more session ticket
keys, not the whole cache. Clients would take care of storing and discarding
tickets for you.

[Twitter wrote a great post](https://blog.twitter.com/2013/forward-secrecy-at-twitter)
about how they manage multiple web front-ends and distribute session ticket
keys securely to each of their machines. I suggest reading that if you are
planning to have a similar setup and support session tickets to improve
response times.

Keep in mind though that Twitter had to write their own web server to handle
forward secrecy in combination with session tickets properly and this might not
be something you want to do yourselves.

It would be great if either OpenSSL or all of the popular web servers and load
balancers would start working towards helping to provide forward secrecy by
default and server admins could get rid of custom front-ends or dirty hacks
to rotate keys.
