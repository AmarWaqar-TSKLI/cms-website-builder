import path from "node:path";

/**
 * Artifact locations. Deliberately its own module with no React import.
 *
 * The serving path needs to know WHERE artifacts live; it must never be able to
 * reach the code that MAKES them. Keeping these three functions separate from
 * build.ts means the request path for a live page cannot import a renderer even
 * by accident — the module graph enforces non-negotiable #7.
 */
export function artifactsRoot(): string {
  return path.resolve(process.env.ARTIFACTS_DIR || "./artifacts");
}

export function releaseDir(siteId: string, releaseId: string): string {
  return path.join(artifactsRoot(), siteId, releaseId);
}

/**
 * "/" → index.html, "/about" → about/index.html.
 * Directory-index form so the artifact serves correctly from any dumb static
 * host and from file:// without URL rewriting.
 */
export function pathToFile(pagePath: string): string {
  const clean = pagePath.replace(/^\/+|\/+$/g, "");
  return clean === "" ? "index.html" : path.join(clean, "index.html");
}
