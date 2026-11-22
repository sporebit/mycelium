"use client";

/**
 * The one timeline: notes, scans, appointments, milestones, photos and
 * letters, newest first, each marked with the week of the pregnancy it
 * fell in. Adding is one line and a button; a picture or a scan is the
 * same line with a file. An entry can be changed in place: Edit opens it
 * as a form where it stands, Save sends what changed. Everything here is
 * seen by everyone in the family space.
 *
 * A picture over 4 MB is made smaller in the browser before it goes
 * (components/family/shrink.ts); the day it was taken is kept as the
 * entry's day.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { INPUT, dayLabelYear, send, timeLabel, type Entry, type Overview } from "./api";
import { prepareUpload } from "./shrink";

const KINDS: Array<{ value: Entry["kind"]; label: string }> = [
  { value: "note", label: "Note" },
  { value: "scan", label: "Scan" },
  { value: "appointment", label: "Appointment" },
  { value: "milestone", label: "Milestone" },
  { value: "photo", label: "Photo" },
];
const KIND_LABEL: Record<Entry["kind"], string> = { note: "Note", scan: "Scan", appointment: "Appointment", milestone: "Milestone", photo: "Photo", letter: "Letter" };

/** An instant as the value a datetime-local input takes, in the browser's own time (the same clock `add` reads it back with). */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EntryCard({ e, who, onRemove, onEdit }: { e: Entry; who: string; onRemove?: () => void; onEdit?: () => void }) {
  const image = e.has_media && (e.media_mime ?? "").startsWith("image/");
  const audio = e.has_media && (e.media_mime ?? "").startsWith("audio/");
  const media = `/api/family/entries/${e.id}/media`;
  return (
    <li className="rounded-v2-lg border border-hairline bg-surface-1 px-4 py-3" data-testid="family-entry">
      <div className="flex items-baseline justify-between gap-3">
        <span className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-text-lo">{KIND_LABEL[e.kind]}</span>
        <span className="text-right text-xs text-text-lo">
          {dayLabelYear(e.happened_on)}
          {e.starts_at && !e.all_day ? `, ${timeLabel(e.starts_at)}` : ""}
          {e.ends_at && !e.all_day ? `–${timeLabel(e.ends_at)}` : ""}
          {e.all_day ? ", all day" : ""}
          {e.week !== null ? ` · week ${e.week}` : ""}
          {e.on_google ? <span className="ml-1 text-[10px] uppercase tracking-[0.08em]" title="On the Family calendar on Google">· G</span> : null}
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
        <span className="flex gap-3">
          {onEdit ? (
            <button type="button" className="underline hover:text-text-hi" aria-label={`Edit ${e.title}`} onClick={onEdit}>
              Edit
            </button>
          ) : null}
          {onRemove ? (
            <button type="button" className="underline hover:text-text-hi" aria-label={`Remove ${e.title}`} onClick={onRemove}>
              Remove
            </button>
          ) : null}
        </span>
      </div>
    </li>
  );
}

