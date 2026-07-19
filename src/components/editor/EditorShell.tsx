"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useEditor } from "@/lib/editor/store";
import { useAutosave } from "@/lib/editor/useAutosave";
import type { ModuleName, PageBody, RenderContext } from "@/lib/registry/types";
import { Canvas } from "./Canvas";
import { Palette } from "./Palette";
import { Properties, type RefOptions } from "./Properties";
import { PublishPanel } from "./PublishPanel";
import { SaveIndicator } from "./SaveIndicator";
import { Badge, Mono } from "../ui";

export interface EditorBootstrap {
  page: { id: string; path: string; title: string };
  site: { id: string; name: string; slug: string };
  body: PageBody;
  lockVersion: number;
  modules: ModuleName[];
  ctx: RenderContext;
  refOptions: RefOptions;
  siblings: { id: string; path: string; title: string }[];
}

type RightTab = "properties" | "publish";

export function EditorShell(boot: EditorBootstrap) {
  const init = useEditor((s) => s.init);
  const [tab, setTab] = useState<RightTab>("properties");
  const selectedId = useEditor((s) => s.selectedId);

  useEffect(() => {
    init(boot.page.id, boot.body, boot.lockVersion);
  }, [init, boot.page.id, boot.body, boot.lockVersion]);

  useAutosave(true);

  // Selecting a block should bring its properties forward.
  useEffect(() => {
    if (selectedId) setTab("properties");
  }, [selectedId]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink-950">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-ink-800 bg-ink-900 px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-[13px] font-medium text-ink-300 transition-colors hover:text-ink-100"
        >
          <span className="text-ink-500">←</span> {boot.site.name}
        </Link>

        <div className="h-5 w-px bg-ink-700" />

        <div className="flex items-center gap-2">
          {boot.siblings.map((p) => (
            <Link
              key={p.id}
              href={`/editor/${p.id}`}
              className={`rounded-lg px-2.5 py-1 text-[12px] transition-colors ${
                p.id === boot.page.id
                  ? "bg-ink-800 text-ink-100"
                  : "text-ink-400 hover:bg-ink-850 hover:text-ink-200"
              }`}
            >
              <Mono>{p.path}</Mono>
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4">
          <SaveIndicator />
          <div className="h-5 w-px bg-ink-700" />
          <button
            type="button"
            onClick={() => setTab(tab === "publish" ? "properties" : "publish")}
            className="rounded-lg bg-flux-500 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-flux-400"
          >
            Publish
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 border-r border-ink-800 bg-ink-900">
          <Palette modules={boot.modules} />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-ink-850 p-6">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border border-ink-700 shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2 border-b border-ink-700 bg-ink-900 px-3 py-2">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
              </span>
              <span className="ml-2 flex-1 truncate rounded-md bg-ink-950 px-2.5 py-1 text-center font-mono text-[11px] text-ink-400">
                {boot.site.slug}
                {boot.page.path}
              </span>
              <Badge tone="neutral">draft</Badge>
            </div>
            <Canvas ctx={boot.ctx} />
          </div>

          <p className="mx-auto mt-4 max-w-5xl text-[11px] leading-relaxed text-ink-500">
            This canvas resolves component names through the same registry the build worker
            uses and calls the same render functions. There is no separate preview
            implementation that could drift.
          </p>
        </main>

        <aside className="flex w-80 shrink-0 flex-col border-l border-ink-800 bg-ink-900">
          <div className="flex shrink-0 border-b border-ink-800">
            {(["properties", "publish"] as RightTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 px-3 py-2.5 text-[12px] font-medium capitalize transition-colors ${
                  tab === t
                    ? "border-b-2 border-flux-500 text-ink-100"
                    : "text-ink-500 hover:text-ink-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "properties" ? (
              <Properties refOptions={boot.refOptions} />
            ) : (
              <PublishPanel siteId={boot.site.id} siteSlug={boot.site.slug} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
