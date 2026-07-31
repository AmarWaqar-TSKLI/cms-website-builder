/**
 * BRANCHES — fork a site, diff it against its parent block-by-block, merge back.
 *
 * "Git for a no-code builder", and only possible because a page here is a typed
 * tree of blocks with STABLE node ids, not an HTML string. A fork copies every
 * component body VERBATIM — so an unchanged block keeps its id in both the branch
 * and the parent — and only remaps the component-REFERENCE ids that must change.
 * That preserved identity is what lets the diff match blocks across the fork and
 * the merge apply a change back to the exact block it came from.
 */
import { prisma } from "./db";
import { getSchema, walk } from "./registry";
import { SHARED_COMPONENT_TYPE, componentIdOf } from "./shared-components";
import type { PageBody, PageNode, ThemeTokens } from "./registry/types";
import { asLayout, asTokens } from "./theme";
import { toJson } from "./json";
import { slugify } from "./slug";
import { publishSite } from "./publish";

const EMPTY: PageBody = { version: 1, root: [] };

async function uniqueSlug(base: string): Promise<string> {
  for (let i = 1; i < 500; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const clash = await prisma.site.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) return slug;
  }
  return `${base}-${Date.now()}`;
}

/** Text (and textarea) props of a node, per its registry schema. */
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

interface FlatBlock {
  type: string;
  text: Record<string, string>;
}

/** Every block across every component body, keyed by its stable node id. */
function flattenBlocks(components: { draft: { body: unknown } | null }[]): Map<string, FlatBlock> {
  const map = new Map<string, FlatBlock>();
  for (const c of components) {
    const body = (c.draft?.body ?? null) as PageBody | null;
    if (!body?.root) continue;
    walk(body.root, (n) => {
      const text = textFields(n);
      if (Object.keys(text).length) map.set(n.id, { type: n.type, text });
    });
  }
  return map;
}

/** New body with every @component ref repointed to its copied component id. */
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

/** Merge prop patches (nodeId → patch) into a tree, structure untouched. */
function applyEdits(nodes: PageNode[], edits: Map<string, Record<string, string>>): PageNode[] {
  return nodes.map((n) => ({
    ...n,
    props: edits.get(n.id) ? { ...n.props, ...edits.get(n.id) } : n.props,
    children: n.children?.length ? applyEdits(n.children, edits) : n.children,
  }));
}

/* ── FORK ──────────────────────────────────────────────────────────────────── */

export async function forkSite(
  siteId: string,
  userId: string,
): Promise<{ id: string; name: string; slug: string }> {
  const src = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      pages: { where: { deletedAt: null }, include: { draft: true } },
      components: { where: { deletedAt: null }, include: { draft: true } },
      themes: { include: { revisions: { orderBy: { versionNo: "desc" }, take: 1 } } },
      modules: true,
    },
  });
  if (!src) throw new Error("Site not found");

  const baseName = src.name.replace(/\s*\(branch[^)]*\)\s*$/i, "");
  const site = await prisma.site.create({
    data: {
      orgId: src.orgId,
      name: `${baseName} (branch)`,
      slug: await uniqueSlug(`${src.slug}-branch`),
      parentSiteId: src.id,
    },
  });

  if (src.modules.length) {
    await prisma.siteModule.createMany({
      data: src.modules.map((m) => ({ siteId: site.id, module: m.module })),
      skipDuplicates: true,
    });
  }

  const srcTheme = src.themes[0];
  if (srcTheme) {
    const theme = await prisma.theme.create({ data: { siteId: site.id, name: srcTheme.name } });
    const rev = srcTheme.revisions[0];
    if (rev) {
      const newRev = await prisma.themeRevision.create({
        data: {
          themeId: theme.id,
          versionNo: 1,
          tokens: toJson(asTokens(rev.tokens)),
          layout: toJson(asLayout(rev.layout)),
        },
      });
      await prisma.theme.update({ where: { id: theme.id }, data: { currentRevisionId: newRev.id } });
    }
  }

  // Components copied verbatim (node ids preserved); build old→new id map.
  const idMap = new Map<string, string>();
  for (const c of src.components) {
    const newComp = await prisma.component.create({
      data: {
        siteId: site.id,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
        draft: c.draft
          ? { create: { updatedBy: userId, lockVersion: 1, body: (c.draft.body ?? EMPTY) as object } }
          : undefined,
      },
    });
    idMap.set(c.id, newComp.id);
  }

  // Pages copied, with @component refs remapped to the new component ids.
  for (const p of src.pages) {
    const page = await prisma.page.create({
      data: { siteId: site.id, path: p.path, type: p.type, title: p.title },
    });
    if (p.draft) {
      const body = remapRefs((p.draft.body ?? EMPTY) as PageBody, idMap);
      await prisma.pageDraft.create({
        data: { pageId: page.id, updatedBy: userId, body: toJson(body) },
      });
    }
  }

  return { id: site.id, name: site.name, slug: site.slug };
}

