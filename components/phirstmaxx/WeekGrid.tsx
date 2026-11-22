"use client";

/**
 * PhirstMaxx — the weekly grid (claude/phirstmaxx-spec.md §4). Always seven
 * days, Monday first, × 48 half-hour rows in London wall-clock time (the
 * clock-change Sundays are handled in lib/phirstmaxx/grid.ts). Each day is
 * split in two: people[0] left, people[1] right. Together-windows shade
 * across the pair; Family calendar events show hatched on both halves and
 * cannot be edited here. No fetching: the page owns the data and writes.
 *
 * Painting, like a spreadsheet:
 * - Mouse: press on a cell of the half being edited, drag across slots and
 *   days, release. The rectangle is highlighted; drag again to add another;
 *   dragging over an existing highlight removes it.
 * - Keyboard: arrows move the focused cell, Shift+arrows extend a rectangle
 *   from where Shift began (same add/remove rule), Space toggles one cell,
 *   Enter moves to the save bar, Escape clears.
 * - Touch: press and hold 250 ms, then drag. An ordinary swipe scrolls. The
 *   Paint toggle makes drags paint at once (the grid stops scrolling by
 *   touch while it is on) and lets painting start over existing blocks.
 * The cell under the pointer is found with elementsFromPoint and the cells'
 * data attributes, so a drag can pass over blocks and the other half.
 *
 * Accessibility compromise: 48 rows a day cannot each be 44 px tall without
 * a 2 m tall grid, so rows are 24 px (the minimum we keep). Touch painting
 * is a drag, not a tap on one row, which makes the smaller target workable;
 * blocks spanning one row are the only 24 px tap targets.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, SegmentedControl } from "@/components/ui";
import {
  DAYS,
  ROWS,
  cellKey,
  cellRuns,
  overlaps,
  rangesFromSelection,
  rectangle,
  rectangleIsSelected,
  rowLabel,
  rowOfTime,
  shiftWeek,
  slotToInstant,
  spanLayout,
  summarise,
  toggleRectangle,
  weekDays,
  weekStartOf,
  type Cell,
  type Segment,
} from "@/lib/phirstmaxx/grid";
import type { EngineKind, Firmness, PmBlock, PmBlockType, PmPlace, TogetherWindow } from "@/lib/phirstmaxx/types";
import { SaveBar, type OverlapItem, type SaveChoice } from "./SaveBar";

const ROW_PX = 24;
const HOLD_MS = 250;
const SLOP_PX = 8;
const EDGE_PX = 36;

const KIND_COLOUR: Record<EngineKind, string> = {
  work: "#7d8a9e",
  shift: "#7d8a9e",
  free: "#5fae7a",
  sit: "#d6a24a",
  walk: "#d6a24a",
  faith: "#9a7fd1",
  busy: "#8a8a8a",
};

const HATCH = "repeating-linear-gradient(135deg, rgba(150,150,150,0.28) 0 4px, transparent 4px 9px)";

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const whenFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const dayLabel = (key: string) => dayFmt.format(new Date(`${key}T00:00:00Z`));
const span = (s: string | number, e: string | number) => `${whenFmt.format(new Date(s))}–${timeFmt.format(new Date(e))}`;
const errText = (e: unknown) => (e instanceof Error ? e.message : "That did not work. Try again.");

type Person = { id: string; name: string; colour: string };

type Props = {
  weekStart: string;
  today: string;
  people: Person[];
  me: string;
  editing: string;
  onEditingChange: (personId: string) => void;
  blocks: PmBlock[];
  pending: Array<{ start: string; end: string; person_id: string }>;
  types: PmBlockType[];
  places: PmPlace[];
  windows: TogetherWindow[];
  calendarEvents: Array<{ id: string; title: string; start: string; end: string }>;
  wakingStart: string;
  lastUsed: { type_id: string | null; firmness: Firmness; place_id: string | null };
  canUndo: boolean;
  onWeekChange: (weekStart: string) => void;
  onSave: (input: { ranges: Array<{ start: string; end: string }>; person_id: string } & SaveChoice) => Promise<void>;
  onBlockTap: (block: PmBlock) => void;
  onBlockResize: (id: string, starts_at: string, ends_at: string) => Promise<void>;
  onUndo: () => Promise<void>;
  onCopyLastWeek: () => Promise<void>;
  patterns: Array<{ id: string; name: string }>;
  onApplyPattern: (id: string) => Promise<void>;
  onSavePattern: (name: string) => Promise<void>;
};

const EMPTY: ReadonlySet<string> = new Set();

/** The cell under a screen point, whichever half or layer is on top. */
function cellAt(x: number, y: number): Cell | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el instanceof HTMLElement && el.dataset.cell) return { d: Number(el.dataset.d), r: Number(el.dataset.r) };
  }
  return null;
}

