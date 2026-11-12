export type Background =
  | { kind: "transparent" }
  | { kind: "original" }
  | { kind: "color"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "image"; url: string };

export type Stroke = {
  mode: "erase" | "restore";
  size: number; // brush diameter in image pixels
  hardness: number; // 0..1
  points: [number, number][];
};

export type Layer = {
  id: string;
  kind: "text" | "rect" | "ellipse";
  x: number; // center, fraction of canvas width
  y: number; // center, fraction of canvas height
  text: string;
  font: string;
  size: number; // fraction of canvas height
  bold: boolean;
  italic: boolean;
  color: string;
  w: number; // shapes: fraction of canvas width
  h: number; // shapes: fraction of canvas height
};

export type Ratio = "original" | "1:1" | "4:5" | "3:4" | "4:3" | "16:9" | "9:16";

export type Doc = {
  strokes: Stroke[];
  bg: Background;
  blur: number; // 0..100, blurs the original background
  shadow: { on: boolean; opacity: number; blur: number; distance: number; angle: number };
  adjust: { brightness: number; contrast: number; saturation: number }; // -100..100
  ratio: Ratio;
  subject: { scale: number; x: number; y: number; rotate: number; flip: boolean };
  layers: Layer[];
};

export const defaultDoc: Doc = {
  strokes: [],
  bg: { kind: "transparent" },
  blur: 0,
  shadow: { on: false, opacity: 0.4, blur: 30, distance: 20, angle: 90 },
  adjust: { brightness: 0, contrast: 0, saturation: 0 },
  ratio: "original",
  subject: { scale: 1, x: 0, y: 0, rotate: 0, flip: false },
  layers: [],
};

export type Item = {
  id: string;
  name: string;
  originalUrl: string;
  status: "pending" | "processing" | "done" | "error";
  stage: "model" | "cutout";
  progress: number;
  error?: string;
  bitmap?: ImageBitmap;
  w: number;
  h: number;
  baseMask?: HTMLCanvasElement;
  doc: Doc;
  past: Doc[];
  future: Doc[];
};

/** Logical canvas size: the image fits inside the chosen aspect ratio. */
export function canvasSize(doc: Pick<Doc, "ratio">, w: number, h: number) {
  if (doc.ratio === "original") return { W: w, H: h };
  const [a, b] = doc.ratio.split(":").map(Number);
  const r = a / b;
  if (r >= w / h) return { W: Math.round(h * r), H: h };
  return { W: w, H: Math.round(w / r) };
}
