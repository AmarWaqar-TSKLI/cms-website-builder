# Security

A working threat model for this codebase — what's defended, what's assumed, and
what still needs doing. Honest, not aspirational.

## Assets

- **Tenant content & drafts** (pages, components, themes) — integrity + tenant isolation.
- **Business data** (orders, customers, form submissions) — confidentiality + integrity.
- **Credentials**: user password hashes, session tokens, Content-API keys, and
  operational secrets (DB, DNS API key, AI key, host token).
- **Availability** of published sites and custom domains.

## Trust boundaries

1. **Browser → app** (session cookie).
2. **Third-party dev → Content API** (bearer key).
3. **App → PowerDNS / TLS edge** (HTTPS + API key) and **app → AI provider**.
4. **The AI's output** is treated as *untrusted input*, not code.

## What's defended

- **Tenant isolation / authz.** Every site-scoped route runs `guardSite` (or a
  by-entity variant) against the DB — authorization is in the route, not the edge.
  "Not yours" and "doesn't exist" return the same `403`, so ids can't be probed.
- **Credential storage.** Passwords are scrypt with parameters carried in the
  hash. Session tokens and Content-API keys are stored **only as SHA-256** — a
  leaked DB yields no working credential. API keys show their plaintext once and
  are site-scoped; revoke is a soft flag (audit survives).
- **Injection via AI.** The AI can only emit `{type, props}` validated against the
  registry ([ADR-0005](docs/adr/0005-registry-constrained-rendering.md)) — never
  HTML/script. Theme tokens become raw CSS custom properties and are **sanitized
  at the sink** (`src/lib/theme.ts`); a stored-XSS through a crafted token was
  found and closed there, with a regression test.
- **Rendering boundary.** `react-dom/server` (document generation) is kept out of
  the request path by build-time enforcement, so the runtime renders components
  but can't be coerced into emitting a document from live state.
- **Rate limiting.** AI, translate and Content-API routes are rate-limited per
  user/key.
- **Response headers.** Custom-domain and `/s/` responses get CSP, X-Frame-Options,
  nosniff, Referrer-Policy, Permissions-Policy (`src/middleware.ts`).
- **On-demand TLS gate.** Caddy only issues a certificate for a host that
  `/api/domains/check` confirms we serve — no open cert issuance.

## Known gaps / to do

- **CSRF.** State-changing routes are cookie-authenticated; verify the session
  cookie's `SameSite` (should be `Lax`/`Strict`) and add explicit CSRF tokens for
  anything a cross-site form could POST. **← audit this before real users.**
- **Secret rotation.** Several secrets were passed through operator chat during
  bring-up and must be rotated: DB password, `PDNS_API_KEY` (was printed to a
  console once), the AI key, and the host API token. None are in git.
- **DNS API key blast radius.** It can create/modify any zone on our nameserver;
  scope it down and put it behind least privilege.
- **Input size limits.** Present on AI paths; audit every JSON body handler for a
  hard cap.
- **DNSSEC / secondary NS.** Not deployed (see
  [ADR-0006](docs/adr/0006-domains-and-tls.md)).

## Reporting

This is a demo/portfolio project. For a real deployment, add a disclosure contact
and a dependency-audit step (`npm audit` / Dependabot) to CI.
