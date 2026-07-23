"use client";

/**
 * The properties panel is GENERATED from the selected component's prop schema.
 *
 * There is no per-component form anywhere in this codebase. The same schema
 * that decides which widget appears here is the one publish walks to write
 * release_dependencies — which is why a reference prop can be labelled as such
 * right in the UI: it is literally the same declaration.
 *
 * Props are grouped into Content / Layout / Style. Because the style props are
 * merged into every component's schema, the Style and Layout sections appear on
 * every block for free.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { findNode, getSchema } from "@/lib/registry";
import type {
  PageNode,
  PropDef,
  PropGroup,
  RefKind,
  ResolvedSharedComponent,
  ThemeTokens,
} from "@/lib/registry/types";
import { useEditor } from "@/lib/editor/store";
import { componentIdOf, isComponentRef, overridesOf } from "@/lib/shared-components";
import { Badge, cx } from "../ui";

export interface RefOptions {
  collection: { value: string; label: string }[];
  product: { value: string; label: string }[];
  media: { value: string; label: string }[];
  post: { value: string; label: string }[];
  component: { value: string; label: string }[];
}

const GROUP_LABEL: Record<PropGroup, string> = {
  content: "Content",
  layout: "Layout",
  style: "Style",
};

/**
 * The panel for one instance of a shared component.
 *
 * Its job is to make the two scopes unmistakable. Editing the component changes
 * every page using it; overriding changes this page and nothing else. Both are
 * one click away, and neither can be reached by accident.
 */
