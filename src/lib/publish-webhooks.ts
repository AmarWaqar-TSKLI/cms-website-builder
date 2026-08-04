/**
 * Firing publish webhooks — the push half of the headless story.
 *
 * The Content API already can't drift from the site (same pointer, same
 * release); this tells a consumer WHEN to look. One event covers publish and
 * rollback alike, because to a consumer they are the same fact: "what's live
 * changed — refetch". The payload names the immutable release id, so the
 * consumer can verify what it fetched is what it was told about.
 *
 * Best-effort by contract: a consumer's broken endpoint must never fail a
 * build or block a rollback. Each delivery is signed
 * (X-CMS-Signature: sha256=<hmac-sha256(secret, body)>) so the receiver can
 * refuse forgeries.
 */
import { createHmac } from "node:crypto";
import { prisma } from "./db";
import { captureError } from "./monitor";

export interface LiveChangedEvent {
  event: "site.live_changed";
  reason: "publish" | "rollback";
  siteId: string;
  releaseId: string;
  version: number;
  at: string;
}

export async function fireLiveChanged(
  siteId: string,
  releaseId: string,
  version: number,
  reason: "publish" | "rollback",
): Promise<{ delivered: number; failed: number }> {
  const hooks = await prisma.webhook.findMany({
    where: { siteId, disabledAt: null },
    select: { id: true, url: true, secret: true },
  });
  if (!hooks.length) return { delivered: 0, failed: 0 };

  const payload: LiveChangedEvent = {
    event: "site.live_changed",
    reason,
    siteId,
    releaseId,
    version,
    at: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);

  let delivered = 0;
  let failed = 0;
  await Promise.all(
    hooks.map(async (hook) => {
      try {
        const signature = createHmac("sha256", hook.secret).update(body, "utf8").digest("hex");
        const res = await fetch(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CMS-Signature": `sha256=${signature}`,
            "X-CMS-Event": payload.event,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) delivered++;
        else {
          failed++;
          captureError(new Error(`webhook ${hook.id} returned ${res.status}`), {
            scope: "publish-webhook",
            siteId,
          });
        }
      } catch (err) {
        failed++;
        captureError(err, { scope: "publish-webhook", siteId });
      }
    }),
  );
  return { delivered, failed };
}
