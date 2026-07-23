/**
 * AUTHENTICATION — who is asking.
 *
 * Real, not faked. Two features depend on knowing the answer — "who changed
 * this?" and "somebody else is editing this page" — and neither can be built on
 * a placeholder.
 *
 * Deliberately dependency-free. Node ships scrypt and a CSPRNG, so there is no
 * bcrypt or next-auth here; a password hash and a random token are not the place
 * to take on supply-chain risk for convenience.
 *
 * The three decisions worth defending:
 *
 *   1. PASSWORDS are scrypt with a per-user salt, and the parameters are stored
 *      alongside the hash. Raising the cost later is then a matter of rehashing
 *      on next login rather than invalidating everyone's password at once.
 *
 *   2. SESSION TOKENS are 32 random bytes. The database stores only a SHA-256 of
 *      the token, so reading the sessions table does not let anyone sign in as
 *      anybody — the same argument as hashing passwords, applied one level up.
 *      A plain hash is right here where it would be wrong for a password: the
 *      token is already high-entropy, so there is nothing to brute-force.
 *
 *   3. COMPARISONS are timing-safe. Both the password check and the session
 *      lookup avoid leaking how much of a value matched.
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { prisma } from "./db";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

export const SESSION_COOKIE = "cms_session";
const SESSION_DAYS = 14;

/** OWASP's floor for scrypt. N is the expensive one; r and p tune memory/threads. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

// ─────────────────────────────────────────────────────────────── passwords ───

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, {
    ...SCRYPT,
    maxmem: 64 * 1024 * 1024,
  });
  // The parameters travel with the hash so they can be changed later.
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");

  let actual: Buffer;
  try {
    actual = await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
  } catch {
    return false;
  }

  // Length check first: timingSafeEqual throws on a mismatch, and the length of
  // a hash is not a secret.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// ──────────────────────────────────────────────────────────────── sessions ───

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Start a session. Returns the plaintext token — the ONLY moment it exists
 * outside the user's cookie.
 */
export async function createSession(userId: string, userAgent?: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: userAgent?.slice(0, 250) ?? null,
    },
  });

  // Opportunistic cleanup. A cron would be tidier; doing it on login keeps the
  // demo to one moving part and the table small either way.
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  return token;
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** The signed-in user, or null. Never throws — callers decide what to do. */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.deleteMany({ where: { tokenHash: session.tokenHash } });
    return null;
  }

  // Cheap "last active" tracking, throttled so a busy tab is not writing on
  // every request.
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session
      .update({ where: { tokenHash: session.tokenHash }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }

  return session.user;
}

export async function currentUserId(): Promise<string | null> {
  return (await currentUser())?.id ?? null;
}

/** Thrown by requireUser / requireSiteAccess. Routes turn it into a status. */
export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new AuthError(401, "Not signed in");
  return user;
}

// ─────────────────────────────────────────────────────────── authorisation ───

/**
 * May this user touch this site?
 *
 * Access is by ORGANISATION MEMBERSHIP, not by a flag on the user. Everyone in
 * an org can reach every site in it — which is what was asked for — but a user
 * in another org gets 403, and that boundary is checked on the server for every
 * site-scoped request rather than hidden by not linking to it.
 */
export async function requireSiteAccess(userId: string, siteId: string): Promise<void> {
  const allowed = await prisma.site.count({
    where: { id: siteId, org: { memberships: { some: { userId } } } },
  });
  if (allowed === 0) {
    // Deliberately the same answer whether the site is missing or simply not
    // theirs. Distinguishing them would let anyone enumerate site ids.
    throw new AuthError(403, "No access to this site");
  }
}

/** Every site this user can reach. The dashboard's list. */
export async function sitesForUser(userId: string) {
  return prisma.site.findMany({
    where: { org: { memberships: { some: { userId } } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Resolve a page to its site, checking access on the way. */
export async function requirePageAccess(userId: string, pageId: string): Promise<string> {
  const page = await prisma.page.findFirst({
    where: { id: pageId, deletedAt: null },
    select: { siteId: true },
  });
  if (!page) throw new AuthError(403, "No access to this page");
  await requireSiteAccess(userId, page.siteId);
  return page.siteId;
}

export async function requireComponentAccess(userId: string, componentId: string): Promise<string> {
  const component = await prisma.component.findFirst({
    where: { id: componentId, deletedAt: null },
    select: { siteId: true },
  });
  if (!component) throw new AuthError(403, "No access to this component");
  await requireSiteAccess(userId, component.siteId);
  return component.siteId;
}
