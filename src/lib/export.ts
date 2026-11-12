import { render } from "./render";
import { maskFor } from "./mask";
import { loadImage } from "./images";
import type { Item } from "./types";

export const baseName = (n: string) => n.replace(/\.[^.]+$/, "") || "image";

export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export type Format = "png" | "jpg" | "webp";

/** Renders the full-resolution result (cutout + background + effects + design). */
export async function exportBlob(item: Item, format: Format, quality = 0.92): Promise<Blob> {
  const bgImg = item.doc.bg.kind === "image" ? await loadImage(item.doc.bg.url) : null;
  const mask = maskFor(item.id, item.baseMask!, item.doc.strokes);
  const canvas = document.createElement("canvas");
  render(canvas, { img: item.bitmap!, w: item.w, h: item.h, mask: mask.canvas }, item.doc, bgImg, 1);

  let out = canvas;
  if (format === "jpg") {
    out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const c = out.getContext("2d")!;
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, out.width, out.height);
    c.drawImage(canvas, 0, 0);
  }
  const mime = format === "png" ? "image/png" : format === "jpg" ? "image/jpeg" : "image/webp";
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), mime, quality)
  );
}
