import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
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
          <h1 className="display text-[30px] text-ink-100">Welcome back</h1>
          <p className="mx-auto mt-2.5 max-w-xs text-[15px] leading-relaxed text-ink-400">
            Sign in to pick up where you left off and keep building your site.
          </p>
        </div>

        <LoginForm next={next} />
      </div>
    </main>
  );
}
