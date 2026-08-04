/**
 * BRANCHES — fork a site, diff it against its parent three-way, merge back.
 *
 * "Git for a no-code builder", and only possible because a page here is a typed
 * tree of blocks with STABLE node ids, not an HTML string. A fork copies every
 * component body VERBATIM — so an unchanged block keeps its id in both the branch
 * and the parent — and only remaps the component-REFERENCE ids that must change.
 * That preserved identity is what lets the diff match blocks across the fork and
 * the merge apply a change back to the exact block it came from.
 *
 * The fork also snapshots a BASELINE (branch_baselines): every node's text, the
 * theme tokens, the parent→branch component map, and the page set, all as of the
 * fork. The pure diff engine (branch-diff.ts) uses it to tell apart:
 *   - the branch changed it            → clean merge candidate
 *   - the PARENT changed it since fork → not offered (merging would revert it)
 *   - both changed it                  → CONFLICT, a person decides
 * and to merge STRUCTURE: blocks and whole sections added/removed on the branch,
 * and pages added/removed, land on the parent in the right place.
 *
 * A branch shares its parent's STORE (store-site.ts) — nothing here copies or
 * merges Tier-2 data, by design.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { walk } from "./registry";
import { SHARED_COMPONENT_TYPE, componentIdOf } from "./shared-components";
import type { PageBody, PageNode, ThemeTokens } from "./registry/types";
import { asLayout, asTokens } from "./theme";
import { toJson } from "./json";
import { slugify } from "./slug";
import { publishSite } from "./publish";
import {
  diffStructure,
  diffTexts,
  diffTheme,
  indexBodies,
  insertNode,
  pageRefIds,
  removeNode,
  sampleOf,
  type AddedNode,
  type AddedSection,
  type Blocks,
  type BodyInput,
  type ChangedBlock,
  type NodePlace,
  type PageRefs,
  type RemovedNode,
  type RemovedSection,
  type ThemeChange,
} from "./branch-diff";

const EMPTY: PageBody = { version: 1, root: [] };

async function uniqueSlug(base: string): Promise<string> {
  for (let i = 1; i < 500; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const clash = await prisma.site.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) return slug;
  }
  return `${base}-${Date.now()}`;
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

/** First readable text across a body's nodes, for section labels. */
function bodySample(root: PageNode[]): string {
  for (const n of root) {
    const s = sampleOf(n);
    if (s) return s;
  }
  return "";
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
  const srcTokens = asTokens(srcTheme?.revisions[0]?.tokens);
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

  // ── THE BASELINE — the fork point, written once ─────────────────────────
  // What turns the diff three-way and makes structural merge possible. Uses the
  // PARENT's node ids (identical to the branch's at this instant, since bodies
  // were copied verbatim).
  const { blocks } = indexBodies(
    src.components.map((c) => ({
      componentId: c.id,
      root: ((c.draft?.body as unknown as PageBody) ?? EMPTY).root ?? [],
    })),
  );
  await prisma.branchBaseline.create({
    data: {
      branchSiteId: site.id,
      blocks: toJson(blocks),
      tokens: toJson(srcTokens),
      componentMap: toJson(Object.fromEntries(idMap)),
      pagePaths: toJson(src.pages.map((p) => p.path)),
    },
  });

  return { id: site.id, name: site.name, slug: site.slug };
}

/* ── DIFF ──────────────────────────────────────────────────────────────────── */

interface SiteForDiff {
  id: string;
  name: string;
  parentSiteId: string | null;
  tokens: ThemeTokens;
  bodies: BodyInput[];
  places: Map<string, NodePlace>;
  blocks: Blocks;
  pages: PageRefs[];
  pageIdByPath: Map<string, string>;
  pageBodyByPath: Map<string, PageBody>;
  componentKinds: Record<string, { kind: string; sample: string }>;
  componentById: Map<
    string,
    { id: string; name: string | null; kind: string; icon: string; body: PageBody }
  >;
}

