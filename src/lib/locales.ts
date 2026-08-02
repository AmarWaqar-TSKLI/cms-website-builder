/**
 * Locale catalogue + path helpers — PURE (no DB, no React), so both the render
 * path (chrome, render-page) and the translate engine can share one source of
 * truth for "what's a locale" and "where does /es/about live".
 */
export interface Locale {
  code: string;
  /** English name — used in the AI translate instruction. */
  name: string;
  /** Endonym — shown in the language switcher. */
  native: string;
}

export const LOCALES: Locale[] = [
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "ar", name: "Arabic", native: "العربية" },
];

export const LOCALE_CODES = new Set(LOCALES.map((l) => l.code));

/** Right-to-left scripts. Only "ar" is in the catalogue today, but keep the set. */
const RTL = new Set(["ar", "he", "fa", "ur"]);

export const isRtl = (code: string): boolean => RTL.has(code);

export const localeByCode = (code: string): Locale | undefined =>
  LOCALES.find((l) => l.code === code);

/** The locale a path belongs to (its first segment), or null for the default. */
export function localeOf(path: string): string | null {
  const seg = path.replace(/^\/+/, "").split("/")[0] ?? "";
  return LOCALE_CODES.has(seg) ? seg : null;
}

/** Strip a locale prefix: "/fr/about" → "/about", "/fr" → "/". */
export function stripLocale(path: string): string {
  const loc = localeOf(path);
  if (!loc) return path;
  const rest = path.slice(loc.length + 1); // drop "/xx"
  return rest === "" ? "/" : rest;
}

/** Add a locale prefix to a logical path: ("fr","/about") → "/fr/about". */
export function withLocale(code: string, logicalPath: string): string {
  return logicalPath === "/" ? `/${code}` : `/${code}${logicalPath}`;
}
