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
const APP_HOSTS = new Set([
  "localhost",
  "localhost:3000",
  "127.0.0.1",
  "127.0.0.1:3000",
  "0.0.0.0:3000",
  "app:3000",
]);

const SESSION_COOKIE = "cms_session";

/** Product surfaces that require a session. */
const PROTECTED = [/^\/dashboard(\/|$)/, /^\/editor(\/|$)/];

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const override = url.searchParams.get("host");
  const host = (override ?? req.headers.get("host") ?? "").toLowerCase();

  // ── 1. Custom-domain routing ──────────────────────────────────────────────
  if (host && (override || !APP_HOSTS.has(host))) {
    const rewritten = new URL(`/site-by-host/${encodeURIComponent(host)}${url.pathname}`, url);
    rewritten.search = "";
    return NextResponse.rewrite(rewritten);
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

  return NextResponse.next();
}

export const config = {
  // Everything except the app's own API, the rewrite target itself, and assets.
  matcher: ["/((?!api|site-by-host|_next|favicon.ico).*)"],
};