/** One half-column of 48 cells. Memoised: painting redraws overlays, not cells. */
const CellColumn = memo(function CellColumn({ d, day, person, editable, focusRow, mask }: { d: number; day: string; person: Person; editable: boolean; focusRow: number; mask: string }) {
  const label = dayLabel(day);
  return (
    <>
      {Array.from({ length: ROWS }, (_, r) => {
        const cls = `block w-full ${r % 2 === 1 ? "border-b border-hairline" : "border-b border-hairline/40 border-dotted"}`;
        const style = { height: ROW_PX };
        return editable ? (
          <button
            key={r}
            type="button"
            data-cell="1"
            data-d={d}
            data-r={r}
            tabIndex={r === focusRow ? 0 : -1}
            aria-pressed={mask[r] === "1"}
            aria-label={`${label} ${rowLabel(r)}, ${person.name}`}
            className={`${cls} hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow`}
            style={style}
          />
        ) : (
          <div key={r} aria-hidden data-cell="1" data-d={d} data-r={r} className={cls} style={style} />
        );
      })}
    </>
  );
});

export function WeekGrid(props: Props) {
  const { weekStart, today, people, me, editing, blocks, pending, types, places, windows, calendarEvents, wakingStart, lastUsed } = props;
  const { onEditingChange, onWeekChange, onSave, onBlockTap, onBlockResize } = props;

  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const halves = people.slice(0, 2);
  const editedPerson = halves.find((p) => p.id === editing) ?? halves[0];
  const scope = `${weekStart}|${editing}`;

  // The highlight belongs to one week and one person; switching either drops it.
  const [barFocus, setBarFocus] = useState(0);
  const [sel, setSel] = useState<{ scope: string; cells: ReadonlySet<string> }>({ scope, cells: EMPTY });
  const cells = sel.scope === scope ? sel.cells : EMPTY;
  const setCells = useCallback(
    (next: ReadonlySet<string>) => {
      setSel({ scope, cells: next });
      if (next.size === 0) setBarFocus(0);
    },
    [scope],
  );

  const [drag, setDrag] = useState<{ a: Cell; b: Cell } | null>(null);
  const [painting, setPainting] = useState(false);
  const [paintMode, setPaintMode] = useState(false);
  const [focus, setFocus] = useState<Cell>(() => ({ d: Math.max(0, days.indexOf(today)), r: rowOfTime(wakingStart) }));
  const [resize, setResize] = useState<{ id: string; start: number; end: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [patternsOpen, setPatternsOpen] = useState(false);
  const [patternName, setPatternName] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; a: Cell; b: Cell } | null>(null);
  const holdRef = useRef<{ pointerId: number; x: number; y: number; cell: Cell; timer: ReturnType<typeof setTimeout> } | null>(null);
  const kbRef = useRef<{ anchor: Cell; base: ReadonlySet<string> } | null>(null);
  const resizeRef = useRef<{ id: string; edge: "start" | "end"; start: number; end: number; orig: string } | null>(null);
  const swallowClick = useRef(false);

  // Open scrolled so the waking start is near the top.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = Math.max(0, rowOfTime(wakingStart) * ROW_PX - ROW_PX / 2);
  }, [weekStart, wakingStart]);

  // Touch: while holding (before it counts as a swipe) and while painting,
  // stop the page scrolling. Must be a non-passive native listener.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    function onTouchMove(ev: TouchEvent) {
      if (dragRef.current || resizeRef.current) {
        ev.preventDefault();
        return;
      }
      const h = holdRef.current;
      const t = ev.touches[0];
      if (!h || !t) return;
      if (Math.hypot(t.clientX - h.x, t.clientY - h.y) > SLOP_PX) {
        clearTimeout(h.timer);
        holdRef.current = null;
      } else ev.preventDefault();
    }
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  useEffect(() => {
    const hold = holdRef;
    return () => {
      if (hold.current) clearTimeout(hold.current.timer);
    };
  }, []);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const ranges = useMemo(() => rangesFromSelection(weekStart, cells), [weekStart, cells]);
  const myBlocks = useMemo(() => blocks.filter((b) => b.person_id === editing), [blocks, editing]);
  const overlapList: OverlapItem[] = useMemo(() => {
    const seen = new Map<string, OverlapItem>();
    for (const o of overlaps(ranges, myBlocks))
      for (const b of o.blocks) seen.set(b.id, { id: b.id, label: b.title ?? typeById.get(b.type_id)?.name ?? "Block", when: span(b.starts_at, b.ends_at) });
    return [...seen.values()];
  }, [ranges, myBlocks, typeById]);
  const myPlaces = useMemo(() => places.filter((p) => p.saved && (p.person_id === editing || p.person_id === null)), [places, editing]);

  const masks = useMemo(() => {
    const out = Array.from({ length: DAYS }, () => Array<string>(ROWS).fill("0"));
    for (const k of cells) {
      const [d, r] = k.split(":").map(Number);
      if (out[d]) out[d][r] = "1";
    }
    return out.map((m) => m.join(""));
  }, [cells]);

  const preview = useMemo(() => {
    if (!drag) return null;
    const rect = rectangle(drag.a, drag.b);
    return { runs: cellRuns(rect), removing: rectangleIsSelected(cells, rect) };
  }, [drag, cells]);

  // ----- painting by pointer -------------------------------------------------

  function startPaint(pointerId: number, cell: Cell) {
    dragRef.current = { pointerId, a: cell, b: cell };
    setDrag({ a: cell, b: cell });
    setPainting(true);
    setFocus(cell);
    try {
      bodyRef.current?.setPointerCapture(pointerId);
    } catch {
      // The pointer may already be gone; the drag ends on the next pointerup.
    }
  }

  function endPaint(commit: boolean) {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    setPainting(false);
    if (d && commit) setCells(toggleRectangle(cells, rectangle(d.a, d.b)));
    if (d && bodyRef.current?.hasPointerCapture(d.pointerId)) bodyRef.current.releasePointerCapture(d.pointerId);
  }

  function cancelHold() {
    if (holdRef.current) clearTimeout(holdRef.current.timer);
    holdRef.current = null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!target || target.closest<HTMLElement>("[data-p]")?.dataset.p !== editing) return;
    const cell = { d: Number(target.dataset.d), r: Number(target.dataset.r) };
    kbRef.current = null;
    if (e.pointerType !== "touch" || paintMode) {
      if (e.pointerType === "mouse") e.preventDefault(); // no text selection; focus is set below
      target.focus({ preventScroll: true });
      startPaint(e.pointerId, cell);
      return;
    }
    cancelHold();
    const pointerId = e.pointerId;
    holdRef.current = {
      pointerId,
      x: e.clientX,
      y: e.clientY,
      cell,
      timer: setTimeout(() => {
        holdRef.current = null;
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(10);
        startPaint(pointerId, cell);
      }, HOLD_MS),
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const h = holdRef.current;
    if (h && h.pointerId === e.pointerId && Math.hypot(e.clientX - h.x, e.clientY - h.y) > SLOP_PX) cancelHold();
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.preventDefault();
    const sc = scrollRef.current;
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (e.clientY < r.top + EDGE_PX + 40) sc.scrollTop -= ROW_PX / 2;
      else if (e.clientY > r.bottom - EDGE_PX) sc.scrollTop += ROW_PX / 2;
      if (e.clientX < r.left + EDGE_PX + 48) sc.scrollLeft -= ROW_PX / 2;
      else if (e.clientX > r.right - EDGE_PX) sc.scrollLeft += ROW_PX / 2;
    }
    const c = cellAt(e.clientX, e.clientY);
    if (!c || (c.d === d.b.d && c.r === d.b.r)) return;
    d.b = c;
    setDrag({ a: d.a, b: c });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (holdRef.current?.pointerId === e.pointerId) cancelHold();
    if (dragRef.current?.pointerId === e.pointerId) {
      setFocus(dragRef.current.b);
      endPaint(true);
    }
  }

  function onPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (holdRef.current?.pointerId === e.pointerId) cancelHold();
    if (dragRef.current?.pointerId === e.pointerId) endPaint(false);
  }

  // ----- painting by keyboard ------------------------------------------------

  function focusCell(c: Cell) {
    setFocus(c);
    bodyRef.current?.querySelector<HTMLElement>(`[data-p="${editing}"] [data-d="${c.d}"][data-r="${c.r}"]`)?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement;
    if (!el.dataset.cell) return;
    const here = { d: Number(el.dataset.d), r: Number(el.dataset.r) };
    const move: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (e.key in move) {
      e.preventDefault();
      const [dd, dr] = move[e.key];
      const next = { d: Math.min(DAYS - 1, Math.max(0, here.d + dd)), r: Math.min(ROWS - 1, Math.max(0, here.r + dr)) };
      if (e.shiftKey) {
        kbRef.current ??= { anchor: here, base: cells };
        setCells(toggleRectangle(kbRef.current.base, rectangle(kbRef.current.anchor, next)));
      } else kbRef.current = null;
      focusCell(next);
    } else if (e.key === " ") {
      e.preventDefault();
      kbRef.current = null;
      setCells(toggleRectangle(cells, [cellKey(here.d, here.r)]));
    } else if (e.key === "Enter") {
      e.preventDefault();
      kbRef.current = null;
      if (cells.size === 0) setCells(new Set([cellKey(here.d, here.r)]));
      setBarFocus((n) => n + 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      kbRef.current = null;
      setCells(EMPTY);
    }
  }

  // ----- blocks: tap and resize ---------------------------------------------

  function onHandleDown(e: React.PointerEvent<HTMLSpanElement>, b: PmBlock, edge: "start" | "end") {
    e.stopPropagation();
    e.preventDefault();
    const start = new Date(b.starts_at).getTime();
    const end = new Date(b.ends_at).getTime();
    resizeRef.current = { id: b.id, edge, start, end, orig: `${start}|${end}` };
    setResize({ id: b.id, start, end });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onHandleMove(e: React.PointerEvent<HTMLSpanElement>) {
    const r = resizeRef.current;
    if (!r) return;
    e.preventDefault();
    const c = cellAt(e.clientX, e.clientY);
    if (!c) return;
    if (r.edge === "end") {
      const end = slotToInstant(weekStart, c.d, c.r + 1);
      if (end > r.start) r.end = end;
    } else {
      const start = slotToInstant(weekStart, c.d, c.r);
      if (start < r.end) r.start = start;
    }
    setResize({ id: r.id, start: r.start, end: r.end });
  }

  function onHandleUp() {
    const r = resizeRef.current;
    resizeRef.current = null;
    // The click that follows this pointerup must not open the block; any later one may.
    swallowClick.current = true;
    setTimeout(() => {
      swallowClick.current = false;
    }, 0);
    if (!r || `${r.start}|${r.end}` === r.orig) {
      setResize(null);
      return;
    }
    setFlash(null);
    onBlockResize(r.id, new Date(r.start).toISOString(), new Date(r.end).toISOString())
      .catch((err: unknown) => setFlash(errText(err)))
      .finally(() => setResize(null));
  }

  // ----- fast paths ----------------------------------------------------------

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setFlash(null);
    try {
      await fn();
    } catch (err) {
      setFlash(errText(err));
    } finally {
      setBusy(null);
    }
  }

  async function save(choice: SaveChoice) {
    await onSave({ ranges: ranges.map((r) => ({ start: new Date(r.start).toISOString(), end: new Date(r.end).toISOString() })), person_id: editing, ...choice });
    setCells(EMPTY);
  }

  // ----- drawing -------------------------------------------------------------

  const colourOf = (b: PmBlock) => typeById.get(b.type_id)?.colour ?? KIND_COLOUR[b.engine_kind];
  const segStyle = (s: Segment) => ({ top: s.topRow * ROW_PX, height: s.rowSpan * ROW_PX });
  const segsByDay = <T,>(items: T[], spanOf: (x: T) => [number, number]) => {
    const out: Array<Array<{ item: T; seg: Segment; first: boolean; last: boolean }>> = Array.from({ length: DAYS }, () => []);
    for (const item of items) {
      const [s, e] = spanOf(item);
      const segs = spanLayout(weekStart, s, e);
      segs.forEach((seg, i) => out[seg.dayIndex].push({ item, seg, first: i === 0, last: i === segs.length - 1 }));
    }
    return out;
  };
  const t = (iso: string) => new Date(iso).getTime();
  const blockSegs = segsByDay(blocks, (b) => (resize?.id === b.id ? [resize.start, resize.end] : [t(b.starts_at), t(b.ends_at)]));
  const pendingSegs = segsByDay(pending, (p) => [t(p.start), t(p.end)]);
  const calSegs = segsByDay(calendarEvents, (c) => [t(c.start), t(c.end)]);
  const windowSegs = segsByDay(windows, (w) => [w.start, w.end]);
  const selRuns = cellRuns(cells);
  const weekLabel = `${dayLabel(days[0])} – ${dayLabel(days[6])}`;
  const forOther = editing !== me && editedPerson;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => onWeekChange(shiftWeek(weekStart, -1))} aria-label="Previous week">
          Prev
        </Button>
        <Button size="sm" onClick={() => onWeekChange(weekStartOf(today))} disabled={weekStartOf(today) === weekStart}>
          Today
        </Button>
        <Button size="sm" onClick={() => onWeekChange(shiftWeek(weekStart, 1))} aria-label="Next week">
          Next
        </Button>
        <span className="text-sm text-text-mid" aria-live="polite">
          {weekLabel}
        </span>
        <span className="flex-1" />
        {halves.length === 2 ? (
          <SegmentedControl size="sm" ariaLabel="Whose times you are editing" value={editing} onChange={onEditingChange} options={halves.map((p) => ({ value: p.id, label: p.name }))} />
        ) : null}
        <Button size="sm" aria-pressed={paintMode} onClick={() => setPaintMode((v) => !v)} className={paintMode ? "border-glow text-glow-2" : ""}>
          Paint{paintMode ? " on" : ""}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void run("copy", props.onCopyLastWeek)} loading={busy === "copy"} disabled={busy !== null}>
          Copy last week
        </Button>
        <div className="relative">
          <Button size="sm" aria-expanded={patternsOpen} aria-haspopup="menu" onClick={() => setPatternsOpen((v) => !v)} disabled={busy !== null}>
            Patterns
          </Button>
          {patternsOpen ? (
            <div role="menu" className="absolute left-0 top-full z-50 mt-1 min-w-[14rem] rounded-v2-md border border-hairline bg-surface-2 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
              {props.patterns.length === 0 ? <p className="px-3 py-2 text-xs text-text-lo">No saved patterns yet.</p> : null}
              {props.patterns.map((p) => (
                <button key={p.id} role="menuitem" type="button" className="block w-full rounded-v2-sm px-3 py-2 text-left text-sm text-text-hi hover:bg-surface-3" onClick={() => {
                  setPatternsOpen(false);
                  void run("pattern", () => props.onApplyPattern(p.id));
                }}>
                  {p.name}
                </button>
              ))}
              <button role="menuitem" type="button" className="block w-full rounded-v2-sm px-3 py-2 text-left text-sm text-glow-2 hover:bg-surface-3" onClick={() => {
                setPatternsOpen(false);
                setPatternName("");
              }}>
                Save this week as a pattern…
              </button>
            </div>
          ) : null}
        </div>
        {patternName !== null ? (
          <form className="flex items-center gap-2" onSubmit={(e) => {
            e.preventDefault();
            const name = patternName.trim();
            if (!name) return;
            void run("save-pattern", async () => {
              await props.onSavePattern(name);
              setPatternName(null);
            });
          }}>
            <input autoFocus aria-label="Pattern name" placeholder="e.g. My usual week" value={patternName} onChange={(e) => setPatternName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setPatternName(null)} className="min-h-[32px] rounded-v2-md border border-hairline bg-surface-0 px-3 text-sm text-text-hi placeholder:text-text-lo focus:border-glow focus:outline-none" />
            <Button size="sm" type="submit" variant="primary" loading={busy === "save-pattern"} disabled={busy !== null || !patternName.trim()}>
              Save pattern
            </Button>
            <Button size="sm" type="button" onClick={() => setPatternName(null)}>
              Cancel
            </Button>
          </form>
        ) : null}
        {props.canUndo ? (
          <Button size="sm" onClick={() => void run("undo", props.onUndo)} loading={busy === "undo"} disabled={busy !== null}>
            Undo last save
          </Button>
        ) : null}
        {forOther ? <span className="text-xs text-text-lo">Entering {editedPerson.name}’s times</span> : null}
      </div>

      {flash ? (
        <p role="alert" className="text-sm text-v2-error">
          {flash}
        </p>
      ) : null}

      <div ref={scrollRef} className="relative max-h-[70dvh] overflow-auto rounded-v2-md border border-hairline bg-surface-0">
        <div className="grid min-w-[36rem]" style={{ gridTemplateColumns: `3rem repeat(${DAYS}, minmax(4.5rem, 1fr))` }}>
          <div className="sticky left-0 top-0 z-30 border-b border-hairline bg-surface-0" />
          {days.map((day) => {
            const isToday = day === today;
            return (
              <div key={day} className={`sticky top-0 z-20 border-b border-l border-hairline px-1 py-1.5 text-center ${isToday ? "bg-surface-2" : "bg-surface-0"}`}>
                <div className={`text-xs ${isToday ? "text-text-hi" : "text-text-mid"}`}>{dayLabel(day)}</div>
                {isToday ? <div className="mt-0.5 inline-block rounded-full bg-glow px-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-surface-0">Today</div> : null}
                {halves.length === 2 ? (
                  <div className="mt-0.5 flex text-[10px] text-text-lo">
                    {halves.map((p) => (
                      <span key={p.id} className="flex-1 truncate" style={{ color: p.id === editing ? p.colour : undefined }}>
                        {p.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

          <div className="sticky left-0 z-10 bg-surface-0" aria-hidden>
            {Array.from({ length: ROWS }, (_, r) => (
              <div key={r} className="pr-1 text-right text-[10px] leading-none text-text-lo" style={{ height: ROW_PX }}>
                {r % 2 === 0 ? <span className="relative -top-1">{rowLabel(r)}</span> : null}
              </div>
            ))}
          </div>

          <div
            ref={bodyRef}
            className="col-span-7 grid select-none [-webkit-touch-callout:none]"
            style={{ gridTemplateColumns: `repeat(${DAYS}, minmax(4.5rem, 1fr))`, touchAction: paintMode || painting ? "none" : "auto" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onKeyDown={onKeyDown}
            onContextMenu={(e) => painting && e.preventDefault()}
          >
            {days.map((day, d) => (
              <div key={day} className={`relative flex border-l border-hairline ${day === today ? "bg-surface-2/30" : ""}`} style={{ height: ROWS * ROW_PX }}>
                {windowSegs[d].map(({ item, seg }, i) => (
                  <div key={`w${i}`} aria-hidden className={`pointer-events-none absolute inset-x-0 z-[1] ${item.firmness === "firm" ? "bg-glow/15" : "bg-glow/8"}`} style={segStyle(seg)} />
                ))}
                {halves.map((p, half) => {
                  const editable = p.id === editing;
                  return (
                    <div key={p.id} data-p={p.id} className={`relative flex-1 ${half === 1 ? "border-l border-hairline/60" : ""} ${editable ? "" : "opacity-80"}`}>
                      <CellColumn d={d} day={day} person={p} editable={editable} focusRow={editable && focus.d === d ? focus.r : -1} mask={editable ? masks[d] : ""} />

                      {calSegs[d].map(({ item, seg }) => (
                        <div key={`c${item.id}`} aria-hidden className="pointer-events-none absolute inset-x-0.5 z-[2] overflow-hidden rounded-v2-sm border border-hairline px-1 text-[10px] text-text-mid" style={{ ...segStyle(seg), backgroundImage: HATCH }}>
                          {half === 0 ? item.title : null}
                        </div>
                      ))}

                      {blockSegs[d]
                        .filter(({ item }) => item.person_id === p.id)
                        .map(({ item: b, seg, first, last }) => {
                          const c = colourOf(b);
                          const firm = b.firmness === "firm";
                          const name = b.title ?? typeById.get(b.type_id)?.name ?? "Block";
                          const live = editable && !paintMode && !drag;
                          return (
                            <button
                              key={`b${b.id}-${seg.dayIndex}`}
                              type="button"
                              tabIndex={editable ? 0 : -1}
                              aria-label={`${name}, ${span(b.starts_at, b.ends_at)}, ${firm ? "set in stone" : "flexible"}, ${p.name}`}
                              aria-hidden={editable ? undefined : true}
                              className={`absolute inset-x-0.5 z-[3] overflow-hidden rounded-v2-sm px-1 text-left text-[10px] leading-tight text-text-hi ${live ? "" : "pointer-events-none"} ${firm ? "border border-transparent" : "border border-dashed"} ${drag ? "opacity-60" : ""}`}
                              style={{ ...segStyle(seg), background: firm ? c : `color-mix(in srgb, ${c} 35%, transparent)`, borderColor: firm ? undefined : c }}
                              onClick={() => {
                                if (swallowClick.current) {
                                  swallowClick.current = false;
                                  return;
                                }
                                onBlockTap(b);
                              }}
                            >
                              <span className="block truncate font-medium">{name}</span>
                              {seg.rowSpan >= 2 ? <span className="block truncate opacity-80">{`${timeFmt.format(new Date(resize?.id === b.id ? resize.start : b.starts_at))}–${timeFmt.format(new Date(resize?.id === b.id ? resize.end : b.ends_at))}`}</span> : null}
                              {live && first ? (
                                <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize touch-none" onPointerDown={(e) => onHandleDown(e, b, "start")} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp} />
                              ) : null}
                              {live && last ? (
                                <span aria-hidden className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize touch-none" onPointerDown={(e) => onHandleDown(e, b, "end")} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp} />
                              ) : null}
                            </button>
                          );
                        })}

                      {pendingSegs[d]
                        .filter(({ item }) => item.person_id === p.id)
                        .map(({ seg }, i) => (
                          <div key={`p${i}`} className="pointer-events-none absolute inset-x-0.5 z-[4] rounded-v2-sm border border-dashed border-text-mid px-1 text-[10px] italic text-text-mid" style={segStyle(seg)}>
                            pending
                          </div>
                        ))}

                      {editable
                        ? selRuns
                            .filter((run) => run.d === d)
                            .map((run) => (
                              <div key={`s${run.r0}`} aria-hidden className="pointer-events-none absolute inset-x-0 z-[5] border border-glow bg-glow/30" style={{ top: run.r0 * ROW_PX, height: (run.r1 - run.r0 + 1) * ROW_PX }} />
                            ))
                        : null}
                      {editable && preview
                        ? preview.runs
                            .filter((run) => run.d === d)
                            .map((run) => (
                              <div key={`v${run.r0}`} aria-hidden className={`pointer-events-none absolute inset-x-0 z-[6] border border-dashed ${preview.removing ? "border-v2-error bg-v2-error/20" : "border-glow bg-glow/20"}`} style={{ top: run.r0 * ROW_PX, height: (run.r1 - run.r0 + 1) * ROW_PX }} />
                            ))
                        : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {cells.size > 0 && editedPerson ? (
        <SaveBar
          key={scope}
          summary={summarise(ranges)}
          personName={editedPerson.name}
          types={types}
          places={myPlaces}
          lastUsed={lastUsed}
          overlapList={overlapList}
          focusToken={barFocus}
          onSave={save}
          onClear={() => setCells(EMPTY)}
        />
      ) : null}
    </div>
  );
}
