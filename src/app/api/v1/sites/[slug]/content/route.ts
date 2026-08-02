/**
 * The headless Content API — GET a published site's content as clean JSON.
 *
 *   GET /api/v1/sites/<slug>/content
 *   Authorization: Bearer cms_live_…            (or: X-API-Key: cms_live_…)
 *
 * Read-only, key-scoped to ONE site, and served straight off the immutable
 * release — so a response is as cacheable as the release id and rolling back the
 * site rolls back the API in the same pointer flip. CORS is open because the key,
 * not the origin, is the credential.
 */
import { NextResponse } from "next/server";
import { verifyKey } from "@/lib/apikeys";
import { siteBySlug, loadRelease, normalisePath } from "@/lib/runtime/release";
import { serializeRelease, contentEtag } from "@/lib/content-api";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureError } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, X-API-Key, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...CORS, ...extra } });
}

function bearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  const header = req.headers.get("x-api-key");
  return header ? header.trim() : null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const token = bearer(req);
  if (!token) {
    return json({ error: "Missing API key. Send 'Authorization: Bearer <key>'." }, 401);
  }

  const key = await verifyKey(token);
  if (!key) return json({ error: "Invalid or revoked API key." }, 401);

  // Rate-limit per key, not per IP — the key is the identity here.
  const rate = await checkRateLimit(`content-api:${key.id}`, { windowMs: 60_000, max: 120 });
  if (rate.limited) return json({ error: "Rate limit exceeded. Try again shortly." }, 429);

  const site = await siteBySlug(slug);
  if (!site) return json({ error: `No site '${slug}'.` }, 404);

  // A key can only read the site it was issued for.
  if (site.id !== key.siteId) {
    return json({ error: "This key is not authorized for that site." }, 403);
  }

  if (!site.liveReleaseId) {
    return json({ error: "This site has no published release yet." }, 409);
  }

  try {
    const release = await loadRelease(site.liveReleaseId);
    if (!release) return json({ error: "Published release is not ready." }, 409);

    const url = new URL(req.url);
    const embed = url.searchParams.get("embed") === "1";
    const pageParam = url.searchParams.get("page");
    const page = pageParam ? normalisePath(pageParam) : null;

    // Conditional GET: the response is a pure function of the immutable release
    // (+ embed + page), so a matching If-None-Match can 304 with no work.
    const etag = contentEtag(release.versionNo, embed, page);
    const cacheHeaders = {
      "Cache-Control": "public, max-age=60, s-maxage=300",
      "X-Content-Version": String(release.versionNo),
      ETag: etag,
      "Last-Modified": new Date(release.createdAt).toUTCString(),
    };
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ...CORS, ...cacheHeaders } });
    }

    const content = serializeRelease(release, embed);
    if (page) {
      const only = content.pages.find((p) => p.path === page);
      if (!only) return json({ error: `No page '${page}' in this site.` }, 404);
      return json({ ...content, pages: [only] }, 200, cacheHeaders);
    }
    return json(content, 200, cacheHeaders);
  } catch (err) {
    captureError(err, { scope: "content-api", slug });
    return json({ error: "Failed to load content." }, 500);
  }
}
