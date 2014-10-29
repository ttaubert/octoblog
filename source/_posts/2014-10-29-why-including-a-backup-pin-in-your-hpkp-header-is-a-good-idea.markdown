---
layout: post
title: "Why you should add a backup pin to your Public-Key-Pinning header"
date: 2014-10-29 11:55
published: false
---

In my last post
[Deploying TLS the hard way](/blog/2014/10/deploying-tls-the-hard-way/)
I explained how TLS and its extensions (as well as a few HTTP extensions) work
and what to watch out for when moving your server to TLS. One of the HTTP
extension mentioned is
[HTTP Public-Key-Pinning (HPKP)](https://tools.ietf.org/html/draft-ietf-websec-key-pinning-21).
As a short reminder, the header looks like this:

{% codeblock lang:text %}
Public-Key-Pins:
  pin-sha256="GRAH5Ex+kB4cCQi5gMU82urf+6kEgbVtzfCSkw55AGk=";
  pin-sha256="lERGk61FITjzyKHcJ89xpc6aDwtRkOPAU0jdnUqzW2s=";
  max-age=15768000; includeSubDomains
{% endcodeblock %}

You can see that the header specifies two *pin-sha256* values, that is the pins
of two different public keys. One is the public key of your currently valid
certificate and I suggested including the pin of a backup key in case you have
to revoke your certificate.

I received a few questions as to why including a backup pin would be a good
idea and what the requirements for a backup key would be. I will try to answer
all of those with a more detailed overview of how public key pinning and TLS
certificates work.

## What represents an RSA key?

Let us start by taking a closer look at how
[RSA](https://en.wikipedia.org/wiki/RSA_%28cryptosystem%29) keys:

{% codeblock lang:text %}
$ openssl genrsa 4096
{% endcodeblock %}

The above command generates a 4096 bit RSA key and prints it to the console.
Although it says `-----BEGIN RSA PRIVATE KEY-----` it does not only print the
private key but an
[ASN.1](https://en.wikipedia.org/wiki/Abstract_Syntax_Notation_One) structure
that also contains the public key and the modulus. We thus actually generated
an RSA key pair with the public key being `(public exponent, modulus)` and the
private key being `(private exponent, modulus)`.

When thinking about certificates it is easy to assume that the RSA key for a
given certificate expires. RSA keys however never expire - after all they are
just three numbers. The certificate containing the public key however can
expire. After a certificate expired you can easily use the same RSA key pair
to generate a new valid certificate again.

## What exactly does a TLS certificate contain?

After you submitted the
[Certificate Signing Request](https://en.wikipedia.org/wiki/Certificate_signing_request)
generated from your RSA key pair to your Certificate Authority will get back a
valid certificate. The certificate will contain the public key of the RSA key
pair we generated above and an expiration date. Both the public key and the
expiration date will be signed by the CA so that modifications of any of the
two would render the certificate invalid immediately.

For simplicity I left out a few other fields,
[X.509 certificates](https://en.wikipedia.org/wiki/X.509#Structure_of_a_certificate)
do of course contain numerous other fields necessary to properly authenticate
TLS connections, for example your server's hostname and several other technical
details.

## How does public key pinning work?

The whole purpose of public key pinning is to detect when the public key for a
certificate has changed. That may happen when an attacker compromises a CA such
that they are able to issue valid certificates for any domain. An attacker
intercepting a connection from a visitor to your server can only be prevented
by detecting that the public key has changed.

After the server has sent its TLS certificate with the handshake the browser
will thus check whether it has any saved pins for the given hostname. If there
is at least a single pin it will check whether any of the stored pins matches
any of the "SPKI fingerprints" (the output of a applying SHA-256 to the public
key information) in the certificate chain. The connection must immediately be
terminated if pin validation fails.

If the browser does not have any stored pins for the current hostname then it
will directly continue with the usual certificate checks. This might happen if
the site does not support public key pinning and does not send any HPKP headers
at all, or if this is the first time visiting and the server has not seen the
HPKP header yet.

Pin validation should happen as soon as possible if implemented correctly and
will thus happen before any basic certificate checks. An expired or revoked
certificate will be happily accepted at the pin validation stage early in the
handshake when any of the SPKI fingerprints of its chain matches a stored pin.
Only a little later the browser will see that the certificate already expired
or was revoked and will reject it.

Pin validation thus also works for self-signed certificates, but they will of
course raise the same warning as usual as soon as the browser determined it was
not signed by a trusted third-party.

## What happens when your certificate was revoked?

If your server was compromised and an attacker obtained your private key you
have to revoke your certificate as the attacker obviously can fully intercept
any TLS connection to your server now and record every conversation. If your
HPKP header contained only a single *pin-sha256* token then you are out of luck
until the *max-age* directive given in the header lets those pins expire in
your visitors' browsers.

Pin validation checks SPKI fingerprints for any certificate in the chain. Thus
when for example StartSSL signed your certificate you have another intermediate
Class 1 or 2 certificate and their root certificate in the chain. The browser
trusts only the root certificate but the intermediate ones are signed with the
root certificate. The intermediate certificate in turn sign the certificate
deployed on your server.

To work around problems with a single public key pin you could for example only
include the SPKI fingerprint of StartSSL's Class 1 intermediate certificate.
An attacker would now have to somehow get a certificate issued by StartSSL's
Class 1 tier to impersonate you. You are however again out of luck should you
decide to upgrade to Class 2 in a month because you suddenly have a few more
subdomains to protect.

Pinning StartSSL's root certificate would let you switch Classes any time and
the attacker would still have to get a certificate issue by StartSSL. This is
a valid approach as long as you are trusting your CA (really?) and as long as
the CA itself is not compromised. In case of a compromise however the attacker
would be able to get a valid certificate for your domain that passed pin
validation. After the attack was discovered StartSSL would quickly revoke all
currently issued certificates, generate a new key pair for their root
certificate and issue new certificates. And again we would be out of luck
because suddenly our pin validations fail and no browser will connect to our
site.

## Include the pin of a backup key!
## the backup key

shouldn't be derived from the current key, just generate a new one
shouldn't be stored on the server already in case your server is compromised
the backup key can have a different bit size but there is no advantage to that
