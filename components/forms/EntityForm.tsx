"use client";

import { useMemo } from "react";
import { useApi } from "@/lib/data/useApi";
import { EntityPicker } from "@/components/compost/EntityPicker";
import { visibleFields, type EntityDef, type FieldDef, type FieldErrors, type FieldValues } from "@/lib/capture/registry";

/**
 * The one form for every registry entry (MYC-161). Renders an entity's
 * visible fields in a two-column grid (or a single row when `inline`), with
 * the values held by the caller. The capture modal, the review card and the
 * app create forms all render through here — the registry decides what a
 * purchase or a reminder asks for, not each screen.
 */

export const inputClass =
  "w-full bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2 disabled:opacity-60";
const inlineInputClass = "bg-transparent outline-none text-sm text-text-0 placeholder:text-text-3 min-w-[120px] flex-1";
const eyebrow = "text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]";

type PeopleRow = { id: string; display_name?: string | null; first_name?: string | null; last_name?: string | null; relationship?: string | null };
type ProjectRow = { id: string; name: string; prefix?: string | null };

function personName(p: PeopleRow): string {
  return (p.display_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim()) || "(unnamed)";
}

export function EntityForm({
  def,
  values,
  onChange,
  errors,
  only,
  inline = false,
  disabled = false,
  autoFocus = false,
  onSubmit,
}: {
  def: EntityDef;
  values: FieldValues;
  onChange: (next: FieldValues) => void;
  errors?: FieldErrors;
  /** Render only these fields, in this order (a quick-add strip). */
  only?: readonly string[];
  /** One row, no labels: the quick-add strips on list pages. */
  inline?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Cmd/Ctrl+Enter anywhere in the form. */
  onSubmit?: () => void;
}) {
  const fields = useMemo(() => visibleFields(def, only), [def, only]);
  const needsPeople = fields.some((f) => f.type === "person");
  const needsProjects = fields.some((f) => f.type === "project");
  const technical = fields.some((f) => f.type === "project" && f.technicalOnly);
  const { data: peopleData } = useApi<{ people: PeopleRow[] }>(needsPeople ? "/api/people" : null);
  const { data: projectData } = useApi<{ projects: ProjectRow[] }>(needsProjects ? (technical ? "/api/projects?area=technical" : "/api/projects") : null);
  const people = peopleData?.people ?? [];
  const projects = projectData?.projects ?? [];

  const set = (name: string, v: unknown) => onChange({ ...values, [name]: v });

  function onKeyDown(e: React.KeyboardEvent) {
    if (onSubmit && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  }

  function control(f: FieldDef, first: boolean) {
    const cls = inline ? inlineInputClass : inputClass;
    const v = values[f.name];
    const common = { id: `ef-${def.kind}-${f.name}`, disabled, autoFocus: autoFocus && first, "aria-invalid": errors?.[f.name] ? true : undefined } as const;
    switch (f.type) {
      case "textarea":
        return (
          <textarea
            {...common}
            rows={inline ? 1 : (f.rows ?? 3)}
            value={typeof v === "string" ? v : ""}
            onChange={(e) => set(f.name, e.target.value)}
            placeholder={f.placeholder ?? (inline ? f.label : undefined)}
            className={`${cls} resize-y`}
          />
        );
      case "number":
        return (
          <input
            {...common}
            type="number"
            inputMode="decimal"
            min={f.min}
            max={f.max}
            step={f.step}
            value={typeof v === "number" ? v : typeof v === "string" ? v : ""}
            onChange={(e) => set(f.name, e.target.value)}
            placeholder={f.placeholder ?? (inline ? f.label : undefined)}
            className={cls}
          />
        );
      case "select":
        return (
          <select {...common} value={typeof v === "string" ? v : ""} onChange={(e) => set(f.name, e.target.value)} className={cls}>
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      case "date":
        return <input {...common} type="date" value={typeof v === "string" ? v : ""} onChange={(e) => set(f.name, e.target.value)} className={cls} />;
      case "time":
        return <input {...common} type="time" value={typeof v === "string" ? v : ""} onChange={(e) => set(f.name, e.target.value)} className={cls} />;
      case "datetime":
        return <input {...common} type="datetime-local" value={typeof v === "string" ? v : ""} onChange={(e) => set(f.name, e.target.value)} className={cls} />;
      case "boolean":
        return (
          <label className={`flex items-center gap-2 text-sm text-text-0 ${inline ? "" : "py-2"} cursor-pointer select-none`}>
            <input {...common} type="checkbox" checked={v === true} onChange={(e) => set(f.name, e.target.checked)} className="accent-accent h-3.5 w-3.5" />
            {inline ? f.label : f.help ?? "Yes"}
          </label>
        );
      case "tags":
        return (
          <input
            {...common}
            type="text"
            value={Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : ""}
            onChange={(e) => set(f.name, e.target.value)}
            onBlur={(e) => set(f.name, e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            placeholder={f.placeholder ?? "comma, separated"}
            className={cls}
          />
        );
      case "person":
        return (
          <select {...common} value={typeof v === "string" ? v : ""} onChange={(e) => set(f.name, e.target.value)} className={cls}>
            {f.selfOption && <option value="__me">Me</option>}
            <option value="">{peopleData ? (f.selfOption ? "Unknown" : `— pick a person —`) : "Loading…"}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {personName(p)}
                {p.relationship ? ` · ${p.relationship}` : ""}
              </option>
            ))}
          </select>
        );
      case "project":
        return (
          <select {...common} value={typeof v === "string" ? v : ""} onChange={(e) => set(f.name, e.target.value)} className={cls}>
            <option value="">{projectData ? (projects.length ? (f.required ? "Choose a project…" : "— No project —") : f.technicalOnly ? "No Tickets projects yet" : "— No project —") : "Loading…"}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.prefix ? `${p.prefix} · ${p.name}` : p.name}
              </option>
            ))}
          </select>
        );
      case "entity":
        return (
          <EntityPicker
            value={typeof v === "string" && v ? v : null}
            valueName={typeof values[`${f.name}__name`] === "string" ? (values[`${f.name}__name`] as string) : null}
            onChange={(ent) => onChange({ ...values, [f.name]: ent?.id ?? "", [`${f.name}__name`]: ent?.name ?? "" })}
          />
        );
      case "text":
      default:
        return (
          <input
            {...common}
            type="text"
            value={typeof v === "string" ? v : ""}
            onChange={(e) => set(f.name, e.target.value)}
            placeholder={f.placeholder ?? (inline ? f.label : undefined)}
            className={cls}
          />
        );
    }
  }

  if (inline) {
    return (
      <div className="flex flex-wrap items-center gap-2 flex-1" onKeyDown={onKeyDown}>
        {fields.map((f, i) => (
          <div key={f.name} className={`${f.type === "text" || f.type === "textarea" ? "flex-1 min-w-[140px]" : ""} flex items-center`} title={errors?.[f.name]}>
            {control(f, i === 0)}
            {errors?.[f.name] && <span className="text-[10px] text-danger ml-1">{errors[f.name]}</span>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" onKeyDown={onKeyDown}>
      {fields.map((f, i) => (
        <label key={f.name} htmlFor={`ef-${def.kind}-${f.name}`} className={`flex flex-col gap-1 ${f.wide ? "sm:col-span-2" : ""}`}>
          <span className={eyebrow}>
            {f.label}
            {f.required && <span className="text-accent"> *</span>}
          </span>
          {control(f, i === 0)}
          {errors?.[f.name] ? (
            <span className="text-[10px] text-danger font-[family-name:var(--font-mono)]">{errors[f.name]}</span>
          ) : f.help && f.type !== "boolean" ? (
            <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">{f.help}</span>
          ) : null}
        </label>
      ))}
    </div>
  );
}
