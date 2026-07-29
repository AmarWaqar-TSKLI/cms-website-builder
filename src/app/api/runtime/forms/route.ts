/**
 * THE RUNTIME API for forms — the D8 story, again, for messages instead of carts.
 *
 * A published page (hosted, or a static file unzipped onto someone else's host,
 * or opened from file://) posts here when a visitor submits a contact or
 * newsletter form. A `form_submissions` row appears. The page's HTML is not
 * touched. "Static" means no server rendered it — not that it is inert.
 *
 * CORS is wide open for exactly the reason the orders endpoint's is: an exported
 * artifact is expected to run on a different origin, or none at all.
 *
 * Unauthenticated by design — a visitor is not a user. The safety here is not a
 * login, it is bounds: the payload is capped and cleaned (lib/forms.ts) and a
 * honeypot quietly swallows the obvious bots.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { cleanSubmission, isHoneypotTripped } from "@/lib/forms";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  let payload: { siteId?: unknown; formKey?: unknown; formName?: unknown; fields?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  const siteId = typeof payload.siteId === "string" ? payload.siteId : "";
  const formKey = typeof payload.formKey === "string" ? payload.formKey.trim() : "";
  const formName = typeof payload.formName === "string" ? payload.formName.slice(0, 120) : "";
  if (!siteId || !formKey) {
    return NextResponse.json({ error: "siteId and formKey are required" }, { status: 400, headers: CORS });
  }

  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!site) return NextResponse.json({ error: "Unknown site" }, { status: 404, headers: CORS });

  // A bot that filled the hidden field: tell it "ok", store nothing. Returning an
  // error would only teach it to try again without the giveaway.
  if (isHoneypotTripped(payload.fields)) {
    return NextResponse.json({ ok: true }, { headers: CORS });
  }

  const clean = cleanSubmission(payload.fields);
  if (!clean) {
    return NextResponse.json({ error: "Please fill in the form before sending." }, { status: 400, headers: CORS });
  }

  const submission = await prisma.formSubmission.create({
    data: {
      siteId,
      formKey: formKey.slice(0, 80),
      formName,
      data: clean.fields as Prisma.InputJsonValue,
      email: clean.email,
    },
    select: { id: true },
  });

  // Live data changes; the artifact does not. A submission is Tier-2 — it will
  // not roll back when the site's appearance does.
  await logActivity({
    siteId,
    actorName: "A visitor",
    action: "form.submitted",
    entityType: "form",
    entityId: submission.id,
    summary: `A visitor sent the “${formName || formKey}” form`,
  });

  return NextResponse.json(
    { ok: true, id: submission.id, note: "Written to `form_submissions`. The page was not modified." },
    { headers: CORS },
  );
}
