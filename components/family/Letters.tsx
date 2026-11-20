"use client";

/**
 * Letters to the baby: one question a week, answered aloud in about a
 * minute, or typed. A recording is kept as it was said; its words are
 * written up by the PC afterwards and appear beneath it. Each of you
 * answers for yourself; the letters sit together on the timeline.
 */
import { useEffect, useRef, useState } from "react";
import { Button, Surface } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { INPUT, send, type Entry, type Overview } from "./api";
import { EntryCard } from "./Timeline";

/** The longest a recording runs before it stops itself: two minutes is well inside the upload limit. */
const MAX_SECONDS = 120;

export function Letters({ family, onChanged }: { family: Overview; onChanged: () => void }) {
  const { data, mutate } = useApi<{ entries: Entry[] }>("/api/family/entries?kind=letter");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const me = family.members.find((m) => m.me);
  const answered = !!me && family.letter.answered_by.includes(me.id);
  const who = (id: string | null) => family.members.find((m) => m.id === id)?.name ?? "";

  const after = async () => {
    await mutate();
    onChanged();
  };
  const sendLetter = async (body: Record<string, unknown> | FormData) => {
    setBusy(true);
    setError(null);
    try {
      await send("POST", "/api/family/entries", body);
      setText("");
      await after();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    recorder.current?.stop();
  };
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const record = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Safari records mp4, Chrome webm; both are kept and both are read by the PC.
      const mime = ["audio/mp4", "audio/webm", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48_000 } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setSeconds(null);
        const type = (rec.mimeType || mime || "audio/webm").split(";")[0];
        const blob = new Blob(chunks.current, { type });
        if (blob.size === 0) return setError("Nothing was recorded. Try again.");
        const form = new FormData();
        form.set("kind", "letter");
        form.set("title", `A letter, ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(new Date())}`);
        form.set("prompt", family.letter.question);
        form.set("file", new File([blob], `letter.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`, { type }));
        void sendLetter(form);
      };
      recorder.current = rec;
      rec.start();
      setSeconds(0);
      timer.current = setInterval(() => {
        setSeconds((s) => {
          const next = (s ?? 0) + 1;
          if (next >= MAX_SECONDS) stop();
          return next;
        });
      }, 1000);
    } catch {
      setError("The microphone is not available here. You can type the letter instead.");
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="family-letters">
      <Surface className="flex flex-col gap-3 p-4">
        <p className="text-[11px] uppercase tracking-[0.08em] text-text-lo">This week&rsquo;s question</p>
        <p className="font-[family-name:var(--font-plate)] text-xl text-text-hi" data-testid="letter-question">
          {family.letter.question}
        </p>
        {answered ? <p className="text-sm text-text-mid">You have answered this one. Another is welcome; a new question comes on Monday.</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          {seconds === null ? (
            <Button variant="primary" loading={busy} onClick={() => void record()}>
              Answer aloud
            </Button>
          ) : (
            <Button variant="primary" onClick={stop}>
              Stop and keep it ({Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")})
            </Button>
          )}
          <span className="text-xs text-text-lo">About a minute is plenty.</span>
        </div>
        <textarea className={`${INPUT} min-h-[88px] py-2`} aria-label="Or write it" placeholder="Or write it" value={text} onChange={(e) => setText(e.target.value)} />
        <div>
          <Button loading={busy} disabled={!text.trim()} onClick={() => void sendLetter({ kind: "letter", title: `A letter, ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(new Date())}`, prompt: family.letter.question, body: text })}>
            Keep this letter
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm text-v2-error">{error}</p> : null}
      </Surface>

      {data && data.entries.length === 0 ? <p className="text-sm text-text-mid">No letters yet. The first one starts the collection.</p> : null}
      <ul className="flex flex-col gap-2">
        {(data?.entries ?? []).map((e) => (
          <EntryCard
            key={e.id}
            e={e}
            who={who(e.created_by)}
            onRemove={() => {
              if (!window.confirm("Remove this letter for everyone?")) return;
              void send("DELETE", `/api/family/entries/${e.id}`)
                .then(after)
                .catch((err: Error) => setError(err.message));
            }}
          />
        ))}
      </ul>
    </div>
  );
}
