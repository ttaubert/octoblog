---
layout: post
title: "HTTP Public-Key-Pinning explained"
alias: /blog/2014/10/why-including-a-backup-pin-in-your-hpkp-header-is-a-good-idea/
date: 2014-10-30 14:00
---

In my last post
["Deploying TLS the hard way"](/blog/2014/10/deploying-tls-the-hard-way/)
I explained how TLS and its extensions (as well as a few HTTP extensions) work
and what to watch out for when enabling TLS for your server. One of the HTTP
extensions mentioned is
[HTTP Public-Key-Pinning (HPKP)](https://tools.ietf.org/html/rfc7469).
As a short reminder, the header looks like this:

{% codeblock lang:text %}
Public-Key-Pins:
  pin-sha256="GRAH5Ex+kB4cCQi5gMU82urf+6kEgbVtzfCSkw55AGk=";
  pin-sha256="lERGk61FITjzyKHcJ89xpc6aDwtRkOPAU0jdnUqzW2s=";
  max-age=15768000; includeSubDomains
{% endcodeblock %}

You can see that it specifies two *pin-sha256* values, that is the pins of two
public keys. One is the pin of any public key in your current certificate chain
and the other is the pin of any public key *not* in your current certificate
chain. The latter is a backup in case your certificate expires or has to be
revoked.

It is definitely not obvious which public keys you should pin and what a good
backup pin would be. Let us answer those questions by starting with a more
detailed overview of how public key pinning and TLS certificates work.

## How are RSA keys represented?

Let us go back to the beginning and start by taking a closer look at
[RSA](https://en.wikipedia.org/wiki/RSA_%28cryptosystem%29) keys:

{% codeblock lang:text %}
$ openssl genrsa 2048
{% endcodeblock %}

The above command generates a 2048 bit RSA key and prints it to the console.
Although it says `-----BEGIN RSA PRIVATE KEY-----` it does not only return the
private key but an
[ASN.1](https://en.wikipedia.org/wiki/Abstract_Syntax_Notation_One) structure
that also contains the public key - we thus actually generated an RSA key pair.

A common misconception when learning about keys and certificates is that the
RSA key itself for a given certificate expires. RSA keys however never expire -
after all they are just numbers. Only the certificate containing the public key
can expire and only the certificate can be revoked. Keys "expire" or are
"revoked" as soon as there are no more valid certificates using the public key,
and you threw away the keys and stopped using them altogether.

## What does the certificate contain?

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
domain. A foreign CA might also just be the attacker, think of state-owned CAs
that you do not want to be able to MITM your site. Any attacker intercepting
a connection from a visitor to your server with a forged certificate can only
be prevented by detecting that the public key has changed.

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

## What if you need to replace your certificate?

If your certificate expires or an attacker obtained the private key you will
have to replace (and possibly revoke) the leaf certificate. This might
invalidate your pin, the constraints for obtaining a new valid certificate are
the same as for an attacker that tries to impersonate you and intercept TLS
sessions.

Pin validation requires checking the SPKI fingerprints of all certificates in
the chain. When for example StartSSL signed your certificate you have another
intermediate Class 1 or 2 certificate and their root certificate in the chain.
The browser trusts only the root certificate but the intermediate ones are
signed by the root certificate. The intermediate certificate in turn signs the
certificate deployed on your server and that is called a chain of trust.

If you pinned your leaf certificate then the only way to recover is your backup
pin - whatever this points to must be included in your new certificate chain
if you want to allow users that stored your pin from previous connections back
on your server.

An easier solution would be available if you provided the SPKI fingerprint of
StartSSL's Class 1 intermediate certificate. To construct a new valid
certificate chain you simply have to ask StartSSL to re-issue a new certificate
for a new or your current key. This comes at the price of a slightly bigger
attack surface as someone that stole the private key of the CA's intermediate
certificate would be able to impersonate your site and pass key pinning checks.

Another possibility is pinning StartSSL's root certificate. Any certificate
issued by StartSSL would let you construct a new valid certificate chain. Again,
this slightly increases the attack vector as any compromised intermediate or
root certificate would allow to impersonate your site and pass pinning checks.

## What key should I pin?

Given all of the above scenarios you might ask which key would be the best to
pin, and the answer is: it depends. You can pin one or all of the public keys
in your certificate chain and that will work. The specification requires you to
have at least two pins, so you must include the SPKI hash of another CA's root
certificate, another CA's intermediate certificate (a different tier of your
current CA would also work), or another leaf certificate. The only requirement
is that this pin is not equal to the hash of any of the certificates in the
current chain. The poor browser cannot tell whether you gave it a valid and
useful backup pin so it will happily accept random values too.

Pinning to a small set of CAs that you are comfortable with helps you reduce the
risk to yourself. Pinning just your leaf certificates is only advised if you are
really certain that this is for you. It is a little like driving without a
seatbelt and might work most of the time. If something goes wrong it usually
goes really wrong and you want to avoid that.

Pinning only your own leaf certs also bears the risk of creating a backup key
that adheres to ancient standards and could not be used anymore when you have
to replace your current certificate. Assume it was three years ago, and your
backup was a 1024-bit RSA key pair. You pin for a year, and your certificate
expires. You go to a CA and say "Hey, re-issue my cert for Key A", and they say
"No, your key is too small/weak". You then say "Ah, but what about my backup
key?" - and that also gets rejected because it is too short. In effect, because
you only pinned to keys under your control you are now bricked.
