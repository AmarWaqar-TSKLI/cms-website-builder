/**
 * The guard every site-scoped API route runs.
 *
 * Authorisation lives HERE, in the route, against the database — not in the
 * middleware, which cannot reach the database and only checks that a cookie
 * exists. If the only thing standing between a stranger and a customer's site
 * were an edge redirect, forging a cookie would be enough. It is not.
 *
 * Two shapes, and the difference matters:
 *
 *   `guard()`      — the caller must be signed in.
 *   `guardSite()`  — signed in AND a member of the org that owns this site.
 *
 * A caller who is signed in but has no business with a site gets 403, and gets
 * the same 403 whether the site belongs to someone else or does not exist. A
 * different answer for "not found" would let anyone map out which ids are real.
 */
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "./db";
import { captureError } from "./monitor";
import {
  AuthError,
  requireComponentAccess,
  requirePageAccess,
  requireSiteAccess,
  requireUser,
  type SessionUser,
} from "./auth";

/* ── CSRF: cookie-authed endpoints must be first-party ─────────────────────────
 *
 * The session cookie is already `SameSite=Lax`, which blocks the classic
 * cross-site form POST. This is defense-in-depth on top of that: every guard here
 * protects a COOKIE-authenticated endpoint that is only ever called by our own
 * dashboard/editor, so a cross-site caller is by definition forgery. The public,
 * cross-origin surfaces (the bearer-auth Content API under /api/v1 and the cart/
 * forms runtime) do NOT use these guards, so they are unaffected.
 *
 * `Sec-Fetch-Site` is the browser stating the relationship directly; when it's
 * absent (older clients, non-browser tools) we fall back to matching Origin
 * against Host. No signal at all → allow, because CSRF requires a browser.
 */
export function isFirstParty(
  secFetchSite: string | null,
  origin: string | null,
  host: string | null,
): boolean {
  if (secFetchSite) return secFetchSite !== "cross-site";
  if (origin) {
    try {
      return new URL(origin).host.toLowerCase() === (host ?? "").toLowerCase();
    } catch {
      return false;
    }
  }
  return true;
}

async function requireApiSameOrigin(): Promise<void> {
  const h = await headers();
  if (!isFirstParty(h.get("sec-fetch-site"), h.get("origin"), h.get("host"))) {
    throw new AuthError(403, "Cross-site request blocked");
  }
}

/** requireUser, gated by the CSRF check. The single entry every guard uses. */
async function requireApiUser(): Promise<SessionUser> {
  await requireApiSameOrigin();
  return requireUser();
}

export type Guarded<T> = { ok: true; user: SessionUser; extra: T } | { ok: false; response: NextResponse };

function deny(err: unknown): { ok: false; response: NextResponse } {
  if (err instanceof AuthError) {
    return { ok: false, response: NextResponse.json({ error: err.message }, { status: err.status }) };
  }
  // Never leak an internal message to the caller; the detail goes to the log and,
  // if a webhook is configured, to monitoring.
  captureError(err, { scope: "api-auth" });
  return { ok: false, response: NextResponse.json({ error: "Request failed" }, { status: 500 }) };
}

/** Signed in, nothing more. */
export async function guard(): Promise<Guarded<null>> {
  try {
    return { ok: true, user: await requireApiUser(), extra: null };
  } catch (err) {
    return deny(err);
  }
}

/** Signed in and a member of the org owning `siteId`. */
export async function guardSite(siteId: string): Promise<Guarded<{ siteId: string }>> {
  try {
    const user = await requireApiUser();
    await requireSiteAccess(user.id, siteId);
    return { ok: true, user, extra: { siteId } };
  } catch (err) {
    return deny(err);
  }
}

/** Signed in and able to reach the site that owns this page. */
export async function guardPage(pageId: string): Promise<Guarded<{ siteId: string }>> {
  try {
    const user = await requireApiUser();
    const siteId = await requirePageAccess(user.id, pageId);
    return { ok: true, user, extra: { siteId } };
  } catch (err) {
    return deny(err);
  }
}

/** Signed in and able to reach the site that owns this component. */
export async function guardComponent(componentId: string): Promise<Guarded<{ siteId: string }>> {
  try {
    const user = await requireApiUser();
    const siteId = await requireComponentAccess(user.id, componentId);
    return { ok: true, user, extra: { siteId } };
  } catch (err) {
    return deny(err);
  }
}

/** Guard by RELEASE id — resolve to its site, then check membership. */
export async function guardRelease(releaseId: string): Promise<Guarded<{ siteId: string }>> {
  try {
    const user = await requireApiUser();
    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { siteId: true },
    });
    // Same answer for "missing" and "not yours" — otherwise this endpoint
    // becomes a way to test whether a release id exists.
    if (!release) throw new AuthError(403, "No access to this release");
    await requireSiteAccess(user.id, release.siteId);
    return { ok: true, user, extra: { siteId: release.siteId } };
  } catch (err) {
    return deny(err);
  }
}

/** Guard by PRODUCT id. */
export async function guardProduct(productId: string): Promise<Guarded<{ siteId: string }>> {
  try {
    const user = await requireApiUser();
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { siteId: true },
    });
    if (!product) throw new AuthError(403, "No access to this product");
    await requireSiteAccess(user.id, product.siteId);
    return { ok: true, user, extra: { siteId: product.siteId } };
  } catch (err) {
    return deny(err);
  }
}

/** Guard by MEDIA id — resolve to its site, then check membership. */
export async function guardMedia(mediaId: string): Promise<Guarded<{ siteId: string }>> {
  try {
    const user = await requireApiUser();
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      select: { siteId: true },
    });
    // Same 403 for "missing" and "not yours" — see the note on guardRelease.
    if (!media) throw new AuthError(403, "No access to this image");
    await requireSiteAccess(user.id, media.siteId);
    return { ok: true, user, extra: { siteId: media.siteId } };
  } catch (err) {
    return deny(err);
  }
}

/** Guard by POST id — resolve to its site, then check membership. */
export async function guardPost(postId: string): Promise<Guarded<{ siteId: string }>> {
  try {
    const user = await requireApiUser();
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { siteId: true },
    });
    if (!post) throw new AuthError(403, "No access to this post");
    await requireSiteAccess(user.id, post.siteId);
    return { ok: true, user, extra: { siteId: post.siteId } };
  } catch (err) {
    return deny(err);
  }
}

/** Guard by FORM SUBMISSION id — resolve to its site, then check membership. */
export async function guardFormSubmission(id: string): Promise<Guarded<{ siteId: string }>> {
  try {
    const user = await requireApiUser();
    const submission = await prisma.formSubmission.findUnique({
      where: { id },
      select: { siteId: true },
    });
    // Same 403 for "missing" and "not yours" — see the note on guardRelease.
    if (!submission) throw new AuthError(403, "No access to this submission");
    await requireSiteAccess(user.id, submission.siteId);
    return { ok: true, user, extra: { siteId: submission.siteId } };
  } catch (err) {
    return deny(err);
  }
}
