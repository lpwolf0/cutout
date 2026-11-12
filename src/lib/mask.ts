import type { Stroke } from "./types";

export type MaskState = { canvas: HTMLCanvasElement; applied: Stroke[] };

function cloneCanvas(src: HTMLCanvasElement) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d")!.drawImage(src, 0, 0);
  return c;
}

const stamps = new Map<string, HTMLCanvasElement>();
function stampFor(size: number, hardness: number) {
  const key = `${Math.round(size)}:${hardness.toFixed(2)}`;
  let c = stamps.get(key);
  if (!c) {
    const d = Math.max(2, Math.ceil(size));
    c = document.createElement("canvas");
    c.width = c.height = d;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(d / 2, d / 2, (d / 2) * Math.min(0.999, hardness), d / 2, d / 2, d / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, d, d);
    if (stamps.size > 60) stamps.clear();
    stamps.set(key, c);
  }
  return c;
}

export function paintSegment(
  ctx: CanvasRenderingContext2D,
  s: Pick<Stroke, "mode" | "size" | "hardness">,
  a: [number, number],
  b: [number, number] | null
) {
  const stamp = stampFor(s.size, s.hardness);
  const d = stamp.width;
  ctx.globalCompositeOperation = s.mode === "erase" ? "destination-out" : "source-over";
  const dist = b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
  const step = Math.max(1, s.size * 0.12);
  const n = b ? Math.max(1, Math.ceil(dist / step)) : 0;
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    const x = b ? a[0] + (b[0] - a[0]) * t : a[0];
    const y = b ? a[1] + (b[1] - a[1]) * t : a[1];
    ctx.drawImage(stamp, x - d / 2, y - d / 2);
  }
  ctx.globalCompositeOperation = "source-over";
}

function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.points.length === 1) paintSegment(ctx, s, s.points[0], null);
  for (let i = 1; i < s.points.length; i++) paintSegment(ctx, s, s.points[i - 1], s.points[i]);
}

const registry = new Map<string, MaskState>();

/** Returns the editable mask for an image, kept in sync with the document's strokes. */
export function maskFor(id: string, base: HTMLCanvasElement, strokes: Stroke[]): MaskState {
  let st = registry.get(id);
  if (!st) {
    const canvas = cloneCanvas(base);
    const ctx = canvas.getContext("2d")!;
    strokes.forEach((s) => paintStroke(ctx, s));
    st = { canvas, applied: strokes };
    registry.set(id, st);
    return st;
  }
  if (st.applied === strokes) return st;
  const ctx = st.canvas.getContext("2d")!;
  const prefix = strokes.length >= st.applied.length && st.applied.every((s, i) => strokes[i] === s);
  if (prefix) {
    for (let i = st.applied.length; i < strokes.length; i++) paintStroke(ctx, strokes[i]);
  } else {
    ctx.clearRect(0, 0, st.canvas.width, st.canvas.height);
    ctx.drawImage(base, 0, 0);
    strokes.forEach((s) => paintStroke(ctx, s));
  }
  st.applied = strokes;
  return st;
}

/** Call after committing a live stroke that was already painted onto the mask. */
export function markApplied(id: string, strokes: Stroke[]) {
  const st = registry.get(id);
  if (st) st.applied = strokes;
}

export function dropMask(id: string) {
  registry.delete(id);
}
