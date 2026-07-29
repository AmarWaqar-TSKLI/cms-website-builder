"use client";

/**
 * A form — one component, two hosts, exactly like AddToCart (D8).
 *
 *   1. the multi-tenant runtime — React hydrates it, `onSubmit` posts, real row
 *   2. the editor canvas        — hydrated, but submitting is an inert preview
 *   3. the static export        — `renderToStaticMarkup`, no bundle; the
 *                                 artifact's own vanilla script binds the same
 *                                 `data-cms-form` element and posts instead
 *
 * So the `data-cms-form*` attributes and the field `name`s are a contract with
 * the export runtime, not decoration. The markup is identical in all three; only
 * who handles the submit differs. The success note is always present but hidden,
 * so both the React path and the vanilla path have something to reveal.
 *
 * Relative imports on purpose: this file is pulled into the component registry,
 * which the build worker and the test runner load OUTSIDE Next's path resolver.
 */
import React, { useState } from "react";
import { HONEYPOT_FIELD } from "../../lib/forms";
import type { ThemeTokens } from "../../lib/registry/types";

export interface FormField {
  name: string;
  label: string;
  type: "text" | "email" | "textarea";
  required?: boolean;
  placeholder?: string;
}

export interface FormIslandProps {
  siteId: string;
  runtimeApi: string;
  formKey: string;
  formName: string;
  fields: FormField[];
  submitLabel: string;
  successMessage: string;
  tokens: ThemeTokens;
  /** Lay the fields and button out in a row — a newsletter's email + button. */
  inline?: boolean;
  /** The editor canvas renders this inert; submitting a preview posts nothing. */
  preview?: boolean;
}

type Status = "idle" | "sending" | "sent" | "error";

export function FormIsland({
  siteId,
  runtimeApi,
  formKey,
  formName,
  fields,
  submitLabel,
  successMessage,
  tokens: t,
  inline,
  preview,
}: FormIslandProps) {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // A preview click shouldn't send anything — just show the confirmation so the
    // author can see what a visitor would.
    if (preview) return setStatus("sent");

    const form = e.currentTarget;
    const fd = new FormData(form);
    // Honeypot: a real person never fills it. Pretend success, post nothing.
    if (String(fd.get(HONEYPOT_FIELD) || "").trim()) return setStatus("sent");

    const values: Record<string, string> = {};
    fd.forEach((v, k) => {
      if (k !== HONEYPOT_FIELD) values[k] = typeof v === "string" ? v : "";
    });

    setStatus("sending");
    try {
      const res = await fetch(`${runtimeApi}/api/runtime/forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, formKey, formName, fields: values }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setStatus("sent");
        form.reset();
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${t.colorBorder}`,
    borderRadius: t.radius,
    padding: "11px 13px",
    fontFamily: t.fontBody,
    fontSize: "15px",
    background: t.colorBg,
    color: "inherit",
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: t.fontBody,
    fontSize: "13px",
    fontWeight: 600,
  };

  return (
    <form
      data-cms-form={formKey}
      data-cms-form-name={formName}
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: inline ? "row" : "column",
        flexWrap: inline ? "wrap" : "nowrap",
        alignItems: inline ? "flex-end" : "stretch",
        gap: inline ? "12px" : "16px",
        textAlign: "left",
      }}
    >
      {fields.map((f) => (
        <label
          key={f.name}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            flex: inline ? "1 1 220px" : "1 1 auto",
            minWidth: 0,
          }}
        >
          {!inline && (
            <span style={labelStyle}>
              {f.label}
              {f.required ? " *" : ""}
            </span>
          )}
          {f.type === "textarea" ? (
            <textarea
              name={f.name}
              required={f.required}
              placeholder={f.placeholder}
              aria-label={f.label}
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          ) : (
            <input
              type={f.type}
              name={f.name}
              required={f.required}
              placeholder={f.placeholder}
              aria-label={f.label}
              style={inputStyle}
            />
          )}
        </label>
      ))}

      {/* Off-screen honeypot. aria-hidden and out of the tab order so no real
          person meets it; a bot that fills every input trips it. */}
      <input
        type="text"
        name={HONEYPOT_FIELD}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", opacity: 0 }}
      />

      <button
        type="submit"
        disabled={status === "sending"}
        style={{
          flex: inline ? "0 0 auto" : "0 0 auto",
          alignSelf: inline ? "stretch" : "flex-start",
          background: t.colorAccent,
          color: t.colorAccentFg,
          border: "none",
          borderRadius: t.radius,
          padding: "12px 24px",
          fontFamily: t.fontBody,
          fontWeight: 600,
          fontSize: "15px",
          cursor: status === "sending" ? "default" : "pointer",
          opacity: status === "sending" ? 0.7 : 1,
        }}
      >
        {status === "sending" ? "Sending…" : submitLabel}
      </button>

      <p
        data-cms-form-note
        style={{
          display: status === "sent" || status === "error" ? "block" : "none",
          flexBasis: "100%",
          margin: 0,
          fontFamily: t.fontBody,
          fontSize: "14px",
          color: status === "error" ? "#b91c1c" : t.colorAccent,
        }}
      >
        {status === "error" ? "Something went wrong. Please try again." : successMessage}
      </p>
    </form>
  );
}
