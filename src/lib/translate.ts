/**
 * AI TRANSLATE — turn a site into a multi-locale site in one command.
 *
 * The whole system composing itself again, like rebrand (lib/rebrand.ts): the
 * site's words live in component drafts, `rewriteCopy` rewrites text for the SAME
 * node ids only (here the "rewrite" is a translation), and `publishSite` snapshots
 * everything into ONE release.
 *
 * What it produces: for each target locale, a translated COPY of every page under
 * a /<locale> path prefix (/es, /es/about…), built exactly like a branch fork —
 * components copied with node ids preserved, @component references remapped to the
 * copies — but with the text translated. A language switcher is added to the nav.
 *
 * Why this needs no serving changes: a page is addressed by path, and publish is
 * site-wide. New locale pages are ordinary pages in the release, so they serve at
 * /s/<slug>/es AND on a custom domain, and one rollback removes every locale at
 * once — because it is exactly one release.
 */
import { prisma } from "./db";
import { getSchema, walk } from "./registry";
import {
  SHARED_COMPONENT_TYPE,
  componentIdOf,
  reachableComponentIds,
} from "./shared-components";
import type { PageBody, PageNode } from "./registry/types";
import { asLayout, asTokens } from "./theme";
import { toJson } from "./json";
import { rewriteCopy, type CopyField } from "./ai";
import { publishSite, type PublishResult } from "./publish";

export interface Locale {
  code: string;
  name: string; // English name (for the AI instruction)
  native: string; // shown in the switcher
}

/** The languages offered. Codes double as the URL prefix (/es, /fr…). */
export const LOCALES: Locale[] = [
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "ar", name: "Arabic", native: "العربية" },
];

const LOCALE_CODES = new Set(LOCALES.map((l) => l.code));
const EMPTY: PageBody = { version: 1, root: [] };

const localeByCode = (code: string) => LOCALES.find((l) => l.code === code);

/** First path segment, e.g. "/es/about" → "es". */
function firstSegment(path: string): string {
  return path.replace(/^\/+/, "").split("/")[0] ?? "";
}

/** A page that is itself a translation (so we never translate translations). */
function isLocalePath(path: string): boolean {
  return LOCALE_CODES.has(firstSegment(path));
}

function splitNs(id: string): [string, string] | null {
  const at = id.indexOf("::");
  return at < 0 ? null : [id.slice(0, at), id.slice(at + 2)];
}

/** Editable text (text/textarea) props of a node, per its schema. */
function textFields(node: PageNode): Record<string, string> {
  const schema = getSchema(node.type);
  if (!schema) return {};
  const out: Record<string, string> = {};
  for (const [k, def] of Object.entries(schema.props)) {
    if (def.kind === "text" || def.kind === "textarea") {
      const v = node.props?.[k];
      if (typeof v === "string" && v.trim()) out[k] = v;
    }
  }
  return out;
}

/** Merge prop patches (nodeId → patch) into a tree; structure untouched. */
function applyEdits(nodes: PageNode[], edits: Map<string, Record<string, string>>): PageNode[] {
  return nodes.map((n) => ({
    ...n,
    props: edits.get(n.id) ? { ...n.props, ...edits.get(n.id) } : n.props,
    children: n.children?.length ? applyEdits(n.children, edits) : n.children,
  }));
}

/** New body with every @component ref repointed via the old→new id map. */
function remapRefs(body: PageBody, idMap: Map<string, string>): PageBody {
  const remap = (nodes: PageNode[]): PageNode[] =>
    nodes.map((n) => {
      let props = n.props;
      if (n.type === SHARED_COMPONENT_TYPE) {
        const cid = componentIdOf(n);
        const mapped = cid ? idMap.get(cid) : undefined;
        if (mapped) props = { ...n.props, componentId: mapped };
      }
      return { ...n, props, children: n.children?.length ? remap(n.children) : n.children };
    });
  return { ...body, root: remap(body.root ?? []) };
}

