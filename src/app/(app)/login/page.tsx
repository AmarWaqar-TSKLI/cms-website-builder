import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthSplit } from "@/components/auth/AuthSplit";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await currentUser()) redirect("/dashboard");

  return (
    <AuthSplit heading="Welcome back" sub="Sign in and pick up where you left off.">
      <LoginForm next={next} />
    </AuthSplit>
  );
}
