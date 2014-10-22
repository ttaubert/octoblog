---
layout: post
title: "Deploying TLS the hard way"
date: 2014-10-25 18:00
---

> 1. [How does TLS work?](#tls)
> 2. [The certificate](#the-cert)
> 3. [(Perfect) Forward Secrecy](#pfs)
> 4. [Choosing the right cipher suites](#cipher-suites)
> 5. [HTTP Strict Transport Security](#hsts)
> 6. [HSTS Preload List](#hsts-preload)
> 7. [OCSP Stapling](#ocsp-stapling)
> 8. [HTTP Public Key Pinning](#hpkp)
> 9. [Known attacks](#attacks)

Last weekend I finally deployed TLS for `timtaubert.de`. I decided to write up
what I learned on the way and hope that it will be useful for anyone doing the
same. Instead of only giving you a few buzz words I want to provide background
information on how TLS and certain HTTP extensions work and why you should use
them or configure TLS in a certain way.

One thing that bugged me was that most posts only describe what to do but not
necessarily why to do it. I hope you appreciate me going into a little more
detail to end up with the bigger picture of what TLS currently is, so that you
will be able to make informed decisions when deploying yourselves.

To follow this post you will need some basic cryptography knowledge. Whenever
you do not know or understand a concept you should probably just head over to
Wikipedia and take a few minutes or just do it later and maybe re-read the
whole thing.

## But didn't Andy say this is all shit?

I read [Andy Wingo's blog post](http://wingolog.org/archives/2014/10/17/ffs-ssl)
too and I really liked it. Everything he says in there is true. But what is
also true is that TLS with the few add-ons is all we have nowadays and we
better make the folks working for the NSA earn their money instead of not
trying to encrypt traffic at all.

After you finished reading this page, maybe go back to Andy's post and read it
again. You might have a better understanding of what he is ranting about than
you had before if the details of TLS are still dark matter to you.

## <a name="tls"></a> How does TLS work?

Every TLS connection starts with both parties sharing their supported TLS
versions and cipher suites. As the next step the server sends its
[X.509 certificate](https://en.wikipedia.org/wiki/X.509#Structure_of_a_certificate)
to the browser.

### Checking the server's certificate

The following certificate checks need to be performed:

* Does the certificate contain the server's hostname?
* Was the certificate issued by a CA that is in my list of trusted CAs?
* Does the certificate's signature verify using the CA's public key?
* Has the certificate expired already?
* Was the certificate revoked?

All of these are very obvious crucial checks to ensure authentiticy. To check
a certificate's revokation status the browser will use the
[Online Certificate Status Protocol (OCSP)](https://tools.ietf.org/html/rfc6960)
which I will describe in more detail in a later section.

After the certificate checks are done and the browser ensured it is talking to
the right host both sides need to agree on secret keys they will use to
communicate with each other.

### Key Exchange using RSA

A simple key exchange would be to let the client generate a "master secret"
and encrypt that with the server's public
[RSA](https://en.wikipedia.org/wiki/RSA_%28cryptosystem%29) key given by the
certificate. Both client and server would then use that master secret to derive
symmetric encryption keys that will be used to encrypt/decrypt for this TLS
session. An attacker could however simply record the handshake and session and
steal the server's private key at any time in the future to recover the whole
conversation.

### Key Exchange using (EC)DHE

When using (Elliptic Curve)
[Diffie-Hellman](https://en.wikipedia.org/wiki/Diffie-Hellman_key_exchange) as
the key exchange mechanism both sides have to collaborate to generate master
secret. They both generate DH key pairs (which is *a lot* cheaper than
generating RSA keys) and send their public key to the other party. With the
private key and the other party's public key the shared master secret can be
calculated and then again be used to derive session keys. We can provide
[Forward Secrecy](https://en.wikipedia.org/wiki/Forward_secrecy) when using
ephemeral DH key pairs. See the section below on how to enable it.

### After the handshake

Now that both sides have agreed on session keys the TLS handshake is done and
they can finally start to communicate using symmetric encryption algorithms
like [AES](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard) that are
*much* faster than asymmetric algorithms.

## <a name="the-cert"></a> The certificate

Now that we understand authenticity is an integral part of TLS we know that in
order to serve your site via TLS you first need a certificate. The TLS protocol
can encrypt traffic between two parties just fine but the certificate
provides the necessary authentication towards your visitors.

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

### Get a signed certificate

Sign up with the CA you chose and depending on how the CA handles this process
you probably will have to first verify that you are the rightful owner of the
domain that you claim to be. StartSSL will do that by sending a token to
`postmaster@example.com` (or similar) and then ask you to confirm the receipt
of that token.

Now that you are signed up and are the verified owner of `example.com` you
simply submit the `example.com.csr` file to request the generation of a
certificate for your domain. The CA will sign your public key and the other
information contained in the CSR with their private key and you can finally
download the certificate to `example.com.crt`.

You can now simply upload the .crt and .key files to your webserver. Be aware
that any intermediate certificate in the CA's chain must be included in the
.crt file as well - you can just `cat` them together. StartSSL's free tier
has an intermediate Class 1 certificate - make sure to include
[the SHA-256 version](http://www.startssl.com/certs/class1/sha2/pem/sub.class1.server.sha2.ca.pem)
of it. Make sure the files are owned by root and can't be read by anyone else.
Configure your webserver to use those and you should probably have TLS running
configured out-of-the-box.

## <a name="pfs"></a> (Perfect) Forward Secrecy

To properly deploy TLS you will want to provide
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
off the table. We could in theory keep using RSA and generate short-lived keys
for every connection but generating a 2048+ bit prime is very expensive. We
thus need switch to ephemeral (Elliptic Curve) Diffie-Hellman cipher suites.
For DH you can generate parameters once, choosing a private key afterwards is
cheap.

{% codeblock lang:text %}
openssl dhparam -out dhparam.pem 2048
{% endcodeblock %}

Simply upload `dhparam.pem` to your server and instruct the web server to use
those parameters for Diffie-Hellman key exchanges. When using ECDH the
predefined elliptic curve represents those parameters and we thus do not need
to generate any.

{% codeblock lang:text %}
(Nginx)
ssl_dhparam /path/to/ssl/dhparam.pem;
{% endcodeblock %}

Apache does unfortunately not support custom DH parameters, it is always set to
1024 bit and is not user configurable. This might hopefully be fixed in future
versions.

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

## <a name="cipher-suites"></a> Choosing the right cipher suites

[Mozilla's guide on server side TLS](https://wiki.mozilla.org/Security/Server_Side_TLS#Modern_compatibility)
provides a great list of modern cipher suites that needs to be put in your web
server's configuration. The combinations below are unfortunately supported by
only modern browser, for broader client support you might want to consider
using the "intermediate" list.

{% codeblock lang:text %}
ECDHE-RSA-AES128-GCM-SHA256:   \
ECDHE-ECDSA-AES128-GCM-SHA256: \
ECDHE-RSA-AES256-GCM-SHA384:   \
ECDHE-ECDSA-AES256-GCM-SHA384: \
DHE-RSA-AES128-GCM-SHA256:     \
DHE-DSS-AES128-GCM-SHA256:     \
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

## <a name="hsts"></a> HTTP Strict Transport Security (HSTS)

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
Strict-Transport-Security:
  max-age=15768000; includeSubDomains; preload
{% endcodeblock %}

Sending these headers over a HTTPS connection (they will be ignored via HTTP)
lets the browser remember that this domain wants strict transport security for
the next six months (~15768000 seconds). The `includeSubDomains` directive
enforces TLS connections for every subdomain of your domain and the
non-standard `preload` token will be required for the next section.

## <a name="hsts-preload"></a> HSTS Preload List

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

## <a name="ocsp-stapling"></a> OCSP Stapling

OCSP - using an external server provided by the CA to check whether the
certificate given by the server was revoked - might sound like a great idea at
first. On the second thought it actually sounds rather terrible. First, the CA
providing the OCSP server suddenly has to be able to handle a lot of requests:
every client opening a connection to your server will want to know whether
your certificate was revoked before talking to you.

Second, the browser contacting a CA and passing the certificate is an easy way
to monitor a user's browsing behavior. If all CAs worked together they probably
could come up with a nice data set of TLS sites that people visit, when and in
what order (not that I know of any plans they actually wanted to do that).

### Let the server do the work for your visitors

[OCSP Stapling](https://tools.ietf.org/html/rfc6066#section-8) is a TLS
extension that enables the server to query its certificate's revokation status
at regular intervals in the background and sends an OCSP response with the TLS
handshake. The stapled response itself cannot be faked as it needs to be
signed with the CA's private key. Enabling OCSP stapling thus improves
performance and privacy for your visitors immediately.

You need to create a certificate file that contains your CA's root certificate
prepended by any intermediate certificates that might be in your CA's chain.
StartSSL has an intermediate certificate for Class 1 (the free tier) - make
sure to use the one having the SHA-256 signature. Pass the file to Nginx using
the `ssl_trusted_certificate` directive and to Apache using the
`SSLCACertificateFile` directive.

### OCSP Must Staple

OCSP however is unfortunately not a silver bullet. Even with stapling there
still are a few attack vectors left as
[Adam Langley explains in great detail](https://www.imperialviolet.org/2014/04/19/revchecking.html).

One solution might be the proposed
[OCSP Must Staple Extension](https://tools.ietf.org/html/draft-hallambaker-muststaple-00).
This would add another field to the certificate issue by the CA that says a
server *must* provide a stapled OCSP response. The problem here is that the
origin proposal expired and in practice it would take years for CAs to support
that.

Another solution would be to implement
[a header similar to HSTS](https://bugzilla.mozilla.org/show_bug.cgi?id=901698),
that lets the browser remember to require a stapled OCSP response when
connecting next time. This however has the same problems on first connection
just like HSTS, and we might have to maintain a "OCSP-Must-Staple Preload List".
As of today there is unfortunately no immediate solution in sight.

## <a name="hpkp"></a> HTTP Public Key Pinning (HPKP)

Even with all those security checks when receiving the server's certificate
we would still be completely out of luck in case your
[CA's private key is compromised](http://en.wikipedia.org/wiki/DigiNotar) or
your [CA simply fucks up](http://nakedsecurity.sophos.com/2013/01/08/the-turktrust-ssl-certificate-fiasco-what-happened-and-what-happens-next/).
We can prevent these kinds of attacks with anrHTTP extension called
[Public Key Pinning](https://tools.ietf.org/html/draft-ietf-websec-key-pinning-21).

Key pinning is a trust-on-first-use (TOFU) mechanism. The first time a browser
connects to a host it lacks the the information necessary to perform "pin
validation" so it will not be able to detect and thwart a {M,W}ITM attack. This
feature only allows detection of these kinds of attacks after the first
connection.

### Generating a HPKP header

Creating an HPKP header is easy, all you need to do is to compute the
base64-encoded "SPKI fingerprint" of your RSA key pair whose public key is
given by the TLS certificate. An SPKI fingerprint is the output of a applying
SHA-256 to the public key information contained in your certificate.

{% codeblock lang:text %}
openssl req -inform pem -pubkey -noout < example.com.csr |
  openssl pkey -pubin -outform der |
  openssl dgst -sha256 -binary |
  base64
{% endcodeblock %}

The output of the above command can be directly used as the *pin-sha256* values
for the *Public-Key-Pins* header as shown below:

{% codeblock lang:text %}
Public-Key-Pins:
  pin-sha256="GRAH5Ex+kB4cCQi5gMU82urf+6kEgbVtzfCSkw55AGk=";
  pin-sha256="lERGk61FITjzyKHcJ89xpc6aDwtRkOPAU0jdnUqzW2s=";
  max-age=15768000; includeSubDomains
{% endcodeblock %}

Upon receiving this header the browser knows that it has to store the pins
given by the header and discard any certificates whose SPKI fingerprints do
not match for the next six months (max-age=15768000). We specified to
`includeSubDomains` token so the browser will verify pins when connecting
to any subdomain.

### Include the pin of a backup key

It is considered good practice to include at least a second pin, the SPKI
fingerprint of a backup RSA key that you can generate exactly as the original
one:

{% codeblock lang:text %}
openssl req -new -newkey rsa:4096 -nodes -sha256 \
  -keyout example.com.backup.key -out example.com.backup.csr
{% endcodeblock %}

In case your private key is compromised you might need to revoke your
current certificate and request the CA to issue a new one. The old pin however
would still be stored in browsers for six months which means they would not
be able to connect to your site. By sending two *pin-sha256* values the browser
will later accept a TLS connection when any of the stored fingerprints match
the given certificate.

## <a name="attacks"></a> Known attacks

In the past years (and especially the last year) a few attacks on SSL/TLS were
published. Some of those attacks can be worked around on the protocol or crypto
library level so that you basically do not have to worry as long as your web
server is up to date and the visitor is using a modern browser. A few attacks
however need to be thwarted by configuring your server properly.

### BEAST (Browser Exploit Against SSL/TLS)

[BEAST](http://blog.cryptographyengineering.com/2011/09/brief-diversion-beast-attack-on-tlsssl.html)
is an attack that only affects TLSv1.0. Exploiting this vulnerability is
possible but rather difficult. You can either disable TLSv1.0 completely -
which is certainly the preferred solution although you might neglect folks
with old browsers on old operating systems - or you can just not worry. All
major browsers have implemented workarounds so that it should not be an issue
anymore in practice.

### BREACH (Browser Reconnaissance and Exfiltration via Adaptive Compression of Hypertext)

[BREACH](https://en.wikipedia.org/wiki/BREACH_%28security_exploit%29) is a
security exploit against HTTPS when using HTTP compression. Breach is based
on [CRIME](https://en.wikipedia.org/wiki/CRIME) but unlike CRIME - which can be
successfully defended by turning off TLS compression (which is the default
for Nginx and Apache nowadays) - BREACH can only be prevented by turning off
HTTP compression. Another method to mitigate this would be to use
[cross-site request forgery (CSRF)](https://en.wikipedia.org/wiki/Cross-site_request_forgery)
protection or
[disable HTTP compression selectively based on headers](https://community.qualys.com/blogs/securitylabs/2013/08/07/defending-against-the-breach-attack)
sent by the application.

### POODLE (Padding Oracle On Downgraded Legacy Encryption)

[POODLE](https://en.wikipedia.org/wiki/POODLE)
is yet another
[padding oracle attack](https://en.wikipedia.org/wiki/Padding_oracle_attack) on
TLS. Luckily it only affects the predecessor of TLS which is SSLv3. The only
solution when deploying a new server is to just disable SSLv3 completely.
Firefox 34 will ship with SSLv3 disabled by default, Chrome and others will
hopefully follow soon.

## Further reading

Thanks for reading and I am glad you made it that far! If you want to read even
more about setting up TLS, the Mozilla Wiki page on
[Server-Side TLS](https://wiki.mozilla.org/Security/Server_Side_TLS) has more
information and proposed web server configurations.

I hope you now have a much better understanding of TLS' current state and most
of its weaknesses. I am not an expert in any of this so please let me know of
any mistakes and I will correct them as soon as possible!
