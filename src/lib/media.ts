/**
 * Media, validated on the way in.
 *
 * Images are stored as data: URIs in `media.storage_key`, not as paths into
 * object storage — decision I13, because a data URI is what lets an exported
 * site render from file:// with no network. Uploads keep that property: the
 * browser downscales the picture and hands us a data URI, and this is where we
 * check it is really an image, really base64, and not so large it would bloat
 * every release that freezes it.
 *
 * Pure functions, no Prisma — so the rules can be unit-tested without a database.
 */

/** The formats a browser can both downscale and render inline. */
export const ALLOWED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

/**
 * Cap on the DECODED image, in bytes. A data URI is copied verbatim into every
 * release that uses it (release_data is frozen at build time), so an oversized
 * image is paid for again on every publish. The browser downscales to well under
 * this; the cap is a backstop against someone posting to the API directly.
 */
export const MAX_MEDIA_BYTES = 2 * 1024 * 1024; // 2 MiB

export interface ValidatedUpload {
  dataUri: string;
  mime: string;
  sizeBytes: number;
}

/** Roughly how many bytes a base64 payload decodes to, without decoding it. */
function base64Bytes(b64: string): number {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * Accept only `data:<allowed-image-mime>;base64,<payload>`. Returning the mime
 * and size means the caller never has to trust client-supplied values for either.
 */
export function validateImageDataUri(
  dataUri: unknown,
): { ok: true; value: ValidatedUpload } | { ok: false; error: string } {
  if (typeof dataUri !== "string" || !dataUri.startsWith("data:")) {
    return { ok: false, error: "That doesn’t look like an image." };
  }
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUri);
  if (!match) {
    return { ok: false, error: "The image couldn’t be read. Try a different file." };
  }
  const mime = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    return { ok: false, error: "That file type isn’t supported. Use a PNG, JPEG, WebP, GIF or SVG." };
  }
  const sizeBytes = base64Bytes(match[2]);
  if (sizeBytes <= 0) {
    return { ok: false, error: "The image appears to be empty." };
  }
  if (sizeBytes > MAX_MEDIA_BYTES) {
    const mb = Math.round((MAX_MEDIA_BYTES / 1024 / 1024) * 10) / 10;
    return { ok: false, error: `That image is too large — keep it under ${mb} MB.` };
  }
  return { ok: true, value: { dataUri, mime, sizeBytes } };
}

/** Trim a supplied filename/alt to something sane, or null. */
export function cleanLabel(input: unknown, max = 200): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().slice(0, max);
  return trimmed.length ? trimmed : null;
}
