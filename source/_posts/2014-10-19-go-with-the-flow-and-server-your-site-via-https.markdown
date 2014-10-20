---
layout: post
title: "Go with the flow: How to securely deploy TLS"
date: 2014-10-19 17:07
---

I finally deployed TLS for `timtaubert.de`. I decided to write up what I
learned on the way and hope that it will make the whole process easier for you.
I want to provide some background information on why certain things are a good
idea and so you can make informed decisions when deploying TLS yourselves.

I will assume you have a dedicated server (either root or virtual) that serves
your small company's web page or even just your personal blog. You want to
encrypt traffic between your server and your visitors and you want to ensure
that the content delivered to the visitor is genuine, i.e. your website is
authenticated.

## The certificate

In order to serve your site via TLS the most basic part you need is a
certificate. The TLS protocol can encrypt traffic between two parties just fine
but the certificate provides the necessary authentication towards your visitors.
Without a certificate a visitor could securely talk to either you, the NSA, or
a different attacker but they probably want to talk to you. The certificate
ensures by cryptographic means that they established a connection to *your*
server.

### Selecting a Certificate Authority (CA)

If you want a cheap certificate, have no specific needs, and only a single
subdomain (e.g. www) then StartSSL is an easy option. Do of course feel free
to take a look at different authorities - their services and prices will vary
heavily.

In the chain of trust the CA plays an important role: by verifying that you are
the rightful owner of your domain and signing your certificate it will let
browsers trust your certificate. The browsers do not want to do all this
verification themselves so they defer it to the CAs.

For your certificate you will need an RSA key pair, a public and private key.
The public key will be included in your certificate and thus also signed by the
CA.

### Generating an RSA key and a certificate signing request

