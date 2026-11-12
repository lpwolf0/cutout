import { useCallback, useEffect, useRef, useState } from "react";
import { zipSync } from "fflate";
import Home, { pickImages } from "./components/Home";
import Editor from "./components/Editor";
import { cutout } from "./lib/cutout";
import { defaultDoc, type Doc, type Item } from "./lib/types";
import { dropMask } from "./lib/mask";
import { baseName, exportBlob, saveBlob } from "./lib/export";

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const files = useRef(new Map<string, File>());

  const patch = useCallback((id: string, p: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }, []);

  const addFiles = useCallback((list: File[]) => {
    if (!list.length) return;
    const added: Item[] = list.map((f) => {
      const id = crypto.randomUUID();
      files.current.set(id, f);
      return {
        id,
        name: f.name || "pasted-image.png",
        originalUrl: URL.createObjectURL(f),
        status: "pending",
        stage: "model",
        progress: 0,
        w: 1,
        h: 1,
        doc: defaultDoc,
        past: [],
        future: [],
      };
    });
    setItems((prev) => [...prev, ...added]);
    setSelectedId((cur) => cur || added[0].id);
  }, []);

  const addFromUrl = useCallback(
    async (url: string): Promise<string | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("bad status");
        const blob = await res.blob();
        if (!blob.type.startsWith("image/")) return "That link isn't an image.";
        const name = url.split("/").pop()?.split("?")[0] || "image";
        addFiles([new File([blob], name, { type: blob.type })]);
        return null;
      } catch {
        return "Couldn't load that link (the site may block downloads). Save the image and upload it instead.";
      }
    },
    [addFiles]
  );

  /* ---- queue: one image at a time (the model is heavy) ---- */
  useEffect(() => {
    if (activeId) return;
    const next = items.find((i) => i.status === "pending");
    if (!next) return;
    const file = files.current.get(next.id);
    if (!file) return;

    setActiveId(next.id);
    patch(next.id, { status: "processing" });
    (async () => {
      try {
        const bitmap = await createImageBitmap(file);
        patch(next.id, { bitmap, w: bitmap.width, h: bitmap.height });
        const baseMask = await cutout(bitmap, (progress, stage) => patch(next.id, { progress, stage }));
        patch(next.id, { status: "done", progress: 1, baseMask });
      } catch (err) {
        console.error(err);
        patch(next.id, { status: "error", error: err instanceof Error ? err.message : "Something went wrong." });
      } finally {
        setActiveId(null);
      }
    })();
  }, [items, activeId, patch]);

  /* ---- paste + drop anywhere ---- */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const pasted = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (pasted.length) addFiles(pasted);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      addFiles(pickImages(e.dataTransfer?.files ?? null));
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

  /* ---- document + history ---- */
  const setDoc = useCallback((id: string, fn: (d: Doc) => Doc) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, doc: fn(i.doc) } : i)));
  }, []);

  const pushHistory = useCallback((id: string, base: Doc) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id && i.doc !== base ? { ...i, past: [...i.past.slice(-49), base], future: [] } : i))
    );
  }, []);

  const undo = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id || !i.past.length) return i;
        const past = i.past.slice();
        const doc = past.pop()!;
        return { ...i, doc, past, future: [i.doc, ...i.future] };
      })
    );
  }, []);

  const redo = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id || !i.future.length) return i;
        const [doc, ...future] = i.future;
        return { ...i, doc, past: [...i.past, i.doc], future };
      })
    );
  }, []);

  const applyToAll = useCallback((id: string) => {
    setItems((prev) => {
      const src = prev.find((i) => i.id === id);
      if (!src) return prev;
      const { bg, blur, shadow, adjust, ratio, layers } = src.doc;
      return prev.map((i) =>
        i.id === id ? i : { ...i, past: [...i.past.slice(-49), i.doc], future: [], doc: { ...i.doc, bg, blur, shadow, adjust, ratio, layers } }
      );
    });
  }, []);

  /* ---- list management ---- */
  const release = (i: Item) => {
    URL.revokeObjectURL(i.originalUrl);
    i.bitmap?.close();
    dropMask(i.id);
    files.current.delete(i.id);
  };

  const remove = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item) release(item);
    const rest = items.filter((i) => i.id !== id);
    setItems(rest);
    if (selectedId === id) setSelectedId(rest[0]?.id ?? "");
  };

  const home = () => {
    if (activeId) return; // let the running cutout finish first
    items.forEach(release);
    setItems([]);
    setSelectedId("");
  };

  const downloadAll = async () => {
    setZipping(true);
    try {
      const entries: Record<string, Uint8Array> = {};
      let n = 0;
      for (const item of items) {
        if (item.status !== "done") continue;
        n++;
        let name = `${baseName(item.name)}-cutout.png`;
        if (entries[name]) name = `${baseName(item.name)}-cutout-${n}.png`;
        entries[name] = new Uint8Array(await (await exportBlob(item, "png")).arrayBuffer());
      }
      saveBlob(new Blob([zipSync(entries, { level: 0 }) as unknown as BlobPart], { type: "application/zip" }), "cutouts.zip");
    } finally {
      setZipping(false);
    }
  };

  const selected = items.find((i) => i.id === selectedId) ?? items[0];

  if (!selected) return <Home onFiles={addFiles} onUrl={addFromUrl} />;

  return (
    <Editor
      items={items}
      item={selected}
      zipping={zipping}
      onSelect={setSelectedId}
      onRemove={remove}
      onAddFiles={addFiles}
      onSetDoc={setDoc}
      onPush={pushHistory}
      onUndo={undo}
      onRedo={redo}
      onApplyAll={applyToAll}
      onDownloadAll={downloadAll}
      onHome={home}
    />
  );
}
