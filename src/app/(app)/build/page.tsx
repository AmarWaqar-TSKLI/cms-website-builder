import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { BuildForm } from "@/components/ai/BuildForm";
import { HubMasthead } from "@/components/dashboard/HubMasthead";

export const dynamic = "force-dynamic";

/** Describe a site in a sentence and let the AI build the homepage. */
export default async function BuildPage() {
  if (!(await currentUser())) redirect("/login?next=/build");

  return (
    <main className="min-h-screen bg-paper text-coal">
      <HubMasthead section="New AI site">
        <a href="/sites" className="text-[14px] font-medium underline decoration-2 underline-offset-4 hover:text-tomato">
          All sites
        </a>
      </HubMasthead>

      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <p className="kicker text-tomato">Describe it in a sentence</p>
        <h1 className="display-mega mt-4 text-[clamp(40px,6.4vw,76px)]">
          What are you <span className="mark-sun">building?</span>
        </h1>
        <p className="mt-5 mb-10 max-w-[46ch] text-[17px] leading-relaxed text-coal/75">
          I&rsquo;ll write the words and lay out a homepage you can start editing right away.
        </p>

        <BuildForm />
      </div>
    </main>
  );
}
