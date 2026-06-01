"use client";

import { useEffect, useState } from "react";
import type {
  Food,
  FoodSearchResult,
  MealGroup,
  NutritionLog,
} from "@/lib/nutrition/types-v2";
import { BarcodeScanner } from "./BarcodeScanner";
import { ServingPicker } from "./ServingPicker";
import { ManualFoodEntry } from "./ManualFoodEntry";

type Tab = "search" | "scan" | "library";

export function FoodSearch({
  open,
  date,
  mealGroups,
  defaultMealGroupId,
  initialTab = "search",
  autoLaunchScan = false,
  onClose,
  onLogged,
  onError,
}: {
  open: boolean;
  date: string;
  mealGroups: MealGroup[];
  defaultMealGroupId: string | null;
  /** Which tab to land on when the drawer opens. Mobile callers pass
   *  "scan" so the user goes straight to the camera. */
  initialTab?: Tab;
  /** When true, the scanner is launched immediately on open (used in
   *  conjunction with `initialTab='scan'` on mobile). */
  autoLaunchScan?: boolean;
  onClose: () => void;
  onLogged: (log: NutritionLog) => void;
  onError: (msg: string) => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [ukOnly, setUkOnly] = useState(true);
  const [library, setLibrary] = useState<Food[] | null>(null);
  const [picked, setPicked] = useState<FoodSearchResult | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [missedBarcode, setMissedBarcode] = useState<string | null>(null);

  // Reset when (re-)opening so a stale picked food doesn't linger.
  // The state writes are scheduled via queueMicrotask to keep them out
  // of the effect's synchronous body (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setTab(initialTab);
      setPicked(null);
      setScannerOpen(autoLaunchScan && initialTab === "scan");
    });
  }, [open, initialTab, autoLaunchScan]);

  // Debounced text search
  useEffect(() => {
    if (!open || tab !== "search") return;
    if (query.trim().length < 2) {
      queueMicrotask(() => {
        setResults([]);
        setHint(null);
      });
      return;
    }
    const handle = setTimeout(() => {
      let cancelled = false;
      setSearching(true);
      const params = new URLSearchParams({ q: query.trim() });
      if (!ukOnly) params.set("global", "true");
      fetch(`/api/nutrition/foods/search?${params.toString()}`)
        .then((r) => r.json())
        .then(
          (j: {
            results?: FoodSearchResult[];
            hint?: string | null;
          }) => {
            if (cancelled) return;
            setResults(Array.isArray(j.results) ? j.results : []);
            setHint(typeof j.hint === "string" ? j.hint : null);
          },
        )
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
      return () => {
        cancelled = true;
      };
    }, 300);
    return () => clearTimeout(handle);
  }, [query, open, tab, ukOnly]);

  // Library tab fetch on open
  useEffect(() => {
    if (!open || tab !== "library" || library !== null) return;
    fetch("/api/nutrition/foods")
      .then((r) => r.json())
      .then((j: { foods?: Food[] }) =>
        setLibrary(Array.isArray(j.foods) ? j.foods : []),
      )
      .catch(() => setLibrary([]));
  }, [open, tab, library]);

  function foodToResult(food: Food): FoodSearchResult {
    return {
      id: food.id,
      name: food.name,
      brand: food.brand,
      barcode: food.barcode,
      off_id: food.off_id,
      source: food.source,
      kcal_per_100g: food.kcal_per_100g,
      protein_per_100g: food.protein_per_100g,
      carbs_per_100g: food.carbs_per_100g,
      fat_per_100g: food.fat_per_100g,
      servings: food.servings ?? [],
      in_library: true,
      is_favourite: food.is_favourite,
      use_count: food.use_count,
    };
  }

  async function tryLookup(code: string): Promise<Food | null> {
    const r = await fetch(
      `/api/nutrition/foods/barcode/${encodeURIComponent(code)}`,
    );
    const j = (await r.json().catch(() => ({}))) as {
      food?: Food;
      error?: string;
    };
    if (!r.ok || !j.food) return null;
    return j.food;
  }

  async function handleBarcode(code: string) {
    setScannerOpen(false);
    setSaving(true);
    try {
      const food = await tryLookup(code);
      if (!food) {
        // OFF didn't have this product. Open the manual entry modal
        // pre-filled with the barcode so the user can keep moving —
        // and we cache the row for next time.
        setMissedBarcode(code);
        return;
      }
      setPicked(foodToResult(food));
    } finally {
      setSaving(false);
    }
  }

  async function saveOffResult(r: FoodSearchResult): Promise<Food | null> {
    try {
      // If the result has an off_id, the barcode lookup endpoint will
      // upsert it AND return the cached row.
      if (r.off_id) {
        const res = await fetch(
          `/api/nutrition/foods/barcode/${encodeURIComponent(r.off_id)}`,
        );
        const j = (await res.json().catch(() => ({}))) as { food?: Food };
        return j.food ?? null;
      }
      // Otherwise POST a manual save
      const res = await fetch("/api/nutrition/foods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: r.name,
          brand: r.brand,
          source: "manual",
          servings: r.servings,
          kcal_per_100g: r.kcal_per_100g,
          protein_per_100g: r.protein_per_100g,
          carbs_per_100g: r.carbs_per_100g,
          fat_per_100g: r.fat_per_100g,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { food?: Food };
      return j.food ?? null;
    } catch {
      return null;
    }
  }

  async function logPicked(payload: {
    quantityG: number;
    servingLabel: string | null;
    mealGroupId: string | null;
    save: boolean;
  }) {
    if (!picked) return;
    setSaving(true);
    try {
      // OFF results without a library id need to be cached first so the
      // log row carries a food_id and the snapshot computes correctly.
      let foodId = picked.id;
      if (!foodId) {
        const saved = await saveOffResult(picked);
        if (!saved) {
          onError("Couldn't save the food. Please try again.");
          return;
        }
        foodId = saved.id;
      }
      const res = await fetch("/api/nutrition/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          food_id: foodId,
          meal_group_id: payload.mealGroupId,
          date,
          quantity_g: payload.quantityG,
          serving_label: payload.servingLabel,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        log?: NutritionLog;
        error?: string;
      };
      if (!res.ok || !j.log) {
        onError(j.error ?? "Couldn't log the food.");
        return;
      }
      onLogged(j.log);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-0/60 backdrop-blur-sm cursor-default"
      />
      <div
        role="dialog"
        aria-label="Add food"
        className="relative w-full max-w-md max-h-[90vh] md:max-h-[80vh] rounded-t-xl md:rounded-xl bg-ink-1 border border-ink-2 shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Add food
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-3 hover:text-ink-4"
          >
            ✕
          </button>
        </div>

        {picked ? (
          <ServingPicker
            food={picked}
            mealGroups={mealGroups}
            defaultMealGroupId={defaultMealGroupId}
            onCancel={() => setPicked(null)}
            onLog={logPicked}
            saving={saving}
          />
        ) : (
          <>
            <div className="flex items-center border-b border-ink-2 px-3">
              <TabBtn label="SEARCH" active={tab === "search"} onClick={() => setTab("search")} />
              <TabBtn label="SCAN" active={tab === "scan"} onClick={() => setTab("scan")} />
              <TabBtn label="MY FOODS" active={tab === "library"} onClick={() => setTab("library")} />
            </div>

            {tab === "search" && (
              <div className="flex flex-col gap-2 px-3 pt-3 flex-1 overflow-y-auto">
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search e.g. oats, banana, Coca-Cola"
                    className="flex-1 px-3 py-2 rounded-md bg-ink-2 text-sm text-text-0 outline-none focus:ring-2 focus:ring-glow-2/60 placeholder:text-ink-3"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTab("scan");
                      setScannerOpen(true);
                    }}
                    title="Scan barcode"
                    className="px-2 py-2 rounded-md border border-ink-2 hover:border-ink-3 text-ink-3 hover:text-ink-4 text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] transition-colors inline-flex items-center gap-1"
                  >
                    📷 SCAN
                  </button>
                </div>

                {/* Country scope toggle — UK by default so most user
                    queries return their local supermarket products. */}
                <button
                  type="button"
                  onClick={() => setUkOnly((v) => !v)}
                  aria-pressed={ukOnly}
                  className={`self-start px-2 py-0.5 rounded-md border text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] transition-colors ${
                    ukOnly
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-ink-2 text-ink-3 hover:text-ink-4"
                  }`}
                  title="When on, restricts search to UK products in English."
                >
                  {ukOnly ? "✓ UK PRODUCTS ONLY" : "🌍 GLOBAL SEARCH"}
                </button>

                {searching && (
                  <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-2 text-center">
                    Searching…
                  </div>
                )}
                {!searching && hint && (
                  <div className="text-[11px] text-ink-3 italic font-[family-name:var(--font-display)] -mt-1">
                    {hint}
                  </div>
                )}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-4 text-center">
                    No matches. Try a different search term
                    {ukOnly ? " or toggle off UK-only" : ""}.
                  </div>
                )}
                <ResultList
                  results={results}
                  onPick={setPicked}
                  onSave={async (r) => {
                    const saved = await saveOffResult(r);
                    if (saved) {
                      onError(`Saved "${saved.name}" to library`);
                    } else {
                      onError("Couldn't save the food.");
                    }
                  }}
                />
              </div>
            )}

            {tab === "scan" && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
                <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] text-center">
                  Use the camera to scan a barcode.
                </p>
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="px-4 py-2 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
                >
                  OPEN SCANNER
                </button>
                <button
                  type="button"
                  onClick={() => setTab("search")}
                  className="text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
                >
                  Search by text instead →
                </button>
              </div>
            )}

            {tab === "library" && (
              <div className="flex-1 overflow-y-auto px-3 py-3">
                {library === null ? (
                  <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-4 text-center">
                    Loading…
                  </div>
                ) : library.length === 0 ? (
                  <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-4 text-center">
                    No saved foods yet. Search and tap the bookmark icon to add.
                  </div>
                ) : (
                  <ResultList
                    results={library.map((f) => ({
                      id: f.id,
                      name: f.name,
                      brand: f.brand,
                      barcode: f.barcode,
                      off_id: f.off_id,
                      source: f.source,
                      kcal_per_100g: f.kcal_per_100g,
                      protein_per_100g: f.protein_per_100g,
                      carbs_per_100g: f.carbs_per_100g,
                      fat_per_100g: f.fat_per_100g,
                      servings: f.servings ?? [],
                      in_library: true,
                      is_favourite: f.is_favourite,
                      use_count: f.use_count,
                    }))}
                    onPick={setPicked}
                    onSave={undefined}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {scannerOpen && (
        <BarcodeScanner
          onDetected={handleBarcode}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {missedBarcode && (
        <ManualFoodEntry
          barcode={missedBarcode}
          retrying={saving}
          onRetry={async () => {
            setSaving(true);
            try {
              const food = await tryLookup(missedBarcode);
              if (food) {
                setMissedBarcode(null);
                setPicked(foodToResult(food));
              }
            } finally {
              setSaving(false);
            }
          }}
          onSaved={(food) => {
            setMissedBarcode(null);
            setPicked(foodToResult(food));
          }}
          onClose={() => setMissedBarcode(null)}
        />
      )}
    </div>
  );
}

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] border-b-2 transition-colors ${
        active
          ? "border-accent text-ink-4"
          : "border-transparent text-ink-3 hover:text-ink-4"
      }`}
    >
      {label}
    </button>
  );
}

function ResultList({
  results,
  onPick,
  onSave,
}: {
  results: FoodSearchResult[];
  onPick: (r: FoodSearchResult) => void;
  onSave: ((r: FoodSearchResult) => Promise<void>) | undefined;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {results.map((r, idx) => (
        <li
          key={r.id ?? `${r.off_id ?? ""}-${idx}`}
          className="bg-ink-0/40 border border-ink-2 hover:border-ink-3 rounded-md px-3 py-2 flex items-center gap-3 transition-colors"
        >
          <button
            type="button"
            onClick={() => onPick(r)}
            className="flex-1 min-w-0 text-left"
          >
            <div className="text-sm text-ink-4 truncate flex items-center gap-1.5">
              <SourceBadge source={r.source} inLibrary={r.in_library} />
              <span className="truncate">{r.name}</span>
              {r.is_favourite && (
                <span className="ml-1 text-warn" title="Favourite">
                  ★
                </span>
              )}
            </div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)] truncate">
              {r.brand ? `${r.brand} · ` : ""}
              {r.kcal_per_100g != null ? `${Math.round(r.kcal_per_100g)} kcal/100g` : "kcal —"}
              {r.protein_per_100g != null ? ` · P ${Math.round(r.protein_per_100g)}g` : ""}
            </div>
          </button>
          {onSave && !r.in_library && (
            <button
              type="button"
              onClick={() => void onSave(r)}
              aria-label="Save to library"
              title="Save to library"
              className="text-ink-3 hover:text-accent transition-colors text-base"
            >
              ＋
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function SourceBadge({
  source,
  inLibrary,
}: {
  source: FoodSearchResult["source"];
  inLibrary: boolean;
}) {
  // "Mine" (already in the user's library) takes precedence over
  // wherever it originated — it's the most useful signal.
  if (inLibrary) {
    return (
      <span
        className="text-[8px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] px-1 py-0.5 rounded-sm bg-ok/15 text-ok border border-ok/40 shrink-0"
        title="In your library"
      >
        MINE
      </span>
    );
  }
  if (source === "usda") {
    return (
      <span
        className="text-[8px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] px-1 py-0.5 rounded-sm bg-glow-2/15 text-glow-2 border border-glow-2/40 shrink-0"
        title="USDA FoodData Central — raw ingredient data"
      >
        USDA
      </span>
    );
  }
  if (source === "open_food_facts") {
    return (
      <span
        className="text-[8px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] px-1 py-0.5 rounded-sm bg-ink-2 text-ink-3 border border-ink-2 shrink-0"
        title="Open Food Facts — branded products"
      >
        OFF
      </span>
    );
  }
  return null;
}