/**
 * Translate a batch of fields, chunked so no single request is truncated. A
 * failed chunk is skipped (those fields keep their source text) rather than
 * failing the whole run — a partial translation still ships.
 */
async function translateFields(
  fields: CopyField[],
  languageName: string,
  siteName?: string,
): Promise<Map<string, Record<string, string>>> {
  const instruction = `Translate every text value into ${languageName}. Keep it natural and idiomatic, preserve the tone and roughly the length, and do NOT translate brand names, product names or proper nouns. Return the SAME ids and field names, with the values translated.`;
  const out = new Map<string, Record<string, string>>();

  let batch: CopyField[] = [];
  let size = 0;
  const flush = async () => {
    if (!batch.length) return;
    const current = batch;
    batch = [];
    size = 0;
    try {
      const edits = await rewriteCopy(current, instruction, siteName);
      for (const e of edits) out.set(e.id, { ...(out.get(e.id) ?? {}), ...e.props });
    } catch {
      /* skip this chunk — its fields stay in the source language */
    }
  };

  for (const f of fields) {
    const s = JSON.stringify(f).length;
    if (size + s > 8000 && batch.length) await flush();
    batch.push(f);
    size += s;
  }
  await flush();
  return out;
}

export interface TranslateResult extends PublishResult {
  localesCreated: string[];
  localesSkipped: string[];
  pagesCreated: number;
  fieldsTranslated: number;
}

