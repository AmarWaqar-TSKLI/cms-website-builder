/**
 * A URL slug from a title. Pure — the uniqueness check that needs the database
 * lives in the route; this just does the string part.
 *
 * NFKD splits an accented letter into a base letter plus a combining mark; the
 * mark is non-alphanumeric, so the next step drops it and the base letter
 * survives ("café" → "cafe").
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-") // anything not a-z/0-9 becomes a hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .slice(0, 80)
    .replace(/-+$/g, ""); // a trailing hyphen the slice may have exposed
}
