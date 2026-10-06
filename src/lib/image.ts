// Image helpers shared by the service worker and the side panel. Everything is
// OffscreenCanvas-based so it runs in a worker (no DOM) as well as a page.

/** Longest edge sent to vision models — plenty for prompt extraction, small payload. */
export const MAX_EDGE = 1568;

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return `data:${blob.type || 'image/jpeg'};base64,${toBase64(await blob.arrayBuffer())}`;
}

/**
 * Decode an image blob, optionally crop it (in source pixels), scale it so the
 * longest edge is ≤ maxEdge, and re-encode as JPEG. Returns a data URL.
 */
export async function normalizeImage(blob: Blob, crop?: CropRect, maxEdge = MAX_EDGE): Promise<string> {
  const bmp = crop
    ? await createImageBitmap(blob, Math.round(crop.x), Math.round(crop.y), Math.max(1, Math.round(crop.w)), Math.max(1, Math.round(crop.h)))
    : await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');
  // JPEG has no alpha — paint white first so transparent PNGs don't go black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
  return blobToDataUrl(out);
}

/** Load a data: / blob-compatible URL into a Blob. */
export async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed (${res.status}).`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/') && !url.startsWith('data:image/')) throw new Error('That link is not an image.');
  return blob;
}

/** Small thumbnail for history lists. */
export async function thumbnail(dataUrl: string, edge = 160): Promise<string> {
  try {
    return await normalizeImage(await urlToBlob(dataUrl), undefined, edge);
  } catch {
    return '';
  }
}
