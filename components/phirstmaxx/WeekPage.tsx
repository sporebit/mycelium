"use client";

/**
 * /phirstmaxx/week (spec §4): the grid, wired to /api/phirstmaxx/week. The
 * page owns the data and every write; the grid draws and asks. Each write
 * answers with the week again, so the grid redraws from one response. A
 * tapped block opens a sheet: type, firmness, place, title, the start and
 * end, and Delete.
 */
import { useState } from "react";
import { Button, Label, Sheet } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { londonWall, weekStartOf } from "@/lib/phirstmaxx/grid";
import type { Firmness, PmBlock } from "@/lib/phirstmaxx/types";
import type { SaveChoice } from "./SaveBar";
import { WeekGrid } from "./WeekGrid";
import { INPUT, errText, fromLocalInput, send, toLocalInput, type WeekData } from "./api";

type WeekReply = Record<string, unknown> & { week?: WeekData };

export function WeekPage({ initialWeek }: { initialWeek: string | null }) {
  const [today] = useState(() => londonWall(Date.now()).date);
  const [weekStart, setWeekStart] = useState(() => (initialWeek ? weekStartOf(initialWeek) : weekStartOf(today)));
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState<PmBlock | null>(null);
  const { data, error, mutate } = useApi<WeekData>(`/api/phirstmaxx/week?week=${weekStart}`);

  /** A write that answers with the week: the grid is redrawn from the answer, not refetched. */
  async function write(body: Record<string, unknown>) {
    const r = await send<WeekReply>("POST", "/api/phirstmaxx/week", { ...body, week: weekStart });
    if (r.week) await mutate(r.week, { revalidate: false });
    else await mutate();
    return r;
  }

  function changeWeek(next: string) {
    setWeekStart(next);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `/phirstmaxx/week?week=${next}`);
  }

  if (error) {
    const status = (error as { status?: number }).status;
    return (
      <div className="rounded-v2-md border border-hairline bg-surface-1 p-5" data-testid="pm-week">
        <p className="text-sm text-text-mid">{status === 404 ? "PhirstMaxx lives in the family space. Set that up first, under Family." : "The week could not be loaded. Reload to try again."}</p>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-text-lo" data-testid="pm-week">Loading the week…</p>;
  const who = editing ?? data.me;

  return (
    <div className="flex flex-col gap-3" data-testid="pm-week">
      <WeekGrid
        weekStart={data.weekStart}
        today={today}
        people={data.people}
        me={data.me}
        editing={who}
        onEditingChange={setEditing}
        blocks={data.blocks}
        pending={[]}
        types={data.types}
        places={data.places}
        windows={data.windows}
        calendarEvents={data.calendarEvents}
        wakingStart={data.wakingStart}
        lastUsed={data.lastUsed}
        canUndo={data.canUndo}
        onWeekChange={changeWeek}
        onSave={async (input: { ranges: Array<{ start: string; end: string }>; person_id: string } & SaveChoice) => {
          await write({ action: "save", ...input });
        }}
        onBlockTap={setOpen}
        onBlockResize={async (id, starts_at, ends_at) => {
          await write({ action: "resize", id, starts_at, ends_at });
        }}
        onUndo={async () => {
          await write({ action: "undo" });
        }}
        onCopyLastWeek={async () => {
          await write({ action: "copy_last_week" });
        }}
        patterns={data.patterns}
        onApplyPattern={async (id) => {
          await write({ action: "apply_pattern", id });
        }}
        onSavePattern={async (name) => {
          await write({ action: "save_pattern", name });
        }}
      />
      <p className="text-xs text-text-lo">
        Drag across the half hours to highlight, then save them all together. The shaded columns are when you are both free and awake. Hatched spans are appointments on the Family calendar; edit those in the calendar.
      </p>
      <EditSheet block={open} data={data} onClose={() => setOpen(null)} write={write} />
    </div>
  );
}

function EditSheet({ block, data, onClose, write }: { block: PmBlock | null; data: WeekData; onClose: () => void; write: (body: Record<string, unknown>) => Promise<WeekReply> }) {
  return (
    <Sheet open={block !== null} onClose={onClose} title="This block">
      {block ? <EditForm key={block.id} block={block} data={data} onClose={onClose} write={write} /> : null}
    </Sheet>
  );
}

function EditForm({ block, data, onClose, write }: { block: PmBlock; data: WeekData; onClose: () => void; write: (body: Record<string, unknown>) => Promise<WeekReply> }) {
  const [typeId, setTypeId] = useState(block.type_id);
  const [firmness, setFirmness] = useState<Firmness>(block.firmness);
  const [placeId, setPlaceId] = useState(block.place_id ?? "");
  const [title, setTitle] = useState(block.title ?? "");
  const [starts, setStarts] = useState(toLocalInput(block.starts_at));
  const [ends, setEnds] = useState(toLocalInput(block.ends_at));
  const [busy, setBusy] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const person = data.people.find((p) => p.id === block.person_id);
  const places = data.places.filter((p) => p.saved && (p.person_id === block.person_id || p.person_id === null));

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setFail(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      setFail(errText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      data-testid="pm-block-sheet"
      onSubmit={(e) => {
        e.preventDefault();
        const s = fromLocalInput(starts);
        const en = fromLocalInput(ends);
        if (!s || !en) {
          setFail("The start and end are times.");
          return;
        }
        void run("save", () => write({ action: "update", id: block.id, type_id: typeId, firmness, place_id: placeId || null, title: title.trim() || null, starts_at: s, ends_at: en }));
      }}
    >
      <p className="text-xs text-text-lo">{person ? `${person.name}’s time` : "A block"}</p>
      <label className="flex flex-col gap-1">
        <Label>Type</Label>
        <select className={INPUT} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {data.types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <Label>Firmness</Label>
        <select className={INPUT} value={firmness} onChange={(e) => setFirmness(e.target.value === "flexible" ? "flexible" : "firm")}>
          <option value="firm">Set in stone</option>
          <option value="flexible">Flexible</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <Label>Place</Label>
        <select className={INPUT} value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
          <option value="">No place</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <Label>Title (optional)</Label>
        <input className={INPUT} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <Label>Starts</Label>
          <input type="datetime-local" step={1800} className={INPUT} value={starts} onChange={(e) => setStarts(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <Label>Ends</Label>
          <input type="datetime-local" step={1800} className={INPUT} value={ends} onChange={(e) => setEnds(e.target.value)} />
        </label>
      </div>
      <p className="text-xs text-text-lo">Times are in half hours.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={busy === "save"} disabled={busy !== null}>
          Save
        </Button>
        <Button type="button" variant="danger" loading={busy === "delete"} disabled={busy !== null} onClick={() => void run("delete", () => write({ action: "delete", id: block.id }))}>
          Delete
        </Button>
        <Button type="button" onClick={onClose} disabled={busy !== null}>
          Close
        </Button>
      </div>
      {fail ? (
        <p role="alert" className="text-sm text-v2-error">
          {fail}
        </p>
      ) : null}
    </form>
  );
}
