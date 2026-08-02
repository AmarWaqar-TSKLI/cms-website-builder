# ADR-0005: One registry drives rendering, editing, dependencies — and the AI

**Status:** Accepted

## Context

The editor's properties panel, the "what breaks if I delete this product?"
warnings, the renderer, and the AI features all need to know the same thing: what
a block *is* and what props it has. Encoding that knowledge four times guarantees
they drift.

## Decision

One **registry** entry per block type declares a schema (`props` with kinds like
`text`, `ref`, `refList`) and a pure `render(props)` function. From that one
declaration:

- the editor builds the **properties panel**;
- publish extracts **dependencies** (`ref`/`refList` props → `release_dependencies`);
- the runtime and export **render** identically (same function, two callers);
- the **AI** composes `{type, props}` blocks that are **validated against the
  registry** before they're accepted.

`render` is pure (no hooks, no client state) so it runs under
`renderToStaticMarkup` in the worker *and* in the editor canvas.

## Consequences

- **+** The AI can only ever produce valid blocks for existing types — it cannot
  emit raw HTML, scripts, or unknown props. This is the core injection defense for
  every AI feature (add section, rewrite, rebrand, plan, translate).
- **+** Add a block type once and the panel, deps, rendering and AI all support it.
- **−** `render` must stay pure and free of `react-dom/server` imports so it's
  usable from the RSC runtime; the string-rendering path lives in a separate,
  worker-only module (see [ADR-0006](0006-domains-and-tls.md) neighbours and the
  `export-next` dynamic-import note in ARCHITECTURE.md).
- **−** Theme tokens become raw CSS custom properties, so they're sanitized at the
  sink (`src/lib/theme.ts`) — a stored-XSS via a crafted token was found and closed
  there.
