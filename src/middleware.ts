import { NextResponse, type NextRequest } from "next/server";

/**
 * Custom-domain routing.
 *
 * The middleware itself does no database work — it only decides "this request
 * arrived at a domain that isn't the app's own" and rewrites to /_host/<domain>,
 * where a normal Node route does the sites.custom_domain lookup. Keeping the DB
 * out of here is what lets this stay on the edge runtime.
 *
 * Because nobody testing this demo owns a domain, ?host=acme.test forces the
 * same path. The MECHANISM is real; only DNS and SSL are out of scope.
 */
const APP_HOSTS = new Set([
  "localhost",
  "localhost:3000",
  "127.0.0.1",
  "127.0.0.1:3000",
  "0.0.0.0:3000",
  "app:3000",
]);

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const override = url.searchParams.get("host");
  const host = (override ?? req.headers.get("host") ?? "").toLowerCase();

  if (!host) return NextResponse.next();

  // No override and we're on the app's own hostname → ordinary dashboard traffic.
  if (!override && APP_HOSTS.has(host)) return NextResponse.next();

  const rewritten = new URL(`/site-by-host/${encodeURIComponent(host)}${url.pathname}`, url);
  rewritten.search = "";
  return NextResponse.rewrite(rewritten);
}

export const config = {
  // Everything except the app's own API, the rewrite target itself, and assets.
  matcher: ["/((?!api|site-by-host|_next|favicon.ico).*)"],
};
