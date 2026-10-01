"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
} from "react";
import {
  encodeGlitterGif,
  formatBytes,
  gifFileName,
} from "@/lib/glitter";

type ItemStatus = "pending" | "working" | "done" | "error";

type Item = {
  id: string;
  file: File;
  name: string;
  thumbUrl: string;
  status: ItemStatus;
  progress: number;
  gifUrl?: string;
  gifBytes?: number;
  error?: string;
};

type SizeOption = number | "original";

const SIZE_OPTIONS: Array<{
  value: SizeOption;
  label: string;
  hint: string;
}> = [
  { value: "original", label: "Original", hint: "max 1920 px" },
  { value: 320, label: "Small", hint: "320 px · smallest file" },
  { value: 480, label: "Medium", hint: "480 px · recommended" },
  { value: 640, label: "Large", hint: "640 px · biggest file" },
];

const MAX_FILES = 60;

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

function SparkleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" />
      <path d="M19 15l.9 3.1L23 19l-3.1.9L19 23l-.9-3.1L15 19l3.1-.9L19 15z" opacity=".8" />
      <path d="M5 15l.7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7L5 15z" opacity=".6" />
    </svg>
  );
}

function DownloadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function UploadIcon({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4m0 0L8 8m4-4l4 4" />
      <path d="M20 16.5A3.5 3.5 0 0 0 18.5 10a5 5 0 0 0-9.8-1.5A4.5 4.5 0 0 0 4 13a3.5 3.5 0 0 0 .5 7H19a3 3 0 0 0 1-.5z" opacity=".55" />
    </svg>
  );
}

function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function ZipIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M12 3v3m0 2v3m0 2v1a2 2 0 1 0 .001 0z" />
    </svg>
  );
}