function InstancePanel({
  node,
  components,
}: {
  node: PageNode;
  components: Record<string, ResolvedSharedComponent>;
}) {
  const router = useRouter();
  const setOverride = useEditor((s) => s.setOverride);
  const clearOverrides = useEditor((s) => s.clearOverrides);
  const detachComponent = useEditor((s) => s.detachComponent);
  const removeNode = useEditor((s) => s.removeNode);
  const duplicateNode = useEditor((s) => s.duplicateNode);
  const nudge = useEditor((s) => s.nudge);

  const componentId = componentIdOf(node);
  const definition = componentId ? components[componentId] : undefined;
  const overrides = overridesOf(node);

  if (!definition) {
    return (
      <div className="p-5">
        <p className="text-[13px] font-medium text-ink-200">Component not found</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-400">
          This instance points at a component that has been deleted. Published releases that pinned
          one of its revisions are unaffected — they render it from the frozen revision.
        </p>
        <div className="mt-4">
          <SmallButton onClick={() => removeNode(node.id)} danger>
            Remove this instance
          </SmallButton>
        </div>
      </div>
    );
  }

  // Every text-ish prop inside the symbol, flattened, so the panel can offer
  // per-instance overrides without the user having to click into the symbol.
  const overridable: { nodeId: string; label: string; key: string; def: PropDef }[] = [];
  const collect = (nodes: PageNode[]) => {
    for (const n of nodes) {
      const schema = getSchema(n.type);
      if (schema) {
        for (const [key, def] of Object.entries(schema.props)) {
          if (def.kind !== "text" && def.kind !== "textarea" && def.kind !== "url") continue;
          if ((def.group ?? "content") !== "content") continue;
          overridable.push({ nodeId: n.id, label: `${schema.label} · ${def.label}`, key, def });
        }
      }
      collect(n.children ?? []);
    }
  };
  collect(definition.root ?? []);

  const overrideCount = Object.values(overrides).reduce(
    (total, patch) => total + Object.keys(patch ?? {}).length,
    0,
  );

  const valueFor = (nodeId: string, key: string) => {
    const patched = overrides[nodeId]?.[key];
    if (patched !== undefined) return patched;
    return findNode(definition.root ?? [], nodeId)?.props?.[key] ?? "";
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-800 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink-100">
            <span className="text-[#22c7a9]">◈</span>
            {definition.name}
          </span>
          <Badge tone="neutral">shared</Badge>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-400">
          One definition, used in several places. This block is a reference to it, not a copy.
        </p>

        <button
          type="button"
          onClick={() => router.push(`/editor/component/${definition.id}`)}
          className="mt-3 w-full rounded-lg border border-[#22c7a9]/40 px-3 py-2 text-[12px] font-medium text-[#22c7a9] transition-colors hover:border-[#22c7a9] hover:bg-[#22c7a9]/10"
        >
          Edit component → changes every page using it
        </button>

        <div className="mt-2 flex flex-wrap gap-1">
          <SmallButton onClick={() => nudge(node.id, -1)}>↑ Up</SmallButton>
          <SmallButton onClick={() => nudge(node.id, 1)}>↓ Down</SmallButton>
          <SmallButton onClick={() => duplicateNode(node.id)}>Duplicate</SmallButton>
          <SmallButton onClick={() => detachComponent(node.id, definition)}>Detach</SmallButton>
          <SmallButton onClick={() => removeNode(node.id)} danger>
            Delete
          </SmallButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Group
          title={overrideCount ? `This page only (${overrideCount})` : "This page only"}
          defaultOpen
        >
          <p className="mb-3 text-[11.5px] leading-relaxed text-ink-500">
            Changes here apply to this instance and nothing else. Leave a field as it is and it keeps
            following the component.
          </p>

          {overridable.length === 0 ? (
            <p className="text-[12px] text-ink-500">
              This component has no text to override yet.
            </p>
          ) : (
            overridable.map(({ nodeId, label, key, def }) => {
              const overridden = overrides[nodeId]?.[key] !== undefined;
              return (
                <div key={`${nodeId}:${key}`} className="mb-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-ink-300">{label}</span>
                    {overridden && (
                      <span className="font-mono text-[9.5px] uppercase tracking-wider text-[#22c7a9]">
                        overridden
                      </span>
                    )}
                  </div>
                  {def.kind === "textarea" ? (
                    <textarea
                      rows={3}
                      value={String(valueFor(nodeId, key) ?? "")}
                      onChange={(e) => setOverride(node.id, nodeId, key, e.target.value)}
                      className={cx(
                        "w-full resize-y rounded-lg border bg-ink-950 px-2.5 py-1.5 text-[12.5px] text-ink-100 outline-none focus:border-flux-500",
                        overridden ? "border-[#22c7a9]/50" : "border-ink-700",
                      )}
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(valueFor(nodeId, key) ?? "")}
                      onChange={(e) => setOverride(node.id, nodeId, key, e.target.value)}
                      className={cx(
                        "w-full rounded-lg border bg-ink-950 px-2.5 py-1.5 text-[12.5px] text-ink-100 outline-none focus:border-flux-500",
                        overridden ? "border-[#22c7a9]/50" : "border-ink-700",
                      )}
                    />
                  )}
                </div>
              );
            })
          )}

          {overrideCount > 0 && (
            <SmallButton onClick={() => clearOverrides(node.id)}>
              Reset to the component
            </SmallButton>
          )}
        </Group>
      </div>
    </div>
  );
}

