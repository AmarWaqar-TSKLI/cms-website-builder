# ADR-0002: Two tiers — versioned engine, live modules

**Status:** Accepted

## Context

Some things about a site *should* roll back with a design (the words, the layout,
the theme). Some things *must not* (a placed order, a customer record, a form
submission). A single "version everything" model would let restoring last week's
homepage un-place this week's orders. A single "version nothing" model loses the
ability to roll back a design at all.

## Decision

Split the schema into two tiers:

- **Tier 1 — engine (versioned):** pages, components, themes, releases. Revision
  tables are append-only.
- **Tier 2 — modules (live):** products, orders, customers, posts, form
  submissions. No revision tables; deletes are soft.

Exactly **one** column crosses the boundary: `sites.live_release_id`. Tier-2 data
that a page references (e.g. product titles/prices) is *frozen* into
`release_data` at publish time, so rendering a release is a pure function of
immutable rows and doesn't drift as the live catalogue changes.

## Consequences

- **+** Rollback is safe: design reverts, business records don't move.
- **+** Rendering a release is deterministic and cacheable forever.
- **−** Frozen Tier-2 data can drift from the live record between publishes. This
  is *accepted* and made visible by the reverse dependency index
  (`release_dependencies`), which powers "3 live releases use this product" before
  a delete.
