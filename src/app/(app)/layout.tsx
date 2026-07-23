/**
 * Root layout for the PRODUCT — dashboard, editor, walkthrough, landing page.
 *
 * There are deliberately two root layouts in this app, and the split is load
 * bearing. This one pulls in Tailwind and the product's fonts. A published site
 * must inherit none of that: a visitor's page should look exactly as its own
 * theme describes, not as whatever CSS reset the builder happens to use. See
 * app/(site)/layout.tsx for the other one.
 */
import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "CMS Website Builder — architecture demo",
  description:
    "A page is a description, not a document. Publish produces an immutable artifact; rollback is a single-column update.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
