/**
 * Helpers d'images → data URI (module PUR, testable sous bun).
 * Partagés entre render.ts (resolveLocalImages) et print-templates.ts
 * (resolveLogoValue — logos du front matter dans les gabarits d'impression).
 */

/** Type MIME d'une image d'après son extension. */
export function imgMime(ext: string): string {
  switch (ext.toLowerCase()) {
    case "jpg": case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "svg": return "image/svg+xml";
    default: return "image/png";
  }
}

/** Octets → base64 standard (compatible data URI). */
export function uint8ToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const CHUNK = 8192;
  for (let i = 0; i < bytes.byteLength; i += CHUNK)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  return btoa(chunks.join(""));
}