async function loadSiteForDiff(siteId: string): Promise<SiteForDiff> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      components: { where: { deletedAt: null }, include: { draft: true } },
      pages: { where: { deletedAt: null }, include: { draft: true } },
      themes: { include: { revisions: { orderBy: { versionNo: "desc" }, take: 1 } } },
    },
  });
  if (!site) throw new Error("Site not found");

  const bodies: BodyInput[] = site.components.map((c) => ({
    componentId: c.id,
    root: ((c.draft?.body as unknown as PageBody) ?? EMPTY).root ?? [],
  }));
  const { blocks, places } = indexBodies(bodies);

  const componentKinds: Record<string, { kind: string; sample: string }> = {};
  const componentById: SiteForDiff["componentById"] = new Map();
  for (const c of site.components) {
    const body = (c.draft?.body as unknown as PageBody) ?? EMPTY;
    componentKinds[c.id] = { kind: c.kind, sample: bodySample(body.root ?? []) };
    componentById.set(c.id, { id: c.id, name: c.name, kind: c.kind, icon: c.icon, body });
  }

  return {
    id: site.id,
    name: site.name,
    parentSiteId: site.parentSiteId,
    tokens: asTokens(site.themes[0]?.revisions[0]?.tokens),
    bodies,
    places,
    blocks,
    pages: site.pages.map((p) => ({
      path: p.path,
      title: p.title,
      refs: pageRefIds((p.draft?.body as unknown as PageBody) ?? EMPTY),
    })),
    pageIdByPath: new Map(site.pages.map((p) => [p.path, p.id])),
    pageBodyByPath: new Map(
      site.pages.map((p) => [p.path, (p.draft?.body as unknown as PageBody) ?? EMPTY]),
    ),
    componentKinds,
    componentById,
  };
}

export interface BranchDiff {
  branchId: string;
  branchName: string;
  parentId: string;
  parentName: string;
  /** True when a fork-point baseline exists — conflicts and structure are exact. */
  threeWay: boolean;
  changed: ChangedBlock[];
  conflictCount: number;
  theme: ThemeChange[];
  addedNodes: AddedNode[];
  removedNodes: RemovedNode[];
  sectionsAdded: AddedSection[];
  sectionsRemoved: RemovedSection[];
  pagesAdded: { path: string; title: string }[];
  pagesRemoved: string[];
}

export async function diffBranch(branchId: string): Promise<BranchDiff> {
  const branch = await loadSiteForDiff(branchId);
  if (!branch.parentSiteId) throw new Error("This site isn't a branch.");
  const parent = await loadSiteForDiff(branch.parentSiteId);

  const baseline = await prisma.branchBaseline.findUnique({
    where: { branchSiteId: branchId },
  });
  const baseBlocks = (baseline?.blocks as unknown as Blocks) ?? null;
  const baseTokens = baseline ? asTokens(baseline.tokens) : null;
  const componentMap = (baseline?.componentMap as unknown as Record<string, string>) ?? null;
  const basePagePaths = (baseline?.pagePaths as unknown as string[]) ?? null;

  const changed = diffTexts(baseBlocks, parent.blocks, branch.blocks);
  const theme = diffTheme(baseTokens, parent.tokens, branch.tokens);
  const structure = diffStructure({
    baseBlocks,
    basePagePaths,
    componentMap,
    parentPlaces: parent.places,
    branchPlaces: branch.places,
    parentPages: parent.pages,
    branchPages: branch.pages,
    branchComponentKinds: branch.componentKinds,
    parentComponentKinds: parent.componentKinds,
  });

  return {
    branchId: branch.id,
    branchName: branch.name,
    parentId: parent.id,
    parentName: parent.name,
    threeWay: !!baseline,
    changed,
    conflictCount:
      changed.filter((c) => c.conflict).length + theme.filter((t) => t.conflict).length,
    theme,
    ...structure,
  };
}

/* ── MERGE ─────────────────────────────────────────────────────────────────── */

