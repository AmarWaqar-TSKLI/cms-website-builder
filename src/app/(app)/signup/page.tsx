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
      <p className="mt-6 text-[13.5px] text-coal/80">
        Already have an account?{" "}
        <a href="/login" className="font-semibold underline decoration-2 underline-offset-4 hover:text-tomato">
          Sign in
        </a>
      </p>
    </AuthSplit>
  );
}
