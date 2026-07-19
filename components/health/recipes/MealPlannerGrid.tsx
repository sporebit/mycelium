"use client";

import {
  addDays,
  dateStr,
  fmtDay,
  fmtWeekRange,
} from "@/lib/health/meal-planner-dates";
import { MEAL_LABELS, MEAL_TYPES, type MealEntry } from "@/lib/health/recipes";

export function MealPlannerGrid({
  weekStart,
  setWeekStart,
  mealEntries,
  loadingMeals,
  onCellClick,
  onDeleteEntry,
  onGenerateShoppingList,
}: {
  weekStart: Date;
  setWeekStart: (d: Date) => void;
  mealEntries: MealEntry[];
  loadingMeals: boolean;
  onCellClick: (date: string, meal: string) => void;
  onDeleteEntry: (id: string) => void;
  onGenerateShoppingList: () => void;
}) {
  return (
    <>
      {/* Week nav */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="text-ink-3 hover:text-ink-4 text-sm font-[family-name:var(--font-mono)]"
        >
          ← Prev
        </button>
        <p className="text-sm text-ink-4 font-[family-name:var(--font-display)]">
          {fmtWeekRange(weekStart)}
        </p>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="text-ink-3 hover:text-ink-4 text-sm font-[family-name:var(--font-mono)]"
        >
          Next →
        </button>
      </div>

      {loadingMeals ? (
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] text-center py-8">
          Loading…
        </p>
      ) : (
        <>
          {/* Grid */}
          <div className="overflow-x-auto mb-4">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.1em] text-left p-2 w-20" />
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = addDays(weekStart, i);
                    return (
                      <th
                        key={i}
                        className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.1em] text-center p-2"
                      >
                        {fmtDay(d)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {MEAL_TYPES.map((meal) => (
                  <tr key={meal} className="border-t border-ink-2">
                    <td className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.1em] p-2">
                      {MEAL_LABELS[meal]}
                    </td>
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = dateStr(addDays(weekStart, i));
                      const entry = mealEntries.find(
                        (e) => e.planned_date === d && e.meal_type === meal,
                      );
                      return (
                        <td key={i} className="p-1 text-center align-top">
                          {entry ? (
                            <div className="group relative px-1 py-1.5 rounded bg-[#5de8e0]/10 border border-[#5de8e0]/20">
                              <p className="text-[10px] text-ink-4 font-[family-name:var(--font-display)] truncate">
                                {entry.recipes?.title || entry.custom_meal || "—"}
                              </p>
                              <button
                                onClick={() => onDeleteEntry(entry.id)}
                                className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 h-4 w-4 rounded-full bg-danger/80 text-white text-[8px] flex items-center justify-center transition-opacity"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => onCellClick(d, meal)}
                              className="w-full py-1.5 rounded border border-dashed border-ink-2 text-ink-3 hover:border-ink-3 hover:text-ink-4 text-[10px] font-[family-name:var(--font-mono)] transition-colors"
                            >
                              +
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Generate shopping list */}
          <button
            onClick={onGenerateShoppingList}
            disabled={mealEntries.filter((e) => e.recipe_id).length === 0}
            className="px-4 py-2 rounded-md bg-[#5de8e0]/15 border border-[#5de8e0]/40 text-[#5de8e0] text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-[#5de8e0]/25 disabled:opacity-30 transition-colors"
          >
            GENERATE SHOPPING LIST
          </button>
        </>
      )}
    </>
  );
}