/* ── DIFF ──────────────────────────────────────────────────────────────────── */

interface DiffSite {
  id: string;
  name: string;
  parentSiteId: string | null;
  components: { draft: { body: unknown } | null }[];
  tokens: ThemeTokens;
  pagePaths: string[];
}

async function loadForDiff(siteId: string): Promise<DiffSite> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      components: { where: { deletedAt: null }, include: { draft: true } },
      pages: { where: { deletedAt: null }, select: { path: true } },
      themes: { include: { revisions: { orderBy: { versionNo: "desc" }, take: 1 } } },
    },
  });
  if (!site) throw new Error("Site not found");
  return {
    id: site.id,
    name: site.name,
    parentSiteId: site.parentSiteId,
    components: site.components,
    tokens: asTokens(site.themes[0]?.revisions[0]?.tokens),
    pagePaths: site.pages.map((p) => p.path),
  };
}

const TOKEN_LABELS: Record<string, string> = {
  colorBg: "Background",
  colorFg: "Text",
  colorAccent: "Accent",
  colorSurface: "Surface",
  colorMuted: "Muted",
  colorBorder: "Border",
  colorAccentFg: "On-accent",
  fontHeading: "Heading font",
  fontBody: "Body font",
  radius: "Corner radius",
};

export interface BranchDiff {
  branchId: string;
  branchName: string;
  parentId: string;
  parentName: string;
  changed: { nodeId: string; type: string; fields: { key: string; before: string; after: string }[] }[];
  added: { nodeId: string; type: string; sample: string }[];
  removed: { nodeId: string; type: string; sample: string }[];
  theme: { key: string; label: string; before: string; after: string }[];
  pagesAdded: string[];
  pagesRemoved: string[];
}

export async function diffBranch(branchId: string): Promise<BranchDiff> {
  const branch = await loadForDiff(branchId);
  if (!branch.parentSiteId) throw new Error("This site isn't a branch.");
  const parent = await loadForDiff(branch.parentSiteId);

  const pBlocks = flattenBlocks(parent.components);
  const bBlocks = flattenBlocks(branch.components);

  const changed: BranchDiff["changed"] = [];
  const added: BranchDiff["added"] = [];
  for (const [id, b] of bBlocks) {
    const p = pBlocks.get(id);
    if (!p) {
      added.push({ nodeId: id, type: b.type, sample: Object.values(b.text)[0] ?? "" });
      continue;
    }
    const fields = Object.entries(b.text)
      .filter(([k, v]) => (p.text[k] ?? "") !== v)
      .map(([k, v]) => ({ key: k, before: p.text[k] ?? "", after: v }));
    if (fields.length) changed.push({ nodeId: id, type: b.type, fields });
  }
  const removed: BranchDiff["removed"] = [];
  for (const [id, p] of pBlocks) {
    if (!bBlocks.has(id)) removed.push({ nodeId: id, type: p.type, sample: Object.values(p.text)[0] ?? "" });
  }

  const theme = (Object.keys(TOKEN_LABELS) as (keyof ThemeTokens)[])
    .filter((k) => parent.tokens[k] !== branch.tokens[k])
    .map((k) => ({ key: k, label: TOKEN_LABELS[k], before: parent.tokens[k], after: branch.tokens[k] }));

  const pPaths = new Set(parent.pagePaths);
  const bPaths = new Set(branch.pagePaths);

  return {
    branchId: branch.id,
    branchName: branch.name,
    parentId: parent.id,
    parentName: parent.name,
    changed,
    added,
    removed,
    theme,
    pagesAdded: [...bPaths].filter((x) => !pPaths.has(x)),
    pagesRemoved: [...pPaths].filter((x) => !bPaths.has(x)),
  };
}

