/**
 * Content-API keys — mint, hash, verify.
 *
 * The security model is identical to sessions (see schema.prisma): we store only
 * a SHA-256 of the token, so the database never holds anything that can read a
 * site. The plaintext is returned to the caller exactly once, at creation, and
 * is unrecoverable after that. Verification hashes the incoming token and looks
 * it up by that hash — an indexed equality match, so there is no secret-dependent
 * timing to attack.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";

const PREFIX = "cms_live_";

export interface MintedKey {
  /** The full secret — shown to the owner once, never stored. */
  token: string;
  /** SHA-256 of the token, stored in api_keys.key_hash. */
  hash: string;
  /** Non-secret display prefix, e.g. "cms_live_a1b2c3d4…". */
  prefix: string;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Generate a fresh key. 32 random bytes → 256 bits of entropy. */
export function mintKey(): MintedKey {
  const token = PREFIX + randomBytes(32).toString("hex");
  return { token, hash: hashToken(token), prefix: `${token.slice(0, PREFIX.length + 8)}…` };
}

/** Cheap shape check so a malformed header never reaches a DB lookup. */
export function looksLikeKey(token: string): boolean {
  return typeof token === "string" && token.startsWith(PREFIX) && token.length >= PREFIX.length + 32;
}

export interface VerifiedKey {
  id: string;
  siteId: string;
}

/**
 * Resolve a bearer token to the site it can read, or null. Rejects revoked keys
 * and keys whose site has been archived. Stamps last_used_at (fire-and-forget —
 * a telemetry write must never fail or slow a read).
 */
export async function verifyKey(token: string): Promise<VerifiedKey | null> {
  if (!looksLikeKey(token)) return null;
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: hashToken(token) },
    select: { id: true, siteId: true, revokedAt: true, site: { select: { deletedAt: true } } },
  });
  if (!row || row.revokedAt || row.site.deletedAt) return null;

  prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { id: row.id, siteId: row.siteId };
}
