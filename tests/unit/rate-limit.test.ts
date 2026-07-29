import { describe, expect, it, beforeEach } from "vitest";
import {
  checkRateLimit,
  usingSharedRateLimiter,
  __resetRateLimiter,
} from "../../src/lib/rate-limit";

describe("rate limiter (in-memory fallback)", () => {
  beforeEach(() => {
    delete process.env.RATE_LIMIT_REST_URL;
    delete process.env.RATE_LIMIT_REST_TOKEN;
    __resetRateLimiter();
  });

  it("allows up to the max, then limits", async () => {
    for (let i = 1; i <= 3; i++) {
      const r = await checkRateLimit("login:a", { windowMs: 1000, max: 3 });
      expect(r.limited).toBe(false);
      expect(r.count).toBe(i);
    }
    const over = await checkRateLimit("login:a", { windowMs: 1000, max: 3 });
    expect(over.limited).toBe(true);
    expect(over.count).toBe(4);
  });

  it("keeps counters separate per key", async () => {
    expect((await checkRateLimit("k1", { windowMs: 1000, max: 1 })).limited).toBe(false);
    expect((await checkRateLimit("k2", { windowMs: 1000, max: 1 })).limited).toBe(false);
    // k1 again crosses its own limit; k2 is untouched.
    expect((await checkRateLimit("k1", { windowMs: 1000, max: 1 })).limited).toBe(true);
  });

  it("reports whether a shared cross-instance backend is configured", () => {
    expect(usingSharedRateLimiter()).toBe(false);
    process.env.RATE_LIMIT_REST_URL = "https://rate.example.test";
    process.env.RATE_LIMIT_REST_TOKEN = "tok";
    expect(usingSharedRateLimiter()).toBe(true);
  });
});
