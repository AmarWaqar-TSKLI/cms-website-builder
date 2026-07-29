import { describe, expect, it } from "vitest";
import {
  cleanSubmission,
  isHoneypotTripped,
  HONEYPOT_FIELD,
  MAX_FIELDS,
  MAX_VALUE_LEN,
} from "../../src/lib/forms";

describe("form submissions", () => {
  it("keeps filled fields, drops empties, and lifts out an email", () => {
    const clean = cleanSubmission({ name: " Ada ", email: "ADA@EXAMPLE.COM ", message: "   " });
    expect(clean).not.toBeNull();
    // Values are trimmed but case-preserved; the message was only whitespace, so gone.
    expect(clean!.fields).toEqual({ name: "Ada", email: "ADA@EXAMPLE.COM" });
    // The email is lifted out lowercased for a tidy inbox and a reply link.
    expect(clean!.email).toBe("ada@example.com");
  });

  it("returns null when nothing usable was submitted", () => {
    expect(cleanSubmission({ a: "  ", b: "" })).toBeNull();
    expect(cleanSubmission(null)).toBeNull();
    expect(cleanSubmission("not an object")).toBeNull();
  });

  it("caps the number of fields and the length of any value", () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < MAX_FIELDS + 20; i++) many[`f${i}`] = "x";
    expect(Object.keys(cleanSubmission(many)!.fields).length).toBe(MAX_FIELDS);

    const long = cleanSubmission({ msg: "a".repeat(MAX_VALUE_LEN + 500) });
    expect(long!.fields.msg.length).toBe(MAX_VALUE_LEN);
  });

  it("detects a tripped honeypot and never stores it as a real field", () => {
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: "i am a bot" })).toBe(true);
    expect(isHoneypotTripped({ name: "Ada" })).toBe(false);
    const clean = cleanSubmission({ name: "Ada", [HONEYPOT_FIELD]: "bot" });
    expect(clean!.fields).not.toHaveProperty(HONEYPOT_FIELD);
    expect(clean!.fields).toEqual({ name: "Ada" });
  });
});
