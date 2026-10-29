import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { lookupInvite } from "@/lib/invites";
import { AcceptInvite } from "@/components/dashboard/AcceptInvite";
import { AuthSplit } from "@/components/auth/AuthSplit";
import { AUTH_CARD, AUTH_LINK } from "@/components/auth/styles";

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
    <AuthSplit
      heading={found.ok ? "Join the team" : "This invite can’t be used"}
      sub={found.ok ? `${found.invite.orgName} wants you in their workspace.` : "Nothing was changed."}
    >
      <div className={AUTH_CARD}>
        {!found.ok ? (
          <>
            <p className="text-[15px] leading-relaxed text-coal">
              {found.reason === "expired"
                ? "This invite has expired. Ask the person who sent it for a new one."
                : found.reason === "already-accepted"
                  ? "This invite has already been used."
                  : "This invite link isn't valid."}
            </p>
            <Link href="/" className={`mt-5 inline-block text-[13.5px] ${AUTH_LINK}`}>
              Back to the homepage
            </Link>
          </>
        ) : (
          <>
            <p className="text-[15px] leading-relaxed text-coal">
              You&rsquo;ve been invited to join <b>{found.invite.orgName}</b> as{" "}
              <b>{found.invite.role}</b>. The invite is for{" "}
              <span className="font-mono text-[13.5px]">{found.invite.email}</span>.
            </p>
            {user ? (
              <AcceptInvite token={token} expectedEmail={found.invite.email} userEmail={user.email} />
            ) : (
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/login?next=/invite/${encodeURIComponent(token)}`}
                  className="btn-poster bg-tomato text-[14px] text-paper"
                >
                  Sign in to accept
                </Link>
                <Link
                  href={`/signup?next=/invite/${encodeURIComponent(token)}`}
                  className="btn-poster bg-white text-[14px] text-coal"
                >
                  Create an account
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </AuthSplit>
  );
}
