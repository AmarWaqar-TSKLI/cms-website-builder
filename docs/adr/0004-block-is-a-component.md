# ADR-0004: Every block is a component; pages store references

**Status:** Accepted

## Context

"Shared/reusable components" is usually a second, special concept bolted onto a
page model — a separate table, separate editing rules, separate rendering. That
duplication is where bugs live. We also need stable identity for blocks so a page
can be diffed and merged (branches) and translated.

## Decision

A page body stores an **ordered list of references** to component records; each
component holds its own tree (`{id, type, props, children}`). Dropping any block
on a page creates a component and a reference to it. There is no separate "shared
component" type:

- a component referenced by **one** page is an ordinary single-use block;
- the same component referenced by **five** pages is a shared header.

Same record, different fan-out. Editing one changes exactly the pages that
reference it. Node ids inside a component are **stable** across edits. Each of
pages and components has the same trio: identity row, one mutable **draft**,
append-only **revisions** — one versioning story applied to both.

## Consequences

- **+** "Reusable components" costs no extra machinery — it's the fan-out of a
  reference.
- **+** Stable node ids make branch diff/merge and translation match blocks
  precisely (`src/lib/branch.ts`, `src/lib/translate.ts`).
- **+** Locking is per component, so two people editing different sections of one
  page don't collide.
- **−** Expansion (`@component` → its tree) must be a pure, reversible transform
  shared by editor, worker and tests (`src/lib/shared-components.ts`), with cycle
  detection at publish. A round-trip test guards that decompose is the exact
  inverse of expand.
