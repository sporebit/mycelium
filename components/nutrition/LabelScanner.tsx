"use client";

import { useEffect, useRef, useState } from "react";
import type { Food } from "@/lib/nutrition/types-v2";

type Extracted = {
  product_name: string;
  brand: string | null;
  serving_size_g: number | null;
  servings_per_pack: number | null;
  kcal_per_100g: number | null;
  protein_per_100g: number | null;
  carbs_per_100g: number | null;
  fat_per_100g: number | null;
  fibre_per_100g: number | null;
  sugar_per_100g: number | null;
  saturated_fat_per_100g: number | null;
  salt_per_100g: number | null;
  ingredients: string | null;
  confidence: "high" | "medium" | "low";
};

type Stage = "camera" | "uploading" | "extracted" | "saving" | "error";

/**
 * Full-screen camera capture for nutrition labels. Capture → Claude
 * Vision OCR → editable pre-filled form → save to library.
 *
 * Falls back to a native file picker when getUserMedia is unavailable
 * or denied; mobile browsers route the file picker to the camera
 * directly so the UX stays one tap away.
 */
export function LabelScanner({
  onSaved,
  onClose,
  onSwitchToBarcode,
}: {
  onSaved: (food: Food) => void;
  onClose: () => void;
  onSwitchToBarcode?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [stage, setStage] = useState<Stage>("camera");
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (stage !== "camera" || typeof window === "undefined") return;
    let cancelled = false;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (err) {
        console.warn("[LabelScanner] camera unavailable", err);
        // We don't error out — the file input below is the fallback.
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [stage]);

  async function captureFromVideo(): Promise<string | null> {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function readImageAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("read failed"));
      reader.readAsDataURL(file);
    });
  }

  async function send(dataUrl: string) {
    setError(null);
    setStage("uploading");
    try {
      const r = await fetch("/api/nutrition/foods/scan-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: dataUrl, media_type: "image/jpeg" }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        extracted?: Extracted;
        error?: string;
      };
      if (!r.ok || !j.extracted) {
        setError(j.error ?? "Vision scan failed");
        setStage("error");
        return;
      }
      setExtracted(j.extracted);
      setStage("extracted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStage("error");
    }
  }

  async function capture() {
    const dataUrl = await captureFromVideo();
    if (!dataUrl) {
      setError("Couldn't capture frame — try the file picker.");
      setStage("error");
      return;
    }
    await send(dataUrl);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const data = await readImageAsDataURL(f);
    await send(data);
  }

  async function save(edited: Extracted) {
    setStage("saving");
    setError(null);
    try {
      const r = await fetch("/api/nutrition/foods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: edited.product_name,
          brand: edited.brand,
          source: "manual",
          kcal_per_100g: edited.kcal_per_100g,
          protein_per_100g: edited.protein_per_100g,
          carbs_per_100g: edited.carbs_per_100g,
          fat_per_100g: edited.fat_per_100g,
          fibre_per_100g: edited.fibre_per_100g,
          sugar_per_100g: edited.sugar_per_100g,
          saturated_fat_per_100g: edited.saturated_fat_per_100g,
          salt_per_100g: edited.salt_per_100g,
          serving_size_g: edited.serving_size_g ?? 100,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        food?: Food;
        error?: string;
      };
      if (!r.ok || !j.food) {
        setError(j.error ?? "Save failed");
        setStage("extracted");
        return;
      }
      onSaved(j.food);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setStage("extracted");
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-ink-0/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          {stage === "extracted" ? "Review label" : "Scan label"}
        </span>
        <div className="flex items-center gap-3">
          {onSwitchToBarcode && stage === "camera" && (
            <button
              type="button"
              onClick={onSwitchToBarcode}
              className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
            >
              ↺ BARCODE
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-3 hover:text-ink-4 text-base"
          >
            ✕
          </button>
        </div>
      </div>

      {(stage === "camera" || stage === "uploading") && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          <div className="relative w-full max-w-md aspect-[3/4] rounded-lg overflow-hidden bg-ink-1 border border-ink-2">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-[85%] h-[60%] border-2 border-glow-2 rounded-lg shadow-[0_0_24px_var(--glow-2)]" />
            </div>
          </div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] text-center max-w-md">
            Hold steady, make sure the label fills the frame.
          </p>
          {stage === "uploading" ? (
            <span className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
              Reading label…
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void capture()}
                className="px-4 py-2 rounded-md bg-glow-2 text-ink-0 hover:bg-glow-1 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
              >
                CAPTURE
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-md border border-ink-2 hover:border-ink-3 text-ink-3 hover:text-ink-4 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
              >
                UPLOAD
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => void onFile(e)}
              />
            </div>
          )}
        </div>
      )}

      {stage === "extracted" && extracted && (
        <ExtractedForm
          initial={extracted}
          onSave={(v) => void save(v)}
          onRetry={() => {
            setExtracted(null);
            setError(null);
            setStage("camera");
          }}
        />
      )}

      {stage === "saving" && (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            Saving…
          </span>
        </div>
      )}

      {stage === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <p className="text-sm text-danger font-[family-name:var(--font-display)] italic text-center max-w-md">
            {error ?? "Something went wrong."}
          </p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStage("camera");
            }}
            className="px-4 py-2 rounded-md bg-accent/15 border border-accent/40 text-accent text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
          >
            TRY AGAIN
          </button>
        </div>
      )}
    </div>
  );
}

