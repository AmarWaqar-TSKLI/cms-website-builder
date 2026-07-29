/**
 * Editing a shared component.
 *
 * The same shell, the same canvas, the same palette, the same undo stack. The
 * only differences are which draft row autosave writes to and a header that
 * makes the blast radius obvious — because saving here changes every page that
 * uses this symbol.
 *
 * `page` is still passed so the shell has a "back to a page" target; when a
 * component is set, the shell edits the component instead.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { loadEditorContext } from "@/lib/editor/bootstrap";
import { usageOf } from "@/lib/component-usage";
import { displayNameOf } from "@/lib/shared-components";
import type { ComponentBody } from "@/lib/registry/types";
import { EditorShell } from "@/components/editor/EditorShell";

export const dynamic = "force-dynamic";

const EMPTY: ComponentBody = { version: 1, root: [] };

export default async function ComponentEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ componentId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { componentId } = await params;
  const { from } = await searchParams;

  const component = await prisma.component.findFirst({
    where: { id: componentId, deletedAt: null },
    include: { draft: true },
  });
  if (!component) notFound();

  const context = await loadEditorContext(component.siteId);
  if (!context) notFound();

  // Loaded before the screen renders, so the blast radius is on screen BEFORE
  // anyone types. A warning that arrives after the edit is not a warning.
  const usage = await usageOf(component.siteId, component.id);

  // The page to return to: whichever one you opened this component FROM, falling
  // back to the first page. This is what makes the header's "← Back to /about"
  // land you where you actually were.
  const backPage = context.siblings.find((s) => s.id === from) ?? context.siblings[0];

  return (
    <EditorShell
      component={{ id: component.id, name: displayNameOf(component), usage }}
      page={
        backPage
          ? { id: backPage.id, path: backPage.path, title: backPage.title }
          : { id: "", path: "/", title: displayNameOf(component) }
      }
      body={(component.draft?.body as unknown as ComponentBody) ?? EMPTY}
      lockVersion={component.draft?.lockVersion ?? 0}
      {...context}
    />
  );
}
