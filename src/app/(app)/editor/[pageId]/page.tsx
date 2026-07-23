import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { loadEditorContext } from "@/lib/editor/bootstrap";
import type { PageBody } from "@/lib/registry/types";
import { EditorShell } from "@/components/editor/EditorShell";

export const dynamic = "force-dynamic";

const EMPTY: PageBody = { version: 1, root: [] };

export default async function EditorPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;

  const page = await prisma.page.findFirst({
    where: { id: pageId, deletedAt: null },
    include: { draft: true },
  });
  if (!page) notFound();

  const context = await loadEditorContext(page.siteId);
  if (!context) notFound();

  return (
    <EditorShell
      page={{ id: page.id, path: page.path, title: page.title }}
      body={(page.draft?.body as unknown as PageBody) ?? EMPTY}
      lockVersion={page.draft?.lockVersion ?? 0}
      {...context}
    />
  );
}
