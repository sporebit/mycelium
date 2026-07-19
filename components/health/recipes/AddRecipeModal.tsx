"use client";

import { useRef, useState } from "react";
import {
  RECIPES_INPUT_CLS,
  type Ingredient,
  type MethodStep,
} from "@/lib/health/recipes";

/**
 * Self-contained recipe editor + Vision-scan flow. Owns all form state so
 * the controller only tracks open/closed. Scan flow: single-page scan
 * populates the form, then "+ ADD ANOTHER PAGE" merges additional pages
 * server-side (parse route accepts `existing_data`).
 */
export function AddRecipeModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formSourceName, setFormSourceName] = useState("");
  const [formSourceUrl, setFormSourceUrl] = useState("");
  const [formPrepTime, setFormPrepTime] = useState("");
  const [formCookTime, setFormCookTime] = useState("");
  const [formServings, setFormServings] = useState("4");
  const [formCuisine, setFormCuisine] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formIngredients, setFormIngredients] = useState<Ingredient[]>([]);
  const [formMethod, setFormMethod] = useState<MethodStep[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const additionalFileRef = useRef<HTMLInputElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [scanningPage, setScanningPage] = useState(0);
  const [scanError, setScanError] = useState("");

  function resetForm() {
    setFormTitle(""); setFormSourceName(""); setFormSourceUrl("");
    setFormPrepTime(""); setFormCookTime(""); setFormServings("4");
    setFormCuisine(""); setFormTags(""); setFormNotes("");
    setFormIngredients([]); setFormMethod([]);
    setPageCount(0); setScanningPage(0); setScanError("");
  }

  function populateForm(r: Record<string, unknown>, merge = false) {
    const recipe = r as {
      title?: string; source_name?: string; source_url?: string;
      prep_time_minutes?: number; cook_time_minutes?: number;
      servings?: number; cuisine?: string; tags?: string[];
      notes?: string; ingredients?: Ingredient[]; method?: MethodStep[];
    };
    setFormTitle(recipe.title || (merge ? formTitle : "") || "");
    setFormSourceName(recipe.source_name || (merge ? formSourceName : "") || "");
    setFormSourceUrl(recipe.source_url || (merge ? formSourceUrl : "") || "");
    setFormPrepTime(recipe.prep_time_minutes?.toString() || (merge ? formPrepTime : "") || "");
    setFormCookTime(recipe.cook_time_minutes?.toString() || (merge ? formCookTime : "") || "");
    setFormServings(recipe.servings?.toString() || (merge ? formServings : "4") || "4");
    setFormCuisine(recipe.cuisine || (merge ? formCuisine : "") || "");
    const tags = Array.isArray(recipe.tags) ? recipe.tags : recipe.tags ? [String(recipe.tags)] : [];
    setFormTags(tags.join(", ") || (merge ? formTags : "") || "");
    setFormNotes(recipe.notes || (merge ? formNotes : "") || "");
    if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) {
      setFormIngredients(recipe.ingredients.map((ing) => ({
        amount: String(ing.amount ?? ""),
        unit: ing.unit ?? null,
        name: String(ing.name ?? ""),
        notes: ing.notes ?? null,
      })));
    }
    if (Array.isArray(recipe.method) && recipe.method.length) {
      setFormMethod(recipe.method.map((s, i) => ({
        step: typeof s.step === "number" ? s.step : i + 1,
        instruction: String(s.instruction ?? ""),
      })));
    }
  }

  function getCurrentFormData() {
    return {
      title: formTitle || null,
      source_name: formSourceName || null,
      source_url: formSourceUrl || null,
      prep_time_minutes: formPrepTime ? Number(formPrepTime) : null,
      cook_time_minutes: formCookTime ? Number(formCookTime) : null,
      servings: Number(formServings) || null,
      cuisine: formCuisine || null,
      tags: formTags.split(",").map((t) => t.trim()).filter(Boolean),
      notes: formNotes || null,
      ingredients: formIngredients,
      method: formMethod,
    };
  }

  async function handleScan(file: File) {
    setScanning(true);
    setScanError("");
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/health/recipes/parse", { method: "POST", body: fd });
      const data = await res.json();
      console.log("[recipe scan] response:", data);
      if (data.ok && data.recipe) {
        populateForm(data.recipe as Record<string, unknown>);
        setPageCount(1);
      } else {
        setScanError(data.error || "Could not extract recipe from image");
      }
    } catch (err) {
      console.error("[recipe scan]", err);
      setScanError("Scan failed — please try again");
    } finally {
      setScanning(false);
    }
  }

  async function handleAdditionalPage(file: File) {
    const page = pageCount + 1;
    setScanningPage(page);
    setScanError("");
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("existing_data", JSON.stringify(getCurrentFormData()));
      const res = await fetch("/api/health/recipes/parse", { method: "POST", body: fd });
      const data = await res.json();
      console.log("[recipe scan] page response:", data);
      if (data.ok && data.recipe) {
        populateForm(data.recipe as Record<string, unknown>, true);
        setPageCount(page);
      } else {
        setScanError(data.error || "Could not extract recipe from page");
      }
    } catch (err) {
      console.error("[recipe scan page]", err);
      setScanError("Page scan failed — please try again");
    } finally {
      setScanningPage(0);
    }
  }

  async function handleSaveRecipe() {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/health/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          source_name: formSourceName || null,
          source_url: formSourceUrl || null,
          prep_time_minutes: formPrepTime ? Number(formPrepTime) : null,
          cook_time_minutes: formCookTime ? Number(formCookTime) : null,
          servings: Number(formServings) || 4,
          cuisine: formCuisine || null,
          tags: formTags.split(",").map((t) => t.trim()).filter(Boolean),
          notes: formNotes || null,
          ingredients: formIngredients,
          method: formMethod,
        }),
      });
      if (res.ok) {
        resetForm();
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-ink-0 border border-ink-2 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic mb-4">
          Add Recipe
        </h2>

        {/* Scan option */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            className="flex-1 py-3 rounded-lg border border-dashed border-[#5de8e0]/40 text-[#5de8e0] text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] hover:bg-[#5de8e0]/5 transition-colors"
          >
            {scanning ? "READING RECIPE…" : "SCAN RECIPE"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleScan(f);
            }}
          />
        </div>

        {scanError && (
          <p className="text-xs text-danger font-[family-name:var(--font-mono)] mb-3">{scanError}</p>
        )}

        {/* Add another page */}
        {pageCount > 0 && !scanning && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => additionalFileRef.current?.click()}
              disabled={scanningPage > 0}
              className="flex-1 py-3 rounded-lg border border-dashed border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] hover:bg-accent/5 transition-colors disabled:opacity-40"
            >
              {scanningPage > 0
                ? `READING PAGE ${scanningPage}…`
                : `+ ADD ANOTHER PAGE (${pageCount} scanned)`}
            </button>
            <input
              ref={additionalFileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAdditionalPage(f);
                e.target.value = "";
              }}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="col-span-2">
            <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">TITLE</label>
            <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} className={RECIPES_INPUT_CLS} placeholder="Recipe name" />
          </div>
          <div>
            <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">SOURCE NAME</label>
            <input value={formSourceName} onChange={(e) => setFormSourceName(e.target.value)} className={RECIPES_INPUT_CLS} placeholder="e.g. Gousto" />
          </div>
          <div>
            <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">SOURCE URL</label>
            <input value={formSourceUrl} onChange={(e) => setFormSourceUrl(e.target.value)} className={RECIPES_INPUT_CLS} placeholder="https://…" />
          </div>
          <div>
            <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">PREP (min)</label>
            <input type="number" value={formPrepTime} onChange={(e) => setFormPrepTime(e.target.value)} className={RECIPES_INPUT_CLS} />
          </div>
          <div>
            <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">COOK (min)</label>
            <input type="number" value={formCookTime} onChange={(e) => setFormCookTime(e.target.value)} className={RECIPES_INPUT_CLS} />
          </div>
          <div>
            <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">SERVINGS</label>
            <input type="number" value={formServings} onChange={(e) => setFormServings(e.target.value)} className={RECIPES_INPUT_CLS} />
          </div>
          <div>
            <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">CUISINE</label>
            <input value={formCuisine} onChange={(e) => setFormCuisine(e.target.value)} className={RECIPES_INPUT_CLS} placeholder="e.g. Italian" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">TAGS (comma separated)</label>
            <input value={formTags} onChange={(e) => setFormTags(e.target.value)} className={RECIPES_INPUT_CLS} placeholder="quick, chicken, healthy" />
          </div>
        </div>

        {/* Ingredients */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">INGREDIENTS</label>
            <button
              onClick={() => setFormIngredients([...formIngredients, { amount: "", unit: null, name: "", notes: null }])}
              className="text-[10px] text-accent font-[family-name:var(--font-mono)]"
            >
              + ADD
            </button>
          </div>
          {formIngredients.map((ing, i) => (
            <div key={i} className="flex gap-1 mb-1">
              <input
                value={ing.amount}
                onChange={(e) => {
                  const next = [...formIngredients];
                  next[i] = { ...next[i], amount: e.target.value };
                  setFormIngredients(next);
                }}
                className={`${RECIPES_INPUT_CLS} w-16`}
                placeholder="Qty"
              />
              <input
                value={ing.unit ?? ""}
                onChange={(e) => {
                  const next = [...formIngredients];
                  next[i] = { ...next[i], unit: e.target.value || null };
                  setFormIngredients(next);
                }}
                className={`${RECIPES_INPUT_CLS} w-16`}
                placeholder="Unit"
              />
              <input
                value={ing.name}
                onChange={(e) => {
                  const next = [...formIngredients];
                  next[i] = { ...next[i], name: e.target.value };
                  setFormIngredients(next);
                }}
                className={`${RECIPES_INPUT_CLS} flex-1`}
                placeholder="Ingredient"
              />
              <button
                onClick={() => setFormIngredients(formIngredients.filter((_, j) => j !== i))}
                className="text-ink-3 hover:text-danger text-xs px-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Method */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">METHOD</label>
            <button
              onClick={() => setFormMethod([...formMethod, { step: formMethod.length + 1, instruction: "" }])}
              className="text-[10px] text-accent font-[family-name:var(--font-mono)]"
            >
              + ADD STEP
            </button>
          </div>
          {formMethod.map((s, i) => (
            <div key={i} className="flex gap-1 mb-1 items-start">
              <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] mt-2.5 w-5 shrink-0">{s.step}.</span>
              <textarea
                value={s.instruction}
                onChange={(e) => {
                  const next = [...formMethod];
                  next[i] = { ...next[i], instruction: e.target.value };
                  setFormMethod(next);
                }}
                className={`${RECIPES_INPUT_CLS} flex-1 resize-y min-h-[36px]`}
                rows={1}
              />
              <button
                onClick={() => {
                  const next = formMethod.filter((_, j) => j !== i).map((s, j) => ({ ...s, step: j + 1 }));
                  setFormMethod(next);
                }}
                className="text-ink-3 hover:text-danger text-xs px-1 mt-2"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">NOTES</label>
          <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} className={`${RECIPES_INPUT_CLS} resize-y`} />
        </div>

        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => { resetForm(); onClose(); }}
            className="px-3 py-1.5 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={handleSaveRecipe}
            disabled={saving || !formTitle.trim()}
            className="px-4 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 disabled:opacity-40 transition-colors"
          >
            {saving ? "SAVING…" : "SAVE"}
          </button>
        </div>
      </div>
    </div>
  );
}
