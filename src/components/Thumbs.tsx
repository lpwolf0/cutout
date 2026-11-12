import type { Item } from "../lib/types";

type Props = {
  items: Item[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
};

function label(i: Item) {
  if (i.status === "pending") return "Waiting";
  if (i.status === "processing") return `${Math.round(i.progress * 100)}%`;
  if (i.status === "error") return "Failed";
  return "";
}

export default function Thumbs({ items, selectedId, onSelect, onRemove }: Props) {
  return (
    <ul className="thumbs">
      {items.map((i) => (
        <li key={i.id} className={i.id === selectedId ? "selected" : ""}>
          <button className="thumb" onClick={() => onSelect(i.id)} aria-label={`Show ${i.name}`}>
            <img src={i.originalUrl} alt="" draggable={false} />
            {label(i) && <span className="badge">{label(i)}</span>}
          </button>
          {i.status !== "processing" && (
            <button className="remove" onClick={() => onRemove(i.id)} aria-label={`Remove ${i.name}`}>
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
