import * as ort from "onnxruntime-web/webgpu";

/** Must match the onnxruntime-web version pinned in package.json. */
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";

/** Put the RMBG-2.0 ONNX file here (see README). */
const MODEL_URL = "/models/rmbg-2.0/model_fp16.onnx";
const SIZE = 1024;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export class ModelMissingError extends Error {
  constructor() {
    super(
      "RMBG-2.0 model file not found. Place model_fp16.onnx in public/models/rmbg-2.0/ (see the README), then reload."
    );
  }
}

type Provider = "webgpu" | "wasm";
let state: { session: ort.InferenceSession; ep: Provider } | null = null;
let modelBytes: Uint8Array | null = null;
let loading: Promise<void> | null = null;

async function downloadModel(onProgress: (fraction: number) => void): Promise<Uint8Array> {
  const res = await fetch(MODEL_URL);
  // Vite's dev server answers a missing file with index.html, so check the type too.
  if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html") || !res.body) {
    throw new ModelMissingError();
  }
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress(received / total);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function createSession(bytes: Uint8Array, ep: Provider) {
  return ort.InferenceSession.create(bytes, {
    executionProviders: [ep],
    graphOptimizationLevel: "all",
  });
}

async function ensureModel(onProgress: (fraction: number) => void) {
  if (state) return;
  if (!loading) {
    loading = (async () => {
      const bytes = await downloadModel(onProgress);
      modelBytes = bytes;
      const hasGpu = "gpu" in navigator;
      try {
        state = { session: await createSession(bytes, hasGpu ? "webgpu" : "wasm"), ep: hasGpu ? "webgpu" : "wasm" };
      } catch (err) {
        if (!hasGpu) throw err;
        console.warn("WebGPU session failed, falling back to WASM", err);
        state = { session: await createSession(bytes, "wasm"), ep: "wasm" };
      }
    })().catch((err) => {
      loading = null;
      throw err;
    });
  }
  await loading;
}

function toInput(bitmap: ImageBitmap): ort.Tensor {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const plane = SIZE * SIZE;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    out[i] = (data[i * 4] / 255 - MEAN[0]) / STD[0];
    out[plane + i] = (data[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
    out[2 * plane + i] = (data[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }
  return new ort.Tensor("float32", out, [1, 3, SIZE, SIZE]);
}

function buildMask(w: number, h: number, alpha: Float32Array): HTMLCanvasElement {
  // Some exports output logits, others probabilities. Logits fall well outside 0..1.
  let logits = false;
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] < -0.05 || alpha[i] > 1.05) {
      logits = true;
      break;
    }
  }

  const small = document.createElement("canvas");
  small.width = small.height = SIZE;
  const sctx = small.getContext("2d")!;
  const md = sctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const a = logits ? 1 / (1 + Math.exp(-alpha[i])) : alpha[i];
    md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = 255;
    md.data[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
  }
  sctx.putImageData(md, 0, 0);

  // Scale the mask up to the original size (smooth edges).
  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext("2d")!;
  mctx.imageSmoothingQuality = "high";
  mctx.drawImage(small, 0, 0, w, h);
  return mask;
}

/** Runs RMBG-2.0 and returns a full-resolution mask canvas (white, alpha = foreground). */
export async function cutout(
  bitmap: ImageBitmap,
  onProgress: (fraction: number, stage: "model" | "cutout") => void
): Promise<HTMLCanvasElement> {
  onProgress(0, "model");
  await ensureModel((f) => onProgress(f, "model"));

  onProgress(0.1, "cutout");
  const input = toInput(bitmap);
  onProgress(0.2, "cutout");

  let s = state!;
  let results: ort.InferenceSession.OnnxValueMapType;
  try {
    results = await s.session.run({ [s.session.inputNames[0]]: input });
  } catch (err) {
    if (s.ep !== "webgpu" || !modelBytes) throw err;
    console.warn("WebGPU run failed, retrying on WASM", err);
    state = { session: await createSession(modelBytes, "wasm"), ep: "wasm" };
    s = state;
    results = await s.session.run({ [s.session.inputNames[0]]: input });
  }

  const out = results[s.session.outputNames[0]];
  if (out.type !== "float32") throw new Error(`Unexpected model output type: ${out.type}`);
  const all = out.data as Float32Array;
  const alpha = all.length === SIZE * SIZE ? all : all.subarray(all.length - SIZE * SIZE);

  onProgress(0.85, "cutout");
  return buildMask(bitmap.width, bitmap.height, alpha);
}
