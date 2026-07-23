/**
 * Description → React elements. Shared by EVERY consumer: the hosted runtime,
 * the editor canvas and the export.
 *
 * This module deliberately does not import react-dom/server. Turning React into
 * an HTML string is the export's job and lives in ./html.tsx, which the runtime
 * has no import path to — Next enforces that boundary at build time, and it is
 * the successor to the old "serve.ts cannot import a renderer" rule. The runtime
 * renders components; it never generates a document.
 */
// Explicit React import: the worker and the test runner compile this file with
// the classic JSX transform (tsconfig keeps jsx:"preserve" for Next's own
// pipeline), so the factory has to be in scope.
import React from "react";
import type { ReactNode } from "react";
import { getComponent } from "../registry";
import { expandComponents } from "../shared-components";
import type { PageNode, RenderContext } from "../registry/types";

/**
 * Expand shared components, then render.
 *
 * Expansion happens once, here, as a tree transform — not as a special case
 * inside the recursion. That keeps `renderNodes` a plain registry walk and means
 * the editor canvas can reuse the exact same transform, which is the only reason
 * the canvas and the artifact can be trusted to agree.
 */
export function renderBody(nodes: PageNode[], ctx: RenderContext): ReactNode {
  return renderNodes(expandComponents(nodes, ctx.components ?? {}), ctx);
}

/** Recursively resolve node types through the registry and render them. */
export function renderNodes(nodes: PageNode[], ctx: RenderContext): ReactNode {
  return nodes.map((node) => {
    const entry = getComponent(node.type);
    if (!entry) {
      // An artifact built by an older codebase can name a component we removed.
      // Degrade visibly rather than throwing away the whole page.
      return (
        <div
          key={node.id}
          data-cms-unknown={node.type}
          style={{
            padding: "16px 24px",
            fontFamily: "ui-monospace, monospace",
            fontSize: "13px",
            color: "#a1a1aa",
            border: "1px dashed #3f3f46",
            margin: "12px 24px",
            borderRadius: "8px",
          }}
        >
          Unknown component “{node.type}”
        </div>
      );
    }
    const children = node.children?.length ? renderNodes(node.children, ctx) : undefined;
    return (
      <div
        key={node.id}
        data-cms-node={node.id}
        data-cms-type={node.type}
        // Provenance for nodes that came out of a symbol. Purely informational in
        // the artifact; the editor uses the same attribute to refuse in-place
        // edits and point you at the component instead.
        data-cms-from-component={node.fromComponent?.componentId}
        data-cms-instance={node.fromComponent?.instanceId}
      >
        {entry.render({ node, props: node.props ?? {}, ctx, children })}
      </div>
    );
  });
}