export interface MergeSelection {
  /** Changed blocks to apply (null/undefined → all NON-conflicted changes). */
  nodeIds?: string[] | null;
  /** Structural picks. Omitted → all additions, NO removals (removals are
   * destructive and must be explicit). */
  addNodeIds?: string[] | null;
  removeNodeIds?: string[] | null;
  addSectionIds?: string[] | null;
  removeSectionIds?: string[] | null;
  addPagePaths?: string[] | null;
  removePagePaths?: string[] | null;
  includeTheme?: boolean;
}

export interface MergeResult {
  parentId: string;
  blocksMerged: number;
  nodesAdded: number;
  nodesRemoved: number;
  sectionsAdded: number;
  sectionsRemoved: number;
  pagesAdded: number;
  pagesRemoved: number;
  themeMerged: boolean;
  conflictsSkipped: number;
  versionNo: number | null;
}

export async function mergeBranch(
  branchId: string,
  userId: string,
  publish = true,
  selection?: MergeSelection,
): Promise<MergeResult> {
  const diff = await diffBranch(branchId);
  const branch = await loadSiteForDiff(branchId);
  const parent = await loadSiteForDiff(diff.parentId);
  const baseline = await prisma.branchBaseline.findUnique({ where: { branchSiteId: branchId } });
  const componentMap = (baseline?.componentMap as unknown as Record<string, string>) ?? {};
  const branchToParent = new Map(Object.entries(componentMap).map(([p, b]) => [b, p]));

  // ── What was picked ──────────────────────────────────────────────────────
  const wantSet = (ids: string[] | null | undefined, all: string[], defaultAll: boolean) =>
    ids != null ? new Set(ids) : new Set(defaultAll ? all : []);

  // Conflicted changes are NEVER merged implicitly — only an explicit pick.
  const defaultChangeIds = diff.changed.filter((c) => !c.conflict).map((c) => c.nodeId);
  const pickedChanges =
    selection?.nodeIds != null ? new Set(selection.nodeIds) : new Set(defaultChangeIds);
  const conflictsSkipped = diff.changed.filter(
    (c) => c.conflict && !pickedChanges.has(c.nodeId),
  ).length;

  const pickedAddNodes = wantSet(selection?.addNodeIds, diff.addedNodes.map((a) => a.nodeId), true);
  const pickedRemoveNodes = wantSet(selection?.removeNodeIds, [], false);
  const pickedAddSections = wantSet(
    selection?.addSectionIds,
    diff.sectionsAdded.map((s) => s.branchComponentId),
    true,
  );
  const pickedRemoveSections = wantSet(selection?.removeSectionIds, [], false);
  const pickedAddPages = wantSet(selection?.addPagePaths, diff.pagesAdded.map((p) => p.path), true);
  const pickedRemovePages = wantSet(selection?.removePagePaths, [], false);
  const includeTheme = selection?.includeTheme ?? diff.theme.some((t) => !t.conflict);

  // ── 1. Text changes + node-level structure, per parent component ─────────
  // All tree surgery for one component is batched into a single draft write.
  const editsByComponent = new Map<string, Map<string, Record<string, string>>>();
  const nodeToParentComponent = new Map<string, string>();
  for (const [id, place] of parent.places) nodeToParentComponent.set(id, place.componentId);

  let blocksMerged = 0;
  for (const ch of diff.changed) {
    if (!pickedChanges.has(ch.nodeId)) continue;
    const compId = nodeToParentComponent.get(ch.nodeId);
    if (!compId) continue;
    let m = editsByComponent.get(compId);
    if (!m) {
      m = new Map();
      editsByComponent.set(compId, m);
    }
    m.set(ch.nodeId, Object.fromEntries(ch.fields.map((f) => [f.key, f.after])));
    blocksMerged++;
  }

  interface TreeOp {
    kind: "insert" | "remove";
    parentNodeId?: string;
    index?: number;
    subtree?: PageNode;
    nodeId?: string;
  }
  const opsByComponent = new Map<string, TreeOp[]>();
  const pushOp = (componentId: string, op: TreeOp) => {
    const list = opsByComponent.get(componentId) ?? [];
    list.push(op);
    opsByComponent.set(componentId, list);
  };

  let nodesAdded = 0;
  for (const add of diff.addedNodes) {
    if (!pickedAddNodes.has(add.nodeId)) continue;
    const subtree = branch.places.get(add.nodeId)?.node;
    if (!subtree) continue;
    // Where on the parent: inside the node with the same id, or at the root of
    // the mapped component when the branch added at component root.
    const targetComponent = add.parentNodeId
      ? nodeToParentComponent.get(add.parentNodeId)
      : branchToParent.get(add.branchComponentId);
    if (!targetComponent) continue; // legacy branch with no anchor — skip safely
    pushOp(targetComponent, {
      kind: "insert",
      parentNodeId: add.parentNodeId,
      index: add.index,
      subtree,
    });
    nodesAdded++;
  }

  let nodesRemoved = 0;
  for (const rem of diff.removedNodes) {
    if (!pickedRemoveNodes.has(rem.nodeId)) continue;
    const compId = nodeToParentComponent.get(rem.nodeId);
    if (!compId) continue;
    pushOp(compId, { kind: "remove", nodeId: rem.nodeId });
    nodesRemoved++;
  }

  const touchedComponents = new Set([...editsByComponent.keys(), ...opsByComponent.keys()]);
  for (const componentId of touchedComponents) {
    const current = parent.componentById.get(componentId)?.body ?? EMPTY;
    let root = current.root ?? [];
    const edits = editsByComponent.get(componentId);
    if (edits) root = applyEdits(root, edits);
    for (const op of opsByComponent.get(componentId) ?? []) {
      root =
        op.kind === "insert"
          ? insertNode(root, op.parentNodeId ?? "", op.index ?? root.length, op.subtree!)
          : removeNode(root, op.nodeId!);
    }
    await prisma.componentDraft.update({
      where: { componentId },
      data: {
        body: toJson({ ...current, root }),
        updatedBy: userId,
        lockVersion: { increment: 1 },
      },
    });
  }

  // ── 2. Whole sections: new component on the parent + a page reference ────
  let sectionsAddedCount = 0;
  // branch component id → the parent-side copy created in this merge, so an
  // added PAGE below can reference sections that were also added here.
  const createdOnParent = new Map<string, string>();
  for (const add of diff.sectionsAdded) {
    if (!pickedAddSections.has(add.branchComponentId)) continue;
    const source = branch.componentById.get(add.branchComponentId);
    if (!source) continue;
    const parentPageBody = parent.pageBodyByPath.get(add.pagePath);
    const parentPageId = parent.pageIdByPath.get(add.pagePath);
    if (!parentPageBody || !parentPageId) continue;

    let parentCompId = createdOnParent.get(add.branchComponentId);
    if (!parentCompId) {
      const created = await prisma.component.create({
        data: {
          siteId: diff.parentId,
          name: source.name,
          kind: source.kind,
          icon: source.icon,
          draft: { create: { updatedBy: userId, lockVersion: 1, body: toJson(source.body) } },
        },
      });
      parentCompId = created.id;
      createdOnParent.set(add.branchComponentId, parentCompId);
    }

    // Insert the reference after its surviving neighbour, else at the diff's index.
    const root = [...(parentPageBody.root ?? [])];
    let at = Math.min(add.index, root.length);
    if (add.afterParentComponentId) {
      const anchorIdx = root.findIndex(
        (n) => n.type === SHARED_COMPONENT_TYPE && componentIdOf(n) === add.afterParentComponentId,
      );
      if (anchorIdx >= 0) at = anchorIdx + 1;
    }
    root.splice(at, 0, {
      id: `m${randomUUID().slice(0, 8)}`,
      type: SHARED_COMPONENT_TYPE,
      props: { componentId: parentCompId },
      children: [],
    });
    const nextBody = { ...parentPageBody, root };
    parent.pageBodyByPath.set(add.pagePath, nextBody);
    await prisma.pageDraft.update({
      where: { pageId: parentPageId },
      data: { body: toJson(nextBody), updatedBy: userId, lockVersion: { increment: 1 } },
    });
    sectionsAddedCount++;
  }

  let sectionsRemovedCount = 0;
  for (const rem of diff.sectionsRemoved) {
    if (!pickedRemoveSections.has(rem.parentComponentId)) continue;
    const parentPageBody = parent.pageBodyByPath.get(rem.pagePath);
    const parentPageId = parent.pageIdByPath.get(rem.pagePath);
    if (!parentPageBody || !parentPageId) continue;
    const root = (parentPageBody.root ?? []).filter(
      (n) => !(n.type === SHARED_COMPONENT_TYPE && componentIdOf(n) === rem.parentComponentId),
    );
    const nextBody = { ...parentPageBody, root };
    parent.pageBodyByPath.set(rem.pagePath, nextBody);
    await prisma.pageDraft.update({
      where: { pageId: parentPageId },
      data: { body: toJson(nextBody), updatedBy: userId, lockVersion: { increment: 1 } },
    });
    // The component itself is left in place: other pages may reference it, and
    // an unreferenced component is harmless (publish pins it, nothing shows it).
    sectionsRemovedCount++;
  }

  // ── 3. Pages the branch added / removed ──────────────────────────────────
  let pagesAddedCount = 0;
  for (const pageAdd of diff.pagesAdded) {
    if (!pickedAddPages.has(pageAdd.path)) continue;
    const body = branch.pageBodyByPath.get(pageAdd.path);
    if (!body) continue;

    // Translate refs: fork-mapped components go back to their parent originals;
    // branch-born components get copies on the parent (reusing any created above).
    const translate = new Map<string, string>(branchToParent);
    for (const ref of pageRefIds(body)) {
      if (translate.has(ref)) continue;
      let target = createdOnParent.get(ref);
      if (!target) {
        const source = branch.componentById.get(ref);
        if (!source) continue;
        const created = await prisma.component.create({
          data: {
            siteId: diff.parentId,
            name: source.name,
            kind: source.kind,
            icon: source.icon,
            draft: { create: { updatedBy: userId, lockVersion: 1, body: toJson(source.body) } },
          },
        });
        target = created.id;
        createdOnParent.set(ref, target);
      }
      translate.set(ref, target);
    }

    const page = await prisma.page.create({
      data: { siteId: diff.parentId, path: pageAdd.path, type: "page", title: pageAdd.title },
    });
    await prisma.pageDraft.create({
      data: { pageId: page.id, updatedBy: userId, body: toJson(remapRefs(body, translate)) },
    });
    pagesAddedCount++;
  }

  let pagesRemovedCount = 0;
  for (const path of diff.pagesRemoved) {
    if (!pickedRemovePages.has(path)) continue;
    const pageId = parent.pageIdByPath.get(path);
    if (!pageId) continue;
    await prisma.page.update({ where: { id: pageId }, data: { deletedAt: new Date() } });
    pagesRemovedCount++;
  }

  // ── 4. Theme ─────────────────────────────────────────────────────────────
  let themeMerged = false;
  if (includeTheme && diff.theme.length) {
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
          tokens: toJson(asTokens(branch.tokens)),
          layout: toJson(asLayout(latest?.layout)),
        },
      });
      await prisma.theme.update({
        where: { id: parentTheme.id },
        data: { currentRevisionId: rev.id },
      });
      themeMerged = true;
    }
  }

  // ── 5. Publish the parent so the whole merge lands as one release ────────
  const anything =
    blocksMerged ||
    nodesAdded ||
    nodesRemoved ||
    sectionsAddedCount ||
    sectionsRemovedCount ||
    pagesAddedCount ||
    pagesRemovedCount ||
    themeMerged;
  let versionNo: number | null = null;
  if (publish && anything) {
    const result = await publishSite(diff.parentId, userId, "Merged branch changes");
    versionNo = result.versionNo;
  }

  return {
    parentId: diff.parentId,
    blocksMerged,
    nodesAdded,
    nodesRemoved,
    sectionsAdded: sectionsAddedCount,
    sectionsRemoved: sectionsRemovedCount,
    pagesAdded: pagesAddedCount,
    pagesRemoved: pagesRemovedCount,
    themeMerged,
    conflictsSkipped,
    versionNo,
  };
}
