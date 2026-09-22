"use client";

import { useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import { FACT_KINDS } from "@/lib/daylog/extraction";
import type { FactRow, SceneRow } from "@/lib/daylog/rows";
import type { SignedMedia } from "@/lib/daylog/media";
import { PhotoStrip } from "./PhotoStrip";

const input = "w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2";
const tiny = "text-[10px] font-[family-name:var(--font-mono)] tracking-[0.1em] disabled:opacity-50";
const chip = "rounded-md border border-ink-4 px-1.5 py-0.5 text-[11px] text-text-1";

async function call(url: string, method: "PATCH" | "DELETE", body?: unknown): Promise<void> {
  const r = await fetch(url, { method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `${r.status}`);
  }
}

/**
 * The scene cards of /journal/[date] (spec §6, Part B): title, place, people,
 * the per-scene narrative and the approved facts grouped by kind — all
 * editable except the transcript. Only reviewed rows appear here; what is
 * still waiting sits behind the pending badge.
 */
export function ScenesSection({ scenes, dayFacts, pending, dayId, media = [], onChanged }: { scenes: SceneRow[]; dayFacts: FactRow[]; pending: number; dayId: string; media?: SignedMedia[]; onChanged: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const loose = media.filter((m) => !m.scene_id || !scenes.some((s) => s.id === m.scene_id));
  if (!scenes.length && !dayFacts.length && !pending && !loose.length) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="card-eyebrow flex items-center justify-between px-1">
        <span>Scenes</span>
        {pending > 0 && (
          <Link href={`/organisation/captures/review?tab=entities&day=${dayId}`} className="rounded-md bg-warn/15 border border-warn/40 px-2 py-0.5 text-[10px] text-warn font-[family-name:var(--font-mono)] tracking-[0.1em]">
            {pending} TO REVIEW
          </Link>
        )}
      </div>
      {scenes.map((s, i) => (
        <SceneCard key={s.id} scene={s} index={i} busy={busy} act={act} photos={media.filter((m) => m.scene_id === s.id)} onChanged={onChanged} />
      ))}
      {loose.length > 0 && (
        <div className="rounded-md bg-ink-1 p-4 flex flex-col gap-2">
          <div className="card-eyebrow">Photos not yet on a scene</div>
          <PhotoStrip photos={loose} onChanged={onChanged} />
        </div>
      )}
      {dayFacts.length > 0 && (
        <div className="rounded-md bg-ink-1 p-4 flex flex-col gap-2">
          <div className="card-eyebrow">The day in general</div>
          <FactList facts={dayFacts} busy={busy} act={act} />
        </div>
      )}
      {err && <div className="text-xs text-error px-1">{err}</div>}
    </section>
  );
}

type Act = (fn: () => Promise<void>) => Promise<void>;

function SceneCard({ scene, index, busy, act, photos, onChanged }: { scene: SceneRow; index: number; busy: boolean; act: Act; photos: SignedMedia[]; onChanged: () => void }) {
  const [edit, setEdit] = useState<{ title: string; place_text: string; time_hint: string; narrative: string } | null>(null);
  const url = `/api/journal/scenes/${scene.id}`;

  const save = () =>
    act(async () => {
      if (!edit) return;
      const body: Record<string, unknown> = {};
      if (edit.title.trim() !== scene.title) body.title = edit.title;
      if (edit.place_text.trim() !== (scene.place_text ?? "")) body.place_text = edit.place_text;
      if (edit.time_hint.trim() !== (scene.time_hint ?? "")) body.time_hint = edit.time_hint;
      if (edit.narrative.trim() !== (scene.narrative ?? "")) body.narrative = edit.narrative;
      if (Object.keys(body).length) await call(url, "PATCH", body);
      setEdit(null);
    });

  return (
    <div className="rounded-md bg-ink-1 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <Mono className="text-[10px] text-text-2">{index + 1}</Mono>
          {edit ? <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} className={input} aria-label="Scene title" /> : <h2 className="text-sm font-semibold text-text-0 truncate">{scene.title}</h2>}
        </div>
        {edit ? (
          <span className="flex gap-2 shrink-0">
            <button type="button" className={`${tiny} text-glow-1`} disabled={busy} onClick={() => void save()}>
              SAVE
            </button>
            <button type="button" className={`${tiny} text-text-2`} onClick={() => setEdit(null)}>
              CANCEL
            </button>
          </span>
        ) : (
          <span className="flex gap-2 shrink-0">
            <button type="button" className={`${tiny} text-text-2 hover:text-text-0`} onClick={() => setEdit({ title: scene.title, place_text: scene.place_text ?? "", time_hint: scene.time_hint ?? "", narrative: scene.narrative ?? "" })}>
              EDIT
            </button>
            <button
              type="button"
              className={`${tiny} text-text-2 hover:text-warn`}
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete the scene "${scene.title}"? Its facts stay on the day.`)) void act(() => call(url, "DELETE"));
              }}
            >
              DELETE
            </button>
          </span>
        )}
      </div>

      {edit ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={edit.place_text} onChange={(e) => setEdit({ ...edit, place_text: e.target.value })} placeholder="Place, as said" className={input} aria-label="Place" />
          <input value={edit.time_hint} onChange={(e) => setEdit({ ...edit, time_hint: e.target.value })} placeholder="When — lunch, ~14:00, evening" className={input} aria-label="Time hint" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {scene.place_id ? (
            <Link href={`/places?focus=${scene.place_id}`} className={`${chip} hover:text-text-0`}>
              {scene.place_name ?? scene.place_text ?? "place"}
            </Link>
          ) : scene.place_text ? (
            <span className={`${chip} border-dashed text-text-2`} title="Not linked to Places yet">
              {scene.place_text}
            </span>
          ) : null}
          {scene.time_hint && <span className="text-[11px] text-text-2">{scene.time_hint}</span>}
          {scene.people.map((p) => (
            <Link key={p.id} href={`/organisation/people/${p.id}`} className={`${chip} bg-glow-3/30 hover:text-text-0`}>
              {p.name}
            </Link>
          ))}
        </div>
      )}

      {edit ? (
        <textarea rows={3} value={edit.narrative} onChange={(e) => setEdit({ ...edit, narrative: e.target.value })} placeholder="What happened here" className={`${input} resize-y`} aria-label="Scene narrative" />
      ) : scene.narrative ? (
        <p className="text-sm text-text-1 whitespace-pre-wrap">{scene.narrative}</p>
      ) : null}

      <PhotoStrip photos={photos} onChanged={onChanged} />
      <FactList facts={scene.facts} busy={busy} act={act} />
    </div>
  );
}

function FactList({ facts, busy, act }: { facts: FactRow[]; busy: boolean; act: Act }) {
  if (!facts.length) return null;
  const groups = FACT_KINDS.map((k) => ({ kind: k, rows: facts.filter((f) => f.kind === k) })).filter((g) => g.rows.length);
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      {groups.map((g) => (
        <div key={g.kind} className="flex gap-2">
          <Mono className="w-20 shrink-0 pt-0.5 text-[10px] uppercase tracking-[0.12em] text-text-2">{g.kind.replace("_", " ")}</Mono>
          <ul className="flex-1 flex flex-col gap-1 min-w-0">
            {g.rows.map((f) => (
              <FactItem key={f.id} fact={f} busy={busy} act={act} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FactItem({ fact, busy, act }: { fact: FactRow; busy: boolean; act: Act }) {
  const [edit, setEdit] = useState<{ text: string; kind: string } | null>(null);
  const url = `/api/journal/facts/${fact.id}`;
  if (edit) {
    return (
      <li className="flex flex-col sm:flex-row gap-2">
        <input value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} className={input} aria-label="Fact" />
        <select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })} className="bg-ink-2 rounded-sm text-xs text-text-0 px-2 py-2" aria-label="Kind">
          {FACT_KINDS.map((k) => (
            <option key={k} value={k}>
              {k.replace("_", " ")}
            </option>
          ))}
        </select>
        <span className="flex gap-2 items-center shrink-0">
          <button
            type="button"
            className={`${tiny} text-glow-1`}
            disabled={busy || !edit.text.trim()}
            onClick={() =>
              void act(async () => {
                await call(url, "PATCH", { text: edit.text, kind: edit.kind });
                setEdit(null);
              })
            }
          >
            SAVE
          </button>
          <button type="button" className={`${tiny} text-text-2`} onClick={() => setEdit(null)}>
            CANCEL
          </button>
        </span>
      </li>
    );
  }
  return (
    <li className="group flex items-baseline justify-between gap-2 text-sm text-text-1">
      <span className="min-w-0">
        {fact.subject_name && <span className="text-glow-2">{fact.subject_name}: </span>}
        {fact.text}
        {fact.confidence === "inferred" && <span className="ml-1 text-[10px] text-text-2 italic">inferred</span>}
      </span>
      <span className="flex gap-2 shrink-0 opacity-60 group-hover:opacity-100">
        <button type="button" className={`${tiny} text-text-2 hover:text-text-0`} onClick={() => setEdit({ text: fact.text, kind: fact.kind })}>
          EDIT
        </button>
        <button type="button" className={`${tiny} text-text-2 hover:text-warn`} disabled={busy} onClick={() => void act(() => call(url, "DELETE"))}>
          ×
        </button>
      </span>
    </li>
  );
}
