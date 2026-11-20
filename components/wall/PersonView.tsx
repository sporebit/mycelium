"use client";

import { useRef, useState } from "react";
import type { WallPersonView } from "@/lib/wall/contract";
import type { HomeItem } from "@/lib/home/contract";

const SERIF = "font-[family-name:var(--font-plate)]";

/**
 * A person's own view on the wall, after their unlock: today's things in
 * order, the next one large, Done and Start under a thumb; the morning read
 * aloud; tap-to-talk into capture. Locks itself when left alone.
 */
export function PersonView({ view, items, busy, onAct, onBriefing, onLock, onCapture }: { view: WallPersonView; items: HomeItem[]; busy: boolean; onAct: (id: string, action: "done" | "start" | "not_now") => void; onBriefing: () => void; onLock: () => void; onCapture: (blob: Blob) => Promise<void> }) {
  const [recording, setRecording] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const next = items.find((i) => i.state !== "done") ?? null;
  const rest = items.filter((i) => i !== next);

  async function toggleTalk() {
    if (recording) {
      rec.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size > 0) {
          setNote("Saving…");
          try {
            await onCapture(blob);
            setNote("Saved");
          } catch {
            setNote("Not saved. Try again.");
          }
          setTimeout(() => setNote(null), 3000);
        }
      };
      rec.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      setNote("No microphone");
      setTimeout(() => setNote(null), 3000);
    }
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className={`${SERIF} text-4xl`}>{view.person.name}</h1>
        <div className="flex gap-3">
          <button type="button" onClick={onBriefing} className="rounded-full border px-5 py-3 text-lg" style={{ borderColor: "rgba(236,230,210,0.3)" }}>
            Read my morning
          </button>
          <button type="button" onClick={toggleTalk} aria-pressed={recording} className="rounded-full border px-5 py-3 text-lg" style={{ borderColor: recording ? "#e9dfc4" : "rgba(236,230,210,0.3)", background: recording ? "rgba(233,223,196,0.15)" : "transparent" }} aria-label="Tap to talk">
            {recording ? "Tap when done" : "Tap to talk"}
          </button>
          <button type="button" onClick={onLock} className="rounded-full px-5 py-3 text-lg opacity-70" aria-label="Lock">
            Lock
          </button>
        </div>
      </div>
      {note ? (
        <div className="text-base opacity-70" role="status">
          {note}
        </div>
      ) : null}
      {next ? (
        <section className="rounded-2xl border p-6" style={{ borderColor: "rgba(236,230,210,0.22)" }} aria-label="Next thing">
          <div className="text-base uppercase tracking-wide opacity-50">{next.state === "started" ? "Doing now" : "Next"}</div>
          <div className={`${SERIF} mt-1 text-4xl leading-tight`}>{next.title}</div>
          <div className="mt-2 text-xl opacity-70">{next.first_step}</div>
          <div className="mt-1 text-base opacity-50">
            {next.minutes} min{next.section ? ` · ${next.section}` : ""}
          </div>
          <div className="mt-4 flex gap-3">
            <button type="button" disabled={busy} onClick={() => onAct(next.item_id, "done")} className="rounded-full border px-6 py-3 text-xl active:scale-95 disabled:opacity-50" style={{ borderColor: "#e9dfc4" }} aria-label="Finish this">
              Done
            </button>
            {next.state !== "started" ? (
              <button type="button" disabled={busy} onClick={() => onAct(next.item_id, "start")} className="rounded-full border px-6 py-3 text-xl active:scale-95 disabled:opacity-50" style={{ borderColor: "rgba(236,230,210,0.3)" }} aria-label="Start this">
                Start
              </button>
            ) : null}
            <button type="button" disabled={busy} onClick={() => onAct(next.item_id, "not_now")} className="rounded-full px-6 py-3 text-xl opacity-60 disabled:opacity-30" aria-label="Not today">
              Not today
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border p-6 text-2xl opacity-70" style={{ borderColor: "rgba(236,230,210,0.12)" }}>
          {items.length ? "All done today." : "Nothing planned today."}
        </section>
      )}
      {rest.length ? (
        <ul className="flex flex-col gap-2" aria-label="Today's things">
          {rest.map((i) => (
            <li key={i.item_id} className="flex items-center justify-between gap-4 text-xl" style={{ opacity: i.state === "done" ? 0.45 : 0.85 }}>
              <span className={i.state === "done" ? "line-through" : ""}>{i.title}</span>
              {i.state !== "done" ? (
                <button type="button" disabled={busy} onClick={() => onAct(i.item_id, "done")} className="rounded-full border px-4 py-1.5 text-base disabled:opacity-50" style={{ borderColor: "rgba(236,230,210,0.3)" }} aria-label="Finish this">
                  Done
                </button>
              ) : (
                <span className="text-base opacity-70">done</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {view.home?.hours ? <div className="mt-auto text-base opacity-50">{view.home.hours.note}</div> : null}
    </div>
  );
}
