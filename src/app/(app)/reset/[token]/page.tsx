import { ResetForm } from "@/components/auth/PasswordResetForms";
import { AuthSplit } from "@/components/auth/AuthSplit";

export const metadata = { title: "Reset password" };

/** The token stays in the URL and goes straight to the POST — never stored here. */
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthSplit
      heading="Set a new password"
      sub="Afterwards you’ll be signed out everywhere and can sign in with the new one."
    >
      <ResetForm token={token} />
    </AuthSplit>
  );
}
