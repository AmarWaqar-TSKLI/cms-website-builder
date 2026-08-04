/**
 * Sitemap for a hosted site — /s/<slug>/sitemap.xml. A static segment beats the
 * page catch-all, so this coexists with the [[...rest]] route untouched.
 */
import { siteBySlug, loadRelease } from "@/lib/runtime/release";
import { sitemapXml } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await siteBySlug(slug);
  if (!site?.liveReleaseId) return new Response("Not found", { status: 404 });
  const release = await loadRelease(site.liveReleaseId);
  if (!release) return new Response("Not found", { status: 404 });

  const xml = sitemapXml(release, new URL(req.url).origin, `/s/${slug}`);
  return new Response(xml, {
    headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=300" },
  });
}
