/**
 * Shrinks a picked image before it is stored.
 *
 * Store photos were saved as the raw file, base64-encoded, straight into the
 * store record. Settings accepted anything up to 2 MB, and base64 adds about a
 * third, so a single logo could occupy 2.7 MB of a JSON blob that is sent to
 * every customer who opens the app. Two merchants doing this is what exhausted
 * the project's egress quota and suspended the backend.
 *
 * The photo is displayed at 48px on receipts and around 96px in Settings, so
 * none of those bytes were ever visible. Re-encoding at 256px costs a few tens
 * of kilobytes and looks identical everywhere it is used.
 */

export interface DownscaleOptions {
  /** Longest edge of the result, in pixels. */
  maxEdge?: number;
  /** JPEG/WebP quality, 0–1. */
  quality?: number;
}

const DEFAULTS = { maxEdge: 256, quality: 0.82 };

/**
 * Fits `width`×`height` inside a square of `maxEdge`, keeping aspect ratio.
 * Images already smaller than the box are left alone rather than upscaled.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Roughly how many bytes a data URL occupies once stored. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return dataUrl.length;
  const payload = dataUrl.length - comma - 1;
  // base64 carries 3 bytes in every 4 characters.
  return Math.round(payload * 0.75);
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read the image'));
    reader.readAsDataURL(file);
  });
}

/** How long to wait for the browser to decode the picked file. */
const DECODE_TIMEOUT_MS = 5000;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // A file the browser will not decode can leave both handlers unfired, and
    // an await with nothing to resolve it hangs the upload silently — the
    // merchant taps their photo and nothing ever happens. Time it out and let
    // the caller fall back to the original bytes.
    const timer = setTimeout(() => reject(new Error('Timed out reading the image')), DECODE_TIMEOUT_MS);
    const settle = (fn: () => void) => { clearTimeout(timer); fn(); };
    img.onload = () => settle(() => resolve(img));
    img.onerror = () => settle(() => reject(new Error('That file could not be read as an image')));
    img.src = src;
  });
}

/**
 * Reads a picked file and returns a small data URL suitable for storing.
 *
 * Falls back to the original bytes if anything about the re-encode fails or
 * comes out bigger — a merchant losing their logo would be a worse outcome
 * than a large one.
 */
export async function downscaleImageToDataUrl(
  file: Blob,
  options: DownscaleOptions = {},
): Promise<string> {
  const maxEdge = options.maxEdge ?? DEFAULTS.maxEdge;
  const quality = options.quality ?? DEFAULTS.quality;

  const original = await readAsDataUrl(file);

  try {
    const img = await loadImage(original);
    const { width, height } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, maxEdge);
    if (!width || !height) return original;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, width, height);

    // WebP keeps transparency, which a logo may rely on, and is markedly
    // smaller than PNG. A browser that cannot encode it returns a PNG data URL
    // from toDataURL, which is still correct — just larger.
    let encoded = canvas.toDataURL('image/webp', quality);
    if (!encoded.startsWith('data:image/webp')) {
      const jpeg = canvas.toDataURL('image/jpeg', quality);
      encoded = dataUrlBytes(jpeg) < dataUrlBytes(encoded) ? jpeg : encoded;
    }

    return dataUrlBytes(encoded) < dataUrlBytes(original) ? encoded : original;
  } catch {
    return original;
  }
}
