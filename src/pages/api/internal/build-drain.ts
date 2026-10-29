/**
 * Inline build, run where the static renderer can actually render.
 *
 * App Router route handlers are bundled for React Server Components, where a
 * "use client" module (AddToCart, FormIsland) becomes a client reference that
 * renderToStaticMarkup cannot call — so a page with a product grid fails to
 * build there. Pages Router API routes get no such transform: the islands are
 * plain components again, exactly as the standalone worker sees them.
 *
 * Publish calls this after it has responded (see lib/inline-build.ts). It only
 * claims jobs already in build_jobs, so calling it twice is harmless.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { drainBuildJobs } from "@/lib/jobs";

export const config = { maxDuration: 60 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const secret = process.env.BUILD_DRAIN_SECRET;
  if (!secret || req.headers["x-drain-secret"] !== secret) return res.status(401).end();

  const built = await drainBuildJobs((msg) =>
    console.log(`[${new Date().toISOString()}] [build-drain] ${msg}`),
  );
  res.status(200).json({ ok: true, built });
}