/* ── MERGE ─────────────────────────────────────────────────────────────────── */

export interface MergeResult {
  parentId: string;
  blocksMerged: number;
  themeMerged: boolean;
  addedNotMerged: number;
  versionNo: number | null;
}

export async function mergeBranch(
  branchId: string,
  userId: string,
  publish = true,
  selection?: { nodeIds?: string[] | null; includeTheme?: boolean },
): Promise<MergeResult> {
  const diff = await diffBranch(branchId);

  // Cherry-pick: merge only the selected blocks (null → all), and the theme only
  // if asked. The selection comes from the diff the user just reviewed.
  const nodeSet = selection?.nodeIds?.length ? new Set(selection.nodeIds) : null;
  const includeTheme = selection?.includeTheme ?? true;
  const changedToMerge = nodeSet ? diff.changed.filter((c) => nodeSet.has(c.nodeId)) : diff.changed;

  // 1. Changed block copy → parent component drafts, matched by node id.
  const parentComponents = await prisma.component.findMany({
    where: { siteId: diff.parentId, deletedAt: null },
    include: { draft: true },
  });
  const nodeToComponent = new Map<string, string>();
  const bodyByComponent = new Map<string, PageBody>();
  for (const c of parentComponents) {
    const body = (c.draft?.body ?? null) as PageBody | null;
    if (!body?.root) continue;
    bodyByComponent.set(c.id, body);
    walk(body.root, (n) => nodeToComponent.set(n.id, c.id));
  }

  const editsByComponent = new Map<string, Map<string, Record<string, string>>>();
  for (const ch of changedToMerge) {
    const compId = nodeToComponent.get(ch.nodeId);
    if (!compId) continue;
    let m = editsByComponent.get(compId);
    if (!m) {
      m = new Map();
      editsByComponent.set(compId, m);
    }
    m.set(ch.nodeId, Object.fromEntries(ch.fields.map((f) => [f.key, f.after])));
  }

  let blocksMerged = 0;
  for (const [componentId, edits] of editsByComponent) {
    const body = bodyByComponent.get(componentId)!;
    await prisma.componentDraft.update({
      where: { componentId },
      data: {
        body: toJson({ ...body, root: applyEdits(body.root, edits) }),
        updatedBy: userId,
        lockVersion: { increment: 1 },
      },
    });
    blocksMerged += edits.size;
  }

  // 2. Theme: take the branch's palette if it diverged and was selected.
  let themeMerged = false;
  if (includeTheme && diff.theme.length) {
    const branchTokens = (await loadForDiff(branchId)).tokens;
    const parentTheme = await prisma.theme.findFirst({ where: { siteId: diff.parentId } });
    if (parentTheme) {
      const latest = await prisma.themeRevision.findFirst({
        where: { themeId: parentTheme.id },
        orderBy: { versionNo: "desc" },
      });
      const rev = await prisma.themeRevision.create({
        data: {
          themeId: parentTheme.id,
          versionNo: (latest?.versionNo ?? 0) + 1,
          tokens: toJson(asTokens(branchTokens)),
          layout: toJson(asLayout(latest?.layout)),
        },
      });
      await prisma.theme.update({ where: { id: parentTheme.id }, data: { currentRevisionId: rev.id } });
      themeMerged = true;
    }
  }

  // 3. Publish the parent so the merge is live as one release.
  let versionNo: number | null = null;
  if (publish && (blocksMerged || themeMerged)) {
    const result = await publishSite(diff.parentId, userId, "Merged branch changes");
    versionNo = result.versionNo;
  }

  return {
    parentId: diff.parentId,
    blocksMerged,
    themeMerged,
    addedNotMerged: diff.added.length,
    versionNo,
  };
}
