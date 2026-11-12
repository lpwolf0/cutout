import { useRef } from "react";
import type { Background, Layer, Ratio } from "../lib/types";
import { Segmented, Slider, type EditApi } from "./ui";

/* ---------- Cutout ---------- */
export function CutoutPanel(p: {
  ed: EditApi;
  tool: "erase" | "restore";
  setTool: (t: "erase" | "restore") => void;
  brush: number;
  setBrush: (n: number) => void;
  hardness: number;
  setHardness: (n: number) => void;
}) {
  const { ed } = p;
  return (
    <div className="panel-body">
      <h2>Erase &amp; Restore</h2>
      <Segmented
        value={p.tool}
        onChange={p.setTool}
        options={[
          { value: "erase", label: "Erase" },
          { value: "restore", label: "Restore" },
        ]}
      />
      <label className="field">
        <span className="field-top">
          <span>Brush size</span>
          <span className="val">{p.brush}px</span>
        </span>
        <input type="range" min={5} max={200} value={p.brush} onChange={(e) => p.setBrush(Number(e.target.value))} />
      </label>
      <label className="field">
        <span className="field-top">
          <span>Hardness</span>
          <span className="val">{p.hardness}%</span>
        </span>
        <input type="range" min={0} max={100} value={p.hardness} onChange={(e) => p.setHardness(Number(e.target.value))} />
      </label>
      <p className="hint">
        Paint on the image. Erase removes leftover background; Restore brings back parts of your subject.
        Shortcuts: E, R, [ and ].
      </p>
      <button className="btn" disabled={ed.doc.strokes.length === 0} onClick={() => ed.commit((d) => ({ ...d, strokes: [] }))}>
        Reset cutout
      </button>
    </div>
  );
}

/* ---------- Background ---------- */
const COLORS = ["#ffffff", "#000000", "#f1f3f9", "#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#073b4c", "#8338ec", "#fb5607", "#ff99c8", "#3a86ff"];
const GRADIENTS = [
  { from: "#ff9a9e", to: "#fad0c4", angle: 135 },
  { from: "#a18cd1", to: "#fbc2eb", angle: 135 },
  { from: "#84fab0", to: "#8fd3f4", angle: 135 },
  { from: "#f6d365", to: "#fda085", angle: 135 },
  { from: "#2b5876", to: "#4e4376", angle: 160 },
  { from: "#0f2027", to: "#2c5364", angle: 180 },
];

