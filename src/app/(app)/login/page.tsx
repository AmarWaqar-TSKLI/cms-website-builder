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
    <main className="grid min-h-screen place-items-center bg-ink-950 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl bg-flux-500 text-[18px] font-semibold text-white">
            ◈
          </div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink-100">
            Sign in
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-400">
            Pages, components and releases are scoped to your organisation.
          </p>
        </div>

        <LoginForm next={next} />
      </div>
    </main>
  );
}
