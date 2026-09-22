"use client";

import { useRef, useState } from "react";
import type { SignedMedia } from "@/lib/daylog/media";

const tiny = "text-[10px] font-[family-name:var(--font-mono)] tracking-[0.1em] disabled:opacity-50";

/**
 * The photos of a scene (or the day's loose ones) as a row of thumbnails
 * (daylog spec §6, decision 28). Signed URLs come from the day GET; a tap
 * opens the full image, × removes it, and captions are edited in place.
 */
export function PhotoStrip({ photos, onChanged, uploadTo }: { photos: SignedMedia[]; onChanged: () => void; uploadTo?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [captioning, setCaptioning] = useState<{ id: string; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const act = async (fn: () => Promise<Response>) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fn();
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `${r.status}`);
      }
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    if (file.lastModified) fd.append("taken_at", new Date(file.lastModified).toISOString());
    await act(() => fetch(uploadTo!, { method: "POST", body: fd }));
  };

  if (!photos.length && !uploadTo) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {photos.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto py-1">
          {photos.map((p) => (
            <li key={p.id} className="relative shrink-0 w-28 flex flex-col gap-1">
              {p.url ? (
                <a href={p.url} target="_blank" rel="noreferrer" className="block h-20 w-28 overflow-hidden rounded-sm bg-ink-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL; next/image cannot optimise it */}
                  <img src={p.url} alt={p.caption ?? "photo"} className="h-full w-full object-cover" loading="lazy" />
                </a>
              ) : (
                <div className="h-20 w-28 rounded-sm bg-ink-2 text-[10px] text-text-2 flex items-center justify-center">no url</div>
              )}
              {captioning?.id === p.id ? (
                <input
                  autoFocus
                  value={captioning.text}
                  onChange={(e) => setCaptioning({ id: p.id, text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void act(() => fetch(`/api/journal/media/${p.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ caption: captioning.text }) })).then(() => setCaptioning(null));
                    }
                    if (e.key === "Escape") setCaptioning(null);
                  }}
                  className="w-full bg-ink-2 rounded-sm text-[11px] text-text-0 px-1.5 py-1 outline-none"
                  aria-label="Caption"
                />
              ) : (
                <button type="button" className="text-left text-[11px] text-text-2 hover:text-text-0 truncate" onClick={() => setCaptioning({ id: p.id, text: p.caption ?? "" })} title={p.caption ?? "Add a caption"}>
                  {p.caption ?? "+ caption"}
                </button>
              )}
              <button
                type="button"
                className={`${tiny} absolute top-1 right-1 rounded-sm bg-ink-0/70 px-1 text-text-2 hover:text-warn`}
                disabled={busy}
                aria-label="Remove photo"
                onClick={() => {
                  if (window.confirm("Remove this photo?")) void act(() => fetch(`/api/journal/media/${p.id}`, { method: "DELETE" }));
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {uploadTo && (
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <button type="button" className={`${tiny} text-text-2 hover:text-text-0`} disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? "…" : "+ PHOTO"}
          </button>
          {err && <span className="text-xs text-error">{err}</span>}
        </div>
      )}
      {!uploadTo && err && <span className="text-xs text-error">{err}</span>}
    </div>
  );
}
