"use client";

import { useEffect, useState } from "react";
import { ContextPicker } from "@/components/compost/ContextPicker";
import { useCurrentContext } from "@/lib/hooks/useCurrentContext";
import { useCurrentDevice } from "@/lib/hooks/useCurrentDevice";
import type { ContextEnergy, ContextOption } from "@/lib/types/context";

const ENERGY_LABEL: Record<ContextEnergy, string> = {
  low: "Low",
  medium: "Med",
  high: "High",
};

/**
 * Compact context strip rendered under the TopRail nav. Shows the
 * auto-detected device, then user-settable where/energy/context dropdowns.
 * Stored in localStorage via useCurrentContext so all surfaces see the
 * same selection.
 */
export function ContextSwitcher() {
  const detectedDevice = useCurrentDevice();
  const [ctx, setCtx] = useCurrentContext();
  const [deviceLocked, setDeviceLocked] = useState(true);
  const [wheres, setWheres] = useState<ContextOption[]>([]);
  const [devices, setDevices] = useState<ContextOption[]>([]);
  const [tags, setTags] = useState<ContextOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/context-options?field=where").then((r) => r.json()),
      fetch("/api/context-options?field=device").then((r) => r.json()),
      fetch("/api/context-options?field=context_tag").then((r) => r.json()),
    ])
      .then(
        ([w, d, t]: [
          { options?: ContextOption[] },
          { options?: ContextOption[] },
          { options?: ContextOption[] },
        ]) => {
          if (cancelled) return;
          setWheres(Array.isArray(w.options) ? w.options : []);
          setDevices(Array.isArray(d.options) ? d.options : []);
          setTags(Array.isArray(t.options) ? t.options : []);
        },
      )
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve the device pill display
  const activeDevice = ctx.device ?? detectedDevice;
  const deviceOption = devices.find((d) => d.value === activeDevice);

  function setEnergy(e: ContextEnergy | null) {
    setCtx({ energy: e });
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap text-xs px-4 sm:px-6 py-1.5">
      <span
        title="Filter tasks by your current context. Click NOW on the task list to apply."
        className="text-[9px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mr-1 cursor-help"
      >
        NOW
      </span>

      {/* Device pill — auto-detected; clicking flips into manual override */}
      <button
        type="button"
        onClick={() => setDeviceLocked((v) => !v)}
        title={
          deviceLocked
            ? "Auto-detected device. Click to override."
            : "Manual override on. Click to lock to detected device."
        }
        className={`px-1.5 py-0.5 text-[10px] rounded-md border inline-flex items-center gap-1 font-[family-name:var(--font-mono)] tracking-[0.12em] transition-colors ${
          deviceLocked
            ? "border-ink-2 bg-ink-0/40 text-ink-3"
            : "border-glow-2/40 bg-glow-2/10 text-glow-2"
        }`}
      >
        {deviceOption?.icon && <span aria-hidden>{deviceOption.icon}</span>}
        <span>{deviceOption?.label ?? activeDevice.toUpperCase()}</span>
        <span aria-hidden>{deviceLocked ? "🔒" : "✎"}</span>
      </button>
      {!deviceLocked && (
        <ContextPicker
          field="device"
          options={devices}
          value={ctx.device}
          onChange={(v) => setCtx({ device: v })}
          onCreated={(opt) => setDevices((cur) => [...cur, opt])}
          placeholder={`auto · ${detectedDevice}`}
          compact
        />
      )}

      <ContextPicker
        field="where"
        options={wheres}
        value={ctx.where}
        onChange={(v) => setCtx({ where: v })}
        onCreated={(opt) => setWheres((cur) => [...cur, opt])}
        placeholder="Where?"
        compact
      />

      {/* Energy: 3-state pill toggle */}
      <div className="inline-flex rounded-md border border-ink-2 bg-ink-0/40 overflow-hidden">
        {(["low", "medium", "high"] as const).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEnergy(ctx.energy === e ? null : e)}
            className={`px-1.5 py-0.5 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] transition-colors ${
              ctx.energy === e
                ? "bg-accent/15 text-accent"
                : "text-ink-3 hover:text-ink-4"
            }`}
          >
            {ENERGY_LABEL[e].toUpperCase()}
          </button>
        ))}
      </div>

      <ContextPicker
        field="context_tag"
        options={tags}
        value={ctx.context_tag}
        onChange={(v) => setCtx({ context_tag: v })}
        onCreated={(opt) => setTags((cur) => [...cur, opt])}
        placeholder="Context?"
        compact
      />
    </div>
  );
}