export async function translateSite(
  siteId: string,
  userId: string,
  codes: string[],
): Promise<TranslateResult> {
  const wanted = [...new Set(codes)].map(localeByCode).filter((l): l is Locale => !!l);
  if (!wanted.length) throw new Error("No valid languages selected.");

  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { name: true } });
  const siteName = site?.name ?? undefined;

  const [pages, components] = await Promise.all([
    prisma.page.findMany({ where: { siteId, deletedAt: null }, include: { draft: true } }),
    prisma.component.findMany({ where: { siteId, deletedAt: null }, include: { draft: true } }),
  ]);

  const bodyById: Record<string, PageBody> = {};
  const componentById = new Map<string, (typeof components)[number]>();
  for (const c of components) {
    bodyById[c.id] = (c.draft?.body ?? EMPTY) as PageBody;
    componentById.set(c.id, c);
  }

  const sourcePages = pages.filter((p) => !isLocalePath(p.path) && p.draft);
  if (!sourcePages.length) throw new Error("This site has no pages to translate.");

  // Exactly the components the source pages use (excludes any prior locale copies).
  const sourceBodies = sourcePages.map((p) => (p.draft!.body ?? EMPTY) as PageBody);
  const reachable = reachableComponentIds(sourceBodies, bodyById).filter((id) =>
    componentById.has(id),
  );

  const existingPaths = new Set(pages.map((p) => p.path));
  const localesCreated: string[] = [];
  const localesSkipped: string[] = [];
  let pagesCreated = 0;
  let fieldsTranslated = 0;

  for (const locale of wanted) {
    if (existingPaths.has(`/${locale.code}`)) {
      localesSkipped.push(locale.code);
      continue;
    }

    // 1. Gather every translatable field (component text + page titles).
    const fields: CopyField[] = [];
    for (const cid of reachable) {
      const body = bodyById[cid];
      walk(body.root ?? [], (n) => {
        const text = textFields(n);
        if (Object.keys(text).length) fields.push({ id: `${cid}::${n.id}`, type: n.type, props: text });
      });
    }
    for (const p of sourcePages) {
      if (p.title?.trim()) fields.push({ id: `T:${p.id}`, type: "Title", props: { title: p.title } });
    }

    // 2. Translate.
    const edits = await translateFields(fields, locale.name, siteName);
    fieldsTranslated += edits.size;

    // 3. Copy each reachable component, translated, into a new component.
    const idMap = new Map<string, string>();
    for (const cid of reachable) {
      const src = componentById.get(cid)!;
      const body = bodyById[cid];
      const nodeEdits = new Map<string, Record<string, string>>();
      walk(body.root ?? [], (n) => {
        const e = edits.get(`${cid}::${n.id}`);
        if (e) nodeEdits.set(n.id, e);
      });
      const translatedBody: PageBody = { ...body, root: applyEdits(body.root ?? [], nodeEdits) };
      const created = await prisma.component.create({
        data: {
          siteId,
          name: src.name ? `${src.name} · ${locale.code}` : null,
          kind: src.kind,
          icon: src.icon,
          draft: { create: { updatedBy: userId, lockVersion: 1, body: toJson(translatedBody) } },
        },
      });
      idMap.set(cid, created.id);
    }

    // 3b. Repoint any @component references inside the copies to the new ids.
    for (const [oldId, newId] of idMap) {
      const body = bodyById[oldId];
      if (!body?.root?.some((n) => n.type === SHARED_COMPONENT_TYPE)) continue;
      await prisma.componentDraft.update({
        where: { componentId: newId },
        data: { body: toJson(remapRefs((await currentBody(newId)) ?? body, idMap)) },
      });
    }

    // 4. Create the locale pages, refs remapped to the copied components.
    for (const p of sourcePages) {
      const localePath = `/${locale.code}` + (p.path === "/" ? "" : p.path);
      const title = edits.get(`T:${p.id}`)?.title ?? p.title;
      const page = await prisma.page.create({
        data: { siteId, path: localePath, type: p.type, title },
      });
      const body = remapRefs((p.draft!.body ?? EMPTY) as PageBody, idMap);
      await prisma.pageDraft.create({ data: { pageId: page.id, updatedBy: userId, body: toJson(body) } });
      pagesCreated++;
    }

    localesCreated.push(locale.code);
    existingPaths.add(`/${locale.code}`);
  }

  // 5. Add a language switcher to the nav (once), so visitors can move between
  // locales. Written as a new theme revision so it's versioned and rolls back.
  if (localesCreated.length) {
    await addLocaleSwitcher(siteId, localesCreated);
  }

  // 6. Publish everything — all locales go live as ONE release.
  const result = await publishSite(
    siteId,
    userId,
    `AI translate: ${localesCreated.join(", ") || "no new locales"}`.slice(0, 200),
  );

  return { ...result, localesCreated, localesSkipped, pagesCreated, fieldsTranslated };
}

/** Read a component draft's current body (used after the first write). */
async function currentBody(componentId: string): Promise<PageBody | null> {
  const draft = await prisma.componentDraft.findUnique({ where: { componentId } });
  return (draft?.body ?? null) as PageBody | null;
}

/** Append locale links to the theme nav, if not already present. */
async function addLocaleSwitcher(siteId: string, codes: string[]): Promise<void> {
  const theme = await prisma.theme.findFirst({ where: { siteId } });
  if (!theme) return;
  const latest = await prisma.themeRevision.findFirst({
    where: { themeId: theme.id },
    orderBy: { versionNo: "desc" },
  });
  const layout = asLayout(latest?.layout);
  const links = [...(layout.nav?.links ?? [])];
  const have = new Set(links.map((l) => l.href));
  for (const code of codes) {
    const href = `/${code}`;
    if (!have.has(href)) links.push({ label: code.toUpperCase(), href });
  }
  const nextLayout = { ...layout, nav: { ...layout.nav, links } };
  const rev = await prisma.themeRevision.create({
    data: {
      themeId: theme.id,
      versionNo: (latest?.versionNo ?? 0) + 1,
      tokens: toJson(asTokens(latest?.tokens)),
      layout: toJson(nextLayout),
    },
  });
  await prisma.theme.update({ where: { id: theme.id }, data: { currentRevisionId: rev.id } });
}
