---
layout: post
title: "The Evolution of Signatures in TLS"
subtitle: "Signature algorithms and schemes in TLS 1.0 - 1.3"
date: 2016-07-26 16:00:00 +0200
---

This post will take a look at the evolution of signature algorithms and schemes
in the TLS protocol since version 1.0. I at first started taking notes for
myself but then decided to polish and publish them, hoping that others will
benefit as well.

(Let's ignore client authentication for simplicity.)

## Signature algorithms in TLS 1.0 and TLS 1.1

In [TLS 1.0](https://tools.ietf.org/html/rfc2246) as well as [TLS 1.1](https://tools.ietf.org/html/rfc4346)
there are only two supported signature schemes: RSA with MD5/SHA-1 and DSA with
SHA-1. The RSA here stands for the PKCS#1 v1.5 signature scheme, naturally.

```c
select (SignatureAlgorithm)
{
    case rsa:
        digitally-signed struct {
            opaque md5_hash[16];
            opaque sha_hash[20];
        };
    case dsa:
        digitally-signed struct {
            opaque sha_hash[20];
        };
} Signature;
```

An RSA signature signs the concatenation of the MD5 and SHA-1 digest, the DSA
signature only the SHA-1 digest. Hashes will be computed as follows:

```
h = Hash(ClientHello.random + ServerHello.random + ServerParams)
```

The `ServerParams` are the actual data to be signed, the `*Hello.random` values
are prepended to prevent replay attacks. This is the reason TLS 1.3 puts a
[downgrade sentinel](https://tlswg.github.io/tls13-spec/#server-hello)
at the end of `ServerHello.random` for clients to check.

The [ServerKeyExchange message](https://tools.ietf.org/html/rfc2246#section-7.4.3)
containing the signature is sent only when static RSA/DH key exchange is *not*
used, that means we have a DHE\_\* cipher suite, an RSA\_EXPORT\_\* suite
downgraded due to export restrictions, or a DH\_anon\_\* suite where both
parties don't authenticate.

## Signature algorithms in TLS 1.2

[TLS 1.2](https://tools.ietf.org/html/rfc5246) brought bigger changes to
signature algorithms by introducing the [signature\_algorithms extension](https://tools.ietf.org/html/rfc5246#section-7.4.1.4.1).
This is a `ClientHello` extension allowing clients to signal supported and
preferred signature algorithms and hash functions.

```c
enum {
    none(0), md5(1), sha1(2), sha224(3), sha256(4), sha384(5), sha512(6)
} HashAlgorithm;

enum {
    anonymous(0), rsa(1), dsa(2), ecdsa(3)
} SignatureAlgorithm;

struct {
    HashAlgorithm hash;
    SignatureAlgorithm signature;
} SignatureAndHashAlgorithm;
```

If a client does not include the `signature_algorithms` extension then it is
assumed to support RSA, DSA, or ECDSA (depending on the negotiated cipher suite)
with SHA-1 as the hash function.

Besides adding all SHA-2 family hash functions, TLS 1.2 also introduced ECDSA
as a new signature algorithm. Note that the extension does not allow to
restrict the curve used for a given scheme, P-521 with SHA-1 is therefore
perfectly legal.

A new requirement for RSA signatures is that the hash has to be wrapped in a
DER-encoded `DigestInfo` sequence before passing it to the RSA sign function.

```
DigestInfo ::= SEQUENCE {
    digestAlgorithm DigestAlgorithm,
    digest OCTET STRING
}
```

This unfortunately led to attacks like [Bleichenbacher'06](https://www.ietf.org/mail-archive/web/openpgp/current/msg00999.html)
and [BERserk](http://www.intelsecurity.com/advanced-threat-research/berserk.html)
because it turns out handling ASN.1 correctly is hard. As in TLS 1.1, a
`ServerKeyExchange` message is sent only when static RSA/DH key exchange is not
used. The hash computation did not change either:

```
h = Hash(ClientHello.random + ServerHello.random + ServerParams)
```

## Signature schemes in TLS 1.3

The `signature_algorithms` extension introduced by TLS 1.2 was revamped in
[TLS 1.3](https://tlswg.github.io/tls13-spec/#rfc.section.4.2.2) and MUST now
be sent if the client offers a single non-PSK cipher suite. The format is
backwards compatible and keeps old code points.

```c
enum {
    /* RSASSA-PKCS1-v1_5 algorithms */
    rsa_pkcs1_sha1 (0x0201),
    rsa_pkcs1_sha256 (0x0401),
    rsa_pkcs1_sha384 (0x0501),
    rsa_pkcs1_sha512 (0x0601),

    /* ECDSA algorithms */
    ecdsa_secp256r1_sha256 (0x0403),
    ecdsa_secp384r1_sha384 (0x0503),
    ecdsa_secp521r1_sha512 (0x0603),

    /* RSASSA-PSS algorithms */
    rsa_pss_sha256 (0x0700),
    rsa_pss_sha384 (0x0701),
    rsa_pss_sha512 (0x0702),

    /* EdDSA algorithms */
    ed25519 (0x0703),
    ed448 (0x0704),

    /* Reserved Code Points */
    private_use (0xFE00..0xFFFF)
} SignatureScheme;
```

Instead of `SignatureAndHashAlgorithm`, a code point is now called a
`SignatureScheme` and tied to a hash function (if applicable) by the
specification. TLS 1.2 algorithm/hash combinations not listed here
are deprecated and MUST NOT be offered or negotiated.

New code points for RSA-PSS schemes, as well as Ed25519 and Ed448-Goldilocks
were added. ECDSA schemes are now tied to the curve given by the code point
name, to be enforced by implementations. SHA-1 signature schemes SHOULD NOT be
offered, if needed for backwards compatibility then only as the lowest priority
after all other schemes.

The current draft-13 still lists RSASSA-PSS as the only valid signature algorithm
allowed to sign handshake messages with an RSA key. The rsa\_pkcs1\_\* values
solely refer to signatures which appear in certificates and are not defined for
use in signed handshake messages. There *is* hope.

To prevent various downgrade attacks like [FREAK](https://freakattack.com/) and [Logjam](https://weakdh.org/) the computation of the hashes to be signed
has changed significantly and covers the complete handshake, up until
`CertificateVerify`:

```
h = Hash(Handshake Context + Certificate) + Hash(Resumption Context)
```

This includes amongst other data the client and server random, key shares, the
cipher suite, the certificate, and resumption information to prevent replay and
downgrade attacks. With static key exchange algorithms gone the
[CertificateVerify message](https://tlswg.github.io/tls13-spec/#rfc.section.4.3.2)
is now the one carrying the signature.
