/**
 * Small server-side helpers shared by the post routes.
 *
 * A post's editable body lives in its current revision (there is no post_drafts
 * table — bodies are versioned directly). The body shape is deliberately plain:
 * a version tag and text, so it stays readable if the format ever grows.
 */
import { prisma } from "./db";

export interface PostBody {
  version: 1;
  text: string;
}

export const EMPTY_POST_BODY: PostBody = { version: 1, text: "" };

/** Read the text out of a stored revision body, whatever shape it's in. */
export function bodyTextOf(body: unknown): string {
  if (body && typeof body === "object" && "text" in body) {
    const t = (body as { text: unknown }).text;
    return typeof t === "string" ? t : "";
  }
  return "";
}

/** First free slug for this site: "hello", then "hello-2", "hello-3"… */
export async function uniqueSlug(
  siteId: string,
  base: string,
  excludeId?: string,
): Promise<string> {
  const root = base || "post";
  for (let n = 1; ; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    const clash = await prisma.post.findFirst({
      where: { siteId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!clash) return slug;
  }
}
