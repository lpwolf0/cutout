import { useRef, useState } from "react";

export const pickImages = (list: FileList | null) => Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));

type Props = { onFiles: (files: File[]) => void; onUrl: (url: string) => Promise<string | null> };

export default function Home({ onFiles, onUrl }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const take = (list: FileList | null) => {
    const files = pickImages(list);
    if (files.length) onFiles(files);
  };

  const submitUrl = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setMsg((await onUrl(url.trim())) ?? "");
    setBusy(false);
  };

  return (
    <div className="home">
      <header className="home-top">
        <span className="logo">Cutout</span>
      </header>
      <main className="hero">
        <h1>Remove Image Background</h1>
        <p className="sub">Automatic, private and free. Runs entirely in your browser.</p>

        <div className="upload-card">
          <button className="btn btn-primary btn-xl" onClick={() => input.current?.click()}>
            Upload Image
          </button>
          <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => take(e.target.files)} />
          <p className="or">or drop one or many files, paste an image (Ctrl/Cmd+V) or a URL</p>
          <form
            className="url-row"
            onSubmit={(e) => {
              e.preventDefault();
              submitUrl();
            }}
          >
            <input type="url" placeholder="Paste image URL" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Image URL" />
            <button className="btn" disabled={busy || !url.trim()}>
              {busy ? "Loading…" : "Go"}
            </button>
          </form>
          {msg && <p className="error-text">{msg}</p>}
        </div>
        <p className="fine">
          Powered by BRIA RMBG-2.0 (non-commercial license). Your images never leave this device.
        </p>
      </main>
    </div>
  );
}
