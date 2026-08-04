import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { lookupInvite } from "@/lib/invites";
import { AcceptInvite } from "@/components/dashboard/AcceptInvite";

export const dynamic = "force-dynamic";

/**
 * The invite landing page. The token in the URL is the secret; this page only
 * LOOKS UP the invite (no side effect on GET — links get prefetched), and the
 * accept itself is a POST from the button.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await currentUser();
  const found = await lookupInvite(token);

  return (
    <main className="grid min-h-screen place-items-center bg-ink-950 px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900/70 p-7">
        <div className="flex items-center gap-2.5 text-[15px] font-semibold text-ink-100">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-flux-500 text-[15px] text-white">
            ◈
          </span>
          Team invite
        </div>

        {!found.ok ? (
          <>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-300">
              {found.reason === "expired"
                ? "This invite has expired. Ask the person who sent it for a new one."
                : found.reason === "already-accepted"
                  ? "This invite has already been used."
                  : "This invite link isn't valid."}
            </p>
            <Link href="/" className="mt-5 inline-block text-[13px] text-flux-300 hover:underline">
              ← Back to the homepage
            </Link>
          </>
        ) : (
          <>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-300">
              You&rsquo;ve been invited to join{" "}
              <b className="text-ink-100">{found.invite.orgName}</b> as{" "}
              <b className="text-ink-100">{found.invite.role}</b>. The invite is for{" "}
              <span className="font-mono text-[13px] text-ink-200">{found.invite.email}</span>.
            </p>
            {user ? (
              <AcceptInvite token={token} expectedEmail={found.invite.email} userEmail={user.email} />
            ) : (
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href={`/login?next=/invite/${encodeURIComponent(token)}`}
                  className="rounded-lg bg-flux-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-flux-400"
                >
                  Sign in to accept
                </Link>
                <Link
                  href={`/signup?next=/invite/${encodeURIComponent(token)}`}
                  className="rounded-lg border border-ink-700 px-4 py-2 text-[13px] font-semibold text-ink-100 hover:border-ink-500"
                >
                  Create an account
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
