"use client";

/**
 * Commerce admin — Tier 2, live data.
 *
 * The interesting part is the delete flow. A product referenced by a published
 * release cannot simply vanish: an artifact on disk has its title and price
 * baked in and must never be rewritten. So the reverse dependency index is
 * consulted first and the consequence is stated before anything happens.
 *
 * Note also what editing a price does NOT do: it does not rebuild anything.
 * Live pages keep showing the price frozen at their build time, which is
 * exactly the trade D5 makes.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge, Dot, Mono, Note, SectionLabel } from "../ui";

interface Product {
  id: string;
  title: string;
  description: string;
  status: string;
  deletedAt: string | null;
  priceCents: number;
  inventoryQty: number;
  sku: string;
  collections: { id: string; title: string; handle: string }[];
}

interface Reference {
  releaseId: string;
  versionNo: number;
  status: string;
  isLive: boolean;
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export function ProductManager({ siteId, collectionId }: { siteId: string; collectionId: string | null }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState({ title: "", priceCents: "2000", inventoryQty: "25" });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    product: Product;
    references: Reference[];
    message: string;
  } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/products?siteId=${siteId}`);
    if (res.ok) setProducts((await res.json()).products);
  }, [siteId]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!draft.title.trim()) return;
    setBusy(true);
    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId,
        collectionId,
        title: draft.title.trim(),
        priceCents: Number(draft.priceCents) || 0,
        inventoryQty: Number(draft.inventoryQty) || 0,
      }),
    });
    setDraft({ title: "", priceCents: "2000", inventoryQty: "25" });
    setBusy(false);
    setFlash("Product created. Live pages are unchanged until you publish again.");
    await load();
  };

  const update = async (id: string, patch: Record<string, unknown>) => {
    await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setFlash("Live data updated. Published artifacts still show their frozen values.");
    await load();
  };

  const remove = async (product: Product, acknowledge = false) => {
    const res = await fetch(
      `/api/products/${product.id}${acknowledge ? "?acknowledge=true" : ""}`,
      { method: "DELETE" },
    );
    const data = await res.json();

    if (res.status === 409 && data.requiresAcknowledgement) {
      setConfirmDelete({ product, references: data.references ?? [], message: data.message });
      return;
    }
    setConfirmDelete(null);
    setFlash(data.note ?? "Soft-deleted.");
    await load();
  };

  return (
    <div className="space-y-6">
      {flash && (
        <div className="rounded-lg border border-flux-500/40 bg-flux-500/10 px-3 py-2 text-[12px] text-flux-300">
          {flash}
        </div>
      )}

      {confirmDelete && (
        <div className="rounded-2xl border border-warn-500/40 bg-warn-500/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-warn-500">
            <Dot tone="warn" /> What breaks if you delete this
          </div>
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-200">{confirmDelete.message}</p>

          <ul className="mb-3 space-y-1">
            {confirmDelete.references.map((r) => (
              <li key={r.releaseId} className="flex items-center gap-2 text-[11px] text-ink-400">
                <Mono className="text-ink-200">v{r.versionNo}</Mono>
                {r.isLive && <Badge tone="live">currently live</Badge>}
                <Mono className="text-ink-600">{r.releaseId.slice(0, 8)}</Mono>
              </li>
            ))}
          </ul>

          <Note className="mb-3">
            The delete is soft, so those releases stay rollback-able. Their pages will render a
            visible placeholder where this product was — degraded, not broken.
          </Note>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => remove(confirmDelete.product, true)}
              className="rounded-lg bg-warn-500 px-3 py-1.5 text-[12px] font-semibold text-ink-950"
            >
              Soft-delete anyway
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-[12px] text-ink-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-ink-700 bg-ink-900/80 p-5">
        <SectionLabel>New product</SectionLabel>
        <div className="flex flex-wrap gap-2">
          <input
            className="min-w-52 flex-1 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[13px] outline-none focus:border-flux-500"
            placeholder="Title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <input
            className="w-28 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[13px] outline-none focus:border-flux-500"
            placeholder="Price (¢)"
            value={draft.priceCents}
            onChange={(e) => setDraft({ ...draft, priceCents: e.target.value })}
          />
          <input
            className="w-24 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[13px] outline-none focus:border-flux-500"
            placeholder="Qty"
            value={draft.inventoryQty}
            onChange={(e) => setDraft({ ...draft, inventoryQty: e.target.value })}
          />
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="rounded-lg bg-flux-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-flux-400 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <Note className="mt-2">
          Products are never versioned and never appear in a release manifest. Adding one changes
          no artifact.
        </Note>
      </section>

      <section className="rounded-2xl border border-ink-700 bg-ink-900/80 p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <SectionLabel>Products</SectionLabel>
          <Mono className="text-ink-500">products · product_variants</Mono>
        </div>

        <ul className="space-y-2">
          {products.map((p) => (
            <li
              key={p.id}
              className={`rounded-xl border p-3 ${
                p.deletedAt ? "border-ink-800 bg-ink-950/60 opacity-60" : "border-ink-800 bg-ink-950"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium text-ink-100">{p.title}</span>
                {p.deletedAt && <Badge tone="warn">soft-deleted</Badge>}
                {p.collections.map((c) => (
                  <Badge key={c.id} tone="neutral">
                    {c.handle}
                  </Badge>
                ))}
                <span className="ml-auto font-mono text-[12px] text-ink-300">
                  {money(p.priceCents)}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-ink-500">
                  price ¢
                  <input
                    defaultValue={p.priceCents}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== p.priceCents) update(p.id, { priceCents: v });
                    }}
                    className="w-20 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 font-mono text-[11px] text-ink-200 outline-none focus:border-flux-500"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-ink-500">
                  qty
                  <input
                    defaultValue={p.inventoryQty}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== p.inventoryQty) update(p.id, { inventoryQty: v });
                    }}
                    className="w-16 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 font-mono text-[11px] text-ink-200 outline-none focus:border-flux-500"
                  />
                </label>

                {p.deletedAt ? (
                  <button
                    type="button"
                    onClick={() => update(p.id, { restore: true, status: "active" })}
                    className="ml-auto rounded-lg border border-ink-700 px-2.5 py-1 text-[11px] text-ink-300 hover:border-live-500/50 hover:text-live-500"
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    className="ml-auto rounded-lg border border-ink-700 px-2.5 py-1 text-[11px] text-ink-300 hover:border-fail-500/50 hover:text-fail-500"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
