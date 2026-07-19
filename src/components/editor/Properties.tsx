"use client";

/**
 * The properties panel is GENERATED from the selected component's prop schema.
 *
 * There is no per-component form anywhere in this codebase. The same schema
 * that decides which widget appears here is the one publish walks to write
 * release_dependencies — which is why a reference prop can be labelled as such
 * right in the UI: it is literally the same declaration.
 */
import { getSchema } from "@/lib/registry";
import type { PropDef, RefKind } from "@/lib/registry/types";
import { useEditor } from "@/lib/editor/store";
import { Badge, Note, SectionLabel } from "../ui";

export interface RefOptions {
  collection: { value: string; label: string }[];
  product: { value: string; label: string }[];
  media: { value: string; label: string }[];
  post: { value: string; label: string }[];
}

export function Properties({ refOptions }: { refOptions: RefOptions }) {
  const selectedId = useEditor((s) => s.selectedId);
  const body = useEditor((s) => s.body);
  const updateProp = useEditor((s) => s.updateProp);
  const removeNode = useEditor((s) => s.removeNode);
  const moveNode = useEditor((s) => s.moveNode);
  const duplicateNode = useEditor((s) => s.duplicateNode);

  const node = selectedId ? body.root.find((n) => n.id === selectedId) : null;

  if (!node) {
    return (
      <div className="p-4">
        <SectionLabel>Properties</SectionLabel>
        <Note>Select a block on the canvas to edit it.</Note>
      </div>
    );
  }

  const schema = getSchema(node.type);
  if (!schema) {
    return (
      <div className="p-4">
        <SectionLabel>Properties</SectionLabel>
        <Note>No schema registered for “{node.type}”.</Note>
      </div>
    );
  }

  const index = body.root.findIndex((n) => n.id === node.id);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-800 p-4">
        <SectionLabel>Properties</SectionLabel>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-ink-100">{schema.label}</span>
          <Badge tone="neutral">{node.type}</Badge>
        </div>
        <Note className="mt-2">{schema.description}</Note>

        <div className="mt-3 flex gap-1">
          <SmallButton onClick={() => moveNode(node.id, -1)} disabled={index <= 0}>
            ↑
          </SmallButton>
          <SmallButton
            onClick={() => moveNode(node.id, 1)}
            disabled={index === body.root.length - 1}
          >
            ↓
          </SmallButton>
          <SmallButton onClick={() => duplicateNode(node.id)}>Duplicate</SmallButton>
          <SmallButton onClick={() => removeNode(node.id)} danger>
            Delete
          </SmallButton>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {Object.entries(schema.props).map(([key, def]) => (
          <Field
            key={key}
            name={key}
            def={def}
            value={node.props[key]}
            refOptions={refOptions}
            onChange={(v) => updateProp(node.id, key, v)}
          />
        ))}
      </div>

      <div className="border-t border-ink-800 p-4">
        <SectionLabel>Stored value</SectionLabel>
        {/* Showing exactly what lands in the JSONB column. No markup anywhere. */}
        <pre className="max-h-44 overflow-auto rounded-lg border border-ink-800 bg-ink-950 p-3 font-mono text-[10.5px] leading-relaxed text-ink-300">
          {JSON.stringify({ type: node.type, props: node.props }, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function SmallButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        danger
          ? "border-ink-700 text-ink-300 hover:border-fail-500/50 hover:text-fail-500"
          : "border-ink-700 text-ink-300 hover:border-ink-600 hover:text-ink-100"
      }`}
    >
      {children}
    </button>
  );
}

const inputClass =
  "w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[13px] text-ink-100 outline-none transition-colors placeholder:text-ink-600 focus:border-flux-500";

function Field({
  name,
  def,
  value,
  onChange,
  refOptions,
}: {
  name: string;
  def: PropDef;
  value: unknown;
  onChange: (v: unknown) => void;
  refOptions: RefOptions;
}) {
  const isRef = def.kind === "ref" || def.kind === "refList";

  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2">
        <span className="text-[12px] font-medium text-ink-200">{def.label}</span>
        {isRef && (
          // The visible consequence of one line in the component's schema.
          <Badge tone="accent" className="!px-1.5 !py-0 !text-[10px]">
            ref → {def.ref}
          </Badge>
        )}
      </span>

      {def.kind === "textarea" ? (
        <textarea
          rows={4}
          className={`${inputClass} resize-y leading-relaxed`}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : def.kind === "select" ? (
        <select
          className={inputClass}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          {(def.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : isRef ? (
        <select
          className={inputClass}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
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
          className={`flex h-6 w-11 items-center rounded-full border transition-colors ${
            value ? "border-flux-500 bg-flux-500/30" : "border-ink-700 bg-ink-850"
          }`}
        >
          <span
            className={`mx-0.5 h-4 w-4 rounded-full transition-transform ${
              value ? "translate-x-5 bg-flux-400" : "bg-ink-500"
            }`}
          />
        </button>
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
          placeholder={name}
        />
      )}

      {def.help && <span className="mt-1.5 block text-[11px] text-ink-500">{def.help}</span>}
    </label>
  );
}
