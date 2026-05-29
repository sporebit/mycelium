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

// Synced with the Shell's md: breakpoint (mobile header + bottom tab bar)
// so the dashboard collapses to a flat single-column stack at the same
// viewport width as the mobile chrome — otherwise a 640-767px phone in
// landscape shows mobile chrome around desktop-style card columns.
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
};

export function DashboardGrid() {
  const [layout, setLayout] = useState<CardLayoutRow[] | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [hideConfirm, setHideConfirm] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SSR-safe viewport pin: server snapshot returns desktop, client snapshot
  // reads matchMedia. Avoids the cascading-render lint that synchronously
  // calling setIsMobile in an effect would trigger.
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    getMobileSnapshot,
    getMobileServerSnapshot,
  );

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
            {/* True per-column masonry: each section that contains 1-wide
                cards renders two independent flex-col columns that flow
                vertically without row-locking. Cards alternate by source
                order (even index → left column, odd → right) so the linear
                drag list maps to a deterministic layout. Full-width cards
                act as section separators and span both columns. Mobile
                collapses to a flat single-column stack in source order. */}
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
                {buildSections(visibleCards).map((section, idx) => {
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
                  const { col1, col2 } = splitPairColumns(section.cards);
                  return (
                    <div
                      key={`pair-${idx}`}
                      className="grid grid-cols-2 gap-4 items-start"
                    >
                      <div className="flex flex-col gap-4">
                        {col1.map((row) => {
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
                      <div className="flex flex-col gap-4">
                        {col2.map((row) => {
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

/** Group ordered visible cards into sections: full-width cards (width=2)
 *  separate buffers of 1-wide cards. Each "pair" buffer renders as a
 *  2-col masonry; each "full" card renders as a section-spanning row. */
type CardSection =
  | { type: "pair"; cards: CardLayoutRow[] }
  | { type: "full"; card: CardLayoutRow };

function buildSections(cards: CardLayoutRow[]): CardSection[] {
  const sections: CardSection[] = [];
  let buffer: CardLayoutRow[] = [];
  for (const card of cards) {
    if (card.width === 2) {
      if (buffer.length > 0) {
        sections.push({ type: "pair", cards: buffer });
        buffer = [];
      }
      sections.push({ type: "full", card });
    } else {
      buffer.push(card);
    }
  }
  if (buffer.length > 0) sections.push({ type: "pair", cards: buffer });
  return sections;
}

/** Even-indexed cards go in the left column, odd-indexed in the right.
 *  Source order is preserved, so reordering via drag deterministically
 *  flows into a per-column masonry without needing height measurement. */
function splitPairColumns(cards: CardLayoutRow[]): {
  col1: CardLayoutRow[];
  col2: CardLayoutRow[];
} {
  const col1: CardLayoutRow[] = [];
  const col2: CardLayoutRow[] = [];
  cards.forEach((c, i) => {
    if (i % 2 === 0) col1.push(c);
    else col2.push(c);
  });
  return { col1, col2 };
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
      {([1, 2] as CardWidth[]).map((w) => {
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
