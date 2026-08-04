import { ForgotForm } from "@/components/auth/PasswordResetForms";

export const metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink-950 px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900/70 p-7">
        <h1 className="display text-[22px] text-ink-100">Forgot your password?</h1>
        <p className="mb-5 mt-1.5 text-[13px] leading-relaxed text-ink-400">
          Enter your account email and we&rsquo;ll send a one-time reset link.
        </p>
        <ForgotForm />
      </div>
    </main>
  );
}
