import { ResetForm } from "@/components/auth/PasswordResetForms";

export const metadata = { title: "Reset password" };

/** The token stays in the URL and goes straight to the POST — never stored here. */
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="grid min-h-screen place-items-center bg-ink-950 px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900/70 p-7">
        <h1 className="display text-[22px] text-ink-100">Set a new password</h1>
        <p className="mb-5 mt-1.5 text-[13px] leading-relaxed text-ink-400">
          Afterwards you&rsquo;ll be signed out everywhere and can sign in with the new one.
        </p>
        <ResetForm token={token} />
      </div>
    </main>
  );
}
