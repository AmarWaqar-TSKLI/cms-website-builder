/**
 * GET /s/:slug/*  — the hosted destination.
 *
 * Three lines of work: look up the pointer, read the file, return the bytes.
 * If this route ever needed the component registry, the architecture would be
 * broken.
 */
import { findSiteBySlug, serveArtifact } from "@/lib/serve";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; rest?: string[] }> },
) {
  const { slug, rest } = await params;

  const site = await findSiteBySlug(slug);
  if (!site) {
    return new Response(`No site with slug "${slug}"`, {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const result = await serveArtifact(site, (rest ?? []).join("/"));
  return new Response(result.body as BodyInit, {
    status: result.status,
    headers: result.headers,
  });
}
