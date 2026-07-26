/**
 * A blog post, expressed as ordinary page blocks.
 *
 * A post-detail page isn't a separate renderer — it's the same renderer fed a
 * small tree built from the frozen post: a heading, a date, and a text block.
 * Both hosts use it (the runtime route and the export), so a post page renders
 * from one place and stays deterministic — the ids are fixed and the date is
 * formatted in UTC, so rendering it twice produces the same bytes.
 */
import type { PageNode, ResolvedPost } from "./registry/types";

/** "January 2, 2026" in UTC, so the build and the runtime agree. */
export function postDateLong(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The path a post is served at. */
export function postPath(slug: string): string {
  return `/blog/${slug}`;
}

export function postPageNodes(post: ResolvedPost): PageNode[] {
  const nodes: PageNode[] = [
    {
      id: "post-title",
      type: "Heading",
      props: { text: post.title, level: "h2", size: 46, paddingBottom: 6 },
      children: [],
    },
  ];

  const date = postDateLong(post.publishedAt);
  if (date) {
    nodes.push({
      id: "post-date",
      type: "TextBlock",
      props: { body: date, size: 14, paddingTop: 0, paddingBottom: 14 },
      children: [],
    });
  }

  nodes.push({
    id: "post-body",
    type: "TextBlock",
    props: { body: post.body, size: 18, lineHeight: 175, measure: 68 },
    children: [],
  });

  return nodes;
}
