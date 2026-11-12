import type { Doc, Layer } from "./types";
import { canvasSize } from "./types";

export type Scene = { img: CanvasImageSource; w: number; h: number; mask: HTMLCanvasElement };

let tmp: HTMLCanvasElement | null = null;
function getTmp(w: number, h: number) {
  if (!tmp) tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  return tmp;
}

/** Maps image pixels to logical canvas units (after the user's move/scale/rotate/flip). */
export function subjectMatrix(doc: Doc, W: number, H: number, w: number, h: number): DOMMatrix {
  const s0 = Math.min(W / w, H / h);
  const { scale, x, y, rotate, flip } = doc.subject;
  const m = new DOMMatrix();
  m.translateSelf(W / 2 + x * W, H / 2 + y * H);
  m.rotateSelf(rotate);
  m.scaleSelf((flip ? -1 : 1) * s0 * scale, s0 * scale);
  m.translateSelf(-w / 2, -h / 2);
  return m;
}

function fontOf(l: Layer, px: number) {
  return `${l.italic ? "italic " : ""}${l.bold ? "700" : "400"} ${px}px "${l.font}", sans-serif`;
}

let measure: CanvasRenderingContext2D | null = null;
export function layerBox(l: Layer, W: number, H: number) {
  if (l.kind !== "text") {
    return { x0: (l.x - l.w / 2) * W, y0: (l.y - l.h / 2) * H, x1: (l.x + l.w / 2) * W, y1: (l.y + l.h / 2) * H };
  }
  if (!measure) measure = document.createElement("canvas").getContext("2d")!;
  const px = l.size * H;
  measure.font = fontOf(l, px);
  const lines = l.text.split("\n");
  const width = Math.max(10, ...lines.map((ln) => measure!.measureText(ln).width));
  const height = lines.length * px * 1.2;
  return { x0: l.x * W - width / 2, y0: l.y * H - height / 2, x1: l.x * W + width / 2, y1: l.y * H + height / 2 };
}

export function hitLayer(layers: Layer[], W: number, H: number, x: number, y: number): Layer | undefined {
  for (let i = layers.length - 1; i >= 0; i--) {
    const b = layerBox(layers[i], W, H);
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return layers[i];
  }
  return undefined;
}

function drawLayers(ctx: CanvasRenderingContext2D, layers: Layer[], W: number, H: number, k: number) {
  for (const l of layers) {
    ctx.save();
    ctx.fillStyle = l.color;
    if (l.kind === "rect") {
      ctx.fillRect((l.x - l.w / 2) * W * k, (l.y - l.h / 2) * H * k, l.w * W * k, l.h * H * k);
    } else if (l.kind === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(l.x * W * k, l.y * H * k, (l.w * W * k) / 2, (l.h * H * k) / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const px = l.size * H * k;
      ctx.font = fontOf(l, px);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lines = l.text.split("\n");
      lines.forEach((ln, i) => ctx.fillText(ln, l.x * W * k, l.y * H * k + (i - (lines.length - 1) / 2) * px * 1.2));
    }
    ctx.restore();
  }
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  doc: Doc,
  scene: Scene,
  bgImg: HTMLImageElement | null,
  cw: number,
  ch: number
) {
  const cover = (src: CanvasImageSource, sw: number, sh: number, extra = 1) => {
    const s = Math.max(cw / sw, ch / sh) * extra;
    ctx.drawImage(src, (cw - sw * s) / 2, (ch - sh * s) / 2, sw * s, sh * s);
  };
  if (doc.blur > 0) {
    ctx.filter = `blur(${(doc.blur / 100) * 0.04 * Math.max(cw, ch)}px)`;
    cover(scene.img, scene.w, scene.h, 1.08);
    ctx.filter = "none";
    return;
  }
  const bg = doc.bg;
  if (bg.kind === "color") {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, cw, ch);
  } else if (bg.kind === "gradient") {
    const t = (bg.angle * Math.PI) / 180;
    const r = Math.hypot(cw, ch) / 2;
    const cx = cw / 2;
    const cy = ch / 2;
    const g = ctx.createLinearGradient(cx - Math.sin(t) * r, cy + Math.cos(t) * r, cx + Math.sin(t) * r, cy - Math.cos(t) * r);
    g.addColorStop(0, bg.from);
    g.addColorStop(1, bg.to);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  } else if (bg.kind === "original") {
    cover(scene.img, scene.w, scene.h);
  } else if (bg.kind === "image" && bgImg) {
    cover(bgImg, bgImg.naturalWidth, bgImg.naturalHeight);
  }
}

export type RenderOpts = { selectedId?: string | null; originalOnly?: boolean };

/** Draws the whole composition. `scale` converts logical canvas units to canvas pixels. */
export function render(
  canvas: HTMLCanvasElement,
  scene: Scene,
  doc: Doc,
  bgImg: HTMLImageElement | null,
  scale: number,
  opts: RenderOpts = {}
) {
  const { W, H } = canvasSize(doc, scene.w, scene.h);
  const cw = Math.max(1, Math.round(W * scale));
  const ch = Math.max(1, Math.round(H * scale));
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";

  if (opts.originalOnly) {
    const s0 = Math.min(W / scene.w, H / scene.h) * scale;
    ctx.drawImage(scene.img, (cw - scene.w * s0) / 2, (ch - scene.h * s0) / 2, scene.w * s0, scene.h * s0);
    return;
  }

  drawBackground(ctx, doc, scene, bgImg, cw, ch);

  // Subject: original pixels masked by the (editable) cutout mask, placed with the user's transform.
  const layer = getTmp(cw, ch);
  const t = layer.getContext("2d")!;
  t.imageSmoothingQuality = "high";
  t.setTransform(new DOMMatrix().scale(scale).multiply(subjectMatrix(doc, W, H, scene.w, scene.h)));
  t.drawImage(scene.img, 0, 0);
  t.globalCompositeOperation = "destination-in";
  t.drawImage(scene.mask, 0, 0);
  t.globalCompositeOperation = "source-over";
  t.setTransform(1, 0, 0, 1, 0, 0);

  ctx.save();
  const a = doc.adjust;
  ctx.filter = `brightness(${100 + a.brightness}%) contrast(${100 + a.contrast}%) saturate(${100 + a.saturation}%)`;
  if (doc.shadow.on) {
    const k = scale * (Math.max(W, H) / 1000);
    const ang = (doc.shadow.angle * Math.PI) / 180;
    ctx.shadowColor = `rgba(0,0,0,${doc.shadow.opacity})`;
    ctx.shadowBlur = doc.shadow.blur * k;
    ctx.shadowOffsetX = Math.cos(ang) * doc.shadow.distance * k;
    ctx.shadowOffsetY = Math.sin(ang) * doc.shadow.distance * k;
  }
  ctx.drawImage(layer, 0, 0);
  ctx.restore();

  drawLayers(ctx, doc.layers, W, H, scale);

  if (opts.selectedId) {
    const l = doc.layers.find((x) => x.id === opts.selectedId);
    if (l) {
      const b = layerBox(l, W, H);
      ctx.save();
      ctx.strokeStyle = "#3b6bff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(b.x0 * scale, b.y0 * scale, (b.x1 - b.x0) * scale, (b.y1 - b.y0) * scale);
      ctx.restore();
    }
  }
}
