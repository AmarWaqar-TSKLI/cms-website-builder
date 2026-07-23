/**
 * The shared-component reference, as a first-class registry entry.
 *
 * It would have been easy to special-case "@component" in the renderer, in
 * extraction, and in the properties panel. Making it a real registry entry
 * instead means it inherits all three for free:
 *
 *   - `refs.ts` walks prop schemas looking for `kind: "ref"`. Declaring
 *     `componentId` that way is the entire reason a page→component dependency
 *     lands in release_dependencies with no change to the extractor.
 *   - the properties panel renders `ref` props from the same schema.
 *   - the renderer resolves types through the registry, so an old revision
 *     naming a component we no longer support degrades the same visible way as
 *     any other unknown block.
 *
 * Expansion fills this node's children with the symbol's tree before rendering
 * starts, so the common case here is simply "render what expansion put inside
 * me". The placeholder branch means exactly one thing: the reference could not
 * be resolved, and this is where it was.
 */
import React from "react";
import type { RegistryEntry } from "./types";

export const SHARED_COMPONENT_ENTRY: RegistryEntry = {
  schema: {
    name: "@component",
    label: "Component",
    description: "An instance of a shared component. Edit it once, everywhere changes.",
    category: "layout",
    icon: "◈",
    // Never dragged in generically — you insert a *particular* symbol, and the
    // palette lists the site's symbols separately.
    hidden: true,
    styleable: false,
    props: {
      componentId: {
        label: "Component",
        kind: "ref",
        ref: "component",
        default: "",
        help: "Which shared component this instance shows.",
      },
      overrides: {
        label: "Overrides",
        kind: "text",
        default: {},
        help: "Per-instance prop values, keyed by the node id inside the component.",
      },
    },
  },

  render: ({ props, ctx, children }) => {
    // Expansion resolved it — this instance is just its definition's tree.
    if (children) return <>{children}</>;

    const id = typeof props.componentId === "string" ? props.componentId : "";
    const known = id ? ctx.components?.[id] : undefined;
    const name = known?.name;

    return (
      <div
        data-cms-component-missing={id || "unset"}
        style={{
          margin: "12px 24px",
          padding: "16px 20px",
          border: "1px dashed #3f3f46",
          borderRadius: "8px",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "13px",
          lineHeight: 1.6,
          color: "#a1a1aa",
        }}
      >
        {name
          ? `Shared component “${name}” is not available in this release.`
          : "Shared component is missing."}
      </div>
    );
  },
};
