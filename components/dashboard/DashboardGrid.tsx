"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Operator } from "./cards/Operator";
import { Session } from "./cards/Session";
import { Habits } from "./cards/Habits";
import { Calendar } from "./cards/Calendar";
import { FinancePulse } from "./cards/FinancePulse";
import { Goals } from "./cards/Goals";
import { KeyBlockers } from "./cards/KeyBlockers";
import { Nutrition } from "./cards/Nutrition";
import { Fuel } from "./cards/Fuel";
import { Journal } from "./cards/Journal";
import { Fitness } from "./cards/Fitness";
import { DashboardSettings } from "./DashboardSettings";
import {
  CARD_REGISTRY,
  type CardLayoutRow,
  type CardWidth,
} from "@/lib/dashboard/card-registry";

// Three layout modes:
//   mobile  (<768px)        : flat single-column stack, cards rendered in
//                             source order regardless of stored width.
//   tablet  (768-1279px)    : 2-column masonry. width=1 lives in the
//                             buffer; width=2 and width=3 both become
//                             full-row spanners.
//   desktop (>=1280px)      : 3-column masonry. width=1 lives in the
//                             buffer; width=2 becomes a 2/3-row spanner
//                             (left-aligned, 1/3 empty); width=3 is full.
const MOBILE_QUERY = "(max-width: 767px)";
const DESKTOP_QUERY = "(min-width: 1280px)";

