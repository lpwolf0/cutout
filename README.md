# Cutout

A private, in-browser background remover (a remove.bg replacement for personal use),
powered by BRIA RMBG-2.0 running locally through ONNX Runtime Web (WebGPU, with a slower WASM/CPU fallback).
Nothing is uploaded. A clone of remove.bg's web app without the API, pricing, login/signup or plugins.

## Features

- Upload, drop, paste or URL; single image or bulk (processed one at a time, zip download, "Apply to all")
- Cutout: Erase / Restore brush (size, hardness), undo/redo, hold-to-compare
- Background: transparent, original, colors, gradients, your own photo
- Effects: background blur, shadow
- Adjust: brightness/contrast/saturation, crop ratios, move/scale/rotate/flip the subject
- Design: text and shapes
- Download PNG / JPG / WebP at full resolution

Not included (they need cloud AI): Magic Background (AI-generated backgrounds), Erase Distractions, Expand image.

## 1. Get the model (one time)

RMBG-2.0 is released under CC BY-NC 4.0: free for personal / non-commercial use only.
Commercial use needs a license from BRIA.

Download an ONNX export and save it as:

    public/models/rmbg-2.0/model_fp16.onnx

The official briaai/RMBG-2.0 repo is gated (you must accept its terms on Hugging Face) and its
original ONNX export has WebGPU compatibility problems. A community WebGPU-compatible fp16 export
(about 490 MB) is yamura4/RMBG-2.0-WebGPU on Hugging Face (onnx/model_fp16.onnx), same license.
It is a third-party re-export, so check it yourself.

## 2. Run

    npm install
    npm run dev

Drop, paste (Ctrl/Cmd+V) or choose one image or many.

## Notes

- Use a recent Chrome or Edge for WebGPU. Without it the model falls back to CPU, which is much slower.
- The model file lives in `public/`, so do not deploy `dist/` publicly with it inside (size and license).
  This is meant to be run locally.
- Model path and input size are constants at the top of `src/lib/cutout.ts`.
- If you change the onnxruntime-web version in package.json, change the CDN version in `cutout.ts` to match.
