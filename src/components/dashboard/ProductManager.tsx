"use client";

/**
 * The store admin.
 *
 * Two things here are worth understanding and both are said in plain words in
 * the UI: editing a price does not rebuild anything (a published page keeps the
 * price it was built with), and removing a product that a published version was
 * built with is a soft delete, announced beforehand with the exact list of
 * versions affected.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge, Dot, cx } from "../ui";
import { Btn, Card, CardHead, money } from "./dash-ui";

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

export function ProductManager({
  siteId,
  collectionId,
}: {
  siteId: string;
  collectionId: string | null;
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [draft, setDraft] = useState({ title: "", price: "20.00", qty: "25" });
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
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
        priceCents: Math.round((Number(draft.price) || 0) * 100),
        inventoryQty: Number(draft.qty) || 0,
      }),
    });
    setDraft({ title: "", price: "20.00", qty: "25" });
    setBusy(false);
    setAdding(false);
    setFlash("Product added. Your published pages stay exactly as they are until you publish again.");
    await load();
  };

  const update = async (id: string, patch: Record<string, unknown>, note: string) => {
    await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setFlash(note);
    await load();
  };

  const remove = async (product: Product, acknowledge = false) => {
    const res = await fetch(`/api/products/${product.id}${acknowledge ? "?acknowledge=true" : ""}`, {
      method: "DELETE",
    });
    const data = await res.json();

    if (res.status === 409 && data.requiresAcknowledgement) {
      setConfirmDelete({ product, references: data.references ?? [], message: data.message });
      return;
    }
    setConfirmDelete(null);
    setFlash(
      `“${product.title}” is off your store. It is hidden, not erased, so older versions of your site still work.`,
    );
    await load();
  };

  const live = (products ?? []).filter((p) => !p.deletedAt);
  const removed = (products ?? []).filter((p) => p.deletedAt);

  return (
    <div className="space-y-5">
      {flash && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-flux-500/35 bg-flux-500/10 px-4 py-3 text-[12.5px] leading-relaxed text-flux-300"
        >
          <span className="flex-1">{flash}</span>
          <button
            type="button"
            onClick={() => setFlash(null)}
            aria-label="Dismiss this message"
            className="shrink-0 rounded-md px-1 text-ink-400 transition-colors hover:text-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flux-400"
          >
            ✕
          </button>
        </div>
      )}

      {confirmDelete && (
        <Card className="border-warn-500/40 bg-warn-500/[0.08] p-5">
          <div className="flex items-center gap-2 text-[13.5px] font-medium text-warn-500">
            <Dot tone="warn" />
            Before you remove “{confirmDelete.product.title}”
          </div>
          <p className="mt-2 max-w-prose text-[12.5px] leading-relaxed text-ink-200">
            {confirmDelete.references.length} published version
            {confirmDelete.references.length === 1 ? " was" : "s were"} built while this product was
            on sale. Those pages keep working — the product simply shows as unavailable where it
            used to be.
          </p>

          <ul className="mt-3 flex flex-wrap gap-2">
            {confirmDelete.references.map((r) => (
              <li
                key={r.releaseId}
                className="inline-flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-950/70 px-2.5 py-1 text-[11.5px] text-ink-300"
                title={`release ${r.releaseId}`}
              >
                Version {r.versionNo}
                {r.isLive && <Badge tone="live">Currently live</Badge>}
              </li>
            ))}
          </ul>

          <p className="mt-3 max-w-prose text-[11.5px] leading-relaxed text-ink-500">
            Nothing is destroyed: the row is hidden, not deleted, so you can put it back at any
            time.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Btn variant="danger" size="sm" onClick={() => remove(confirmDelete.product, true)}>
              Remove it anyway
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
              Keep it
            </Btn>
          </div>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <CardHead
          title="Products"
          hint="Prices and stock save the moment you leave the field. Published pages keep the values they were built with until you publish again."
          tables="products · product_variants"
          action={
            <Btn
              variant={adding ? "ghost" : "primary"}
              size="sm"
              onClick={() => setAdding((v) => !v)}
              aria-expanded={adding}
            >
              {adding ? "Cancel" : "Add a product"}
            </Btn>
          }
        />

        {adding && (
          <div className="mt-4 rounded-xl border border-ink-700 bg-ink-950/70 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_120px_100px_auto] sm:items-end">
              <Field label="Name">
                <input
                  autoFocus
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                  placeholder="Ceramic mug"
                  className={INPUT}
                />
              </Field>
              <Field label="Price">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-500">
                    $
                  </span>
                  <input
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                    inputMode="decimal"
                    className={cx(INPUT, "pl-6 font-mono")}
                  />
                </div>
              </Field>
              <Field label="In stock">
                <input
                  value={draft.qty}
                  onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
                  inputMode="numeric"
                  className={cx(INPUT, "font-mono")}
                />
              </Field>
              <Btn variant="primary" onClick={create} disabled={busy || !draft.title.trim()}>
                {busy ? "Adding…" : "Add"}
              </Btn>
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-500">
              New products appear on your live site the next time you publish.
            </p>
          </div>
        )}

        {products === null ? (
          <ul className="mt-4 space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="h-[84px] animate-pulse rounded-xl border border-ink-800 bg-ink-950/60"
              />
            ))}
          </ul>
        ) : live.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-ink-700 px-4 py-8 text-center">
            <p className="text-[13px] text-ink-200">Nothing for sale yet.</p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-ink-500">
              Add your first product and it will show up on your site the next time you publish.
            </p>
            {!adding && (
              <Btn variant="primary" size="sm" className="mt-4" onClick={() => setAdding(true)}>
                Add a product
              </Btn>
            )}
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {live.map((p) => (
              <ProductRow key={p.id} product={p} onUpdate={update} onRemove={remove} />
            ))}
          </ul>
        )}

        {removed.length > 0 && (
          <div className="mt-6">
            <h3 className="text-[12px] font-medium text-ink-300">Removed</h3>
            <p className="mt-1 text-[11.5px] text-ink-500">
              Hidden from your store, kept so older versions of your site still make sense.
            </p>
            <ul className="mt-3 space-y-2">
              {removed.map((p) => (
                <ProductRow key={p.id} product={p} onUpdate={update} onRemove={remove} />
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}

const INPUT =
  "h-10 w-full min-w-0 rounded-lg border border-ink-700 bg-ink-950 px-3 text-[13px] text-ink-100 placeholder:text-ink-500 outline-none transition-colors focus:border-flux-500 focus-visible:ring-2 focus-visible:ring-flux-400/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11.5px] font-medium text-ink-400">{label}</span>
      {children}
    </label>
  );
}

function ProductRow({
  product: p,
  onUpdate,
  onRemove,
}: {
  product: Product;
  onUpdate: (id: string, patch: Record<string, unknown>, note: string) => void;
  onRemove: (p: Product) => void;
}) {
  const removed = Boolean(p.deletedAt);
  return (
    <li
      className={cx(
        "rounded-xl border p-3.5 transition-colors",
        removed ? "border-ink-800 bg-ink-950/40" : "border-ink-800 bg-ink-950/60",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span
          className={cx(
            "text-[13.5px] font-medium",
            removed ? "text-ink-400 line-through" : "text-ink-100",
          )}
        >
          {p.title}
        </span>
        {removed && <Badge tone="warn">Removed</Badge>}
        {p.collections.map((c) => (
          <Badge key={c.id} tone="neutral" className="hidden sm:inline-flex">
            {c.title}
          </Badge>
        ))}
        <span className="ml-auto font-mono text-[13px] text-ink-200">{money(p.priceCents)}</span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-[10.5px] uppercase tracking-wider text-ink-500">
            Price
          </span>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11.5px] text-ink-500">
              $
            </span>
            <input
              defaultValue={(p.priceCents / 100).toFixed(2)}
              inputMode="decimal"
              aria-label={`Price of ${p.title} in dollars`}
              onBlur={(e) => {
                const cents = Math.round((Number(e.target.value) || 0) * 100);
                if (cents !== p.priceCents) {
                  onUpdate(
                    p.id,
                    { priceCents: cents },
                    `Price updated. Pages already published still show ${money(p.priceCents)} — they keep the value they were built with.`,
                  );
                }
              }}
              className="h-8 w-24 rounded-lg border border-ink-700 bg-ink-900 pl-5 pr-2 font-mono text-[12px] text-ink-100 outline-none transition-colors focus:border-flux-500 focus-visible:ring-2 focus-visible:ring-flux-400/40"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10.5px] uppercase tracking-wider text-ink-500">
            In stock
          </span>
          <input
            defaultValue={p.inventoryQty}
            inputMode="numeric"
            aria-label={`Units of ${p.title} in stock`}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v !== p.inventoryQty) {
                onUpdate(p.id, { inventoryQty: v }, "Stock updated.");
              }
            }}
            className="h-8 w-20 rounded-lg border border-ink-700 bg-ink-900 px-2 font-mono text-[12px] text-ink-100 outline-none transition-colors focus:border-flux-500 focus-visible:ring-2 focus-visible:ring-flux-400/40"
          />
        </label>

        <span className="hidden text-[11px] text-ink-500 sm:block" title="product_variants.sku">
          {p.sku}
        </span>

        {removed ? (
          <Btn
            variant="ghost"
            size="xs"
            className="ml-auto hover:border-live-500/50 hover:text-live-500"
            onClick={() =>
              onUpdate(p.id, { restore: true, status: "active" }, `“${p.title}” is back on sale.`)
            }
          >
            Put back on sale
          </Btn>
        ) : (
          <Btn
            variant="ghost"
            size="xs"
            className="ml-auto hover:border-fail-500/50 hover:text-fail-500"
            onClick={() => onRemove(p)}
          >
            Remove
          </Btn>
        )}
      </div>
    </li>
  );
}
