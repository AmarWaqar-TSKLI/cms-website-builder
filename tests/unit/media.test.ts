import { describe, expect, it } from "vitest";
import {
  ALLOWED_IMAGE_MIME,
  MAX_MEDIA_BYTES,
  cleanLabel,
  validateImageDataUri,
} from "../../src/lib/media";

/** A base64 data URI whose decoded payload is exactly `bytes` long. */
function dataUriOfSize(mime: string, bytes: number): string {
  // 3 raw bytes -> 4 base64 chars, no padding, so this lands on an exact size.
  const raw = "A".repeat(bytes);
  const b64 = Buffer.from(raw, "utf8").toString("base64");
  return `data:${mime};base64,${b64}`;
}

describe("validateImageDataUri", () => {
  it("accepts a small base64 PNG and reports its mime and size", () => {
    const uri = dataUriOfSize("image/png", 30);
    const result = validateImageDataUri(uri);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mime).toBe("image/png");
      expect(result.value.sizeBytes).toBe(30);
      expect(result.value.dataUri).toBe(uri);
    }
  });

  it("accepts every allowed image type", () => {
    for (const mime of ALLOWED_IMAGE_MIME) {
      expect(validateImageDataUri(dataUriOfSize(mime, 12)).ok).toBe(true);
    }
  });

  it("rejects a non-image mime even as a valid data URI", () => {
    const result = validateImageDataUri(dataUriOfSize("application/pdf", 12));
    expect(result.ok).toBe(false);
  });

  it("rejects anything that isn't a base64 data URI", () => {
    expect(validateImageDataUri("https://example.com/cat.png").ok).toBe(false);
    expect(validateImageDataUri("data:image/png,notbase64").ok).toBe(false);
    expect(validateImageDataUri("").ok).toBe(false);
    expect(validateImageDataUri(null).ok).toBe(false);
    expect(validateImageDataUri(42).ok).toBe(false);
  });

  it("rejects an image over the size cap but accepts one just under it", () => {
    expect(validateImageDataUri(dataUriOfSize("image/jpeg", MAX_MEDIA_BYTES + 3)).ok).toBe(false);
    expect(validateImageDataUri(dataUriOfSize("image/jpeg", MAX_MEDIA_BYTES - 3)).ok).toBe(true);
  });

  it("rejects an empty payload", () => {
    expect(validateImageDataUri("data:image/png;base64,").ok).toBe(false);
  });
});

describe("cleanLabel", () => {
  it("trims, caps length, and nulls out empties", () => {
    expect(cleanLabel("  hero.png  ")).toBe("hero.png");
    expect(cleanLabel("")).toBeNull();
    expect(cleanLabel("   ")).toBeNull();
    expect(cleanLabel(123)).toBeNull();
    expect(cleanLabel("x".repeat(500), 200)?.length).toBe(200);
  });
});
