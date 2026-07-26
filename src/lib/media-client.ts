/**
 * Turn a picked file into a data URI, in the browser, before it is uploaded.
 *
 * This is where "real uploads" meet decision I13. Images are stored as data
 * URIs so an exported site renders from file:// with no network — so the upload
 * pipeline's job is to produce a SMALL data URI, not to ship the raw file to
 * object storage. Raster images are drawn into a bounded canvas and re-encoded;
 * SVGs are text, so they pass through; animated GIFs are passed through untouched
 * so the animation survives (the server's size cap is the backstop).
 *
 * Browser-only: uses Image, canvas and FileReader. Import from client code.
 */

/** Longest edge a re-encoded raster image is allowed to keep. */
export const MAX_DIMENSION = 1600;

export interface PreparedImage {
  dataUri: string;
  mime: string;
  width: number | null;
  height: number | null;
  filename: string;
}

export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const filename = file.name || "image";

  if (file.type === "image/svg+xml") {
    // Base64-encode the markup (UTF-8 safe) so the stored URI has one shape.
    const text = await file.text();
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return {
      dataUri: `data:image/svg+xml;base64,${btoa(binary)}`,
      mime: "image/svg+xml",
      width: null,
      height: null,
      filename,
    };
  }

  if (file.type === "image/gif") {
    // A canvas would flatten the animation to a single frame, so keep it as-is.
    return {
      dataUri: await readAsDataUri(file),
      mime: "image/gif",
      width: null,
      height: null,
      filename,
    };
  }

  const img = await loadImage(file);
  const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
  const scale = Math.min(1, MAX_DIMENSION / longest);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn’t process that image.");
  ctx.drawImage(img, 0, 0, width, height);

  // PNGs keep their format so transparency survives (logos, cut-outs); everything
  // else becomes a JPEG, which is far smaller for photographs.
  const keepPng = file.type === "image/png";
  const mime = keepPng ? "image/png" : "image/jpeg";
  const dataUri = keepPng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.82);

  return { dataUri, mime, width, height, filename };
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn’t read that file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image couldn’t be opened."));
    };
    img.src = url;
  });
}