function subscribeMobile(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getMobileSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getMobileServerSnapshot(): boolean {
  return false;
}

function subscribeDesktop(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getDesktopSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function getDesktopServerSnapshot(): boolean {
  // Render the tablet layout on the server. Desktop hydrates up via a single
  // re-render on first paint; mobile hydrates down. Either way the loading
  // placeholder masks the transition since layout is fetched async.
  return false;
}

const CARD_COMPONENTS: Record<string, ComponentType<{ width: CardWidth }>> = {
  operator: Operator,
  session: Session,
  habits: Habits,
  calendar: Calendar,
  finance_pulse: FinancePulse,
  goals: Goals,
  key_blockers: KeyBlockers,
  nutrition: Nutrition,
  fuel: Fuel,
  journal: Journal,
  fitness: Fitness,
};

export function DashboardGrid() {
  const [layout, setLayout] = useState<CardLayoutRow[] | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [hideConfirm, setHideConfirm] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SSR-safe viewport pins. matchMedia is read via useSyncExternalStore so
  // we don't need a setState-in-useEffect (which the React 19 lint rule
  // flags). Two separate stores — mobile takes priority; desktop only
  // applies when mobile is false.
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    getMobileSnapshot,
    getMobileServerSnapshot,
  );
  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    getDesktopSnapshot,
    getDesktopServerSnapshot,
  );
  const colCount: 2 | 3 = isDesktop && !isMobile ? 3 : 2;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/dashboard/layout", { cache: "no-store" });
        if (!r.ok || !mounted) return;
        const j = (await r.json()) as { layout: CardLayoutRow[] };
        if (mounted) setLayout(j.layout ?? []);
      } catch {
        if (mounted) setLayout([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /** Debounced persist. Optimistic local state is the source of truth;
   *  failures revert to the most-recent server state on next mount. */
  const persist = useCallback((next: CardLayoutRow[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch("/api/dashboard/layout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout: next }),
        });
      } catch {
        /* swallow — the next page load will reconcile from the server */
      }
    }, 300);
  }, []);

  function handleDragEnd(e: DragEndEvent) {
    if (!layout) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const visible = layout.filter((r) => !r.hidden);
    const hidden = layout.filter((r) => r.hidden);
    const oldIdx = visible.findIndex((r) => r.card_key === active.id);
    const newIdx = visible.findIndex((r) => r.card_key === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(visible, oldIdx, newIdx).map((r, i) => ({
      ...r,
      position: i,
    }));
    // Hidden rows keep their relative position but get pushed after visible.
    const hiddenWithPos = hidden.map((r, i) => ({
      ...r,
      position: reordered.length + i,
    }));
    const next = [...reordered, ...hiddenWithPos];
    setLayout(next);
    persist(next);
  }

  function changeWidth(cardKey: string, width: CardWidth) {
    if (!layout) return;
    const next = layout.map((r) =>
      r.card_key === cardKey ? { ...r, width } : r
    );
    setLayout(next);
    persist(next);
  }

  function hideCard(cardKey: string) {
    if (!layout) return;
    const next = layout.map((r) =>
      r.card_key === cardKey ? { ...r, hidden: true } : r
    );
    setLayout(next);
    persist(next);
    setHideConfirm(null);
  }

  function showCard(cardKey: string) {
    if (!layout) return;
    const next = layout.map((r) =>
      r.card_key === cardKey ? { ...r, hidden: false } : r
    );
    setLayout(next);
    persist(next);
  }

  async function resetLayout() {
    const r = await fetch("/api/dashboard/layout/reset", { method: "POST" });
    if (r.ok) {
      // Re-fetch from the server to pick up the freshly-defaulted layout.
      const fresh = await fetch("/api/dashboard/layout", { cache: "no-store" });
      if (fresh.ok) {
        const j = (await fresh.json()) as { layout: CardLayoutRow[] };
        setLayout(j.layout ?? []);
      }
    }
  }

  const visibleCards = useMemo(
    () =>
      (layout ?? [])
        .filter((r) => !r.hidden && CARD_COMPONENTS[r.card_key])
        .sort((a, b) => a.position - b.position),
    [layout]
  );
  const visibleIds = visibleCards.map((r) => r.card_key);

  if (layout === null) {
    return (
      <div className="text-sm text-text-2 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-text-2 hover:text-text-0 px-2 py-1 rounded-sm border border-ink-3 hover:border-ink-4"
        >
          ⚙ CUSTOMIZE
        </button>
      </div>

      {visibleCards.length === 0 ? (
        <div className="text-sm text-text-2 italic font-[family-name:var(--font-display)] py-16 text-center">
          All cards hidden.{" "}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="underline hover:text-text-0"
          >
            Open settings
          </button>{" "}
          to restore.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
            {/* True per-column masonry. Each "group" section renders N
                independent flex-col columns (2 on tablet, 3 on desktop)
                with cards distributed by index mod N — so source-order
                drag-reorder maps to a deterministic packed layout without
                needing height measurement. Width=3 cards act as full-row
                spanners; width=2 cards span 2 columns (full row on tablet,
                2/3 row on desktop). Mobile collapses to a flat single-
                column stack in source order. */}
            {isMobile ? (
              <div className="flex flex-col gap-4">
                {visibleCards.map((row) => {
                  const Component = CARD_COMPONENTS[row.card_key];
                  return (
                    <SortableCardWrapper
                      key={row.card_key}
                      row={row}
                      onChangeWidth={(w) => changeWidth(row.card_key, w)}
                      onHide={() => setHideConfirm(row.card_key)}
                    >
                      <Component width={row.width} />
                    </SortableCardWrapper>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {buildSections(visibleCards, colCount).map((section, idx) => {
                  if (section.type === "full") {
                    const row = section.card;
                    const Component = CARD_COMPONENTS[row.card_key];
                    return (
                      <SortableCardWrapper
                        key={row.card_key}
                        row={row}
                        onChangeWidth={(w) => changeWidth(row.card_key, w)}
                        onHide={() => setHideConfirm(row.card_key)}
                      >
                        <Component width={row.width} />
                      </SortableCardWrapper>
                    );
                  }

                  if (section.type === "wide") {
                    // 2/3-row card on desktop (3-col mode only). Same
                    // grid-cols-3 wrapper as adjacent group sections so
                    // the card edges align with the 3-column grid.
                    const row = section.card;
                    const Component = CARD_COMPONENTS[row.card_key];
                    return (
                      <div
                        key={`wide-${idx}`}
                        className="grid grid-cols-3 gap-4 items-start"
                      >
                        <div className="col-span-2">
                          <SortableCardWrapper
                            row={row}
                            onChangeWidth={(w) =>
                              changeWidth(row.card_key, w)
                            }
                            onHide={() => setHideConfirm(row.card_key)}
                          >
                            <Component width={row.width} />
                          </SortableCardWrapper>
                        </div>
                      </div>
                    );
                  }

                  // group: 2 or 3 flex-col columns
                  const cols = splitColumns(section.cards, colCount);
                  const gridClass =
                    colCount === 3
                      ? "grid grid-cols-3 gap-4 items-start"
                      : "grid grid-cols-2 gap-4 items-start";
                  return (
                    <div key={`group-${idx}`} className={gridClass}>
                      {cols.map((colCards, ci) => (
                        <div key={ci} className="flex flex-col gap-4">
                          {colCards.map((row) => {
                            const Component = CARD_COMPONENTS[row.card_key];
                            return (
                              <SortableCardWrapper
                                key={row.card_key}
                                row={row}
                                onChangeWidth={(w) =>
                                  changeWidth(row.card_key, w)
                                }
                                onHide={() => setHideConfirm(row.card_key)}
                              >
                                <Component width={row.width} />
                              </SortableCardWrapper>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </SortableContext>
        </DndContext>
      )}

      {showSettings && (
        <DashboardSettings
          layout={layout}
          onClose={() => setShowSettings(false)}
          onToggleHidden={(key, hidden) =>
            hidden ? hideCard(key) : showCard(key)
          }
          onReset={resetLayout}
        />
      )}

      {hideConfirm && (
        <HideConfirmModal
          cardKey={hideConfirm}
          onCancel={() => setHideConfirm(null)}
          onConfirm={() => hideCard(hideConfirm)}
        />
      )}
    </>
  );
}

/** Group ordered visible cards into sections.
 *
 *  - "group" sections hold runs of width=1 cards that flow per-column
 *    inside a grid-cols-N flexbox (N = colCount).
 *  - "full" sections hold a width=3 card spanning the full row, or a
 *    width=2 card on tablet where 2 = full row.
 *  - "wide" sections hold a width=2 card on desktop where 2 = 2/3 row.
 *
 *  Spanners (full + wide) always end the current group buffer so the
 *  per-column flow restarts cleanly after them.
 */
type CardSection =
  | { type: "group"; cards: CardLayoutRow[] }
  | { type: "wide"; card: CardLayoutRow }
  | { type: "full"; card: CardLayoutRow };

function buildSections(
  cards: CardLayoutRow[],
  colCount: 2 | 3,
): CardSection[] {
  const sections: CardSection[] = [];
  let buffer: CardLayoutRow[] = [];
  const flushBuffer = () => {
    if (buffer.length > 0) {
      sections.push({ type: "group", cards: buffer });
      buffer = [];
    }
  };
  for (const card of cards) {
    if (card.width === 3) {
      flushBuffer();
      sections.push({ type: "full", card });
    } else if (card.width === 2) {
      flushBuffer();
      // On tablet (2 cols), width=2 fills the row; on desktop (3 cols)
      // it's a 2/3-row spanner.
      sections.push(
        colCount === 2
          ? { type: "full", card }
          : { type: "wide", card },
      );
    } else {
      buffer.push(card);
    }
  }
  flushBuffer();
  return sections;
}

/** Distribute cards across N columns by index parity (mod N). Source order
 *  is preserved, so reordering via drag deterministically flows into a
 *  per-column masonry without needing height measurement. */
function splitColumns(
  cards: CardLayoutRow[],
  colCount: 2 | 3,
): CardLayoutRow[][] {
  const cols: CardLayoutRow[][] = Array.from(
    { length: colCount },
    () => [],
  );
  cards.forEach((c, i) => {
    cols[i % colCount].push(c);
  });
  return cols;
}

function SortableCardWrapper({
  row,
  onChangeWidth,
  onHide,
  children,
}: {
  row: CardLayoutRow;
  onChangeWidth: (w: CardWidth) => void;
  onHide: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.card_key });
  const cfg = CARD_REGISTRY[row.card_key];

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative ${
        isDragging ? "ring-1 ring-glow-2/60 shadow-2xl rounded-md" : ""
      }`}
    >
      {children}

      {/* Affordance cluster — hover on desktop, always on touch */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 sm:[@media(pointer:coarse)]:opacity-100">
        <WidthToggle
          current={row.width}
          supports={cfg?.supports ?? [1, 2, 3]}
          onChange={onChangeWidth}
        />
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag card"
          className="h-7 w-7 flex items-center justify-center rounded-sm text-text-2 hover:text-text-0 bg-ink-2/60 hover:bg-ink-2 cursor-grab active:cursor-grabbing touch-none"
        >
          <span aria-hidden className="text-sm leading-none">⠿</span>
        </button>
        <button
          type="button"
          onClick={onHide}
          aria-label="Hide card"
          className="h-7 w-7 flex items-center justify-center rounded-sm text-text-2 hover:text-error bg-ink-2/60 hover:bg-ink-2"
        >
          <span aria-hidden className="text-sm leading-none">×</span>
        </button>
      </div>
    </div>
  );
}

function WidthToggle({
  current,
  supports,
  onChange,
}: {
  current: CardWidth;
  supports: CardWidth[];
  onChange: (w: CardWidth) => void;
}) {
  return (
    <div className="hidden sm:flex rounded-sm bg-ink-2/60 overflow-hidden">
      {([1, 2, 3] as CardWidth[]).map((w) => {
        const enabled = supports.includes(w);
        const active = current === w;
        return (
          <button
            key={w}
            type="button"
            disabled={!enabled}
            onClick={() => enabled && onChange(w)}
            aria-label={`Width ${w}`}
            title={
              enabled
                ? `Width ${w} column${w === 1 ? "" : "s"}`
                : `This card needs ${supports[0]}+ columns`
            }
            className={`h-7 w-7 flex items-center justify-center text-[11px] font-[family-name:var(--font-mono)] transition-colors ${
              active
                ? "bg-glow-2 text-text-0"
                : enabled
                ? "text-text-1 hover:bg-ink-2 hover:text-text-0"
                : "text-text-3 cursor-not-allowed opacity-50"
            }`}
          >
            {w}
          </button>
        );
      })}
    </div>
  );
}

function HideConfirmModal({
  cardKey,
  onCancel,
  onConfirm,
}: {
  cardKey: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const label = CARD_REGISTRY[cardKey]?.label ?? cardKey;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCancel}
    >
      <div
        className="growth-in w-full sm:max-w-sm bg-ink-1 border border-ink-2 rounded-t-2xl sm:rounded-lg shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-base text-text-0">Hide {label}?</h2>
          <p className="text-sm text-text-1 mt-1 italic font-[family-name:var(--font-display)]">
            You can restore it from Dashboard settings.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-ink-2 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-11 rounded-sm border border-ink-4 text-text-1 text-xs font-[family-name:var(--font-mono)] tracking-[0.18em] hover:text-text-0 hover:bg-ink-2"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-[2] h-11 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 text-xs font-[family-name:var(--font-mono)] tracking-[0.18em]"
          >
            HIDE
          </button>
        </div>
      </div>
    </div>
  );
}
