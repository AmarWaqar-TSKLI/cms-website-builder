/**
 * Form-submission validation — pure, so it is testable without a database.
 *
 * A form's SHAPE is the author's to decide (that is why FormSubmission.data is
 * JSON), so this does not enforce which fields exist. What it does is keep a
 * public, unauthenticated endpoint from being a hole: it bounds how many fields
 * and how much text one submission can carry, drops empties, strips a honeypot
 * field, and lifts out an email for a readable inbox and a reply link.
 */

/** Beyond these, a submission is almost certainly abuse rather than a message. */
export const MAX_FIELDS = 24;
export const MAX_VALUE_LEN = 5000;
export const MAX_KEY_LEN = 80;

/**
 * A field real people never see or fill. A bot that fills every input trips it,
 * and we drop the submission while telling the bot it succeeded. Named with a
 * leading underscore so it never collides with a real field.
 */
export const HONEYPOT_FIELD = "_hp";

// Intentionally loose: good enough to pull an address out for display, not a
// gatekeeper. The endpoint stores the message regardless of whether it parses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CleanSubmission {
  fields: Record<string, string>;
  email: string | null;
}

/** True when the honeypot field was filled — treat as a bot, store nothing. */
export function isHoneypotTripped(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const value = (raw as Record<string, unknown>)[HONEYPOT_FIELD];
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

/**
 * Clean submitted fields into something safe to store. Returns null when there
 * is nothing usable left (all empty), which the caller turns into a 400.
 */
export function cleanSubmission(raw: unknown): CleanSubmission | null {
  if (!raw || typeof raw !== "object") return null;

  const entries = Object.entries(raw as Record<string, unknown>)
    .filter(([key]) => key !== HONEYPOT_FIELD && key.length > 0 && key.length <= MAX_KEY_LEN)
    .slice(0, MAX_FIELDS);

  const fields: Record<string, string> = {};
  for (const [key, value] of entries) {
    const asString = typeof value === "string" ? value : value == null ? "" : String(value);
    const trimmed = asString.slice(0, MAX_VALUE_LEN).trim();
    if (trimmed) fields[key] = trimmed;
  }

  if (Object.keys(fields).length === 0) return null;
  return { fields, email: findEmail(fields) };
}

/** Prefer a field whose name mentions email; otherwise any address-shaped value. */
function findEmail(fields: Record<string, string>): string | null {
  for (const [key, value] of Object.entries(fields)) {
    if (key.toLowerCase().includes("email") && EMAIL_RE.test(value)) return value.toLowerCase();
  }
  for (const value of Object.values(fields)) {
    if (EMAIL_RE.test(value)) return value.toLowerCase();
  }
  return null;
}
