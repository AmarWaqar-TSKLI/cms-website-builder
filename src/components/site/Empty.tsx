/**
 * The two states a published-site URL can be in without having a page to show.
 *
 * Both are deliberately explanatory rather than a bare 404. "Nothing published
 * yet" is the single most common confusion when someone first runs this — a site
 * with pages in the database and no release genuinely has nothing to serve, and
 * saying so is more useful than a status code.
 */
import React from "react";

const SHELL: React.CSSProperties = {
  margin: 0,
  background: "#08080a",
  color: "#e8e8ef",
  fontFamily: "Inter, system-ui, sans-serif",
  display: "grid",
  placeItems: "center",
  minHeight: "100vh",
};

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={SHELL}>
      <div style={{ maxWidth: 560, padding: 40, textAlign: "center" }}>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 650,
            letterSpacing: "-.02em",
            margin: "0 0 12px",
          }}
        >
          {title}
        </h1>
        <div style={{ color: "#9a9aad", lineHeight: 1.65 }}>{children}</div>
      </div>
    </div>
  );
}

export function NotPublished({ site }: { site: { name: string } }) {
  return (
    <Shell title="Nothing published yet">
      <p style={{ margin: "0 0 24px" }}>
        <strong>{site.name}</strong> has pages in the database but no finished release, so there is
        nothing to serve. That is not a bug — a site becomes live only once a publish has been
        snapshotted and its data frozen.
      </p>
      <a
        href="/dashboard"
        style={{
          display: "inline-block",
          background: "#6d5cff",
          color: "#fff",
          padding: "11px 22px",
          borderRadius: 10,
          textDecoration: "none",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        Open the dashboard and publish
      </a>
    </Shell>
  );
}

export function PageMissing({
  site,
  path,
  version,
}: {
  site: { name: string; slug: string };
  path: string;
  version: number;
}) {
  return (
    <Shell title="404">
      <p style={{ margin: "0 0 24px" }}>
        No page at <code style={{ color: "#c8c8d4" }}>{path}</code> in the release currently being
        served (v{version}) of <strong>{site.name}</strong>.
      </p>
      <a href={`/s/${site.slug}`} style={{ color: "#a89dff" }}>
        Back to the home page
      </a>
    </Shell>
  );
}
