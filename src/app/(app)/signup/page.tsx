import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { SignupForm } from "@/components/auth/SignupForm";
import { AuthSplit } from "@/components/auth/AuthSplit";

export const dynamic = "force-dynamic";

/**
 * Create an account. A real new person starts here — not on the seeded demo.
 * On success they get their own fresh site and land on their dashboard.
 */
export default async function SignupPage() {
  if (await currentUser()) redirect("/dashboard");

  return (
    <AuthSplit
      heading="Create your site"
      sub="Sign up free — you'll get a fresh website with a starting page you can edit right away."
    >
      <SignupForm />
      <p className="mt-5 text-[13px] text-ink-400">
        Already have an account?{" "}
        <a href="/login" className="font-semibold text-flux-300 transition-colors hover:text-flux-400">
          Sign in
        </a>
      </p>
    </AuthSplit>
  );
}
