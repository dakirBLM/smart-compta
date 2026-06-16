"use client";

/**
 * Downscale + compress an image in the browser before upload.
 *
 * Phone photos are often 5–12 MB, but the AI webhook (Make) rejects anything
 * over 5 MB (413 FieldValueTooLongError). Resizing to a sane max dimension and
 * re-encoding as JPEG keeps uploads small (typically 200–600 KB) and also makes
 * the vision model respond faster. Non-image files (e.g. PDF) pass through.
 */
export async function compressImage(
  file: File,
  maxDim = 1600,
  quality = 0.8,
  maxBytes = 4_500_000
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // Already small enough and reasonably sized — skip the work.
  if (file.size < 800_000) return file;

  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  // Step down quality until under the size cap.
  let q = quality;
  let blob = await toBlob(canvas, q);
  while (blob && blob.size > maxBytes && q > 0.4) {
    q -= 0.15;
    blob = await toBlob(canvas, q);
  }
  if (!blob) return file;

  const name = file.name.replace(/\.\w+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
}
