import { afterEach, describe, expect, it } from "vitest";
import {
  domainMatchCandidates,
  domainTarget,
  normalizeDomain,
} from "../../src/lib/domains";

/**
 * A non-technical owner types a domain any of a dozen ways. `normalizeDomain`
 * has to turn all the reasonable ones into the same bare hostname and reject the
 * ones that could never be served — before the value ever reaches the database
 * (where it becomes a UNIQUE key). These tests pin both halves.
 */
describe("normalizeDomain", () => {
  it("forgives scheme, path, port, case, whitespace and a trailing dot", () => {
    const cases: [string, string][] = [
      ["golotto.com", "golotto.com"],
      ["  Golotto.COM  ", "golotto.com"],
      ["https://golotto.com", "golotto.com"],
      ["http://www.Golotto.com/pricing?ref=x", "www.golotto.com"],
      ["golotto.com:3000", "golotto.com"],
      ["golotto.com.", "golotto.com"],
      ["shop.golotto.co.uk", "shop.golotto.co.uk"],
    ];
    for (const [input, expected] of cases) {
      const r = normalizeDomain(input);
      expect(r.ok, `"${input}" should be accepted`).toBe(true);
      if (r.ok) expect(r.domain).toBe(expected);
    }
  });

  it("rejects what can never be a public site domain", () => {
    const bad = [
      "", // empty
      "   ", // whitespace only
      "localhost", // reserved
      "site.localhost", // reserved suffix
      "golotto", // single label, no dot
      "not a domain.com", // space in a label
      "-bad.com", // label starts with a hyphen
      "bad-.com", // label ends with a hyphen
      "golotto.c", // one-character TLD
      "site.123", // numeric TLD
      "192.168.0.1", // bare IP
    ];
    for (const input of bad) {
      const r = normalizeDomain(input);
      expect(r.ok, `"${input}" should be rejected`).toBe(false);
      if (!r.ok) expect(r.error).toBeTruthy();
    }
  });

  it("rejects non-strings", () => {
    expect(normalizeDomain(undefined).ok).toBe(false);
    expect(normalizeDomain(42).ok).toBe(false);
    expect(normalizeDomain(null).ok).toBe(false);
  });
});

describe("domainMatchCandidates", () => {
  it("treats apex and www as the same site, and strips port + trailing dot", () => {
    expect(domainMatchCandidates("golotto.com").sort()).toEqual(
      ["golotto.com", "www.golotto.com"].sort(),
    );
    expect(domainMatchCandidates("www.golotto.com").sort()).toEqual(
      ["golotto.com", "www.golotto.com"].sort(),
    );
    expect(domainMatchCandidates("golotto.com:3000")).toContain("golotto.com");
    expect(domainMatchCandidates("golotto.com.")).toContain("golotto.com");
  });
});

describe("domainTarget", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.CUSTOM_DOMAIN_CNAME = saved.CUSTOM_DOMAIN_CNAME;
    process.env.CUSTOM_DOMAIN_IP = saved.CUSTOM_DOMAIN_IP;
  });

  it("prefers a CNAME target, falls back to an IP, else none", () => {
    delete process.env.CUSTOM_DOMAIN_CNAME;
    delete process.env.CUSTOM_DOMAIN_IP;
    expect(domainTarget()).toEqual({ kind: "none", value: null });

    process.env.CUSTOM_DOMAIN_IP = "203.0.113.10";
    expect(domainTarget()).toEqual({ kind: "a", value: "203.0.113.10" });

    process.env.CUSTOM_DOMAIN_CNAME = "sites.example.com";
    expect(domainTarget()).toEqual({ kind: "cname", value: "sites.example.com" });
  });
});
