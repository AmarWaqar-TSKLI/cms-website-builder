import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { TEMPLATES } from "@/lib/templates";
import { TemplateGallery } from "@/components/templates/TemplateGallery";
import { HubMasthead } from "@/components/dashboard/HubMasthead";

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
    <main className="min-h-screen bg-paper text-coal">
      <HubMasthead section="Templates">
        <Link href="/sites" className="text-[14px] font-medium underline decoration-2 underline-offset-4 hover:text-tomato">
          All sites
        </Link>
      </HubMasthead>

      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="mb-12 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="kicker text-tomato">Start from a design</p>
            <h1 className="display-mega mt-4 text-[clamp(40px,6vw,72px)]">
              Pick a <span className="mark-sun">template.</span>
            </h1>
          </div>
          <p className="max-w-[40ch] text-[16px] leading-relaxed text-coal/75">
            Each one is a full multi-page site with its own colours and fonts. Change the words, colours and
            layout to make it yours, or go back for a blank site or one the AI builds.
          </p>
        </div>

        <TemplateGallery templates={templates} />
      </div>
    </main>
  );
}
