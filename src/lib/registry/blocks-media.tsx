/**
 * MEDIA BLOCKS.
 *
 * A picture grid and a video embed. Same rules as the rest of the palette (I16):
 * pure render, inline styles, wrapped in Section.
 *
 * VideoEmbed is the one block that is deliberately NOT self-contained — a hosted
 * video lives on YouTube or Vimeo, so an exported page needs the network to play
 * it. That is fine and expected: I13's "renders with no network" guarantee is
 * about a page's OWN assets (its images, stored inline), not third-party embeds
 * the author explicitly chose to add. In the editor we show a placeholder rather
 * than load the real iframe, so building a page never pulls in third-party
 * frames or their trackers.
 */
import React from "react";
import { MissingRef, Section, autoGrid, withStyleProps } from "./style";
import type { RegistryEntry, RenderProps, ResolvedMedia } from "./types";

// ─────────────────────────────────────────────────────────────── Gallery ─────

const Gallery: RegistryEntry = {
  schema: {
    name: "Gallery",
    label: "Gallery",
    description: "A grid of images from your media library.",
    category: "media",
    icon: "⊞",
    props: withStyleProps({
      images: {
        label: "Images",
        kind: "refList",
        ref: "media",
        default: [],
        help: "Pick the pictures to show, in order.",
      },
      columns: {
        label: "Columns",
        kind: "segment",
        default: "3",
        options: [
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
        ],
      },
      gap: { label: "Gap", kind: "range", default: 12, min: 0, max: 40, step: 2, unit: "px" },
      imageRadius: { label: "Corners", kind: "range", default: 8, min: 0, max: 32, step: 2, unit: "px" },
      ratio: {
        label: "Shape",
        kind: "segment",
        default: "1/1",
        options: [
          { value: "auto", label: "Auto" },
          { value: "1/1", label: "Square" },
          { value: "4/3", label: "4:3" },
          { value: "16/9", label: "Wide" },
        ],
      },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const ids = Array.isArray(props.images) ? (props.images as string[]) : [];
    const images = ids
      .map((id) => ctx.media[id])
      .filter((m): m is ResolvedMedia => Boolean(m) && !m.missing);
    const ratio = String(props.ratio ?? "1/1");
    return (
      <Section props={props} tokens={t}>
        {images.length === 0 ? (
          <MissingRef t={t} label="Pick images in the panel on the right." />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: autoGrid(Number(props.columns ?? 3)),
              gap: `${Number(props.gap ?? 12)}px`,
            }}
          >
            {images.map((m) => (
              <img
                key={m.id}
                src={m.url}
                alt={m.alt}
                style={{
                  width: "100%",
                  height: ratio !== "auto" ? "100%" : "auto",
                  aspectRatio: ratio !== "auto" ? ratio : undefined,
                  objectFit: "cover",
                  borderRadius: `${Number(props.imageRadius ?? 8)}px`,
                  display: "block",
                }}
              />
            ))}
          </div>
        )}
      </Section>
    );
  },
};

// ────────────────────────────────────────────────────────────── VideoEmbed ───

/**
 * Turn a normal watch link into an embeddable one. Pure and deterministic — the
 * same input always yields the same output, so it never disturbs render
 * determinism (check #9). Returns null when the link isn't one we can embed.
 */
export function embedUrl(raw: string): string | null {
  const url = (raw ?? "").trim();
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  // Already a full URL? Allow it through as a raw iframe source.
  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

const VideoEmbed: RegistryEntry = {
  schema: {
    name: "VideoEmbed",
    label: "Video",
    description: "A YouTube or Vimeo video, sized to fit.",
    category: "media",
    icon: "▶",
    props: withStyleProps({
      url: {
        label: "Video link",
        kind: "url",
        default: "",
        help: "Paste the link from YouTube or Vimeo.",
      },
      title: { label: "Title", kind: "text", default: "Video", help: "Describes the video for screen readers." },
      ratio: {
        label: "Shape",
        kind: "segment",
        default: "16/9",
        options: [
          { value: "16/9", label: "Wide" },
          { value: "4/3", label: "4:3" },
          { value: "1/1", label: "Square" },
        ],
      },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const ratio = ["16/9", "4/3", "1/1"].includes(String(props.ratio)) ? String(props.ratio) : "16/9";
    const url = String(props.url ?? "").trim();
    const src = embedUrl(url);
    const title = String(props.title || "Video");

    let inner: React.ReactNode;
    if (!url) {
      inner = <MissingRef t={t} label="Paste a YouTube or Vimeo link in the panel on the right." />;
    } else if (ctx.editing || !src) {
      // A quiet placeholder while editing (or if the link isn't embeddable), so
      // the canvas never loads a third-party frame.
      inner = (
        <div
          style={{
            aspectRatio: ratio,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            background: t.colorSurface,
            border: `1px solid ${t.colorBorder}`,
            borderRadius: t.radius,
            color: t.colorMuted,
          }}
        >
          <span aria-hidden style={{ fontSize: "34px" }}>▶</span>
          <span style={{ fontFamily: t.fontBody, fontSize: "13px" }}>
            {src ? title : "That link can’t be embedded"}
          </span>
        </div>
      );
    } else {
      inner = (
        <div style={{ aspectRatio: ratio, borderRadius: t.radius, overflow: "hidden" }}>
          <iframe
            src={src}
            title={title}
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }

    return (
      <Section props={props} tokens={t}>
        {inner}
      </Section>
    );
  },
};

export const MEDIA_BLOCKS: RegistryEntry[] = [Gallery, VideoEmbed];