export default function GlitterMaker() {
  const [items, setItems] = useState<Item[]>([]);
  const [working, setWorking] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [size, setSize] = useState<SizeOption>("original");

  const inputRef = useRef<HTMLInputElement>(null);
  const urlCache = useRef<Set<string>>(new Set());
  const cancelRef = useRef(false);

  const updateItem = useCallback((id: string, patch: Partial<Item>) => {
    setItems((prev) =>
      prev.some((it) => it.id === id)
        ? prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
        : prev
    );
  }, []);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList)
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, MAX_FILES);
      if (files.length === 0) return;
      const added: Item[] = files.map((file) => {
        const url = URL.createObjectURL(file);
        urlCache.current.add(url);
        return {
          id: crypto.randomUUID(),
          file,
          name: file.name || "pasted-image",
          thumbUrl: url,
          status: "pending" as const,
          progress: 0,
        };
      });
      setItems((prev) => [...prev, ...added]);
    },
    []
  );

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) addFiles(e.target.files);
      e.target.value = "";
    },
    [addFiles]
  );

  // Paste images from the clipboard
  useEffect(() => {
    const onPaste = (e: ReactClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) addFiles(files);
    };
    window.addEventListener("paste", onPaste as unknown as EventListener);
    return () => window.removeEventListener("paste", onPaste as unknown as EventListener);
  }, [addFiles]);

  // Prevent the browser from navigating away on stray drops
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  const convertAll = useCallback(async () => {
    const pending = items.filter((it) => it.status === "pending");
    if (pending.length === 0 || working) return;

    setWorking(true);
    cancelRef.current = false;

    for (const item of pending) {
      if (cancelRef.current) break;
      updateItem(item.id, { status: "working", progress: 0 });
      try {
        const bitmap = await createImageBitmap(item.file);
        const blob = await encodeGlitterGif(
          bitmap,
          { size },
          (p) => updateItem(item.id, { progress: p })
        );
        bitmap.close();
        const url = URL.createObjectURL(blob);
        urlCache.current.add(url);
        updateItem(item.id, {
          status: "done",
          gifUrl: url,
          gifBytes: blob.size,
          progress: 1,
        });
      } catch {
        if (cancelRef.current) break;
        updateItem(item.id, {
          status: "error",
          error: "Could not convert this image.",
        });
      }
      setItems((prev) => [...prev]); // refresh header counters
    }

    setWorking(false);
  }, [items, working, size, updateItem]);

  const reset = useCallback(() => {
    cancelRef.current = true;
    setWorking(false);
    setZipping(false);
    for (const url of urlCache.current) URL.revokeObjectURL(url);
    urlCache.current.clear();
    setItems([]);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const download = useCallback((item: Item) => {
    if (!item.gifUrl) return;
    const a = document.createElement("a");
    a.href = item.gifUrl;
    a.download = gifFileName(item.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const downloadZip = useCallback(async () => {
    const finished = items.filter((it) => it.status === "done" && it.gifUrl);
    if (finished.length === 0) return;
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const used = new Map<string, number>();
      for (const it of finished) {
        const blob = await (await fetch(it.gifUrl!)).blob();
        let name = gifFileName(it.name);
        const seen = used.get(name) ?? 0;
        used.set(name, seen + 1);
        if (seen > 0) {
          const base = name.replace(/\.gif$/, "");
          name = `${base}-${seen + 1}.gif`;
        }
        zip.file(name, blob);
      }
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = "glitter-gifs.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally {
      setZipping(false);
    }
  }, [items]);

  useEffect(() => {
    const cache = urlCache.current;
    return () => {
      for (const url of cache) URL.revokeObjectURL(url);
    };
  }, []);

  const pendingCount = items.filter((it) => it.status === "pending").length;
  const doneCount = items.filter((it) => it.status === "done").length;
  const workingCount = items.filter((it) => it.status === "working").length;
  const workingIndex = doneCount + workingCount;
  const totalToConvert = doneCount + workingCount + pendingCount;

  return (
    <main className="flex w-full flex-1 flex-col items-center px-4 pb-16 pt-8 sm:pt-12">
      {/* Header */}
      <header className="mb-8 flex flex-col items-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-violet-600 text-white shadow-lg shadow-fuchsia-500/30">
          <SparkleIcon className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Glitter GIF Maker
        </h1>
        <p className="mt-2 max-w-md text-sm text-slate-500 sm:text-base">
          Add one or more photos and turn them into sparkly animated GIFs.
          Everything happens in your browser — nothing is uploaded.
        </p>
      </header>

      <div className="w-full max-w-5xl">
        {/* Controls card */}
        <section className="rounded-3xl bg-white p-4 shadow-xl shadow-fuchsia-900/5 ring-1 ring-slate-900/5 sm:p-6">
          <label
            htmlFor="file-input"
            onDragOver={(e: ReactDragEvent) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e: ReactDragEvent) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors sm:py-12 ${
              dragOver
                ? "border-fuchsia-400 bg-fuchsia-50"
                : "border-slate-300 bg-slate-50 hover:border-fuchsia-400 hover:bg-fuchsia-50/60"
            }`}
          >
            <div className="mb-3 text-fuchsia-500">
              <UploadIcon />
            </div>
            <p className="text-base font-semibold text-slate-700">
              Tap to add images, or drop them here
            </p>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              JPG, PNG, WebP, GIF &amp; more — you can also paste from the clipboard
            </p>
          </label>
          <input
            ref={inputRef}
            id="file-input"
            type="file"
            accept="image/*"
            multiple
            onChange={onInputChange}
            className="sr-only"
          />

          {/* Options + actions */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex flex-1 items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
              <span className="text-sm font-medium text-slate-600">GIF size</span>
              <select
                id="gif-size"
                name="gif-size"
                value={String(size)}
                onChange={(e) =>
                  setSize(
                    e.target.value === "original"
                      ? "original"
                      : Number(e.target.value)
                  )
                }
                disabled={working}
                className="min-w-0 flex-1 rounded-lg border-0 bg-transparent py-1.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 disabled:opacity-60"
              >
                {SIZE_OPTIONS.map((opt) => (
                  <option key={String(opt.value)} value={String(opt.value)}>
                    {opt.label} ({opt.hint})
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={convertAll}
              disabled={pendingCount === 0 || working}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-6 text-sm font-semibold text-white shadow-lg shadow-fuchsia-600/25 transition hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:min-w-[190px]"
            >
              {working ? (
                <>
                  <Spinner />
                  Converting {workingIndex} / {totalToConvert}
                </>
              ) : (
                <>
                  <SparkleIcon className="h-4 w-4" />
                  Make {pendingCount > 0 ? `${pendingCount} ` : ""}GIF
                  {pendingCount === 1 ? "" : "s"}
                </>
              )}
            </button>
          </div>

          {/* Secondary actions */}
          {(doneCount > 0 || items.length > 0) && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-400 sm:text-sm">
                {doneCount > 0 && (
                  <>
                    {doneCount} GIF{doneCount === 1 ? "" : "s"} ready
                    {pendingCount > 0 && ` · ${pendingCount} still queued`}
                  </>
                )}
                {doneCount === 0 && `${items.length} image${items.length === 1 ? "" : "s"} added`}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={downloadZip}
                  disabled={doneCount === 0 || zipping}
                  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:flex-none"
                >
                  {zipping ? <Spinner /> : <ZipIcon />}
                  {zipping ? "Zipping…" : "Download all (ZIP)"}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98] sm:flex-none"
                >
                  <TrashIcon />
                  Start over
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Items */}
        {items.length > 0 && (
          <ul
            className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Your images"
          >
            {items.map((item) => (
              <li
                key={item.id}
                className="overflow-hidden rounded-2xl bg-white shadow-md shadow-slate-900/5 ring-1 ring-slate-900/5"
              >
                <div className="relative aspect-[4/3] bg-slate-100">
                  {item.status === "done" && item.gifUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.gifUrl}
                      alt={`Animated glitter version of ${item.name}`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  )}

                  {item.status === "pending" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px]">
                      <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-slate-600">
                        Queued
                      </span>
                    </div>
                  )}

                  {item.status === "working" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/55 backdrop-blur-[2px]">
                      <span className="flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-fuchsia-600">
                        <Spinner />
                        Adding glitter…
                      </span>
                      <div className="h-1 w-24 overflow-hidden rounded-full bg-white/40">
                        <div
                          className="h-full rounded-full bg-white transition-[width] duration-200"
                          style={{ width: `${item.progress * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {item.status === "error" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/55 p-4 text-center backdrop-blur-[2px]">
                      <span className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white">
                        {item.error ?? "Failed"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700" title={item.name}>
                      {item.status === "done" ? gifFileName(item.name) : item.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {item.status === "done" && item.gifBytes != null
                        ? `GIF · ${formatBytes(item.gifBytes)}`
                        : "Original image"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => download(item)}
                    disabled={item.status !== "done"}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 text-xs font-semibold text-white transition hover:bg-fuchsia-500 active:scale-[0.97] disabled:pointer-events-none disabled:invisible"
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    Save
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">
          Tip: bigger GIF sizes look sharper but produce larger files. Privacy
          first — your images never leave your device.
        </p>
      </div>
    </main>
  );
}
