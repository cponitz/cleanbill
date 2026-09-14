// iPhone photos picked from the library can arrive as HEIC/HEIF, which the claim API rejects (the extraction model does
// not read it). Convert in the browser to JPEG before upload (SPEC-04b §4). The converter (~1 MB) is loaded only when a
// HEIC file is actually chosen, so it never affects the page's first load.
const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

export function isHeic(file: File): boolean {
  return HEIC_TYPES.has(file.type.toLowerCase()) || /\.hei[cf]$/i.test(file.name);
}

export async function toJpegIfHeic(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  const mod = await import("heic2any");
  const heic2any = (mod.default ?? mod) as (o: { blob: Blob; toType: string; quality?: number }) => Promise<Blob | Blob[]>;
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(out) ? out[0] : out;
  return new File([blob], file.name.replace(/\.hei[cf]$/i, "") + ".jpg", { type: "image/jpeg" });
}