function ExtractedForm({
  initial,
  onSave,
  onRetry,
}: {
  initial: Extracted;
  onSave: (v: Extracted) => void;
  onRetry: () => void;
}) {
  const [v, setV] = useState<Extracted>(initial);

  function num(k: keyof Extracted, val: string) {
    const n = val === "" ? null : Number(val);
    setV((cur) => ({ ...cur, [k]: Number.isFinite(n as number) ? n : null }));
  }

  const tone =
    v.confidence === "high"
      ? "text-ok bg-ok/15 border-ok/40"
      : v.confidence === "medium"
        ? "text-warn bg-warn/15 border-warn/40"
        : "text-danger bg-danger/15 border-danger/40";

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 max-w-xl mx-auto w-full">
      <div
        className={`text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] px-2 py-1.5 rounded-md border ${tone}`}
      >
        Confidence: {v.confidence}
        {v.confidence !== "high" && " — please double-check values"}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Name *
        </span>
        <input
          type="text"
          value={v.product_name}
          onChange={(e) => setV((c) => ({ ...c, product_name: e.target.value }))}
          className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Brand
        </span>
        <input
          type="text"
          value={v.brand ?? ""}
          onChange={(e) =>
            setV((c) => ({ ...c, brand: e.target.value.trim() || null }))
          }
          className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <NumField label="kcal / 100g" value={v.kcal_per_100g} onChange={(x) => num("kcal_per_100g", x)} />
        <NumField label="Protein / 100g" value={v.protein_per_100g} onChange={(x) => num("protein_per_100g", x)} />
        <NumField label="Carbs / 100g" value={v.carbs_per_100g} onChange={(x) => num("carbs_per_100g", x)} />
        <NumField label="Fat / 100g" value={v.fat_per_100g} onChange={(x) => num("fat_per_100g", x)} />
        <NumField label="Fibre / 100g" value={v.fibre_per_100g} onChange={(x) => num("fibre_per_100g", x)} />
        <NumField label="Sugar / 100g" value={v.sugar_per_100g} onChange={(x) => num("sugar_per_100g", x)} />
        <NumField label="Sat. fat / 100g" value={v.saturated_fat_per_100g} onChange={(x) => num("saturated_fat_per_100g", x)} />
        <NumField label="Salt / 100g" value={v.salt_per_100g} onChange={(x) => num("salt_per_100g", x)} />
        <NumField label="Serving (g)" value={v.serving_size_g} onChange={(x) => num("serving_size_g", x)} />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4"
        >
          ↻ RETRY
        </button>
        <button
          type="button"
          onClick={() => onSave(v)}
          disabled={!v.product_name.trim() || v.kcal_per_100g == null}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 disabled:opacity-40 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
        >
          SAVE TO LIBRARY
        </button>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60 tabular-nums"
      />
    </label>
  );
}
