/**
 * Where an uploaded image actually lives — the object-storage seam.
 *
 * By DEFAULT nothing changes: an upload stays a `data:` URI in media.storage_key,
 * which is decision I13 and the whole reason an exported site renders from
 * file:// with no network. That default is what every test and the demo use.
 *
 * When object storage IS configured (STORAGE_S3_* env), a fresh upload is PUT to
 * an S3-compatible bucket and storage_key holds the object's public URL instead.
 * That is what a very large media library eventually wants. The S3 client here is
 * dependency-free — SigV4 signed with Node's crypto — so it needs no SDK and
 * works against AWS S3, Cloudflare R2, MinIO, or DigitalOcean Spaces.
 *
 * The catch this module is built to keep honest: object-stored images would make
 * an exported site depend on the network, breaking I13. So `inlineForFreeze`
 * pulls any http(s) image back into a data URI at BUILD time, before it is frozen
 * into release_data. The hosted runtime serves fast URLs; an export still carries
 * the bytes. The property survives either backend — see the I13 amendment.
 */
import { createHash, createHmac } from "node:crypto";

interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBase: string;
}

function s3Config(): S3Config | null {
  const endpoint = process.env.STORAGE_S3_ENDPOINT;
  const bucket = process.env.STORAGE_S3_BUCKET;
  const accessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: endpoint.replace(/\/$/, ""),
    bucket,
    region: process.env.STORAGE_S3_REGION || "auto",
    accessKeyId,
    secretAccessKey,
    // Where a stored object is READ from. Defaults to path-style on the endpoint.
    publicBase: (process.env.STORAGE_S3_PUBLIC_BASE || `${endpoint.replace(/\/$/, "")}/${bucket}`).replace(/\/$/, ""),
  };
}

/** True when a real object store is wired up. */
export function usingObjectStorage(): boolean {
  return s3Config() !== null;
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/**
 * Persist an uploaded image and return the value to store in media.storage_key.
 * Data URI by default (I13); an object URL when object storage is configured.
 */
export async function storeUpload(
  dataUri: string,
  meta: { mime: string; siteId: string; id: string },
): Promise<string> {
  const cfg = s3Config();
  if (!cfg) return dataUri; // I13 default — store the bytes inline.

  const body = dataUriToBuffer(dataUri);
  if (!body) return dataUri; // Not decodable → fall back rather than lose the upload.

  const ext = MIME_EXT[meta.mime] ?? "bin";
  const key = `media/${meta.siteId}/${meta.id}.${ext}`;
  try {
    await s3Put(cfg, key, body, meta.mime);
    return `${cfg.publicBase}/${key}`;
  } catch (err) {
    // Never lose an upload to a storage hiccup — fall back to the inline default.
    console.error("[storage] object PUT failed, storing inline:", err instanceof Error ? err.message : err);
    return dataUri;
  }
}

/**
 * Turn a stored value into something safe to FREEZE into release_data.
 *
 * A data URI passes straight through (the default path — no network, no cost).
 * An http(s) URL (object-stored) is fetched once and inlined, so the frozen
 * release, and every export made from it, still renders with no network (I13).
 */
export async function inlineForFreeze(storageKey: string): Promise<string> {
  if (!storageKey || storageKey.startsWith("data:")) return storageKey;
  if (!/^https?:\/\//i.test(storageKey)) return storageKey;
  try {
    const res = await fetch(storageKey, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch (err) {
    // If the image can't be inlined, keep the URL — a live page still shows it;
    // only an export of this particular release would need the network.
    console.error("[storage] inline-for-freeze failed, keeping URL:", err instanceof Error ? err.message : err);
    return storageKey;
  }
}

/** Identity today, but the one place a future signed-URL scheme would live. */
export function resolveMediaUrl(storageKey: string): string {
  return storageKey;
}

// ── data: URI helpers ─────────────────────────────────────────────────────────

function dataUriToBuffer(dataUri: string): Buffer | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUri);
  if (!match) return null;
  const [, , isBase64, payload] = match;
  return isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
}

// ── S3 PutObject, SigV4 signed, no SDK ────────────────────────────────────────

const sha256Hex = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data, "utf8").digest();

/** Encode each path segment per RFC 3986, which is what S3's canonical URI wants. */
function encodeKey(key: string): string {
  return key
    .split("/")
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

async function s3Put(cfg: S3Config, key: string, body: Buffer, contentType: string): Promise<void> {
  const host = new URL(cfg.endpoint).host;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const canonicalUri = `/${cfg.bucket}/${encodeKey(key)}`;

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "", // no query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`${cfg.endpoint}${canonicalUri}`, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      "Content-Type": contentType,
    },
    // A Node Buffer is a Uint8Array at runtime, but fetch's BodyInit type wants
    // the plain view — this copy is that, and nothing more.
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`S3 PUT ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
}
