import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs, in this order: custom-domain routing, then keeping the product
 * behind a login.
 *
 * ── Custom domains ──────────────────────────────────────────────────────────
 * No database work happens here. The middleware only decides "this request
 * arrived at a domain that isn't the app's own" and rewrites to
 * /site-by-host/<domain>, where a normal Node route does the
 * sites.custom_domain lookup. Keeping the DB out of here is what lets this stay
 * on the edge runtime.
 *
 * Because nobody testing this demo owns a domain, ?host=acme.test forces the
 * same path. The MECHANISM is real; only DNS and TLS are out of scope.
 *
 * ── The login gate ──────────────────────────────────────────────────────────
 * This checks that a session cookie EXISTS and nothing more. It cannot validate
 * one — that needs the database, which is not available on the edge — so it is a
 * redirect for convenience and NEVER a security boundary.
 *
 * The real check is `requireUser()` inside each route and page, against the
 * session table. Anyone who forges a cookie sails past this middleware and is
 * then refused by the thing that actually matters. Treating middleware as
 * authorisation is a well-known way to ship an auth bypass; this is deliberately
 * not doing that.
 *
 * Published sites are not gated. They are public web pages.
 */
// The app's OWN hostnames. Any OTHER Host header is treated as a customer's
// custom domain and routed to their site. Localhost covers dev; the deployed
// public host is derived from NEXT_PUBLIC_RUNTIME_API (inlined at build) so the
// app recognises its own domain instead of mistaking it for a custom domain and
// 404ing every page. NEXT_PUBLIC_APP_HOSTS (comma-separated) adds any extras.
const APP_HOSTS = new Set([
  "localhost",
  "localhost:3000",
  "127.0.0.1",
  "127.0.0.1:3000",
  "0.0.0.0:3000",
  "app:3000",
]);
for (const raw of [
  process.env.NEXT_PUBLIC_RUNTIME_API,
  ...(process.env.NEXT_PUBLIC_APP_HOSTS ?? "").split(","),
]) {
  const value = raw?.trim();
  if (!value) continue;
  try {
    // Accept a full origin ("https://x") or a bare host ("x").
    APP_HOSTS.add(new URL(value.includes("://") ? value : `https://${value}`).host.toLowerCase());
  } catch {
    /* ignore a malformed entry rather than break routing */
  }
}

const SESSION_COOKIE = "cms_session";

/** Product surfaces that require a session. */
const PROTECTED = [/^\/dashboard(\/|$)/, /^\/editor(\/|$)/];

// The cart island on a published page calls the app origin for cart/orders; on a
// custom domain that is cross-origin, so connect-src must allow it explicitly.
const RUNTIME_ORIGIN = (() => {
  const raw = process.env.NEXT_PUBLIC_RUNTIME_API?.trim();
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
  } catch {
    return "";
  }
})();

// Published pages ship no eval and (aside from Next's own inline hydration) no
// inline app script, so this locks resource loading down hard: no external
// scripts, no <object>/<embed>, no <base> hijack, no framing (clickjacking), no
// off-site form posts. It's the backstop behind the theme-token sanitiser — even
// if some value ever reached CSS unescaped, an injected external script or a
// stolen form submission still can't run.
const SITE_CSP = [
  "default-src 'self'",
  "img-src 'self' https: data:",
  "font-src 'self' https: data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  `connect-src 'self'${RUNTIME_ORIGIN ? ` ${RUNTIME_ORIGIN}` : ""}`,
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

/** Always-on hardening for every response; the strict CSP is added for published sites. */
function harden(res: NextResponse, siteResponse: boolean): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (siteResponse) {
    res.headers.set("Content-Security-Policy", SITE_CSP);
    res.headers.set("X-Frame-Options", "DENY");
  }
  return res;
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const override = url.searchParams.get("host");
  const host = (override ?? req.headers.get("host") ?? "").toLowerCase();

  // ── 1. Custom-domain routing ──────────────────────────────────────────────
  if (host && (override || !APP_HOSTS.has(host))) {
    const rewritten = new URL(`/site-by-host/${encodeURIComponent(host)}${url.pathname}`, url);
    rewritten.search = "";
    return harden(NextResponse.rewrite(rewritten), true);
  }

  // ── 2. The login gate ─────────────────────────────────────────────────────
  if (PROTECTED.some((pattern) => pattern.test(url.pathname))) {
    if (!req.cookies.get(SESSION_COOKIE)?.value) {
      const login = new URL("/login", url);
      // Carried so the user lands where they were headed. Validated on the other
      // side before it is followed — an unchecked redirect target taken from a
      // URL is an open redirect.
      login.searchParams.set("next", url.pathname);
      return NextResponse.redirect(login);
    }
  }

  // Published sites are also reachable directly at /s/<slug>; harden those too.
  return harden(NextResponse.next(), url.pathname.startsWith("/s/"));
}

export const config = {
  // Everything except the app's own API, the rewrite target itself, and assets.
  matcher: ["/((?!api|site-by-host|_next|favicon.ico).*)"],
};
