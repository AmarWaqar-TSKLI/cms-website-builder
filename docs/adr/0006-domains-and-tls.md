# ADR-0006: Bring-your-own-domain via our own TLS edge + managed DNS

**Status:** Accepted (with known single-VM limitation)

## Context

Customers want their site on their own domain with HTTPS, ideally without
touching a hosting dashboard. The platform host's managed-cert pipeline was a
dead end for us (a domain stuck in `VALIDATING_OWNERSHIP` for 24h+). We also want
the Vercel-style "point your nameservers at us once and we manage everything".

## Decision

Serving a custom domain is already trivial: match the `Host` header against
`sites.custom_domain` (`siteByHost`). The rest is two env-gated ways to *connect*
one:

1. **Manual A-record** — the customer points their domain at our **TLS edge**: a
   Caddy VM doing **on-demand TLS**, gated by `/api/domains/check` (so it only
   issues certs for domains we actually host), proxying to the app.
2. **Managed DNS** — we run our own authoritative DNS (**PowerDNS**, driven over
   its HTTPS API). Connecting a domain creates a zone (apex/www/wildcard → the TLS
   edge); the customer delegates their nameservers to ours **once**, and we own
   every record and the certificate from then on.

Both keep the app portable: the whole thing is a `Host` match plus a certificate,
so swapping the edge or DNS provider changes one module, not the app.

## Consequences

- **+** A customer connects a domain entirely in-app; certs issue automatically on
  first request; publish/rollback stay a pointer flip with no per-domain rebuild.
- **+** Managed DNS is the real "we host your domain" capability, proven live end
  to end (delegation resolves via public resolvers → auto-issued Let's Encrypt).
- **− (known)** The TLS edge and DNS run on **one VM**, and `ns1`/`ns2` resolve to
  the **same IP** — convenient, not redundant. No DNSSEC, no secondary
  nameserver. Production would need a redundant/managed edge + real secondary DNS.
- **−** The DNS API key is a high-value secret; it must be rotated and tightly
  scoped (tracked in `SECURITY.md`).
