"use client";

import {
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
  closestCenter,
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
  rectSortingStrategy,
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
import { Glossary } from "./cards/Glossary";
import { CARD_REGISTRY, type CardWidth } from "@/lib/dashboard/card-registry";

// ---------------------------------------------------------------------------
// Types & size configuration
// ---------------------------------------------------------------------------

type CardSize = "sm" | "tall" | "tall-3" | "tall-4" | "md" | "md-3" | "md-4" | "wide" | "lg" | "full";

type DashCardPref = {
  id: string;
  size: CardSize;
  order: number;
  hidden: boolean;
};

const SIZE_CONFIG: Record<CardSize, { colSpan: number; rowSpan: number }> = {
  sm:       { colSpan: 3,  rowSpan: 1 },
  tall:     { colSpan: 3,  rowSpan: 2 },
  "tall-3": { colSpan: 3,  rowSpan: 3 },
  "tall-4": { colSpan: 3,  rowSpan: 4 },
  md:       { colSpan: 6,  rowSpan: 2 },
  "md-3":   { colSpan: 6,  rowSpan: 3 },
  "md-4":   { colSpan: 6,  rowSpan: 4 },
  wide:     { colSpan: 9,  rowSpan: 1 },
  lg:       { colSpan: 9,  rowSpan: 2 },
  full:     { colSpan: 12, rowSpan: 1 },
};

const ALL_SIZES: CardSize[] = ["sm", "tall", "tall-3", "tall-4", "md", "md-3", "md-4", "wide", "lg", "full"];

const SIZE_LABELS: Record<CardSize, string> = {
  sm: "SM", tall: "TALL", "tall-3": "TALL 3", "tall-4": "TALL 4",
  md: "MD", "md-3": "MD 3", "md-4": "MD 4",
  wide: "WIDE", lg: "LG", full: "FULL",
};

function sizeToWidth(size: CardSize): CardWidth {
  const span = SIZE_CONFIG[size].colSpan;
  if (span <= 3) return 1;
  if (span <= 6) return 2;
  return 3;
}

function mdColSpan(size: CardSize): number {
  return SIZE_CONFIG[size].colSpan >= 6 ? 6 : 3;
}

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "dashboard-cards";

const DEFAULT_SIZES: Record<string, CardSize> = {
  operator: "md",
  session: "full",
  habits: "md",
  calendar: "md",
  finance_pulse: "md",
  goals: "tall",
  key_blockers: "sm",
  nutrition: "md",
  fuel: "sm",
  journal: "tall",
  fitness: "md",
  capture_review: "sm",
  glossary: "sm",
};

function buildDefaults(): DashCardPref[] {
  return Object.keys(CARD_REGISTRY).map((key, i) => ({
    id: key,
    size: DEFAULT_SIZES[key] ?? "md",
    order: i,
    hidden: false,
  }));
}

function loadPrefs(): DashCardPref[] {
  if (typeof window === "undefined") return buildDefaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaults();
    const parsed = JSON.parse(raw) as DashCardPref[];
    if (!Array.isArray(parsed) || parsed.length === 0) return buildDefaults();
    const existing = new Set(parsed.map((p) => p.id));
    const reconciled = parsed.filter((p) => CARD_REGISTRY[p.id]);
    let maxOrder = Math.max(0, ...reconciled.map((p) => p.order));
    for (const key of Object.keys(CARD_REGISTRY)) {
      if (!existing.has(key)) {
        reconciled.push({
          id: key,
          size: DEFAULT_SIZES[key] ?? "md",
          order: ++maxOrder,
          hidden: false,
        });
      }
    }
    return reconciled;
  } catch {
    return buildDefaults();
  }
}

function savePrefs(prefs: DashCardPref[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* quota — acceptable loss */ }
}

// ---------------------------------------------------------------------------
// Breakpoint detection
// ---------------------------------------------------------------------------

type Breakpoint = "sm" | "md" | "lg";
const MD_Q = "(min-width: 768px) and (max-width: 1023px)";
const LG_Q = "(min-width: 1024px)";

function getBreakpoint(): Breakpoint {
  if (typeof window === "undefined") return "lg";
  if (window.matchMedia(LG_Q).matches) return "lg";
  if (window.matchMedia(MD_Q).matches) return "md";
  return "sm";
}

function subscribeBp(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const a = window.matchMedia(MD_Q);
  const b = window.matchMedia(LG_Q);
  a.addEventListener("change", cb);
  b.addEventListener("change", cb);
  return () => {
    a.removeEventListener("change", cb);
    b.removeEventListener("change", cb);
  };
}

