import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { TEMPLATES } from "@/lib/templates";
import { TemplateGallery } from "@/components/templates/TemplateGallery";

export const dynamic = "force-dynamic";

/**
 * The template gallery. Server-renders the display metadata for each template —
 * name, tagline, category and its theme tokens (for the little preview) — and
 * hands them to the client gallery. The heavy part, the block trees, never
 * reaches the browser: it's only needed on the server when a template is chosen
 * and built through /api/sites.
 */
export default async function TemplatesPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/templates");

  const templates = TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    tagline: t.tagline,
    category: t.category,
    tokens: t.tokens,
  }));

  return (
    <main className="min-h-screen bg-ink-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-6 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold text-ink-100">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-flux-500 text-[15px] text-white">
            ◈
          </span>
          <span>Your workspace</span>
        </Link>
        <Link
          href="/sites"
          className="rounded-lg border border-ink-800 px-3 py-2 text-[12.5px] text-ink-300 transition-colors hover:border-ink-600 hover:text-ink-100"
        >
          ← All sites
        </Link>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10 sm:px-10">
        <div className="mb-8">
          <h1 className="display-mega text-[clamp(28px,4.5vw,40px)] text-ink-100">Start from a template</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink-400">
            Pick a finished design to start from. You get a full, multi-page site with its own
            colours and fonts — then change the words, colours and layout to make it yours. Prefer a
            blank page, or want it built for you? Head back and choose{" "}
            <span className="text-ink-300">＋ Blank site</span> or{" "}
            <span className="text-flux-300">✨ New AI site</span>.
          </p>
        </div>

        <TemplateGallery templates={templates} />
      </div>
    </main>
  );
}
