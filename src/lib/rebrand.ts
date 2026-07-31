/**
 * AI REBRAND — rewrite a whole site's words and restyle its theme, then publish,
 * in one command.
 *
 * This is the whole system composing itself. It leans on parts that already
 * exist and are already safe:
 *
 *   - the site's TEXT lives in component drafts (a page holds only pointers), so
 *     a rebrand collects every editable text field across every component,
 *   - `rewriteCopy` returns new text for the SAME node ids and fields ONLY — it
 *     can't add, remove or restructure anything (lib/ai.ts),
 *   - `rebrandTheme` returns a validated palette (bad values are dropped, never
 *     written as CSS),
 *   - and `publishSite` snapshots the lot into ONE immutable release.
 *
 * So the copy and the look change together, atomically, and one rollback undoes
 * the entire rebrand across every page — because it is exactly one release.
 */
import { prisma } from "./db";
import { walk } from "./registry";
import type { PageBody, PageNode } from "./registry/types";
import { getSchema } from "./registry";
import { rebrandTheme, rewriteCopy, type CopyField } from "./ai";
import { asLayout, asTokens } from "./theme";
import { toJson } from "./json";
import { publishSite, type PublishResult } from "./publish";

/** Split a namespaced field id "<componentId>::<nodeId>" back into its parts. */
function splitNs(id: string): [string, string] | null {
  const at = id.indexOf("::");
  if (at < 0) return null;
  return [id.slice(0, at), id.slice(at + 2)];
}

/** A new tree with `edits` (nodeId → prop patch) merged in. Structure untouched. */
function applyEdits(nodes: PageNode[], edits: Map<string, Record<string, string>>): PageNode[] {
  return nodes.map((n) => {
    const patch = edits.get(n.id);
    return {
      ...n,
      props: patch ? { ...n.props, ...patch } : n.props,
      children: n.children?.length ? applyEdits(n.children, edits) : n.children,
    };
  });
}

export interface RebrandResult extends PublishResult {
  componentsRewritten: number;
  fieldsRewritten: number;
  themeChanged: boolean;
}

export async function rebrandSite(
  siteId: string,
  userId: string,
  instruction: string,
): Promise<RebrandResult> {
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { name: true } });
  const siteName = site?.name ?? undefined;

  // ── 1. Collect every editable text field across every component ────────────
  // Namespaced by component id, because node ids ("n1") are only unique within
  // a component, not across them.
  const components = await prisma.component.findMany({
    where: { siteId, deletedAt: null },
    include: { draft: true },
  });

  const bodyByComponent = new Map<string, PageBody>();
  const fields: CopyField[] = [];
  for (const c of components) {
    const body = (c.draft?.body ?? null) as PageBody | null;
    if (!body?.root?.length) continue;
    bodyByComponent.set(c.id, body);
    walk(body.root, (n) => {
      const schema = getSchema(n.type);
      if (!schema) return;
      const props: Record<string, string> = {};
      for (const [k, def] of Object.entries(schema.props)) {
        if (def.kind === "text" || def.kind === "textarea") {
          const v = n.props?.[k];
          if (typeof v === "string" && v.trim()) props[k] = v;
        }
      }
      if (Object.keys(props).length) fields.push({ id: `${c.id}::${n.id}`, type: n.type, props });
    });
  }

  // ── 2. Current theme tokens (to rebrand from) ──────────────────────────────
  const theme = await prisma.theme.findFirst({ where: { siteId } });
  let currentTokens = asTokens(undefined);
  let latestThemeRev: { id: string; versionNo: number; layout: unknown } | null = null;
  if (theme) {
    const latest = await prisma.themeRevision.findFirst({
      where: { themeId: theme.id },
      orderBy: { versionNo: "desc" },
      select: { id: true, versionNo: true, tokens: true, layout: true },
    });
    if (latest) {
      currentTokens = asTokens(latest.tokens);
      latestThemeRev = { id: latest.id, versionNo: latest.versionNo, layout: latest.layout };
    }
  }

  // ── 3. Ask the model for new copy and a new palette, together ──────────────
  const [edits, newTokens] = await Promise.all([
    fields.length ? rewriteCopy(fields, instruction, siteName) : Promise.resolve([]),
    rebrandTheme(currentTokens, instruction).catch(() => null),
  ]);

  // ── 4. Apply the copy back into each component draft ───────────────────────
  const editsByComponent = new Map<string, Map<string, Record<string, string>>>();
  for (const e of edits) {
    const parts = splitNs(e.id);
    if (!parts) continue;
    const [componentId, nodeId] = parts;
    if (!bodyByComponent.has(componentId)) continue;
    let m = editsByComponent.get(componentId);
    if (!m) {
      m = new Map();
      editsByComponent.set(componentId, m);
    }
    m.set(nodeId, e.props);
  }

  for (const [componentId, nodeEdits] of editsByComponent) {
    const body = bodyByComponent.get(componentId)!;
    const nextBody: PageBody = { ...body, root: applyEdits(body.root, nodeEdits) };
    await prisma.componentDraft.update({
      where: { componentId },
      data: { body: toJson(nextBody), updatedBy: userId, lockVersion: { increment: 1 } },
    });
  }

  // ── 5. Append a new theme revision with the new palette, and repoint ───────
  let themeChanged = false;
  if (theme && newTokens && Object.keys(newTokens).length) {
    const tokens = asTokens({ ...currentTokens, ...newTokens });
    const revision = await prisma.themeRevision.create({
      data: {
        themeId: theme.id,
        versionNo: (latestThemeRev?.versionNo ?? 0) + 1,
        tokens: toJson(tokens),
        layout: toJson(asLayout(latestThemeRev?.layout)),
      },
    });
    await prisma.theme.update({ where: { id: theme.id }, data: { currentRevisionId: revision.id } });
    themeChanged = true;
  }

  // ── 6. Publish everything as ONE release ───────────────────────────────────
  const result = await publishSite(siteId, userId, `AI rebrand: ${instruction}`.slice(0, 200));

  return {
    ...result,
    componentsRewritten: editsByComponent.size,
    fieldsRewritten: edits.length,
    themeChanged,
  };
}