export function Properties({
  refOptions,
  tokens,
  components,
}: {
  refOptions: RefOptions;
  tokens: ThemeTokens;
  components: Record<string, ResolvedSharedComponent>;
}) {
  const selectedId = useEditor((s) => s.selectedId);
  const body = useEditor((s) => s.body);
  const updateProp = useEditor((s) => s.updateProp);
  const removeNode = useEditor((s) => s.removeNode);
  const duplicateNode = useEditor((s) => s.duplicateNode);
  const nudge = useEditor((s) => s.nudge);
  const [showJson, setShowJson] = useState(false);

  const node = selectedId ? findNode(body.root, selectedId) : undefined;

  if (!node) {
    return (
      <div className="p-5">
        <p className="text-[13px] font-medium text-ink-200">Nothing selected</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-400">
          Click a block on the canvas to edit it, or drag one in from the left.
        </p>
        <p className="mt-4 text-[12px] leading-relaxed text-ink-500">
          Double-click text on the canvas to type directly into it.
        </p>
      </div>
    );
  }

  // A shared component instance gets its own panel. The generic schema-driven
  // form would show two useless fields — an id and a blob of overrides — where
  // what is actually wanted is: what is this, where do I edit it, and what can I
  // change here without changing it everywhere.
  if (isComponentRef(node)) {
    return <InstancePanel node={node} components={components} />;
  }

  const schema = getSchema(node.type);
  if (!schema) {
    return <div className="p-5 text-[12px] text-ink-400">No schema for “{node.type}”.</div>;
  }

  const entries = Object.entries(schema.props);
  const groups: PropGroup[] = ["content", "layout", "style"];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-800 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] font-semibold text-ink-100">{schema.label}</span>
          <Badge tone="neutral">{node.type}</Badge>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-400">{schema.description}</p>

        <div className="mt-3 flex flex-wrap gap-1">
          <SmallButton onClick={() => nudge(node.id, -1)}>↑ Up</SmallButton>
          <SmallButton onClick={() => nudge(node.id, 1)}>↓ Down</SmallButton>
          <SmallButton onClick={() => duplicateNode(node.id)}>Duplicate</SmallButton>
          <SmallButton onClick={() => removeNode(node.id)} danger>
            Delete
          </SmallButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.map((group) => {
          const inGroup = entries.filter(
            ([, def]) => (def.group ?? "content") === group,
          );
          if (inGroup.length === 0) return null;
          return (
            <Group key={group} title={GROUP_LABEL[group]} defaultOpen={group === "content"}>
              {inGroup.map(([key, def]) => {
                if (def.showIf && !def.showIf(node.props)) return null;
                return (
                  <Field
                    key={key}
                    def={def}
                    tokens={tokens}
                    value={node.props[key]}
                    refOptions={refOptions}
                    onChange={(v) => updateProp(node.id, key, v)}
                  />
                );
              })}
            </Group>
          );
        })}
      </div>

      <div className="border-t border-ink-800">
        <button
          type="button"
          onClick={() => setShowJson(!showJson)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[11px] text-ink-500 transition-colors hover:text-ink-300"
        >
          <span>What gets stored</span>
          <span>{showJson ? "−" : "+"}</span>
        </button>
        {showJson && (
          // Exactly what lands in the JSONB column. No markup anywhere.
          <pre className="max-h-52 overflow-auto border-t border-ink-800 bg-ink-950 p-3 font-mono text-[10.5px] leading-relaxed text-ink-300">
            {JSON.stringify({ type: node.type, props: node.props }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function Group({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <section className="border-b border-ink-850">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-ink-850"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">
          {title}
        </span>
        <span className="text-[11px] text-ink-500">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="space-y-3.5 px-4 pb-4 pt-1">{children}</div>}
    </section>
  );
}

function SmallButton({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-md border px-2 py-1 text-[11px] transition-colors",
        danger
          ? "border-ink-700 text-ink-300 hover:border-fail-500/50 hover:text-fail-500"
          : "border-ink-700 text-ink-300 hover:border-ink-600 hover:text-ink-100",
      )}
    >
      {children}
    </button>
  );
}

const inputClass =
  "w-full rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-[12.5px] text-ink-100 outline-none transition-colors placeholder:text-ink-600 focus:border-flux-500";

function Field({
  def,
  value,
  onChange,
  refOptions,
  tokens,
}: {
  def: PropDef;
  value: unknown;
  onChange: (v: unknown) => void;
  refOptions: RefOptions;
  tokens: ThemeTokens;
}) {
  const isRef = def.kind === "ref" || def.kind === "refList";

  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2">
        <span className="text-[11.5px] font-medium text-ink-200">{def.label}</span>
        {isRef && (
          // The visible consequence of one line in the component's schema.
          <span
            className="rounded-full border border-flux-500/40 bg-flux-500/10 px-1.5 text-[9.5px] text-flux-300"
            title="Choosing this records a row in release_dependencies at publish time."
          >
            ref → {def.ref}
          </span>
        )}
      </span>

      {def.kind === "textarea" ? (
        <textarea
          rows={4}
          className={cx(inputClass, "resize-y leading-relaxed")}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : def.kind === "segment" ? (
        <div className="flex rounded-lg border border-ink-700 bg-ink-950 p-0.5">
          {(def.options ?? []).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={cx(
                "flex-1 rounded-md px-1.5 py-1 text-[11.5px] transition-colors",
                String(value) === o.value
                  ? "bg-flux-500 font-medium text-white"
                  : "text-ink-400 hover:text-ink-200",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : def.kind === "select" ? (
        <select className={inputClass} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {(def.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : isRef ? (
        <select className={inputClass} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          <option value="">— none —</option>
          {(refOptions[def.ref as RefKind] ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : def.kind === "boolean" ? (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={cx(
            "flex h-5 w-9 items-center rounded-full border transition-colors",
            value ? "border-flux-500 bg-flux-500/30" : "border-ink-700 bg-ink-850",
          )}
        >
          <span
            className={cx(
              "mx-0.5 h-3.5 w-3.5 rounded-full transition-transform",
              value ? "translate-x-4 bg-flux-400" : "bg-ink-500",
            )}
          />
        </button>
      ) : def.kind === "color" ? (
        <ColorField value={String(value ?? "")} onChange={onChange} tokens={tokens} />
      ) : def.kind === "range" ? (
        <RangeField def={def} value={Number(value ?? def.default ?? 0)} onChange={onChange} />
      ) : def.kind === "number" ? (
        <input
          type="number"
          className={inputClass}
          value={Number(value ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      ) : (
        <input
          type="text"
          className={inputClass}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {def.help && <span className="mt-1.5 block text-[10.5px] leading-snug text-ink-500">{def.help}</span>}
    </label>
  );
}

function RangeField({
  def,
  value,
  onChange,
}: {
  def: PropDef;
  value: number;
  onChange: (v: number) => void;
}) {
  const min = def.min ?? 0;
  const max = def.max ?? 100;
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="range"
        min={min}
        max={max}
        step={def.step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-flux-500"
      />
      <span className="w-14 shrink-0 rounded-md border border-ink-800 bg-ink-950 px-1.5 py-0.5 text-center font-mono text-[11px] text-ink-300">
        {value}
        {def.unit ?? ""}
      </span>
    </div>
  );
}

/** Theme swatches first, then a free picker. Empty means "inherit the theme". */
function ColorField({
  value,
  onChange,
  tokens,
}: {
  value: string;
  onChange: (v: string) => void;
  tokens: ThemeTokens;
}) {
  const swatches = [
    { c: tokens.colorBg, label: "Background" },
    { c: tokens.colorSurface, label: "Surface" },
    { c: tokens.colorFg, label: "Foreground" },
    { c: tokens.colorAccent, label: "Accent" },
    { c: "#ffffff", label: "White" },
    { c: "#000000", label: "Black" },
  ];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange("")}
          title="Inherit from theme"
          className={cx(
            "h-6 w-6 shrink-0 rounded-md border text-[10px] text-ink-500",
            value === "" ? "border-flux-500" : "border-ink-700",
          )}
        >
          ⌀
        </button>
        {swatches.map((s) => (
          <button
            key={s.c + s.label}
            type="button"
            title={s.label}
            onClick={() => onChange(s.c)}
            className={cx(
              "h-6 w-6 shrink-0 rounded-md border transition-transform hover:scale-110",
              value.toLowerCase() === s.c.toLowerCase() ? "border-flux-500" : "border-ink-700",
            )}
            style={{ background: s.c }}
          />
        ))}
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-8 shrink-0 cursor-pointer rounded-md border border-ink-700 bg-transparent p-0"
          title="Custom colour"
        />
      </div>
      <input
        type="text"
        value={value}
        placeholder="inherit"
        onChange={(e) => onChange(e.target.value)}
        className={cx(inputClass, "font-mono text-[11px]")}
      />
    </div>
  );
}
