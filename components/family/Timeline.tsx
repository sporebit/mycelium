"use client";

/**
 * The one timeline: notes, scans, appointments, milestones, photos and
 * letters, newest first, each marked with the week of the pregnancy it
 * fell in. Adding is one line and a button; a picture or a scan is the
 * same line with a file. Everything here is seen by everyone in the
 * family space.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { INPUT, dayLabelYear, send, timeLabel, type Entry, type Overview } from "./api";

const KINDS: Array<{ value: Entry["kind"]; label: string }> = [
  { value: "note", label: "Note" },
  { value: "scan", label: "Scan" },
  { value: "appointment", label: "Appointment" },
  { value: "milestone", label: "Milestone" },
  { value: "photo", label: "Photo" },
];
const KIND_LABEL: Record<Entry["kind"], string> = { note: "Note", scan: "Scan", appointment: "Appointment", milestone: "Milestone", photo: "Photo", letter: "Letter" };

export function EntryCard({ e, who, onRemove }: { e: Entry; who: string; onRemove?: () => void }) {
  const image = e.has_media && (e.media_mime ?? "").startsWith("image/");
  const audio = e.has_media && (e.media_mime ?? "").startsWith("audio/");
  const media = `/api/family/entries/${e.id}/media`;
  return (
    <li className="rounded-v2-lg border border-hairline bg-surface-1 px-4 py-3" data-testid="family-entry">
      <div className="flex items-baseline justify-between gap-3">
        <span className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-text-lo">{KIND_LABEL[e.kind]}</span>
        <span className="text-right text-xs text-text-lo">
          {dayLabelYear(e.happened_on)}
          {e.starts_at ? `, ${timeLabel(e.starts_at)}` : ""}
          {e.week !== null ? ` · week ${e.week}` : ""}
        </span>
      </div>
      <p className="mt-1 break-words text-sm text-text-hi">{e.title}</p>
      {e.prompt ? <p className="mt-1 text-xs italic text-text-lo">{e.prompt}</p> : null}
      {e.place ? <p className="mt-1 text-xs text-text-mid">{e.place}</p> : null}
      {e.body ? <p className="mt-2 whitespace-pre-line text-sm text-text-mid">{e.body}</p> : null}
      {!e.transcribed && !e.body ? <p className="mt-2 text-xs text-text-lo">The words will appear here once the recording has been written up.</p> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed, short-lived link: not something the image optimiser can fetch */}
      {image ? <img src={media} alt={e.title} loading="lazy" className="mt-2 max-h-80 rounded-v2-md" /> : null}
      {audio ? <audio controls preload="none" src={media} className="mt-2 w-full" /> : null}
      {e.has_media && !image && !audio ? (
        <a href={media} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-glow-2 hover:underline">
          Open the file
        </a>
      ) : null}
      <div className="mt-2 flex items-center justify-between text-xs text-text-lo">
        <span>{who}</span>
        {onRemove ? (
          <button type="button" className="underline hover:text-text-hi" aria-label={`Remove ${e.title}`} onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function Timeline({ family, onChanged }: { family: Overview; onChanged: () => void }) {
  const { data, mutate } = useApi<{ entries: Entry[] }>("/api/family/entries");
  const [kind, setKind] = useState<Entry["kind"]>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState("");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const who = (id: string | null) => family.members.find((m) => m.id === id)?.name ?? "";

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const f = file.current?.files?.[0];
      const fields: Record<string, string> = { kind, title, body };
      if (kind === "appointment") {
        if (!when) throw new Error("An appointment needs a date and time.");
        // the picker gives local time; send it as an instant
        fields.starts_at = new Date(when).toISOString();
        if (place) fields.place = place;
      }
      if (f) {
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) if (v) form.set(k, v);
        form.set("file", f);
        await send("POST", "/api/family/entries", form);
      } else {
        if (!title.trim()) throw new Error("Give it a line to go by.");
        await send("POST", "/api/family/entries", fields);
      }
      setTitle("");
      setBody("");
      setWhen("");
      setPlace("");
      if (file.current) file.current.value = "";
      await mutate();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="family-timeline">
      <form
        className="flex flex-col gap-2 rounded-v2-lg border border-hairline bg-surface-1 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="flex flex-wrap gap-2">
          <select aria-label="What kind of entry" className={`${INPUT} pr-8`} value={kind} onChange={(e) => setKind(e.target.value as Entry["kind"])}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input className={`${INPUT} min-w-[12rem] flex-1`} aria-label="A line to go by" placeholder={kind === "appointment" ? "Midwife, 16 weeks" : "What happened"} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {kind === "appointment" ? (
          <div className="flex flex-wrap gap-2">
            <input type="datetime-local" aria-label="Date and time" className={INPUT} value={when} onChange={(e) => setWhen(e.target.value)} />
            <input className={`${INPUT} min-w-[10rem] flex-1`} aria-label="Where" placeholder="Where" value={place} onChange={(e) => setPlace(e.target.value)} />
          </div>
        ) : null}
        <textarea className={`${INPUT} min-h-[64px] py-2`} aria-label="More, if you want" placeholder="More, if you want" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <input ref={file} type="file" aria-label="A picture or a file" accept="image/*,application/pdf" className="max-w-full text-xs text-text-mid file:mr-2 file:rounded-v2-md file:border file:border-hairline file:bg-surface-0 file:px-3 file:py-1.5 file:text-text-hi" />
          <Button type="submit" variant="primary" loading={busy}>
            Add to the timeline
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm text-v2-error">{error}</p> : null}
      </form>

      {data && data.entries.length === 0 ? <p className="text-sm text-text-mid">Nothing on the timeline yet. The first note, scan or appointment starts it.</p> : null}
      <ul className="flex flex-col gap-2">
        {(data?.entries ?? []).map((e) => (
          <EntryCard
            key={e.id}
            e={e}
            who={who(e.created_by)}
            onRemove={() => {
              if (!window.confirm(`Remove "${e.title}" from the timeline for everyone?`)) return;
              void send("DELETE", `/api/family/entries/${e.id}`)
                .then(() => mutate())
                .then(onChanged)
                .catch((err: Error) => setError(err.message));
            }}
          />
        ))}
      </ul>
    </div>
  );
}
