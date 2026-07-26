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
import { prisma } from "./db";
import {
  AuthError,
  requireComponentAccess,
  requirePageAccess,
  requireSiteAccess,
  requireUser,
  type SessionUser,
} from "./auth";

export type Guarded<T> = { ok: true; user: SessionUser; extra: T } | { ok: false; response: NextResponse };

function deny(err: unknown): { ok: false; response: NextResponse } {
  if (err instanceof AuthError) {
    return { ok: false, response: NextResponse.json({ error: err.message }, { status: err.status }) };
  }
  // Never leak an internal message to the caller; the detail goes to the log.
  console.error("[api-auth]", err);
  return { ok: false, response: NextResponse.json({ error: "Request failed" }, { status: 500 }) };
}

/** Signed in, nothing more. */
export async function guard(): Promise<Guarded<null>> {
  try {
    return { ok: true, user: await requireUser(), extra: null };
  } catch (err) {
    return deny(err);
  }
}

/** Signed in and a member of the org owning `siteId`. */
export async function guardSite(siteId: string): Promise<Guarded<{ siteId: string }>> {
  try {
    const user = await requireUser();
    await requireSiteAccess(user.id, siteId);
    return { ok: true, user, extra: { siteId } };
  } catch (err) {
    return deny(err);
  }
}

/** Signed in and able to reach the site that owns this page. */
export async function guardPage(pageId: string): Promise<Guarded<{ siteId: string }>> {
  try {
    const user = await requireUser();
    const siteId = await requirePageAccess(user.id, pageId);
    return { ok: true, user, extra: { siteId } };
  } catch (err) {
    return deny(err);
  }
}

/** Signed in and able to reach the site that owns this component. */
export async function guardComponent(componentId: string): Promise<Guarded<{ siteId: string }>> {
  try {
    const user = await requireUser();
    const siteId = await requireComponentAccess(user.id, componentId);
    return { ok: true, user, extra: { siteId } };
  } catch (err) {
    return deny(err);
  }
}

/** Guard by RELEASE id — resolve to its site, then check membership. */
export async function guardRelease(releaseId: string): Promise<Guarded<{ siteId: string }>> {
  try {
    const user = await requireUser();
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
    const user = await requireUser();
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
    const user = await requireUser();
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
