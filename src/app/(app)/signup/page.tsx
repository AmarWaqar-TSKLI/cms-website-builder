import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { SignupForm } from "@/components/auth/SignupForm";

export const dynamic = "force-dynamic";

/**
 * Create an account. A real new person starts here — not on the seeded demo.
 * On success they get their own fresh site and land on their dashboard.
 */
export default async function SignupPage() {
  if (await currentUser()) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center bg-ink-950 px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <a
            href="/"
            className="mx-auto mb-6 inline-grid h-12 w-12 place-items-center rounded-2xl bg-flux-500 text-[20px] font-semibold text-white transition-transform hover:scale-105"
            aria-label="Back to home"
          >
            ◈
          </a>
          <h1 className="display text-[30px] text-ink-100">Create your site</h1>
          <p className="mx-auto mt-2.5 max-w-xs text-[15px] leading-relaxed text-ink-400">
            Sign up free. You&rsquo;ll get a fresh website with a starting page you can begin editing
            right away.
          </p>
        </div>

        <SignupForm />

        <p className="mt-5 text-center text-[13px] text-ink-400">
          Already have an account?{" "}
          <a href="/login" className="font-medium text-flux-300 transition-colors hover:text-flux-400">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}
