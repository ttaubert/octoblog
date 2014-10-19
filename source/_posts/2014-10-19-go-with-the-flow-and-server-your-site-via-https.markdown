---
layout: post
title: "Go with the flow: Serve your site via TLS"
date: 2014-10-19 17:07
---

This weekend I finally took some time to finally cross something off my todo
list that has been there for quite a while: serve my blog via HTTPS. It wasn't
straightforward (not that I expected that) and I hit a frew road blocks. I had
to read multiple blog posts and wiki pages that told me mostly how but not why
to do things. Someone not acquainted with how TLS works might be left puzzled
and inscecure. In this post I will try to convey what you need to know to
securely convert your site to HTTPS and give some background information so
that you can hopefully make some informed decisions.

## Abstract

Assume you have a dedicated server (either root or virtual) that serves your
small company's web page or even just your personal blog. You want to encrypt
traffic between your server and your visitors and you want to ensure that the
content delivered to the visitor is genuine, i.e. your website is authenticated.

## The certificate

In order to serve your site via TLS the most basic part you need is a
certificate. The TLS protocol can encrypt traffic between two parties even
without a certificate but the certificate provides the necessary authentication
towards your visitors. Without a certificate a visitor could securely talk to
either you, the NSA, or a different attacker but they probably want to talk to
you. The certificate ensures by cryptographic means that they established a
connection to your server.

### Selecting a Certificate Authority

If you want a cheap certificate, have no specific needs, and only a single
subdomain (e.g. www) then StartSSL is an easy option. Do of course feel free
to take a look at different CAs.

You need an authority because that will establish a chain of trust: browsers
trust CAs, CAs trust you, and so in the end the browser will trust your
certificate.

### Generating an RSA key and a certificate signing request

The example below shows how you can use OpenSSL on the command line to generate
a secret key for your domain. Simply replace `example.com` with the domain of
your website. The certificate will expire after 365 days as StartSSL's free
tier does not support longer lifetimes. Yes, this means having to generate a
new certificate every year.

{% codeblock lang:text %}
openssl req -new -newkey rsa:4096 -days 365 -nodes -sha256 \
  -keyout example.com.key -out example.com.csr
{% endcodeblock %}

We will use a SHA-256 based signature to ensure integrity.
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
your server, it can decrypt all this traffic years later by stealing your
private key or going the "legal" way to obtain it. This can be prevented by
using short-lived (ephemeral) keys for TLS connections that the server will
throw away after a short period.

### Choosing cipher suites

Using RSA with your certificate's private and public keys for key exchanges is
now off the table. We could in theory keep using RSA and generate short-lived
keys for every connection but generating a 2048+ bit prime takes way too long.
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
If the web server generates those once when the daemon starts then it would
use the same key for months. To properly support forward secrecy you need to
either disable session tickets or ensure that key rotation happens often.

Apache does currently not seem to support session tickets that would not
violate forward secrecy. The only option would be to manually rotate the secret
key specified by `SSLCertificateKeyFile`. If no key file is given then `mod_ssl`
generates a secret at startup and would probably use the same key for months.

> Please note that a web server using multiple workers needs to provide a shared
> session ticket cache. When using multiple web servers you might want to deploy
> memcached to support a client resuming a TLS session they started on a
> different physical machine.

## HTTP Strict Transport Security (HSTS)

why?

## HSTS Preload List

why?

## HTTP Public Key Pinning (HPKP)

why?
only your cert not any in the chain
backup cert
two pins

## OCSP

why?
how? stapled certs
not the root cert

## algorithms

no rc4

## more resources
