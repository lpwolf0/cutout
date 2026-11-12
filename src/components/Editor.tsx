import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { canvasSize, type Doc, type Item } from "../lib/types";
import { hitLayer, render, subjectMatrix } from "../lib/render";
import { markApplied, maskFor, paintSegment } from "../lib/mask";
import { loadImage } from "../lib/images";
import { baseName, exportBlob, saveBlob, type Format } from "../lib/export";
import { AdjustPanel, BackgroundPanel, CutoutPanel, DesignPanel, EffectsPanel } from "./panels";
import type { EditApi } from "./ui";
import { pickImages } from "./Home";
import Thumbs from "./Thumbs";

type Tab = "cutout" | "background" | "effects" | "adjust" | "design";
const TABS: { id: Tab; label: string }[] = [
  { id: "cutout", label: "Cutout" },
  { id: "background", label: "Background" },
  { id: "effects", label: "Effects" },
  { id: "adjust", label: "Adjust" },
  { id: "design", label: "Design" },
];

type Props = {
  items: Item[];
  item: Item;
  zipping: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAddFiles: (files: File[]) => void;
  onSetDoc: (id: string, fn: (d: Doc) => Doc) => void;
  onPush: (id: string, base: Doc) => void;
  onUndo: (id: string) => void;
  onRedo: (id: string) => void;
  onApplyAll: (id: string) => void;
  onDownloadAll: () => void;
  onHome: () => void;
};

