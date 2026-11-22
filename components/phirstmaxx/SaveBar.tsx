"use client";

/**
 * The weekly grid's save bar (claude/phirstmaxx-spec.md §4): it appears
 * whenever something is highlighted, says how much ("5 ranges, 31 h"), and
 * saves everything highlighted at once. Type, firmness, place, an optional
 * title and "repeat weekly until". When the ranges overlap blocks already
 * there, Save first lists them and asks: replace, keep both sides trimmed,
 * or cancel. The server's sentence is shown when a save fails.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Button, Label, SegmentedControl } from "@/components/ui";
import type { Firmness, PmBlockType, PmPlace } from "@/lib/phirstmaxx/types";

const INPUT =
  "min-h-[40px] px-3 rounded-v2-md bg-surface-0 border border-hairline text-text-hi text-sm placeholder:text-text-lo focus:outline-none focus:border-glow transition-colors";

export type SaveChoice = {
  type_id: string;
  firmness: Firmness;
  place_id: string | null;
  title: string | null;
  repeat_until: string | null;
  overlap_policy: "replace" | "trim";
};

export type OverlapItem = { id: string; label: string; when: string };

/** Work by default; the last-used type when it still exists. */
export function defaultTypeId(types: PmBlockType[], lastUsed: string | null): string {
  if (lastUsed && types.some((t) => t.id === lastUsed)) return lastUsed;
  return (types.find((t) => t.name.trim().toLowerCase() === "work") ?? types.find((t) => t.engine_kind === "work") ?? types[0])?.id ?? "";
}

export function SaveBar({
  summary,
  personName,
  types,
  places,
  lastUsed,
  overlapList,
  focusToken,
  onSave,
  onClear,
}: {
  summary: string;
  personName: string;
  types: PmBlockType[];
  /** Saved places for the edited person plus shared ones. */
  places: PmPlace[];
  lastUsed: { type_id: string | null; firmness: Firmness; place_id: string | null };
  overlapList: OverlapItem[];
  /** Bumped by the grid (Enter on a cell) to move focus into the bar. */
  focusToken: number;
  onSave: (choice: SaveChoice) => Promise<void>;
  onClear: () => void;
}) {
  const id = useId();
  const typeRef = useRef<HTMLSelectElement>(null);
  const [typeId, setTypeId] = useState(() => defaultTypeId(types, lastUsed.type_id));
  const [firmness, setFirmness] = useState<Firmness>(() => {
    const t = types.find((x) => x.id === defaultTypeId(types, lastUsed.type_id));
    return t && t.id !== lastUsed.type_id ? t.default_firmness : lastUsed.firmness;
  });
  const [placeId, setPlaceId] = useState<string>(() => {
    const t = types.find((x) => x.id === defaultTypeId(types, lastUsed.type_id));
    const want = t && t.id !== lastUsed.type_id ? t.default_place_id : lastUsed.place_id;
    return want && places.some((p) => p.id === want) ? want : "";
  });
  const [title, setTitle] = useState("");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (focusToken > 0) typeRef.current?.focus();
  }, [focusToken]);

  function chooseType(next: string) {
    setTypeId(next);
    const t = types.find((x) => x.id === next);
    if (!t) return;
    setFirmness(t.default_firmness);
    if (t.default_place_id && places.some((p) => p.id === t.default_place_id)) setPlaceId(t.default_place_id);
  }

  async function submit(policy: "replace" | "trim") {
    if (!typeId) {
      setError("Choose a type first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        type_id: typeId,
        firmness,
        place_id: placeId || null,
        title: title.trim() || null,
        repeat_until: repeatUntil || null,
        overlap_policy: policy,
      });
      setAsking(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function onSaveClick() {
    if (overlapList.length > 0) setAsking(true);
    else void submit("replace");
  }

  return (
    <section
      aria-label="Save the highlighted times"
      className="sticky bottom-0 z-40 mt-3 rounded-v2-md border border-hairline bg-surface-2 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.25)]"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !saving) {
          e.preventDefault();
          if (asking) setAsking(false);
          else onClear();
        }
      }}
    >
      <p className="mb-2 text-sm text-text-hi" aria-live="polite">
        {summary} <span className="text-text-lo">for {personName}</span>
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1" htmlFor={`${id}-type`}>
          <Label>Type</Label>
          <select id={`${id}-type`} ref={typeRef} className={INPUT} value={typeId} onChange={(e) => chooseType(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <Label>Firmness</Label>
          <SegmentedControl
            ariaLabel="Firmness"
            value={firmness}
            onChange={(v) => setFirmness(v === "flexible" ? "flexible" : "firm")}
            options={[
              { value: "firm", label: "Set in stone" },
              { value: "flexible", label: "Flexible" },
            ]}
          />
        </div>
        <label className="flex flex-col gap-1" htmlFor={`${id}-place`}>
          <Label>Place</Label>
          <select id={`${id}-place`} className={INPUT} value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
            <option value="">No place</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1" htmlFor={`${id}-title`}>
          <Label>Title (optional)</Label>
          <input id={`${id}-title`} className={INPUT} value={title} maxLength={120} placeholder="e.g. Early shift" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1" htmlFor={`${id}-repeat`}>
          <Label>Repeat weekly until</Label>
          <input id={`${id}-repeat`} type="date" className={INPUT} value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <Button variant="primary" onClick={onSaveClick} disabled={saving || asking} loading={saving && !asking}>
            Save
          </Button>
          <Button onClick={onClear} disabled={saving}>
            Clear
          </Button>
        </div>
      </div>

      {asking ? (
        <div className="mt-3 rounded-v2-md border border-hairline bg-surface-0 p-3" role="group" aria-label="Overlapping blocks">
          <p className="text-sm text-text-hi">
            {overlapList.length === 1 ? "This overlaps a block already there:" : `This overlaps ${overlapList.length} blocks already there:`}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-text-mid">
            {overlapList.map((o) => (
              <li key={o.id}>
                {o.label} <span className="text-text-lo">· {o.when}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => void submit("replace")} loading={saving} disabled={saving}>
              Replace
            </Button>
            <Button size="sm" onClick={() => void submit("trim")} disabled={saving}>
              Keep both sides trimmed
            </Button>
            <Button size="sm" onClick={() => setAsking(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-v2-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
