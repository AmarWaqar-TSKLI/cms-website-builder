import { NextResponse } from "next/server";
import { guardRelease } from "@/lib/api-auth";
import { buildExport, type ExportKind } from "@/lib/export";
import { buildNextExport } from "@/lib/export-next";

// Rendering the Next.js source project pulls in react-dom/server + the whole
// block registry, so this route needs the Node runtime, not the edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ releaseId: string; kind: string }> },
) {
  const { releaseId, kind } = await params;
  const auth = await guardRelease(releaseId);
  if (!auth.ok) return auth.response;
  if (kind !== "static" && kind !== "container" && kind !== "nextjs") {
    return NextResponse.json({ error: "kind must be static, container or nextjs" }, { status: 400 });
  }

  try {
    const bundle =
      kind === "nextjs" ? await buildNextExport(releaseId) : await buildExport(releaseId, kind as ExportKind);
    return new Response(bundle.bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${bundle.filename}"`,
        "Content-Length": String(bundle.bytes.length),
        // Same release id as the hosted URL. That equality is the point.
        "X-CMS-Release-Id": bundle.releaseId,
        "X-CMS-Release-Version": `v${bundle.versionNo}`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 409 },
    );
  }
}
