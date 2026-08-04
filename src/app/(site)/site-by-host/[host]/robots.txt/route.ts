/**
 * robots.txt on a custom domain — only meaningful at a domain root, which a
 * custom domain is (the /s/<slug> form lives under the app's origin, where the
 * app's own robots policy applies).
 */
import { siteByHost } from "@/lib/runtime/release";
import { robotsTxt } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const domain = decodeURIComponent(host);
  const site = await siteByHost(domain);
  if (!site) return new Response("Not found", { status: 404 });

  return new Response(robotsTxt(`https://${domain.split(":")[0]}`), {
    headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=3600" },
  });
}
