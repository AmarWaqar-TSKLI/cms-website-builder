import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { BuildForm } from "@/components/ai/BuildForm";

export const dynamic = "force-dynamic";

/** Describe a site in a sentence and let the AI build the homepage. */
export default async function BuildPage() {
  if (!(await currentUser())) redirect("/login?next=/build");

  return (
    <main className="grid min-h-screen place-items-center bg-ink-950 px-6 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-5 inline-grid h-12 w-12 place-items-center rounded-2xl bg-flux-500 text-[20px] text-white">
            ✨
          </span>
          <h1 className="display text-[32px] text-ink-100">What are you building?</h1>
          <p className="mx-auto mt-2.5 max-w-md text-[15px] leading-relaxed text-ink-400">
            Describe your site in a sentence — I&rsquo;ll write the words and lay out a homepage you
            can start editing right away.
          </p>
        </div>

        <BuildForm />

        <p className="mt-6 text-center text-[13px] text-ink-500">
          <a href="/sites" className="transition-colors hover:text-ink-300">
            ← Back to your websites
          </a>
        </p>
      </div>
    </main>
  );
}
