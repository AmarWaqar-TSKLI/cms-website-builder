/**
 * Sitemap on a custom domain — the middleware rewrites <domain>/sitemap.xml
 * here. The public origin is the domain itself, so URLs are absolute and real.
 */
import { siteByHost, loadRelease } from "@/lib/runtime/release";
import { sitemapXml } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const domain = decodeURIComponent(host);
  const site = await siteByHost(domain);
  if (!site?.liveReleaseId) return new Response("Not found", { status: 404 });
  const release = await loadRelease(site.liveReleaseId);
  if (!release) return new Response("Not found", { status: 404 });

  const xml = sitemapXml(release, `https://${domain.split(":")[0]}`);
  return new Response(xml, {
    headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=300" },
  });
}
