/**
 * The custom-domain destination. Reached only via the middleware rewrite.
 *
 * Identical serving path to /s/:slug — same pointer lookup, same file read,
 * same bytes. A custom domain is a different way to ADDRESS a site, not a
 * different way to build or serve one. One artifact, many addresses. (D9)
 *
 * (Not named `_host`: App Router treats underscore-prefixed folders as private
 * and never routes to them.)
 */
import { findSiteByHost, serveArtifact } from "@/lib/serve";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ host: string; rest?: string[] }> },
) {
  const { host, rest } = await params;
  const decoded = decodeURIComponent(host);

  const site = await findSiteByHost(decoded);
  if (!site) {
    return new Response(unknownDomainPage(decoded), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const result = await serveArtifact(site, (rest ?? []).join("/"));
  return new Response(result.body as BodyInit, {
    status: result.status,
    headers: { ...result.headers, "X-CMS-Matched-Domain": site.customDomain ?? "" },
  });
}

function unknownDomainPage(host: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Domain not configured</title></head>
<body style="margin:0;background:#08080a;color:#e8e8ef;font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh">
<div style="max-width:560px;padding:40px;text-align:center">
<h1 style="font-size:24px;font-weight:650;margin:0 0 12px">Domain not configured</h1>
<p style="color:#9a9aad;line-height:1.65">No site has <code style="color:#c8c8d4">${host}</code> as its custom domain.</p>
<p style="color:#6e6e80;font-size:13px;line-height:1.6">The seeded site answers to <code>acme.test</code>. Try
<a href="/?host=acme.test" style="color:#a89dff">/?host=acme.test</a>.</p>
</div></body></html>`;
}
