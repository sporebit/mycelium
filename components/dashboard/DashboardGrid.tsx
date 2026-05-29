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
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
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
import { CaptureReview } from "./cards/CaptureReview";
import { DashboardSettings } from "./DashboardSettings";
import {
  CARD_REGISTRY,
  type CardCol,
  type CardLayoutRow,
  type CardWidth,
} from "@/lib/dashboard/card-registry";

// Mobile = single-column stack regardless of saved columns. Synced
// with the Shell's md: breakpoint so the dashboard collapses at the
// same point as the mobile chrome.
const MOBILE_QUERY = "(max-width: 767px)";

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
  capture_review: CaptureReview,
};

const COLS: CardCol[] = [1, 2, 3];

export function DashboardGrid() {
  const [layout, setLayout] = useState<CardLayoutRow[] | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [hideConfirm, setHideConfirm] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMobile = useSyncExternalStore(
    subscribeMobile,
    getMobileSnapshot,
    getMobileServerSnapshot,
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 500, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
        /* swallow — next page load reconciles from the server */
      }
    }, 300);
  }, []);

  // ---------------------------------------------------------------------------
  // Derived layout groups
  // Spanners (width >= 2) render as full-width rows above the column
  // grid, ordered by (col, position). Width=1 cards are bucketed by
  // their `col` and ordered by `position`.
  const visibleCards = useMemo(
    () => (layout ?? []).filter((r) => !r.hidden && CARD_COMPONENTS[r.card_key]),
    [layout],
  );
  const spanners = useMemo(
    () =>
      [...visibleCards]
        .filter((c) => c.width >= 2)
        .sort((a, b) => {
          if (a.col !== b.col) return a.col - b.col;
          return a.position - b.position;
        }),
    [visibleCards],
  );
  const colCards = useMemo(() => {
    const map = new Map<CardCol, CardLayoutRow[]>([
      [1, []],
      [2, []],
      [3, []],
    ]);
    for (const c of visibleCards) {
      if (c.width >= 2) continue;
      map.get(c.col)!.push(c);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [visibleCards]);

  const activeCard = useMemo(
    () => visibleCards.find((c) => c.card_key === activeId) ?? null,
    [activeId, visibleCards],
  );

  // ---------------------------------------------------------------------------
  // Mutations

  function applyLayout(next: CardLayoutRow[]) {
    setLayout(next);
    persist(next);
  }

  function changeWidth(cardKey: string, width: CardWidth) {
    if (!layout) return;
    const next = layout.map((r) =>
      r.card_key === cardKey ? { ...r, width } : r,
    );
    // Width changes can move a card between the spanner stack and a
    // column; renormalise per-bucket positions to 0..N-1 so the next
    // drag starts from clean indices.
    applyLayout(renormalisePositions(next));
  }

  function hideCard(cardKey: string) {
    if (!layout) return;
    const next = layout.map((r) =>
      r.card_key === cardKey ? { ...r, hidden: true } : r,
    );
    applyLayout(next);
    setHideConfirm(null);
  }

  function showCard(cardKey: string) {
    if (!layout) return;
    const next = layout.map((r) =>
      r.card_key === cardKey ? { ...r, hidden: false } : r,
    );
    applyLayout(next);
  }

  async function resetLayout() {
    const r = await fetch("/api/dashboard/layout/reset", { method: "POST" });
    if (r.ok) {
      const fresh = await fetch("/api/dashboard/layout", { cache: "no-store" });
      if (fresh.ok) {
        const j = (await fresh.json()) as { layout: CardLayoutRow[] };
        setLayout(j.layout ?? []);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Drag-and-drop
  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!layout) return;
    const { active, over } = e;
    if (!over) return;
    const droppedId = String(active.id);
    const overId = String(over.id);
    if (droppedId === overId) return;

    const activeRow = layout.find((r) => r.card_key === droppedId);
    if (!activeRow) return;

    // Spanners reorder among themselves only — they live in their own
    // stack above the column grid. Use the width toggle to demote a
    // spanner to width=1 and pull it into a column.
    if (activeRow.width >= 2) {
      const overRow = layout.find((r) => r.card_key === overId);
      if (!overRow || overRow.width < 2) return;
      const sortedSpanners = [...spanners];
      const oldIdx = sortedSpanners.findIndex((s) => s.card_key === droppedId);
      const newIdx = sortedSpanners.findIndex((s) => s.card_key === overId);
      if (oldIdx < 0 || newIdx < 0) return;
      const reordered = arrayMove(sortedSpanners, oldIdx, newIdx);
      // Park every spanner in col 1 with sequential positions so they
      // share a clean namespace — col doesn't matter for spanner
      // rendering since they're always full-width.
      const updates = new Map<string, { col: CardCol; position: number }>();
      reordered.forEach((s, i) =>
        updates.set(s.card_key, { col: 1, position: i }),
      );
      const next = layout.map((r) => {
        const u = updates.get(r.card_key);
        return u ? { ...r, col: u.col, position: u.position } : r;
      });
      applyLayout(renormalisePositions(next));
      return;
    }

    // Column-card drop. The over target is either another column card
    // (a sortable item) or one of the column droppable wrappers
    // ("col-1" / "col-2" / "col-3"), which catch drops on the empty
    // tail of the column.
    const colMatch = /^col-(\d)$/.exec(overId);
    let targetCol: CardCol;
    let targetPosition: number;
    if (colMatch) {
      targetCol = Number(colMatch[1]) as CardCol;
      const colList = colCards.get(targetCol) ?? [];
      // Don't no-op when dropping on your own column's empty zone —
      // there's nothing to do (already in this col), so just bail.
      if (activeRow.col === targetCol) return;
      targetPosition = colList.length;
    } else {
      const overRow = layout.find((r) => r.card_key === overId);
      if (!overRow || overRow.width >= 2) return;
      targetCol = overRow.col;
      const colList = colCards.get(targetCol) ?? [];
      const overIdxInCol = colList.findIndex(
        (c) => c.card_key === overRow.card_key,
      );
      if (overIdxInCol < 0) return;
      if (activeRow.col === targetCol) {
        // Within-column reorder.
        const oldIdxInCol = colList.findIndex(
          (c) => c.card_key === activeRow.card_key,
        );
        const reordered = arrayMove(colList, oldIdxInCol, overIdxInCol);
        const updates = new Map<string, number>();
        reordered.forEach((c, i) => updates.set(c.card_key, i));
        const next = layout.map((r) =>
          updates.has(r.card_key)
            ? { ...r, position: updates.get(r.card_key)! }
            : r,
        );
        applyLayout(next);
        return;
      }
      targetPosition = overIdxInCol;
    }

    // Cross-column move: pull active out of source col, splice into
    // target col at targetPosition. Renumber both cols.
    const sourceCol = activeRow.col;
    const sourceList = (colCards.get(sourceCol) ?? []).filter(
      (c) => c.card_key !== activeRow.card_key,
    );
    const targetList = [...(colCards.get(targetCol) ?? [])];
    targetList.splice(targetPosition, 0, { ...activeRow, col: targetCol });

    const updates = new Map<string, { col: CardCol; position: number }>();
    sourceList.forEach((c, i) =>
      updates.set(c.card_key, { col: sourceCol, position: i }),
    );
    targetList.forEach((c, i) =>
      updates.set(c.card_key, { col: targetCol, position: i }),
    );
    const next = layout.map((r) => {
      const u = updates.get(r.card_key);
      return u ? { ...r, col: u.col, position: u.position } : r;
    });
    applyLayout(next);
  }

  // ---------------------------------------------------------------------------
  if (layout === null) {
    return (
      <div className="text-sm text-text-2 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  // Mobile: ignore columns, render all cards in a single flex-col in
  // order of (col * 100 + position) per the rebuild spec. Spanners
  // and width=1 cards interleave naturally because spanners default
  // to col 1.
  if (isMobile) {
    const ordered = [...visibleCards].sort((a, b) => {
      if (a.col !== b.col) return a.col - b.col;
      return a.position - b.position;
    });
    return (
      <>
        <CustomizeButton onClick={() => setShowSettings(true)} />
        {ordered.length === 0 ? (
          <EmptyState onCustomize={() => setShowSettings(true)} />
        ) : (
          <div className="flex flex-col gap-4">
            {ordered.map((row) => {
              const Component = CARD_COMPONENTS[row.card_key];
              return (
                <CardWrapper
                  key={row.card_key}
                  row={row}
                  draggable={false}
                  onChangeWidth={(w) => changeWidth(row.card_key, w)}
                  onHide={() => setHideConfirm(row.card_key)}
                >
                  <Component width={row.width} />
                </CardWrapper>
              );
            })}
          </div>
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

  // Desktop: spanners stacked above, 3-column grid below. The DndContext
  // wraps all of it so a card can drag from one column into another
  // (or from a column into the spanner stack via the width toggle).
  return (
    <>
      <CustomizeButton onClick={() => setShowSettings(true)} />
      {visibleCards.length === 0 ? (
        <EmptyState onCustomize={() => setShowSettings(true)} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {spanners.length > 0 && (
            <SortableContext
              items={spanners.map((s) => s.card_key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-4 mb-4">
                {spanners.map((row) => {
                  const Component = CARD_COMPONENTS[row.card_key];
                  return (
                    <SortableCard
                      key={row.card_key}
                      row={row}
                      onChangeWidth={(w) => changeWidth(row.card_key, w)}
                      onHide={() => setHideConfirm(row.card_key)}
                    >
                      <Component width={row.width} />
                    </SortableCard>
                  );
                })}
              </div>
            </SortableContext>
          )}

          <div className="grid grid-cols-3 gap-4 items-start">
            {COLS.map((col) => (
              <DroppableColumn
                key={col}
                col={col}
                cards={colCards.get(col) ?? []}
                onChangeWidth={(key, w) => changeWidth(key, w)}
                onHide={(key) => setHideConfirm(key)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeCard ? (
              <div className="opacity-90 ring-1 ring-glow-2/60 shadow-2xl rounded-md">
                {(() => {
                  const Component = CARD_COMPONENTS[activeCard.card_key];
                  return <Component width={activeCard.width} />;
                })()}
              </div>
            ) : null}
          </DragOverlay>
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

// ---------------------------------------------------------------------------
// Helpers

function renormalisePositions(rows: CardLayoutRow[]): CardLayoutRow[] {
  // Per-col positions 0..N-1 for spanners (parked in col 1) + each
  // column. Used after width changes that move cards between the
  // spanner stack and a column.
  const byBucket = new Map<string, CardLayoutRow[]>();
  for (const r of rows) {
    const bucket = r.width >= 2 ? "span" : `col-${r.col}`;
    const list = byBucket.get(bucket) ?? [];
    list.push(r);
    byBucket.set(bucket, list);
  }
  for (const list of byBucket.values()) {
    list.sort((a, b) => a.position - b.position);
  }
  const out: CardLayoutRow[] = [];
  for (const list of byBucket.values()) {
    list.forEach((r, i) => out.push({ ...r, position: i }));
  }
  return out;
}

function CustomizeButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex items-center justify-end mb-3">
      <button
        type="button"
        onClick={onClick}
        className="text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-text-2 hover:text-text-0 px-2 py-1 rounded-sm border border-ink-3 hover:border-ink-4"
      >
        ⚙ CUSTOMIZE
      </button>
    </div>
  );
}

function EmptyState({ onCustomize }: { onCustomize: () => void }) {
  return (
    <div className="text-sm text-text-2 italic font-[family-name:var(--font-display)] py-16 text-center">
      All cards hidden.{" "}
      <button
        type="button"
        onClick={onCustomize}
        className="underline hover:text-text-0"
      >
        Open settings
      </button>{" "}
      to restore.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Droppable column — its own SortableContext over the cards currently
// in it. The wrapping <div> registers as a droppable so dnd-kit can
// land cross-column drops on the empty tail / empty column.
function DroppableColumn({
  col,
  cards,
  onChangeWidth,
  onHide,
}: {
  col: CardCol;
  cards: CardLayoutRow[];
  onChangeWidth: (key: string, w: CardWidth) => void;
  onHide: (key: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${col}` });
  return (
    <SortableContext
      items={cards.map((c) => c.card_key)}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-4 min-h-[120px] rounded-md transition-colors ${
          isOver ? "bg-glow-2/5 outline outline-1 outline-glow-2/30" : ""
        }`}
      >
        {cards.length === 0 ? (
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] py-8 text-center border border-dashed border-ink-2 rounded-md">
            Drop a card here
          </div>
        ) : (
          cards.map((row) => {
            const Component = CARD_COMPONENTS[row.card_key];
            return (
              <SortableCard
                key={row.card_key}
                row={row}
                onChangeWidth={(w) => onChangeWidth(row.card_key, w)}
                onHide={() => onHide(row.card_key)}
              >
                <Component width={row.width} />
              </SortableCard>
            );
          })
        )}
      </div>
    </SortableContext>
  );
}

// ---------------------------------------------------------------------------
// SortableCard — a single card that participates in @dnd-kit's sortable
// list. Hover-revealed affordances (width toggle + drag handle + hide)
// hang in the top-right.
function SortableCard({
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
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <CardWrapper
      row={row}
      draggable
      dragRef={setNodeRef}
      dragStyle={style}
      dragAttributes={attributes}
      dragListeners={listeners}
      dragging={isDragging}
      onChangeWidth={onChangeWidth}
      onHide={onHide}
      supports={cfg?.supports ?? [1, 2, 3]}
    >
      {children}
    </CardWrapper>
  );
}

// Shared chrome around a card. Mobile passes draggable=false; desktop
// passes the dnd-kit refs/attributes/listeners.
function CardWrapper({
  row,
  draggable,
  dragRef,
  dragStyle,
  dragAttributes,
  dragListeners,
  dragging,
  onChangeWidth,
  onHide,
  supports,
  children,
}: {
  row: CardLayoutRow;
  draggable: boolean;
  dragRef?: (node: HTMLElement | null) => void;
  dragStyle?: React.CSSProperties;
  dragAttributes?: React.HTMLAttributes<HTMLElement>;
  dragListeners?: React.HTMLAttributes<HTMLElement>;
  dragging?: boolean;
  onChangeWidth: (w: CardWidth) => void;
  onHide: () => void;
  supports?: CardWidth[];
  children: React.ReactNode;
}) {
  const cfg = CARD_REGISTRY[row.card_key];
  const cardSupports = supports ?? cfg?.supports ?? [1, 2, 3];
  return (
    <div
      ref={dragRef}
      style={dragStyle}
      className={`group relative ${
        dragging ? "ring-1 ring-glow-2/60 shadow-2xl rounded-md" : ""
      }`}
    >
      {children}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 sm:[@media(pointer:coarse)]:opacity-100">
        <WidthToggle
          current={row.width}
          supports={cardSupports}
          onChange={onChangeWidth}
        />
        {draggable && (
          <button
            type="button"
            {...dragAttributes}
            {...dragListeners}
            aria-label="Drag card"
            className="h-7 w-7 flex items-center justify-center rounded-sm text-text-2 hover:text-text-0 bg-ink-2/60 hover:bg-ink-2 cursor-grab active:cursor-grabbing touch-none"
          >
            <span aria-hidden className="text-sm leading-none">⠿</span>
          </button>
        )}
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
                ? `Width ${w}${w === 1 ? " (column card)" : " (spanner)"}`
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
