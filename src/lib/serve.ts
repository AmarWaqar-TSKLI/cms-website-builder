/**
 * LIVE SERVING — the hosting half of D9. (non-negotiable #7)
 *
 * This module reads a file off disk and returns its bytes. That is the whole
 * request path for a published page. It does not import the registry, does not
 * touch page_revisions, and could not re-render a page if it wanted to.
 *
 * The only database query is the pointer lookup: which release is this site
 * currently serving? Everything after that is filesystem.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./db";
// Note: from ./paths, NOT ./build. This module has no path to a renderer.
import { releaseDir } from "./paths";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

export interface SiteLookup {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  liveReleaseId: string | null;
}

export async function findSiteBySlug(slug: string): Promise<SiteLookup | null> {
  return prisma.site.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, customDomain: true, liveReleaseId: true },
  });
}

/**
 * Custom domain routing. The mechanism is real: an incoming Host header is
 * matched against sites.custom_domain. Only DNS and SSL are out of scope — the
 * port is stripped so "acme.test:3000" matches "acme.test".
 */
export async function findSiteByHost(host: string): Promise<SiteLookup | null> {
  const bare = host.toLowerCase().split(":")[0];
  return prisma.site.findFirst({
    where: { customDomain: { in: [host.toLowerCase(), bare] } },
    select: { id: true, name: true, slug: true, customDomain: true, liveReleaseId: true },
  });
}

/** "/", "/about", "/about/" → the file the build wrote for that path. */
function resolveFile(dir: string, subpath: string): string | null {
  const clean = subpath.replace(/^\/+|\/+$/g, "");
  const candidate = clean === "" ? "index.html" : clean;

  const full = path.resolve(dir, candidate);
  // Refuse anything that escapes the release directory.
  if (!full.startsWith(path.resolve(dir))) return null;
  return full;
}

export interface ServeResult {
  status: number;
  body: Buffer | string;
  headers: Record<string, string>;
}

export async function serveArtifact(site: SiteLookup, subpath: string): Promise<ServeResult> {
  if (!site.liveReleaseId) {
    return {
      status: 404,
      body: notPublishedPage(site),
      headers: { "Content-Type": "text/html; charset=utf-8" },
    };
  }

  const release = await prisma.release.findUnique({
    where: { id: site.liveReleaseId },
    select: { id: true, versionNo: true, status: true },
  });
  if (!release) {
    return { status: 500, body: "Live release missing", headers: { "Content-Type": "text/plain" } };
  }

  const dir = releaseDir(site.id, release.id);
  const target = resolveFile(dir, subpath);
  if (!target) {
    return { status: 400, body: "Bad path", headers: { "Content-Type": "text/plain" } };
  }

  // Directory-style URL → the index.html the build wrote inside it.
  const candidates = target.endsWith(".html") || path.extname(target) !== ""
    ? [target]
    : [path.join(target, "index.html"), `${target}.html`];

  for (const file of candidates) {
    try {
      const info = await stat(file);
      if (!info.isFile()) continue;
      const bytes = await readFile(file);
      return {
        status: 200,
        body: bytes,
        headers: {
          "Content-Type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
          // Provenance in the response headers: you can curl -I a live page and
          // see exactly which immutable release produced these bytes.
          "X-CMS-Release-Id": release.id,
          "X-CMS-Release-Version": `v${release.versionNo}`,
          "X-CMS-Served-From": "artifact-on-disk",
          "X-CMS-Rendered-At-Request-Time": "false",
          "Cache-Control": "no-store",
        },
      };
    } catch {
      /* try the next candidate */
    }
  }

  return {
    status: 404,
    body: missingPage(site, subpath, release.versionNo),
    headers: { "Content-Type": "text/html; charset=utf-8", "X-CMS-Release-Id": release.id },
  };
}

function shellPage(title: string, message: string, extra = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#08080a;color:#e8e8ef;font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh">
<div style="max-width:560px;padding:40px;text-align:center">
<h1 style="font-size:26px;font-weight:650;letter-spacing:-.02em;margin:0 0 12px">${title}</h1>
<p style="color:#9a9aad;line-height:1.65;margin:0 0 24px">${message}</p>${extra}
</div></body></html>`;
}

function notPublishedPage(site: SiteLookup): string {
  return shellPage(
    "Nothing published yet",
    `<strong>${site.name}</strong> has pages in the database but no release, so there is no artifact to serve. That is not a bug — a site is only live once a build has produced files on disk.`,
    `<a href="/dashboard" style="display:inline-block;background:#6d5cff;color:#fff;padding:11px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">Open the dashboard and publish</a>`,
  );
}

function missingPage(site: SiteLookup, subpath: string, version: number): string {
  return shellPage(
    "404",
    `No page at <code style="color:#c8c8d4">${subpath || "/"}</code> in the release currently being served (v${version}) of <strong>${site.name}</strong>.`,
    `<a href="/s/${site.slug}" style="color:#a89dff">Back to the home page</a>`,
  );
}
