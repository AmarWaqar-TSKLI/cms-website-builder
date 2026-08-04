import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeSignature } from "../../src/lib/payments";

const SECRET = "whsec_test_secret";
const BODY = '{"type":"checkout.session.completed"}';

const sign = (body: string, t: number, secret = SECRET) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

describe("verifyStripeSignature", () => {
  const now = 1_800_000_000_000; // fixed clock for determinism
  const t = Math.floor(now / 1000);

  it("accepts a correctly signed payload", () => {
    expect(verifyStripeSignature(BODY, sign(BODY, t), SECRET, now)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyStripeSignature(BODY + " ", sign(BODY, t), SECRET, now)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(verifyStripeSignature(BODY, sign(BODY, t, "whsec_other"), SECRET, now)).toBe(false);
  });

  it("rejects a stale timestamp (replay window)", () => {
    const old = t - 600; // 10 minutes ago, tolerance is 5
    expect(verifyStripeSignature(BODY, sign(BODY, old), SECRET, now)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyStripeSignature(BODY, null, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(BODY, "v1=abc", SECRET, now)).toBe(false);
    expect(verifyStripeSignature(BODY, `t=${t}`, SECRET, now)).toBe(false);
  });
});
