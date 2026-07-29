/**
 * FORM BLOCKS — the palette side of the forms module.
 *
 * ContactForm and Newsletter both need the `forms` module (like ProductGrid
 * needs `commerce`). Each renders a FormIsland, which is the D8 client island:
 * hydrated and posting on the hosted runtime, bound by the vanilla script in an
 * export. The blocks themselves stay pure — they only choose the fields and the
 * copy; the island owns the behaviour.
 */
import React from "react";
import { FormIsland } from "../../components/site/FormIsland";
import { Section, alignOf, withStyleProps } from "./style";
import type { RegistryEntry, RenderProps } from "./types";

function Intro({
  heading,
  description,
  align,
  t,
}: {
  heading: string;
  description: string;
  align: "left" | "center" | "right";
  t: RenderProps["ctx"]["tokens"];
}) {
  if (!heading && !description) return null;
  return (
    <div style={{ marginBottom: "22px", textAlign: align }}>
      {heading ? (
        <h2
          data-cms-prop="heading"
          style={{
            fontFamily: t.fontHeading,
            fontSize: "clamp(22px, 2.6vw, 30px)",
            fontWeight: 660,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          {heading}
        </h2>
      ) : null}
      {description ? (
        <p
          data-cms-prop="description"
          style={{
            fontFamily: t.fontBody,
            fontSize: "15.5px",
            lineHeight: 1.6,
            margin: "10px 0 0",
            opacity: 0.82,
          }}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── ContactForm ─

const ContactForm: RegistryEntry = {
  schema: {
    name: "ContactForm",
    label: "Contact form",
    description: "Name, email and message — sent to your Forms inbox.",
    category: "forms",
    requiresModule: "forms",
    icon: "✉",
    props: withStyleProps({
      heading: { label: "Heading", kind: "text", default: "Get in touch", inlineEditable: true },
      description: {
        label: "Intro text",
        kind: "textarea",
        default: "Send us a message and we’ll get back to you soon.",
        inlineEditable: true,
      },
      submitLabel: { label: "Button label", kind: "text", default: "Send message" },
      successMessage: {
        label: "Thank-you message",
        kind: "text",
        default: "Thanks! We’ll be in touch soon.",
        help: "Shown after someone sends the form.",
      },
      formKey: {
        label: "Inbox name",
        kind: "text",
        default: "contact",
        help: "Groups submissions in your Forms inbox. Give each form its own if you have several.",
      },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const align = alignOf(props);
    return (
      <Section props={props} tokens={t}>
        <div style={{ maxWidth: "580px", marginLeft: align === "center" ? "auto" : 0, marginRight: align === "center" ? "auto" : 0 }}>
          <Intro heading={String(props.heading ?? "")} description={String(props.description ?? "")} align={align} t={t} />
          <FormIsland
            siteId={ctx.siteId}
            runtimeApi={ctx.runtimeApi}
            formKey={String(props.formKey || "contact")}
            formName={String(props.heading || "Contact")}
            fields={[
              { name: "name", label: "Name", type: "text", required: true, placeholder: "Your name" },
              { name: "email", label: "Email", type: "email", required: true, placeholder: "you@example.com" },
              { name: "message", label: "Message", type: "textarea", required: true, placeholder: "How can we help?" },
            ]}
            submitLabel={String(props.submitLabel || "Send message")}
            successMessage={String(props.successMessage || "Thanks! We’ll be in touch soon.")}
            tokens={t}
            preview={ctx.editing}
          />
        </div>
      </Section>
    );
  },
};

// ──────────────────────────────────────────────────────────────── Newsletter ─

const Newsletter: RegistryEntry = {
  schema: {
    name: "Newsletter",
    label: "Newsletter signup",
    description: "Collect email addresses into your Forms inbox.",
    category: "forms",
    requiresModule: "forms",
    icon: "✦",
    props: withStyleProps({
      heading: { label: "Heading", kind: "text", default: "Stay in the loop", inlineEditable: true },
      description: {
        label: "Intro text",
        kind: "textarea",
        default: "Occasional updates, straight to your inbox. No spam.",
        inlineEditable: true,
      },
      placeholder: { label: "Field hint", kind: "text", default: "you@example.com" },
      submitLabel: { label: "Button label", kind: "text", default: "Subscribe" },
      successMessage: {
        label: "Thank-you message",
        kind: "text",
        default: "You’re on the list — thanks!",
        help: "Shown after someone subscribes.",
      },
      formKey: { label: "Inbox name", kind: "text", default: "newsletter", help: "Groups submissions in your Forms inbox." },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const align = alignOf(props);
    return (
      <Section props={props} tokens={t}>
        <div style={{ maxWidth: "540px", marginLeft: align === "center" ? "auto" : 0, marginRight: align === "center" ? "auto" : 0 }}>
          <Intro heading={String(props.heading ?? "")} description={String(props.description ?? "")} align={align} t={t} />
          <FormIsland
            siteId={ctx.siteId}
            runtimeApi={ctx.runtimeApi}
            formKey={String(props.formKey || "newsletter")}
            formName={String(props.heading || "Newsletter")}
            fields={[
              {
                name: "email",
                label: "Email",
                type: "email",
                required: true,
                placeholder: String(props.placeholder || "you@example.com"),
              },
            ]}
            submitLabel={String(props.submitLabel || "Subscribe")}
            successMessage={String(props.successMessage || "You’re on the list — thanks!")}
            inline
            tokens={t}
            preview={ctx.editing}
          />
        </div>
      </Section>
    );
  },
};

export const FORM_BLOCKS: RegistryEntry[] = [ContactForm, Newsletter];
