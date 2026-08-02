# ADR-0001: A page is a description, not a document

**Status:** Accepted

## Context

The naive CMS stores a page as rendered HTML (or a blob that renders to one).
That couples "what the page says" to "the bytes a visitor got", which makes
versioning, multi-tenant serving, and rollback all awkward: to keep an old
version you keep old HTML; to change how *everything* renders you rewrite every
stored document.

## Decision

Store a page as a **typed description** — an ordered tree of `{ id, type, props }`
blocks — and render it on demand through a component registry. Nothing in the
database is HTML. The same description is rendered by the runtime (as RSC) and by
the export (`renderToStaticMarkup`).

## Consequences

- **+** One change to a component's render function changes every page that uses
  it, across all tenants, with no data migration.
- **+** A page can be diffed, merged, translated and validated as data, because it
  *is* data with stable node ids. Branches and AI translate fall out of this.
- **+** The AI can be constrained to emit only valid `{type, props}` — it never
  produces markup, so it can't inject.
- **−** A registry entry must exist for every block type; an old release naming a
  removed type must degrade visibly rather than crash (it does).
- **−** Rendering happens per request (mitigated by the immutable release cache,
  [ADR-0003](0003-immutable-releases.md)).