export function BackgroundPanel({ ed }: { ed: EditApi }) {
  const file = useRef<HTMLInputElement>(null);
  const bg = ed.doc.bg;
  const set = (b: Background) => ed.commit((d) => ({ ...d, bg: b, blur: 0 }));
  const isColor = (c: string) => bg.kind === "color" && bg.color === c && ed.doc.blur === 0;

  return (
    <div className="panel-body">
      <h2>Background</h2>
      <div className="swatches">
        <button
          className={`swatch checker${bg.kind === "transparent" && ed.doc.blur === 0 ? " active" : ""}`}
          onClick={() => set({ kind: "transparent" })}
          title="Transparent"
          aria-label="Transparent"
        />
        <button
          className={`swatch original${bg.kind === "original" && ed.doc.blur === 0 ? " active" : ""}`}
          onClick={() => set({ kind: "original" })}
          title="Original"
          aria-label="Original background"
        >
          Orig
        </button>
        {COLORS.map((c) => (
          <button
            key={c}
            className={`swatch${isColor(c) ? " active" : ""}`}
            style={{ background: c }}
            onClick={() => set({ kind: "color", color: c })}
            title={c}
            aria-label={`Color ${c}`}
          />
        ))}
        <label className="swatch custom" title="Custom color">
          <input type="color" value={bg.kind === "color" ? bg.color : "#888888"} onChange={(e) => set({ kind: "color", color: e.target.value })} aria-label="Custom color" />
        </label>
      </div>

      <h3>Gradients</h3>
      <div className="swatches">
        {GRADIENTS.map((g, i) => (
          <button
            key={i}
            className={`swatch${bg.kind === "gradient" && bg.from === g.from && bg.to === g.to && ed.doc.blur === 0 ? " active" : ""}`}
            style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }}
            onClick={() => set({ kind: "gradient", ...g })}
            aria-label={`Gradient ${i + 1}`}
          />
        ))}
      </div>

      <h3>Your photo</h3>
      <button className="btn" onClick={() => file.current?.click()}>
        Upload background image
      </button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) set({ kind: "image", url: URL.createObjectURL(f) });
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* ---------- Effects ---------- */
export function EffectsPanel({ ed }: { ed: EditApi }) {
  const { doc } = ed;
  const sh = doc.shadow;
  const setShadow = (patch: Partial<typeof sh>) => ed.set((d) => ({ ...d, shadow: { ...d.shadow, ...patch } }));
  return (
    <div className="panel-body">
      <h2>Effects</h2>
      <Slider label="Blur background" value={doc.blur} min={0} max={100} ed={ed} onChange={(v) => ed.set((d) => ({ ...d, blur: v }))} />
      <p className="hint">Blurs your original background behind the subject. Set to 0 to use the Background tab.</p>

      <label className="check">
        <input type="checkbox" checked={sh.on} onChange={(e) => ed.commit((d) => ({ ...d, shadow: { ...d.shadow, on: e.target.checked } }))} />
        Shadow
      </label>
      {sh.on && (
        <>
          <Slider label="Opacity" value={sh.opacity * 100} min={0} max={100} unit="%" ed={ed} onChange={(v) => setShadow({ opacity: v / 100 })} />
          <Slider label="Blur" value={sh.blur} min={0} max={100} ed={ed} onChange={(v) => setShadow({ blur: v })} />
          <Slider label="Distance" value={sh.distance} min={0} max={100} ed={ed} onChange={(v) => setShadow({ distance: v })} />
          <Slider label="Direction" value={sh.angle} min={0} max={360} unit="°" ed={ed} onChange={(v) => setShadow({ angle: v })} />
        </>
      )}
    </div>
  );
}

/* ---------- Adjust ---------- */
const RATIOS: { value: Ratio; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "3:4", label: "3:4" },
  { value: "4:3", label: "4:3" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
];

export function AdjustPanel({ ed }: { ed: EditApi }) {
  const { doc } = ed;
  const a = doc.adjust;
  const s = doc.subject;
  const setAdj = (patch: Partial<typeof a>) => ed.set((d) => ({ ...d, adjust: { ...d.adjust, ...patch } }));
  const setSub = (patch: Partial<typeof s>) => ed.set((d) => ({ ...d, subject: { ...d.subject, ...patch } }));
  return (
    <div className="panel-body">
      <h2>Color &amp; light</h2>
      <Slider label="Brightness" value={a.brightness} min={-100} max={100} ed={ed} onChange={(v) => setAdj({ brightness: v })} />
      <Slider label="Contrast" value={a.contrast} min={-100} max={100} ed={ed} onChange={(v) => setAdj({ contrast: v })} />
      <Slider label="Saturation" value={a.saturation} min={-100} max={100} ed={ed} onChange={(v) => setAdj({ saturation: v })} />
      <button className="btn" onClick={() => ed.commit((d) => ({ ...d, adjust: { brightness: 0, contrast: 0, saturation: 0 } }))}>
        Reset colors
      </button>

      <h2>Crop &amp; place</h2>
      <div className="chips">
        {RATIOS.map((r) => (
          <button key={r.value} className={`chip${doc.ratio === r.value ? " on" : ""}`} onClick={() => ed.commit((d) => ({ ...d, ratio: r.value }))}>
            {r.label}
          </button>
        ))}
      </div>
      <Slider label="Subject size" value={s.scale * 100} min={20} max={300} unit="%" ed={ed} onChange={(v) => setSub({ scale: v / 100 })} />
      <Slider label="Rotate" value={s.rotate} min={-180} max={180} unit="°" ed={ed} onChange={(v) => setSub({ rotate: v })} />
      <div className="row">
        <button className="btn" onClick={() => ed.commit((d) => ({ ...d, subject: { ...d.subject, flip: !d.subject.flip } }))}>
          Flip
        </button>
        <button className="btn" onClick={() => ed.commit((d) => ({ ...d, subject: { scale: 1, x: 0, y: 0, rotate: 0, flip: false } }))}>
          Reset position
        </button>
      </div>
      <p className="hint">Drag the subject on the canvas to move it.</p>
    </div>
  );
}

