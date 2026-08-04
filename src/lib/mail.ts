/**
 * The mail seam — one function, env-gated, dependency-free.
 *
 * Speaks the Resend REST API over plain fetch (MAIL_API_KEY + MAIL_FROM), the
 * same no-SDK pattern as storage, rate limiting and the AI providers. Unset,
 * mailConfigured() is false and every caller degrades visibly — an invite shows
 * its link to copy, a form submission is dashboard-only — rather than failing.
 *
 * Every send is best-effort by contract: nothing in the product is allowed to
 * fail because an email couldn't go out.
 */
import { captureError } from "./monitor";

const API_URL = process.env.MAIL_API_URL?.trim() || "https://api.resend.com/emails";

export function mailConfigured(): boolean {
  return !!(process.env.MAIL_API_KEY?.trim() && process.env.MAIL_FROM?.trim());
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Send one email. Returns whether it was accepted; never throws. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const key = process.env.MAIL_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!key || !from) return false;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      captureError(new Error(`mail provider returned ${res.status}`), { scope: "mail" });
      return false;
    }
    return true;
  } catch (err) {
    captureError(err, { scope: "mail" });
    return false;
  }
}