// ---------------------------------------------------------------------------
// Card component map
// ---------------------------------------------------------------------------

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
  glossary: Glossary,
};

// ---------------------------------------------------------------------------
// DashboardGrid
// ---------------------------------------------------------------------------

export function DashboardGrid() {
  const [prefs, setPrefs] = useState<DashCardPref[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const breakpoint = useSyncExternalStore(
    subscribeBp,
    getBreakpoint,
    () => "lg" as Breakpoint,
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const loaded = loadPrefs();
    queueMicrotask(() => setPrefs(loaded));
  }, []);

  function applyPrefs(next: DashCardPref[]) {
    setPrefs(next);
    savePrefs(next);
  }

  const visible = useMemo(
    () =>
      (prefs ?? [])
        .filter((p) => !p.hidden && CARD_COMPONENTS[p.id])
        .sort((a, b) => a.order - b.order),
    [prefs],
  );

  const hiddenCount = useMemo(
    () => (prefs ?? []).filter((p) => p.hidden).length,
    [prefs],
  );

  const activeCard = useMemo(
    () => visible.find((c) => c.id === activeId) ?? null,
    [activeId, visible],
  );

  function changeSize(id: string, size: CardSize) {
    if (!prefs) return;
    applyPrefs(prefs.map((p) => (p.id === id ? { ...p, size } : p)));
  }

  function hideCard(id: string) {
    if (!prefs) return;
    applyPrefs(prefs.map((p) => (p.id === id ? { ...p, hidden: true } : p)));
  }

  function showAllCards() {
    if (!prefs) return;
    applyPrefs(prefs.map((p) => ({ ...p, hidden: false })));
  }

  function resetLayout() {
    applyPrefs(buildDefaults());
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!prefs) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = visible.map((c) => c.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(ids, oldIdx, newIdx);
    const orderMap = new Map<string, number>();
    reordered.forEach((id, i) => orderMap.set(id, i));
    applyPrefs(
      prefs.map((p) =>
        orderMap.has(p.id) ? { ...p, order: orderMap.get(p.id)! } : p,
      ),
    );
  }

  if (prefs === null) {
    return (
      <div className="text-sm text-text-2 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  // Mobile: stacked, no drag
  if (breakpoint === "sm") {
    return (
      <>
        {visible.length === 0 ? (
          <EmptyState onReset={resetLayout} />
        ) : (
          <div className="flex flex-col gap-4">
            {visible.map((pref) => {
              const Component = CARD_COMPONENTS[pref.id];
              return (
                <div key={pref.id}>
                  <Component width={sizeToWidth(pref.size)} />
                </div>
              );
            })}
          </div>
        )}
        <EditButton editing={editing} onClick={() => setEditing((e) => !e)} />
      </>
    );
  }

  // Desktop / Tablet: CSS Grid dense masonry
  const cols = breakpoint === "lg" ? 12 : 6;

  return (
    <>
      {visible.length === 0 ? (
        <EmptyState onReset={resetLayout} />
      ) : (
        <DndContext
          sensors={editing ? sensors : undefined}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={visible.map((c) => c.id)}
            strategy={rectSortingStrategy}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridAutoRows: 128,
                gridAutoFlow: "row dense",
                gap: 16,
              }}
            >
              {visible.map((pref) => (
                <SortableCard
                  key={pref.id}
                  pref={pref}
                  cols={cols as 12 | 6}
                  editing={editing}
                  onChangeSize={(s) => changeSize(pref.id, s)}
                  onHide={() => hideCard(pref.id)}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeCard ? (
              <div className="opacity-90 ring-1 ring-glow-2/60 shadow-2xl rounded-md">
                {(() => {
                  const Component = CARD_COMPONENTS[activeCard.id];
                  return <Component width={sizeToWidth(activeCard.size)} />;
                })()}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {editing && hiddenCount > 0 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="text-[11px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.08em]">
            {hiddenCount} card{hiddenCount === 1 ? "" : "s"} hidden
          </span>
          <button
            type="button"
            onClick={showAllCards}
            className="text-[11px] font-[family-name:var(--font-mono)] tracking-[0.08em] text-accent hover:text-accent/80 transition-colors"
          >
            Show all
          </button>
        </div>
      )}

      <EditButton editing={editing} onClick={() => setEditing((e) => !e)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// SortableCard
// ---------------------------------------------------------------------------

function SortableCard({
  pref,
  cols,
  editing,
  onChangeSize,
  onHide,
}: {
  pref: DashCardPref;
  cols: 12 | 6;
  editing: boolean;
  onChangeSize: (s: CardSize) => void;
  onHide: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pref.id, disabled: !editing });

  const cfg = SIZE_CONFIG[pref.size];
  const colSpan = cols === 12 ? cfg.colSpan : mdColSpan(pref.size);

  const Component = CARD_COMPONENTS[pref.id];
  if (!Component) return null;

  const style: React.CSSProperties = {
    gridColumn: `span ${colSpan}`,
    gridRow: `span ${cfg.rowSpan}`,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative overflow-hidden rounded-md ${
        editing
          ? "outline outline-1 outline-dashed outline-ink-3/40"
          : ""
      } ${isDragging ? "ring-1 ring-glow-2/60 shadow-2xl" : ""}`}
    >
      <Component width={sizeToWidth(pref.size)} />

      {editing && (
        <>
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Drag card"
            className="absolute top-2 left-2 z-10 h-7 w-7 flex items-center justify-center rounded-sm text-text-2 hover:text-text-0 bg-ink-2/80 hover:bg-ink-2 cursor-grab active:cursor-grabbing touch-none"
          >
            <span aria-hidden className="text-sm leading-none">⠿</span>
          </button>
          <SizePicker
            current={pref.size}
            onChange={onChangeSize}
            onHide={onHide}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SizePicker popover
// ---------------------------------------------------------------------------

const SHAPE_DIMS: Record<CardSize, { w: number; h: number }> = {
  sm:       { w: 20, h: 12 },
  tall:     { w: 20, h: 24 },
  "tall-3": { w: 20, h: 32 },
  "tall-4": { w: 20, h: 38 },
  md:       { w: 32, h: 24 },
  "md-3":   { w: 32, h: 32 },
  "md-4":   { w: 32, h: 38 },
  wide:     { w: 40, h: 12 },
  lg:       { w: 40, h: 24 },
  full:     { w: 52, h: 12 },
};

function SizePicker({
  current,
  onChange,
  onHide,
}: {
  current: CardSize;
  onChange: (s: CardSize) => void;
  onHide: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="absolute top-2 right-2 z-10 flex items-center gap-1">
      <button
        type="button"
        onClick={onHide}
        aria-label="Hide card"
        className="h-7 w-7 flex items-center justify-center rounded-sm text-text-2 hover:text-error bg-ink-2/80 hover:bg-ink-2"
      >
        <span aria-hidden className="text-sm leading-none">×</span>
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Change size"
        className={`h-7 w-7 flex items-center justify-center rounded-sm bg-ink-2/80 hover:bg-ink-2 ${
          open ? "text-text-0" : "text-text-2 hover:text-text-0"
        }`}
      >
        <span aria-hidden className="text-sm leading-none">⊞</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-ink-1 border border-ink-2 rounded-md shadow-lg p-2 grid grid-cols-2 gap-1.5 min-w-[180px] max-h-[320px] overflow-y-auto">
          {ALL_SIZES.map((size) => {
            const sh = SHAPE_DIMS[size];
            const active = current === size;
            return (
              <button
                key={size}
                type="button"
                onClick={() => {
                  onChange(size);
                  setOpen(false);
                }}
                className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-sm transition-colors ${
                  active
                    ? "bg-glow-2/20 ring-1 ring-glow-2/40"
                    : "hover:bg-ink-2/60"
                }`}
              >
                <div
                  className={`rounded-sm ${active ? "bg-glow-2/60" : "bg-ink-3/30"}`}
                  style={{ width: sh.w, height: sh.h }}
                />
                <span className="text-[9px] font-[family-name:var(--font-mono)] tracking-[0.15em] text-ink-3">
                  {SIZE_LABELS[size]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function EditButton({
  editing,
  onClick,
}: {
  editing: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`fixed bottom-6 right-6 z-40 px-4 py-2.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase shadow-lg transition-colors border ${
        editing
          ? "bg-glow-2 border-glow-2 text-text-0 hover:bg-glow-1"
          : "bg-ink-1 border-ink-2 text-ink-4 hover:text-text-0 hover:border-ink-3"
      }`}
    >
      {editing ? "DONE" : "EDIT LAYOUT"}
    </button>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="text-sm text-text-2 italic font-[family-name:var(--font-display)] py-16 text-center">
      All cards hidden.{" "}
      <button
        type="button"
        onClick={onReset}
        className="underline hover:text-text-0"
      >
        Reset layout
      </button>{" "}
      to restore.
    </div>
  );
}