/* ---------- Design ---------- */
const FONTS = ["Arial", "Georgia", "Impact", "Trebuchet MS", "Verdana", "Courier New", "Times New Roman", "Bricolage Grotesque", "IBM Plex Sans"];

export function DesignPanel({ ed, selectedId, setSelectedId }: { ed: EditApi; selectedId: string | null; setSelectedId: (id: string | null) => void }) {
  const layers = ed.doc.layers;
  const sel = layers.find((l) => l.id === selectedId);

  const add = (kind: Layer["kind"]) => {
    const id = crypto.randomUUID();
    const base: Layer = { id, kind, x: 0.5, y: 0.5, text: "", font: "Arial", size: 0.08, bold: true, italic: false, color: "#ffffff", w: 0.3, h: 0.2 };
    const layer: Layer =
      kind === "text"
        ? { ...base, text: "Your text", y: 0.15 }
        : kind === "rect"
        ? { ...base, color: "#3b6bff" }
        : { ...base, color: "#ef476f", w: 0.25, h: 0.25 };
    ed.commit((d) => ({ ...d, layers: [...d.layers, layer] }));
    setSelectedId(id);
  };
  const patch = (id: string, p: Partial<Layer>) => ed.set((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...p } : l)) }));
  const remove = (id: string) => {
    ed.commit((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }));
    setSelectedId(null);
  };

  return (
    <div className="panel-body">
      <h2>Design</h2>
      <div className="row">
        <button className="btn" onClick={() => add("text")}>Add text</button>
        <button className="btn" onClick={() => add("rect")}>Rectangle</button>
        <button className="btn" onClick={() => add("ellipse")}>Circle</button>
      </div>
      <p className="hint">Click an item on the canvas to select it, then drag to move.</p>

      {layers.length > 0 && (
        <ul className="layer-list">
          {layers.map((l) => (
            <li key={l.id}>
              <button className={l.id === selectedId ? "on" : ""} onClick={() => setSelectedId(l.id)}>
                {l.kind === "text" ? l.text.split("\n")[0] || "Text" : l.kind === "rect" ? "Rectangle" : "Circle"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {sel && (
        <div className="layer-edit">
          {sel.kind === "text" ? (
            <>
              <textarea
                value={sel.text}
                rows={2}
                onFocus={ed.begin}
                onChange={(e) => patch(sel.id, { text: e.target.value })}
                onBlur={ed.end}
                aria-label="Text"
              />
              <select
                value={sel.font}
                onChange={(e) => ed.commit((d) => ({ ...d, layers: d.layers.map((l) => (l.id === sel.id ? { ...l, font: e.target.value } : l)) }))}
                aria-label="Font"
              >
                {FONTS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <Slider label="Size" value={sel.size * 100} min={2} max={30} unit="%" ed={ed} onChange={(v) => patch(sel.id, { size: v / 100 })} />
              <div className="row">
                <button className={`btn${sel.bold ? " on" : ""}`} onClick={() => ed.commit((d) => ({ ...d, layers: d.layers.map((l) => (l.id === sel.id ? { ...l, bold: !l.bold } : l)) }))}>Bold</button>
                <button className={`btn${sel.italic ? " on" : ""}`} onClick={() => ed.commit((d) => ({ ...d, layers: d.layers.map((l) => (l.id === sel.id ? { ...l, italic: !l.italic } : l)) }))}>Italic</button>
              </div>
            </>
          ) : (
            <>
              <Slider label="Width" value={sel.w * 100} min={2} max={100} unit="%" ed={ed} onChange={(v) => patch(sel.id, { w: v / 100 })} />
              <Slider label="Height" value={sel.h * 100} min={2} max={100} unit="%" ed={ed} onChange={(v) => patch(sel.id, { h: v / 100 })} />
            </>
          )}
          <label className="field inline">
            <span>Color</span>
            <input type="color" value={sel.color} onFocus={ed.begin} onChange={(e) => patch(sel.id, { color: e.target.value })} onBlur={ed.end} />
          </label>
          <button className="btn btn-quiet" onClick={() => remove(sel.id)}>Delete</button>
        </div>
      )}
    </div>
  );
}
