/**
 * EXPORT TO CODE — a real, buildable Next.js project from a release.
 *
 * The static/container exports (export.ts) hand back the pre-rendered artifact
 * byte-for-byte. This one is different in intent: it emits a **source project** a
 * developer can open, run (`npm i && npm run dev`), edit and deploy — the
 * "no lock-in" promise made concrete.
 *
 * Faithfulness without a reverse-compiler: every block is rendered to HTML by the
 * SAME renderer the site uses (renderBody → renderToStaticMarkup), then emitted
 * as its own React section component. So the output is pixel-identical to the
 * live site AND has a real file structure (app router pages, one component per
 * section, theme in globals.css) the developer actually edits. Tailwind is wired
 * up and ready to use, with preflight off so it never fights the site's own reset.
 */
import React from "react";
import archiver from "archiver";
import { PassThrough } from "node:stream";
import { prisma } from "./db";
import { loadRelease, type LoadedRelease } from "./runtime/release";
import { renderBody } from "./render";
import { SiteNav, SiteFooter, tokensToCss, BASE_CSS } from "../components/site/chrome";
import { isComponentRef, componentIdOf } from "./shared-components";
import type { PageNode, RenderContext } from "./registry/types";

export interface NextExportBundle {
  filename: string;
  bytes: Buffer;
  releaseId: string;
  versionNo: number;
}

/**
 * react-dom/server is loaded via a dynamic import ON PURPOSE: a STATIC import of
 * it anywhere reachable from an app route fails the Next build (it must not enter
 * the RSC/client graph). Deferring it to call time keeps this module importable
 * by the route while the actual markup rendering happens server-side in Node.
 */
type RenderFn = (el: React.ReactElement) => string;
let _render: RenderFn | null = null;
async function getRenderer(): Promise<RenderFn> {
  if (!_render) _render = (await import("react-dom/server")).renderToStaticMarkup as RenderFn;
  return _render;
}

function exportContext(rel: LoadedRelease): RenderContext {
  return {
    siteId: rel.siteId,
    siteName: rel.siteName,
    releaseId: rel.id,
    runtimeApi: "",
    tokens: rel.tokens,
    products: rel.data.products,
    collections: rel.data.collections,
    media: rel.data.media,
    posts: rel.data.posts ?? {},
    components: rel.components,
    basePath: "", // a standalone app is served at the root
  };
}

function toStaticHtml(render: RenderFn, nodes: PageNode[], ctx: RenderContext): string {
  return render(React.createElement(React.Fragment, null, renderBody(nodes, ctx)));
}

