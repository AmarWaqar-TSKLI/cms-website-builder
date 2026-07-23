/**
 * "What will change if I edit this component?"
 *
 * This exists because a vague warning is not a warning. Telling someone
 * "editing this changes every page that uses it" is a sentence they will read
 * once and then stop seeing. Telling them "this will change 12 pages: /, /about,
 * /pricing…" is a fact they can act on.
 *
 * Shared components are opt-in — a block is only shared if someone deliberately
 * made it one — but the moment a person opens one to edit, the blast radius has
 * to be on screen, in numbers, before they type anything.
 *
 * Two tenses, because they have genuinely different answers:
 *   usageOf()  — what changes when I publish. Reads DRAFTS: the state the next
 *                publish will snapshot.
 *   releasesReferencing() (lib/dependencies.ts) — what already shipped. Reads
 *                the reverse index built at publish time.
 */
import { prisma } from "./db";
import { directComponentRefs } from "./shared-components";
import type { PageBody } from "./registry/types";

export interface ComponentUsage {
  /** Pages whose current draft places this component directly. */
  pages: { id: string; path: string; title: string }[];
  /** Other components whose current draft places this one inside them. */
  components: { id: string; name: string }[];
  /**
   * Pages reached only THROUGH another component — a page using a Card, where
   * the Card uses this Button. They change too, and are the ones people forget.
   */
  indirectPages: { id: string; path: string; title: string }[];
  /** pages + indirectPages. The number worth putting in front of someone. */
  totalPages: number;
}

export async function usageOf(siteId: string, componentId: string): Promise<ComponentUsage> {
  const [pages, components] = await Promise.all([
    prisma.page.findMany({
      where: { siteId, deletedAt: null },
      include: { draft: true },
      orderBy: { path: "asc" },
    }),
    prisma.sharedComponent.findMany({
      where: { siteId, deletedAt: null },
      include: { draft: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const refsOf = (body: unknown) =>
    directComponentRefs(((body as PageBody | undefined)?.root ?? []) as PageBody["root"]);

  // Which components transitively contain the one being edited? Walk the
  // component graph backwards until it stops growing. Small graphs, and it runs
  // once when a screen opens — a fixpoint loop is clearer here than anything
  // cleverer would be.
  const containing = new Set<string>([componentId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of components) {
      if (containing.has(c.id)) continue;
      if (refsOf(c.draft?.body).some((id) => containing.has(id))) {
        containing.add(c.id);
        grew = true;
      }
    }
  }

  const direct: ComponentUsage["pages"] = [];
  const indirect: ComponentUsage["indirectPages"] = [];

  for (const page of pages) {
    const refs = refsOf(page.draft?.body);
    const entry = { id: page.id, path: page.path, title: page.title };
    if (refs.includes(componentId)) direct.push(entry);
    else if (refs.some((id) => containing.has(id))) indirect.push(entry);
  }

  return {
    pages: direct,
    components: components
      .filter((c) => c.id !== componentId && refsOf(c.draft?.body).includes(componentId))
      .map((c) => ({ id: c.id, name: c.name })),
    indirectPages: indirect,
    totalPages: direct.length + indirect.length,
  };
}

/** "Used on 3 pages" / "Not used on any page yet". */
export function describeUsage(usage: ComponentUsage): string {
  if (usage.totalPages === 0) return "Not used on any page yet";
  const n = usage.totalPages;
  const via = usage.indirectPages.length
    ? ` (${usage.indirectPages.length} through another component)`
    : "";
  return `Used on ${n} page${n === 1 ? "" : "s"}${via}`;
}