/** One entry opened as a form where it stands. Only what changed is sent. */
function EditEntry({ e, onDone, onCancel }: { e: Entry; onDone: () => Promise<void> | void; onCancel: () => void }) {
  const [title, setTitle] = useState(e.title);
  const [body, setBody] = useState(e.body ?? "");
  const [place, setPlace] = useState(e.place ?? "");
  const [when, setWhen] = useState(e.starts_at ? toLocalInput(e.starts_at) : "");
  const [until, setUntil] = useState(e.ends_at ? toLocalInput(e.ends_at) : "");
  const [day, setDay] = useState(e.happened_on);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appointment = e.kind === "appointment";

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const changes: Record<string, string | null> = {};
      if (title.trim() !== e.title) changes.title = title.trim();
      if (body.trim() !== (e.body ?? "")) changes.body = body.trim() || null;
      if (appointment) {
        if (!when) throw new Error("An appointment needs a date and time.");
        const at = new Date(when).toISOString();
        if (at !== e.starts_at) changes.starts_at = at;
        const end = until ? new Date(until).toISOString() : null;
        if (end && end < at) throw new Error("The end comes after the start.");
        if (end !== (e.ends_at ?? null)) changes.ends_at = end;
        if (place.trim() !== (e.place ?? "")) changes.place = place.trim() || null;
      } else if (day !== e.happened_on) {
        changes.happened_on = day;
      }
      if (!title.trim()) throw new Error("Give it a line to go by.");
      if (Object.keys(changes).length > 0) await send("PATCH", `/api/family/entries/${e.id}`, changes);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-v2-lg border border-glow bg-surface-1 px-4 py-3" data-testid="family-entry-edit">
      <form
        className="flex flex-col gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          void save();
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-text-lo">{KIND_LABEL[e.kind]}</span>
          {appointment ? (
            <span className="flex flex-wrap gap-2">
              <input type="datetime-local" aria-label="Date and time" className={INPUT} value={when} onChange={(ev) => setWhen(ev.target.value)} />
              <input type="datetime-local" aria-label="Until" className={INPUT} value={until} min={when || undefined} onChange={(ev) => setUntil(ev.target.value)} />
            </span>
          ) : (
            <input type="date" aria-label="The day" className={INPUT} value={day} onChange={(ev) => setDay(ev.target.value)} />
          )}
        </div>
        <input className={INPUT} aria-label="A line to go by" value={title} maxLength={200} onChange={(ev) => setTitle(ev.target.value)} />
        {appointment ? <input className={INPUT} aria-label="Where" placeholder="Where" value={place} onChange={(ev) => setPlace(ev.target.value)} /> : null}
        {e.prompt ? <p className="text-xs italic text-text-lo">{e.prompt}</p> : null}
        <textarea className={`${INPUT} min-h-[64px] py-2`} aria-label="More, if you want" placeholder="More, if you want" value={body} onChange={(ev) => setBody(ev.target.value)} />
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm text-v2-error">{error}</p> : null}
      </form>
    </li>
  );
}

export function Timeline({ family, onChanged }: { family: Overview; onChanged: () => void }) {
  const { data, mutate } = useApi<{ entries: Entry[] }>("/api/family/entries");
  const [kind, setKind] = useState<Entry["kind"]>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState("");
  const [until, setUntil] = useState("");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
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
        if (until) {
          if (new Date(until) < new Date(when)) throw new Error("The end comes after the start.");
          fields.ends_at = new Date(until).toISOString();
        }
        if (place) fields.place = place;
      }
      if (f) {
        // a big picture is made smaller here; the day it was taken becomes the entry's day
        const prepared = await prepareUpload(f);
        if (prepared.taken_on && kind !== "appointment") fields.happened_on = prepared.taken_on;
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) if (v) form.set(k, v);
        form.set("file", prepared.file);
        await send("POST", "/api/family/entries", form);
      } else {
        if (!title.trim()) throw new Error("Give it a line to go by.");
        await send("POST", "/api/family/entries", fields);
      }
      setTitle("");
      setBody("");
      setWhen("");
      setUntil("");
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
            <input type="datetime-local" aria-label="Until" title="Until (optional; an hour if left blank)" className={INPUT} value={until} min={when || undefined} onChange={(e) => setUntil(e.target.value)} />
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
        <p className="text-xs text-text-lo">A picture over 4 MB is made smaller here before it goes, and keeps the day it was taken.</p>
        {error ? <p role="alert" className="text-sm text-v2-error">{error}</p> : null}
      </form>

      {data && data.entries.length === 0 ? <p className="text-sm text-text-mid">Nothing on the timeline yet. The first note, scan or appointment starts it.</p> : null}
      <ul className="flex flex-col gap-2">
        {(data?.entries ?? []).map((e) =>
          editing === e.id ? (
            <EditEntry
              key={e.id}
              e={e}
              onCancel={() => setEditing(null)}
              onDone={async () => {
                setEditing(null);
                await mutate();
                onChanged();
              }}
            />
          ) : (
            <EntryCard
              key={e.id}
              e={e}
              who={who(e.created_by)}
              onEdit={() => setEditing(e.id)}
              onRemove={() => {
                if (!window.confirm(`Remove "${e.title}" from the timeline for everyone?`)) return;
                void send("DELETE", `/api/family/entries/${e.id}`)
                  .then(() => mutate())
                  .then(onChanged)
                  .catch((err: Error) => setError(err.message));
              }}
            />
          ),
        )}
      </ul>
    </div>
  );
}
