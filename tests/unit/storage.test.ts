import { describe, expect, it, beforeEach } from "vitest";
import {
  storeUpload,
  inlineForFreeze,
  resolveMediaUrl,
  usingObjectStorage,
} from "../../src/lib/storage";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const S3_ENV = [
  "STORAGE_S3_ENDPOINT",
  "STORAGE_S3_BUCKET",
  "STORAGE_S3_ACCESS_KEY_ID",
  "STORAGE_S3_SECRET_ACCESS_KEY",
  "STORAGE_S3_REGION",
  "STORAGE_S3_PUBLIC_BASE",
];

describe("storage seam", () => {
  beforeEach(() => {
    for (const k of S3_ENV) delete process.env[k];
  });

  it("keeps uploads inline as data URIs by default — I13 (no object store)", async () => {
    expect(usingObjectStorage()).toBe(false);
    expect(await storeUpload(PNG, { mime: "image/png", siteId: "s1", id: "m1" })).toBe(PNG);
  });

  it("passes data URIs and non-URLs through the freeze inliner unchanged", async () => {
    // The default path must never touch the network.
    expect(await inlineForFreeze(PNG)).toBe(PNG);
    expect(await inlineForFreeze("")).toBe("");
    expect(await inlineForFreeze("not-a-url")).toBe("not-a-url");
  });

  it("resolves a stored key to a usable url (identity today)", () => {
    expect(resolveMediaUrl(PNG)).toBe(PNG);
    expect(resolveMediaUrl("https://cdn.example.test/x.png")).toBe("https://cdn.example.test/x.png");
  });

  it("reports object storage as configured only when the full env is set", () => {
    expect(usingObjectStorage()).toBe(false);
    process.env.STORAGE_S3_ENDPOINT = "https://s3.example.test";
    process.env.STORAGE_S3_BUCKET = "b";
    // Still incomplete — no credentials.
    expect(usingObjectStorage()).toBe(false);
    process.env.STORAGE_S3_ACCESS_KEY_ID = "ak";
    process.env.STORAGE_S3_SECRET_ACCESS_KEY = "sk";
    expect(usingObjectStorage()).toBe(true);
  });
});