The example below shows how you can use OpenSSL on the command line to generate
a key for your domain. Simply replace `example.com` with the domain of your
website. `example.com.key` will be your new RSA key and `example.com.csr` will
be the
[Certificate Signing Request](https://en.wikipedia.org/wiki/Certificate_signing_request)
that StartSSL needs to generate your certificate.

{% codeblock lang:text %}
openssl req -new -newkey rsa:4096 -nodes -sha256 \
  -keyout example.com.key -out example.com.csr
{% endcodeblock %}

We will use a SHA-256 based signature for integrity as
[Firefox and Chrome will phase out support for SHA-1 based certificates soon](https://blog.mozilla.org/security/2014/09/23/phasing-out-certificates-with-sha-1-based-signature-algorithms/).
The RSA keys used to authenticate your website will use a 4096 bit modulus. If
you need to handle a lot of traffic or your server has a weak CPU you might
want to use 2048 bit. Never go below that as keys smaller than 2048 bit are
considered insecure nowadays.

### Let StartSSL sign your public key to generate a certificate

sign up  
verify that you own your domain  
submit the CSR containing your public key  
download the certificate

## (Perfect) Forward Secrecy

To properly deploy TLS you will want
[(Perfect) Forward Secrecy](http://vincent.bernat.im/en/blog/2011-ssl-perfect-forward-secrecy.html).
Without forward secrecy TLS still seems to secure your communication today, it
might however not if your private key is compromised in the future. If a
powerful adversary (think NSA) records all communication between a visitor and
your server, they can decrypt all this traffic years later by stealing your
private key or going the "legal" way to obtain it. This can be prevented by
using short-lived (ephemeral) keys for TLS connections that the server will
throw away after a short period.

### Diffie-Hellman key exchanges

Using RSA with your certificate's private and public keys for key exchanges is
now off the table. We could in theory keep using RSA and generate short-lived
keys for every connection but generating a 2048+ bit prime is very expensive.
We thus need switch to ephemeral (Elliptic Curve) Diffie-Hellman cipher suites.
For DH you can generate parameters once, choosing a private key afterwards is
cheap.

{% codeblock lang:text %}
openssl dhparam -out dhparam.pem 2048
{% endcodeblock %}

Simply upload `dhparam.pem` to your server and instruct the web server to use
those parameters for Diffie-Hellman key exchanges. When using ECDH the
predefined elliptic curve represents those parameters and we thus do not need
to generate any.

### Session Tickets

One of the most important mechanisms to improve TLS performance is
[Session Resumption](http://tools.ietf.org/html/rfc5077).
Instead of a full handshake a client can just send a "ticket" from its last
TLS session to the server when connecting. The session ticket contains the
state of the last session (including the negotiated master secret) and is
encrypted with a secret key only known to the server.

Now you might notice that this might violate Forward Secrecy as a compromised
secret key would reveal all communication for a session. It is thus important
that your web server supports session tickets protected by an ephemeral key.
If the web server generates this private key only once when the daemon starts
(like Apache does) it would use the same key for months. To properly support
forward secrecy you thus need to either disable session tickets or ensure that
key rotation happens often.

> Note: A web server using multiple workers needs to provide a shared session
> ticket cache to enable resuming a TLS session that was started on a different
> worker. When using multiple physical web servers you might want to deploy
> memcached to support resuming a TLS session that was started on a different
> physical machine.

## Choosing algorithms

[Mozilla's guide on server side TLS](https://wiki.mozilla.org/Security/Server_Side_TLS#Modern_compatibility)
provides a great list of modern cipher suites that needs to be put in your web
server's configuration. The combinations below are unfortunately supported by
only modern browser, for broader client support you might want to consider
using the "intermediate" list.

{% codeblock lang:text %}
ECDHE-RSA-AES128-GCM-SHA256: \
ECDHE-ECDSA-AES128-GCM-SHA256: \
ECDHE-RSA-AES256-GCM-SHA384: \
ECDHE-ECDSA-AES256-GCM-SHA384: \
DHE-RSA-AES128-GCM-SHA256: \
DHE-DSS-AES128-GCM-SHA256: \
[...]
!aNULL:!eNULL:!EXPORT:!DES:!RC4:!3DES:!MD5:!PSK
{% endcodeblock %}

All these cipher suites start with (EC)DHE wich means they only support
ephemeral Diffie-Hellman key exchanges for forward secrecy. The last line
discards non-authenticated DH key exchanges, null-encryption (cleartext),
legacy weak ciphers marked exportable by US law, weak ciphers (3)DES and RC4,
weak MD5 signatures, and lastly pre-shared keys.

> Note: To ensure that the order of cipher suites is respected you need to set
> `ssl_prefer_server_ciphers on` for Nginx or `SSLHonorCipherOrder on` for
> Apache.

## HTTP Strict Transport Security (HSTS)

Now that your server is configured to accept TLS connections you still want to
support HTTP connections on port 80 to redirect old links and folks typing
`example.com` in the URL bar to your shiny new HTTPS site.

At this point however a [Man-In-The-Middle](https://en.wikipedia.org/wiki/Man-in-the-middle_attack)
(or Woman-In-The-Middle) attack can easily intercept and modify traffic to
deliver a forged HTTP version of your site to a visitor. The poor visitor might
never know because they did not realize you offer TLS connections now.

To ensure your users are secured when visiting your site the next time you
want to send a HSTS header to enforce
[strict transport security](https://tools.ietf.org/html/rfc6797).
By sending this header the browser will not try to establish a HTTP connection
next time but directly connect to your website via TLS.

{% codeblock lang:text %}
(Nginx)
add_header Strict-Transport-Security \
  'max-age=15768000; includeSubDomains; preload';

(Apache)
Header set Strict-Transport-Security \
  "max-age=15768000; includeSubDomains; preload"
{% endcodeblock %}

Sending these headers over a HTTPS connection (they will be ignored via HTTP)
lets the browser remember that this domain wants strict transport security for
the next six months (~15768000 seconds). The `includeSubDomains` directive
enforces TLS connections for every subdomain of your domain and the
non-standard `preload` token will be required for the next section.

## HSTS Preload List

If after deploying TLS the very first connection of a visitor is a genuine one
we are fine. Your server will send the HSTS header over TLS and the visitor's
browser remembers to use TLS in the future. The very first connection and every
connection after the HSTS header expires however are still vulnerable to a
{M,W}ITM attack.

To prevent this Firefox and Chrome share a
[HSTS Preload List](https://chromium.googlesource.com/chromium/src/net/+/master/http/transport_security_state_static.json)
that basically includes HSTS headers for all pages that would send that header
when visiting anyway. So before connecting to a host Firefox and Chrome check
whether that domain is in the list and if so would not even try using an
insecure HTTP connection.

Including your page in that list is easy, just submit your domain using the
[HSTS Preload List submission form](http://hstspreload.appspot.com/). Your
HSTS header must be set up correctly and contain the `includeSubDomains` and
`preload` tokens to be accepted.

## OCSP Stapling

why?
how? stapled certs
not the root cert

## HTTP Public Key Pinning (HPKP)

why?
only your cert not any in the chain
backup cert
two pins

## more resources

disable sslv3  
tls, gzip compression  
mozilla wiki pages