/** "Hero", "Our Team" → "Hero", "OurTeam"; anything empty → "Section". */
function pascal(raw: string): string {
  const cleaned = (raw || "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  const safe = cleaned.replace(/^[^a-zA-Z]+/, "");
  return safe || "Section";
}

/** app path → directory under app/. "/" → "", "/about" → "about". */
function pageDir(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

/** A section component file: renders its block's HTML, escaping-proof via JSON. */
function sectionFile(html: string): string {
  return `// Rendered from your site's block, pixel-identical. Edit freely.
export default function Section() {
  return <div dangerouslySetInnerHTML={{ __html: ${JSON.stringify(html)} }} />;
}
`;
}

export async function buildNextExport(releaseId: string): Promise<NextExportBundle> {
  const meta = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { site: true },
  });
  if (!meta) throw new Error("Release not found");
  if (meta.status !== "ready") {
    throw new Error(`Release v${meta.versionNo} is ${meta.status} — publish it before exporting.`);
  }

  const rel = await loadRelease(releaseId);
  if (!rel) throw new Error("Release is not ready to render.");
  const ctx = exportContext(rel);
  const render = await getRenderer();

  const archive = archiver("zip", { zlib: { level: 9 } });
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on("data", (c: Buffer) => chunks.push(c));
  archive.pipe(sink);
  const add = (name: string, contents: string) => archive.append(contents, { name });

  const slug = rel.siteSlug;
  const stem = `${slug}-nextjs`;
  const root = `${stem}/`;

  // ── scaffold ──────────────────────────────────────────────────────────────
  add(`${root}package.json`, packageJson(slug));
  add(`${root}next.config.mjs`, NEXT_CONFIG);
  add(`${root}tsconfig.json`, TSCONFIG);
  add(`${root}tailwind.config.ts`, TAILWIND_CONFIG);
  add(`${root}postcss.config.mjs`, POSTCSS_CONFIG);
  add(`${root}next-env.d.ts`, NEXT_ENV);
  add(`${root}.gitignore`, GITIGNORE);
  add(`${root}README.md`, readme(rel.siteName, rel.versionNo, releaseId));

  // ── globals.css: Tailwind + the site's theme + reset ────────────────────────
  add(
    `${root}app/globals.css`,
    `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n${tokensToCss(rel.tokens)}\n${BASE_CSS}\n`,
  );

  // ── chrome (nav + footer), rendered once and reused by the layout ───────────
  const navHtml = render(
    React.createElement(SiteNav, { layout: rel.layout, tokens: rel.tokens, basePath: "" }),
  );
  const footerHtml = render(
    React.createElement(SiteFooter, { layout: rel.layout, tokens: rel.tokens, basePath: "" }),
  );
  add(
    `${root}components/SiteChrome.tsx`,
    `// The site nav + footer that wrap every page. Rendered from your theme.
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: ${JSON.stringify(navHtml)} }} />
      <main>{children}</main>
      <div dangerouslySetInnerHTML={{ __html: ${JSON.stringify(footerHtml)} }} />
    </>
  );
}
`,
  );

  add(
    `${root}app/layout.tsx`,
    `import "./globals.css";
import SiteChrome from "@/components/SiteChrome";

export const metadata = { title: ${JSON.stringify(rel.siteName)} };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
`,
  );

  // ── one page per path, one component per top-level section ───────────────────
  const pages = Object.values(rel.pages).sort((a, b) => a.path.localeCompare(b.path));
  const usedNames = new Set<string>();

  for (const page of pages) {
    const dir = pageDir(page.path);
    const compDir = dir ? `sections/${dir.replace(/\//g, "-")}` : "sections/home";
    const imports: string[] = [];
    const elements: string[] = [];

    page.root.forEach((node, i) => {
      const baseRaw =
        isComponentRef(node) && componentIdOf(node)
          ? rel.components[componentIdOf(node)!]?.name || "Section"
          : node.type;
      let name = pascal(baseRaw);
      // Unique per project so imports never collide across pages.
      let unique = name;
      let n = 2;
      while (usedNames.has(unique)) unique = `${name}${n++}`;
      usedNames.add(unique);
      name = unique;

      const html = toStaticHtml(render, [node], ctx);
      add(`${root}components/${compDir}/${name}.tsx`, sectionFile(html));
      const importPath = `@/components/${compDir}/${name}`;
      imports.push(`import ${name} from ${JSON.stringify(importPath)};`);
      elements.push(`      <${name} />`);
    });

    const pagePath = dir ? `app/${dir}/page.tsx` : "app/page.tsx";
    add(
      `${root}${pagePath}`,
      `${imports.join("\n")}

export const metadata = { title: ${JSON.stringify(`${page.title} — ${rel.siteName}`)} };

export default function Page() {
  return (
    <>
${elements.join("\n") || "      {/* no sections */}"}
    </>
  );
}
`,
    );
  }

  const done = new Promise<void>((resolve, reject) => {
    sink.on("end", () => resolve());
    archive.on("error", reject);
  });
  await archive.finalize();
  await done;

  return {
    filename: `${stem}.zip`,
    bytes: Buffer.concat(chunks),
    releaseId: rel.id,
    versionNo: rel.versionNo,
  };
}

/* ── scaffold file contents ─────────────────────────────────────────────────── */

function packageJson(slug: string): string {
  return JSON.stringify(
    {
      name: slug || "exported-site",
      version: "1.0.0",
      private: true,
      scripts: { dev: "next dev", build: "next build", start: "next start" },
      dependencies: { next: "15.1.3", react: "19.0.0", "react-dom": "19.0.0" },
      devDependencies: {
        typescript: "^5.7.2",
        "@types/node": "^22.10.2",
        "@types/react": "^19.0.2",
        "@types/react-dom": "^19.0.2",
        tailwindcss: "^3.4.17",
        postcss: "^8.4.49",
        autoprefixer: "^10.4.20",
      },
    },
    null,
    2,
  );
}

const NEXT_CONFIG = `/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
`;

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      plugins: [{ name: "next" }],
      paths: { "@/*": ["./*"] },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"],
  },
  null,
  2,
);

const TAILWIND_CONFIG = `import type { Config } from "tailwindcss";

// Preflight is OFF: your site ships its own reset (in globals.css), so Tailwind
// utilities are available for new work without restyling the exported markup.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
`;

const POSTCSS_CONFIG = `export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
`;

const NEXT_ENV = `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`;

const GITIGNORE = `/node_modules
/.next
/out
*.log
.DS_Store
`;

function readme(siteName: string, version: number, releaseId: string): string {
  return `# ${siteName} — exported as Next.js

Release \`${releaseId}\` (v${version}).

A real Next.js (App Router) + TypeScript project, generated from your site. It is
yours — edit anything, deploy it anywhere.

## Run it

\`\`\`bash
npm install
npm run dev      # http://localhost:3000
\`\`\`

## How it's laid out

- \`app/\` — one folder per page (\`app/page.tsx\` is your home page).
- \`components/sections/\` — one component per section, rendered pixel-identical to
  your live site. Start editing here.
- \`components/SiteChrome.tsx\` — the nav + footer that wrap every page.
- \`app/globals.css\` — your theme, as CSS variables, plus Tailwind.

## Tailwind

Tailwind is set up and ready — add utility classes anywhere. Its \`preflight\`
reset is intentionally disabled so it doesn't fight the styles your site already
ships with.

> Images are embedded inline, so the project renders with no external assets.
`;
}