export default function Editor(p: Props) {
  const { item, items } = p;
  const [tab, setTab] = useState<Tab>("cutout");
  const [tool, setTool] = useState<"erase" | "restore">("erase");
  const [brush, setBrush] = useState(40);
  const [hardness, setHardness] = useState(70);
  const [zoom, setZoom] = useState(1);
  const [compare, setCompare] = useState(false);
  const [selLayer, setSelLayer] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>("png");
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
  const [view, setView] = useState({ w: 700, h: 500 });
  const [tick, setTick] = useState(0);
  const [exporting, setExporting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLInputElement>(null);
  const itemRef = useRef(item);
  itemRef.current = item;
  const gesture = useRef<Doc | null>(null);
  const live = useRef<{ stroke: { mode: "erase" | "restore"; size: number; hardness: number; points: [number, number][] }; last: [number, number] } | null>(null);
  const drag = useRef<{ kind: "subject" | "layer"; sx: number; sy: number; x0: number; y0: number; id?: string } | null>(null);

  const done = item.status === "done" && !!item.bitmap && !!item.baseMask;
  const { W, H } = canvasSize(item.doc, item.w, item.h);

  /* ---- editing API (a drag = one undo step) ---- */
  const ed: EditApi = useMemo(
    () => ({
      doc: item.doc,
      begin: () => {
        if (!gesture.current) gesture.current = itemRef.current.doc;
      },
      set: (fn) => p.onSetDoc(item.id, fn),
      end: () => {
        const b = gesture.current;
        gesture.current = null;
        if (b) p.onPush(item.id, b);
      },
      commit: (fn) => {
        const b = itemRef.current.doc;
        p.onSetDoc(item.id, fn);
        p.onPush(item.id, b);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.id, item.doc, p.onSetDoc, p.onPush]
  );

  /* ---- viewport size / zoom ---- */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setView({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = Math.max(0.01, Math.min((view.w - 40) / W, (view.h - 40) / H));
  const cssW = W * fit * zoom;
  const cssH = H * fit * zoom;
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(fit * zoom * dpr, 3000 / Math.max(W, H));

  /* ---- background image + fonts ---- */
  const bgUrl = item.doc.bg.kind === "image" ? item.doc.bg.url : "";
  useEffect(() => {
    if (!bgUrl) return setBgImg(null);
    let alive = true;
    loadImage(bgUrl).then((i) => alive && setBgImg(i));
    return () => {
      alive = false;
    };
  }, [bgUrl]);

  const fontsKey = item.doc.layers.map((l) => l.font).join("|");
  useEffect(() => {
    new Set(item.doc.layers.map((l) => l.font)).forEach((f) => document.fonts?.load(`700 20px "${f}"`).then(() => setTick((t) => t + 1)));
  }, [fontsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- drawing ---- */
  const drawRef = useRef<() => void>(() => {});
  drawRef.current = () => {
    const canvas = canvasRef.current;
    const it = itemRef.current;
    if (!canvas || !it.bitmap || !it.baseMask || it.status !== "done") return;
    const mask = maskFor(it.id, it.baseMask, it.doc.strokes);
    render(canvas, { img: it.bitmap, w: it.w, h: it.h, mask: mask.canvas }, it.doc, bgImg, scale, {
      selectedId: tab === "design" ? selLayer : null,
      originalOnly: compare,
    });
  };
  useLayoutEffect(() => {
    drawRef.current();
  }, [item.doc, item.status, compare, bgImg, scale, tab, selLayer, tick, done]);

  /* ---- pointer interaction ---- */
  const toCanvas = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height, rw: r.width };
  };

  const moveCursor = (e: React.PointerEvent) => {
    const c = cursorRef.current;
    if (!c) return;
    c.style.left = `${e.clientX}px`;
    c.style.top = `${e.clientY}px`;
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!done || compare) return;
    const pt = toCanvas(e);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tab === "cutout") {
      const m = subjectMatrix(item.doc, W, H, item.w, item.h);
      const pxPerImgPx = Math.hypot(m.a, m.b) * (pt.rw / W);
      const q = m.inverse().transformPoint(new DOMPoint(pt.x, pt.y));
      const stroke = { mode: tool, size: Math.max(1, brush / pxPerImgPx), hardness: hardness / 100, points: [[q.x, q.y]] as [number, number][] };
      const mask = maskFor(item.id, item.baseMask!, item.doc.strokes);
      paintSegment(mask.canvas.getContext("2d")!, stroke, [q.x, q.y], null);
      live.current = { stroke, last: [q.x, q.y] };
      ed.begin();
      drawRef.current();
    } else if (tab === "adjust") {
      ed.begin();
      drag.current = { kind: "subject", sx: pt.x, sy: pt.y, x0: item.doc.subject.x, y0: item.doc.subject.y };
    } else if (tab === "design") {
      const hit = hitLayer(item.doc.layers, W, H, pt.x, pt.y);
      setSelLayer(hit?.id ?? null);
      if (hit) {
        ed.begin();
        drag.current = { kind: "layer", id: hit.id, sx: pt.x, sy: pt.y, x0: hit.x, y0: hit.y };
      }
    }
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tab === "cutout") moveCursor(e);
    if (!done) return;
    const pt = toCanvas(e);

    if (live.current) {
      const m = subjectMatrix(item.doc, W, H, item.w, item.h);
      const q = m.inverse().transformPoint(new DOMPoint(pt.x, pt.y));
      const next: [number, number] = [q.x, q.y];
      const mask = maskFor(item.id, item.baseMask!, item.doc.strokes);
      paintSegment(mask.canvas.getContext("2d")!, live.current.stroke, live.current.last, next);
      live.current.stroke.points.push(next);
      live.current.last = next;
      drawRef.current();
    } else if (drag.current) {
      const d = drag.current;
      const dx = (pt.x - d.sx) / W;
      const dy = (pt.y - d.sy) / H;
      if (d.kind === "subject") {
        ed.set((doc) => ({ ...doc, subject: { ...doc.subject, x: d.x0 + dx, y: d.y0 + dy } }));
      } else {
        ed.set((doc) => ({ ...doc, layers: doc.layers.map((l) => (l.id === d.id ? { ...l, x: d.x0 + dx, y: d.y0 + dy } : l)) }));
      }
    }
  };

  const onUp = () => {
    if (live.current) {
      const strokes = [...itemRef.current.doc.strokes, live.current.stroke];
      markApplied(item.id, strokes);
      live.current = null;
      ed.set((d) => ({ ...d, strokes }));
      ed.end();
    } else if (drag.current) {
      drag.current = null;
      ed.end();
    }
  };

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "range") return;
      if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? p.onRedo(item.id) : p.onUndo(item.id);
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        p.onRedo(item.id);
      } else if (!mod && e.key.toLowerCase() === "e") {
        setTab("cutout");
        setTool("erase");
      } else if (!mod && e.key.toLowerCase() === "r") {
        setTab("cutout");
        setTool("restore");
      } else if (e.key === "[") setBrush((b) => Math.max(5, b - 5));
      else if (e.key === "]") setBrush((b) => Math.min(200, b + 5));
      else if ((e.key === "Delete" || e.key === "Backspace") && tab === "design" && selLayer) {
        ed.commit((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== selLayer) }));
        setSelLayer(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const download = async () => {
    setExporting(true);
    try {
      const ext = format;
      saveBlob(await exportBlob(item, format), `${baseName(item.name)}-cutout.${ext}`);
    } finally {
      setExporting(false);
    }
  };

  const doneCount = items.filter((i) => i.status === "done").length;
  const waiting = items.filter((i) => i.status === "pending" || i.status === "processing").length;

  return (
    <div className="editor-shell">
      <header className="topbar">
        <button className="logo" onClick={p.onHome} aria-label="Cutout, start over">Cutout</button>

        <div className="tb-group">
          <button className="tb-btn" onClick={() => p.onUndo(item.id)} disabled={!item.past.length}>Undo</button>
          <button className="tb-btn" onClick={() => p.onRedo(item.id)} disabled={!item.future.length}>Redo</button>
          <button
            className="tb-btn"
            disabled={!done}
            onPointerDown={() => setCompare(true)}
            onPointerUp={() => setCompare(false)}
            onPointerLeave={() => setCompare(false)}
          >
            Hold to compare
          </button>
        </div>

        <div className="tb-group zoom">
          <button className="tb-btn" onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">−</button>
          <span className="zoom-val">{Math.round(zoom * 100)}%</span>
          <button className="tb-btn" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">+</button>
          <button className="tb-btn" onClick={() => setZoom(1)}>Fit</button>
        </div>

        <div className="tb-right">
          {items.length > 1 && (
            <button className="tb-btn" disabled={!done} onClick={() => p.onApplyAll(item.id)}>Apply to all</button>
          )}
          <button className="tb-btn" onClick={() => more.current?.click()}>Add images</button>
          <input
            ref={more}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              p.onAddFiles(pickImages(e.target.files));
              e.target.value = "";
            }}
          />
          <select className="fmt" value={format} onChange={(e) => setFormat(e.target.value as Format)} aria-label="Format">
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="webp">WebP</option>
          </select>
          <button className="btn btn-primary" disabled={!done || exporting} onClick={download}>
            {exporting ? "Preparing…" : "Download"}
          </button>
          {doneCount > 1 && (
            <button className="btn" disabled={p.zipping || waiting > 0} onClick={p.onDownloadAll}>
              {p.zipping ? "Zipping…" : `Download all (${doneCount})`}
            </button>
          )}
        </div>
      </header>

      <div className="body">
        <nav className="rail" aria-label="Tools">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)} disabled={!done}>
              {t.label}
            </button>
          ))}
        </nav>

        <aside className="side">
          {!done && <div className="panel-body"><p className="hint">Tools unlock when the cutout is ready.</p></div>}
          {done && tab === "cutout" && (
            <CutoutPanel ed={ed} tool={tool} setTool={setTool} brush={brush} setBrush={setBrush} hardness={hardness} setHardness={setHardness} />
          )}
          {done && tab === "background" && <BackgroundPanel ed={ed} />}
          {done && tab === "effects" && <EffectsPanel ed={ed} />}
          {done && tab === "adjust" && <AdjustPanel ed={ed} />}
          {done && tab === "design" && <DesignPanel ed={ed} selectedId={selLayer} setSelectedId={setSelLayer} />}
        </aside>

        <div className="center">
          <div className="viewport" ref={viewportRef}>
            {done ? (
              <div className="canvas-wrap checker" style={{ width: cssW, height: cssH }}>
                <canvas
                  ref={canvasRef}
                  className={tab === "cutout" ? "cursor-none" : tab === "adjust" ? "cursor-move" : ""}
                  style={{ width: "100%", height: "100%" }}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  onPointerEnter={() => cursorRef.current && (cursorRef.current.style.display = tab === "cutout" ? "block" : "none")}
                  onPointerLeave={() => cursorRef.current && (cursorRef.current.style.display = "none")}
                />
              </div>
            ) : (
              <div className="processing" aria-live="polite">
                <img src={item.originalUrl} alt="" />
                {item.status === "error" ? (
                  <p className="error-text">{item.error ?? "Couldn't remove the background from this image."}</p>
                ) : (
                  <>
                    <p>
                      {item.status === "pending"
                        ? "Waiting for its turn"
                        : item.stage === "model"
                        ? "Loading the RMBG-2.0 model (first image only)"
                        : "Removing the background"}
                    </p>
                    <div className="bar" role="progressbar" aria-valuenow={Math.round(item.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                      <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {items.length > 1 && <Thumbs items={items} selectedId={item.id} onSelect={p.onSelect} onRemove={p.onRemove} />}
        </div>
      </div>

      <div ref={cursorRef} className="brush-cursor" style={{ width: brush, height: brush, display: "none" }} />
    </div>
  );
}
