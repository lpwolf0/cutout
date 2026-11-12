import type { Doc } from "../lib/types";

/** Editing API handed to panels. Sliders call begin/set/end so a drag is one undo step. */
export type EditApi = {
  doc: Doc;
  begin: () => void;
  set: (fn: (d: Doc) => Doc) => void;
  end: () => void;
  commit: (fn: (d: Doc) => Doc) => void;
};

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  ed: EditApi;
  onChange: (v: number) => void;
};

export function Slider({ label, value, min, max, step = 1, unit = "", ed, onChange }: SliderProps) {
  return (
    <label className="field">
      <span className="field-top">
        <span>{label}</span>
        <span className="val">
          {Math.round(value)}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={ed.begin}
        onKeyDown={ed.begin}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={ed.end}
        onKeyUp={ed.end}
        onBlur={ed.end}
      />
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
