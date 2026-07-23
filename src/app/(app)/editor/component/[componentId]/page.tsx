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
import type { ComponentBody } from "@/lib/registry/types";
import { EditorShell } from "@/components/editor/EditorShell";

export const dynamic = "force-dynamic";

const EMPTY: ComponentBody = { version: 1, root: [] };

export default async function ComponentEditorPage({
  params,
}: {
  params: Promise<{ componentId: string }>;
}) {
  const { componentId } = await params;

  const component = await prisma.sharedComponent.findFirst({
    where: { id: componentId, deletedAt: null },
    include: { draft: true },
  });
  if (!component) notFound();

  const context = await loadEditorContext(component.siteId);
  if (!context) notFound();

  const home = context.siblings[0];

  return (
    <EditorShell
      component={{ id: component.id, name: component.name }}
      page={
        home
          ? { id: home.id, path: home.path, title: home.title }
          : { id: "", path: "/", title: component.name }
      }
      body={(component.draft?.body as unknown as ComponentBody) ?? EMPTY}
      lockVersion={component.draft?.lockVersion ?? 0}
      {...context}
    />
  );
}
