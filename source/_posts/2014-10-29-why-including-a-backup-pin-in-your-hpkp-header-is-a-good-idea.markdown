---
layout: post
title: "Why including a backup pin in your Public-Key-Pinning header is a good idea"
date: 2014-10-30 14:00
---

In my last post
["Deploying TLS the hard way"](/blog/2014/10/deploying-tls-the-hard-way/)
I explained how TLS and its extensions (as well as a few HTTP extensions) work
and what to watch out for when enabling TLS for your server. One of the HTTP
extensions mentioned is
[HTTP Public-Key-Pinning (HPKP)](https://developer.mozilla.org/en-US/docs/Web/Security/Public_Key_Pinning).
As a short reminder, the header looks like this:

{% codeblock lang:text %}
Public-Key-Pins:
  pin-sha256="GRAH5Ex+kB4cCQi5gMU82urf+6kEgbVtzfCSkw55AGk=";
  pin-sha256="lERGk61FITjzyKHcJ89xpc6aDwtRkOPAU0jdnUqzW2s=";
  max-age=15768000; includeSubDomains
{% endcodeblock %}

You can see that it specifies two *pin-sha256* values, that is the pins of two
public keys. One is the public key of your currently valid certificate and the
other is a backup key in case you have to revoke your certificate.

I received a few questions as to why I suggest including a backup pin and what
the requirements for a backup key would be. I will try to answer those with a
more detailed overview of how public key pinning and TLS certificates work.

## How are RSA keys represented?

Let us go back to the beginning and start by taking a closer look at
[RSA](https://en.wikipedia.org/wiki/RSA_%28cryptosystem%29) keys:

{% codeblock lang:text %}
$ openssl genrsa 4096
{% endcodeblock %}

The above command generates a 4096 bit RSA key and prints it to the console.
Although it says `-----BEGIN RSA PRIVATE KEY-----` it does not only return the
private key but an
[ASN.1](https://en.wikipedia.org/wiki/Abstract_Syntax_Notation_One) structure
that also contains the public key - we thus actually generated an RSA key pair.

A common misconception when learning about keys and certificates is that the
RSA key itself for a given certificate expires. RSA keys however never expire -
after all they are just three numbers. Only the certificate containing the
public key can expire and only the certificate can be revoked. Keys "expire" or
are "revoked" as soon as there are no more valid certificates using the public
key, and you threw away the keys and stopped using them altogether.

## What does the TLS certificate contain?

By submitting the
[Certificate Signing Request (CSR)](https://en.wikipedia.org/wiki/Certificate_signing_request)
containing your public key to a Certificate Authority it will issue a valid
certificate. That will again contain the public key of the RSA key pair we
generated above and an expiration date. Both the public key and the expiration
date will be signed by the CA so that modifications of any of the two would
render the certificate invalid immediately.

For simplicity I left out a few other fields that
[X.509 certificates](https://en.wikipedia.org/wiki/X.509#Structure_of_a_certificate)
contain to properly authenticate TLS connections, for example your server's
hostname and other details.

## How does public key pinning work?

The whole purpose of public key pinning is to detect when the public key of a
certificate for a specific host has changed. That may happen when an attacker
compromises a CA such that they are able to issue valid certificates for *any*
domain. An attacker intercepting a connection from a visitor to your server
with a forged certificate can only be prevented by detecting that the public
key has changed.

After the server sent a TLS certificate with the handshake, the browser will
look up any stored pins for the given hostname and check whether any of those
stored pins match any of the
[SPKI fingerprints](https://tools.ietf.org/html/draft-ietf-websec-key-pinning-21#section-2.4)
(the output of applying SHA-256 to the public key information) in the
certificate chain. The connection must be terminated immediately if pin
validation fails.

If the browser does not find any stored pins for the current hostname then it
will directly continue with the usual certificate checks. This might happen if
the site does not support public key pinning and does not send any HPKP headers
at all, or if this is the first time visiting and the server has not seen the
HPKP header yet in a previous visit.

[Pin validation](https://tools.ietf.org/html/draft-ietf-websec-key-pinning-21#section-2.6)
should happen as soon as possible and thus before any basic certificate checks
are performed. An expired or revoked certificate will be happily accepted at
the pin validation stage early in the handshake when any of the SPKI
fingerprints of its chain match a stored pin. Only a little later the browser
will see that the certificate already expired or was revoked and will reject it.

Pin validation also works for self-signed certificates, but they will of course
raise the same warnings as usual as soon as the browser determined they were
not signed by a trusted third-party.

## What if your certificate was revoked?

If your server was compromised and an attacker obtained your private key you
have to revoke your certificate as the attacker obviously can fully intercept
any TLS connection to your server and record every conversation. If your HPKP
header contained only a single *pin-sha256* token you are out of luck until the
*max-age* directive given in the header lets those pins expire in your
visitors' browsers.

Pin validation requires checking the SPKI fingerprints of all certificates in
the chain. When for example StartSSL signed your certificate you have another
intermediate Class 1 or 2 certificate and their root certificate in the chain.
The browser trusts only the root certificate but the intermediate ones are
signed by the root certificate. The intermediate certificate in turn signs the
certificate deployed on your server and that is called a chain of trust.

To prevent getting stuck after your only pinned key was compromised, you could
for example provide the SPKI fingerprint of StartSSL's Class 1 intermediate
certificate. An attacker would now have to somehow get a certificate issued by
StartSSL's Class 1 tier to successfully impersonate you. You are however again
out of luck should you decide to upgrade to Class 2 in a month because you
decided to start paying for a certificate.

Pinning StartSSL's root certificate would let you switch Classes any time and
the attacker would still have to get a certificate issued by StartSSL for your
domain. This is a valid approach as long as you are trusting your CA (really?)
and as long as the CA itself is not compromised. In case of a compromise
however the attacker would be able to get a valid certificate for your domain
that passes pin validation. After the attack was discovered StartSSL would
quickly revoke all currently issued certificates, generate a new key pair for
their root certificate and issue new certificates. And again we would be out of
luck because suddenly pin validation fails and no browser will connect to our
site.

## Include the pin of a backup key

The safest way to pin your certificate's public key and be prepared to revoke
your certificate when necessary is to include the pin of a second public key:
your backup key. This backup RSA key should in no way be related to your first
key, just generate a new one.

A good advice is to keep this backup key pair (especially the private key) on
your machine until you need it. Uploading it to the server is dangerous: when
your server is compromised you lose both keys at once and have no backup key
left.

Generate a pin for the backup key exactly as you did for the current key and
include both *pin-sha256* values as shown above in the HPKP header. In case the
current key is compromised make sure all vulnerabilities are patched and then
remove the revoked pin. Generate a CSR for the backup key, let your CA issue a
new certificate, and revoke the old one. Upload the new certificate to your
server and you are done.

Finally, do not forget to generate a new backup key and include that pin in
your HPKP header again. Once a browser successfully establishes a TLS
connection the next time, it will see your updated HPKP header and replace any
stored pins with the new ones.
