"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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

const CARD_COMPONENTS: Record<string, ComponentType> = {
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
              {visibleCards.map((row) => {
                const Component = CARD_COMPONENTS[row.card_key];
                return (
                  <SortableCardWrapper
                    key={row.card_key}
                    row={row}
                    onChangeWidth={(w) => changeWidth(row.card_key, w)}
                    onHide={() => setHideConfirm(row.card_key)}
                  >
                    <Component />
                  </SortableCardWrapper>
                );
              })}
            </div>
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

  // Desktop grid spans 3 cols, so saved width maps directly. Mobile and
  // tablet ignore via responsive Tailwind utilities — col-span only fires
  // at lg+.
  const spanClass =
    row.width === 3
      ? "lg:col-span-3"
      : row.width === 2
      ? "lg:col-span-2"
      : "lg:col-span-1";

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative ${spanClass} ${
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
