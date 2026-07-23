/**
 * Root layout for PUBLISHED SITES.
 *
 * A second root layout, and the reason it exists is the whole point of the
 * split: this one imports nothing. No Tailwind, no reset, no fonts, no product
 * CSS. A visitor to a published site gets exactly what that site's theme
 * describes and not one byte more.
 *
 * The `<html>` and `<head>` here are intentionally bare. Everything that varies
 * per site — the title, the theme's custom properties, the base stylesheet — is
 * emitted by the page itself, because it comes from the release being served and
 * a layout cannot know which release that is.
 */
export default function SiteRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
