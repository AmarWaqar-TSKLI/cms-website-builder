import { ForgotForm } from "@/components/auth/PasswordResetForms";
import { AuthSplit } from "@/components/auth/AuthSplit";

export const metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <AuthSplit
      heading="Forgot your password?"
      sub="Enter your account email and we’ll send a one-time reset link."
    >
      <ForgotForm />
    </AuthSplit>
  );
}
