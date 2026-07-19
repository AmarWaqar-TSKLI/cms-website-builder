import { cookies } from "next/headers";
import { prisma } from "./db";

/**
 * FAKED AUTH — explicitly out of scope.
 *
 * There is no login UI and no password check. The seed creates one user and
 * every request is treated as that user. A cookie is still set and read so the
 * session plumbing is in the right shape, but it proves nothing about identity.
 * Listed in the "what's faked" section of the README.
 */
export const SESSION_COOKIE = "cms_session";

export async function currentUser() {
  const store = await cookies();
  const userId = store.get(SESSION_COOKIE)?.value;

  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) return user;
  }
  // No cookie yet (or a stale one): fall back to the single seeded user.
  return prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
}

export async function currentUserId(): Promise<string | null> {
  const user = await currentUser();
  return user?.id ?? null;
}
