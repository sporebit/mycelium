"use client";

import { useEffect, useRef, useState } from "react";
import { isLikelyBarcode } from "@/lib/nutrition/off";
import type { Food } from "@/lib/nutrition/types-v2";
import { LabelScanner } from "./LabelScanner";

/**
 * Full-screen barcode scanner overlay. Uses @zxing/browser, loaded on
 * demand via dynamic import so the heavy decode library doesn't enter
 * the SSR / initial-route bundle.
 *
 * Falls back to a manual barcode entry field when:
 *  - the user denies camera permission
 *  - the device has no camera
 *  - the @zxing library fails to load (offline / network blocked)
 *
 * Non-barcode reads (the user accidentally points the camera at a QR
 * code, a bit of printed text, etc.) are rejected before they leave
 * the component so callers only ever see digit-formatted EAN/UPC
 * payloads.
 */
export function BarcodeScanner({
  onDetected,
  onClose,
  onLabelSaved,
}: {
  onDetected: (barcode: string) => void;
  onClose: () => void;
  /** When set, a "Scan label instead" affordance is rendered.
   *  Tapping switches the overlay to the Claude Vision OCR flow and
   *  fires this callback with the saved food row. */
  onLabelSaved?: (food: Food) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<
    "initialising" | "scanning" | "permission_denied" | "no_camera" | "library_error"
  >("initialising");
  const [manual, setManual] = useState("");
  const [rejectedMsg, setRejectedMsg] = useState<string | null>(null);
  const rejectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [labelMode, setLabelMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let controlsRef: { stop: () => void } | null = null;

    async function start() {
      try {
        // Probe getUserMedia first so denial flows through our own UI
        // rather than a generic library error.
        if (!navigator.mediaDevices?.getUserMedia) {
          if (!cancelled) setStatus("no_camera");
          return;
        }

        const mod = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new mod.BrowserMultiFormatReader();

        const constraints = { video: { facingMode: { ideal: "environment" } } };
        const controls = await reader.decodeFromConstraints(
          constraints,
          videoRef.current!,
          (result, _err, ctrls) => {
            if (result && !cancelled) {
              const text = result.getText().trim();
              // @zxing's MultiFormatReader will happily decode QR
              // codes, Data Matrix, etc — any of those reaching the
              // OFF endpoint would just 404. Reject early with a
              // visible message so the user knows to point at a
              // product's actual barcode, then let the reader keep
              // looking for the next read.
              if (!isLikelyBarcode(text)) {
                console.warn(
                  "[BarcodeScanner] non-product code ignored:",
                  text,
                );
                if (rejectedTimerRef.current) {
                  clearTimeout(rejectedTimerRef.current);
                }
                setRejectedMsg("That's not a product barcode — try again.");
                rejectedTimerRef.current = setTimeout(
                  () => setRejectedMsg(null),
                  2500,
                );
                return;
              }
              ctrls.stop();
              onDetected(text);
            }
          },
        );
        controlsRef = controls;
        if (!cancelled) setStatus("scanning");
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (/permission|denied|notallowed/i.test(msg)) {
          setStatus("permission_denied");
        } else if (/notfound|no.*device/i.test(msg)) {
          setStatus("no_camera");
        } else {
          console.error("[BarcodeScanner]", err);
          setStatus("library_error");
        }
      }
    }
    void start();

    return () => {
      cancelled = true;
      if (rejectedTimerRef.current) {
        clearTimeout(rejectedTimerRef.current);
      }
      try {
        controlsRef?.stop();
      } catch {
        /* ignore */
      }
    };
  }, [onDetected]);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const v = manual.trim();
    if (!v) return;
    if (!isLikelyBarcode(v)) {
      setRejectedMsg("Enter a numeric barcode (8, 12, 13 or 14 digits).");
      return;
    }
    onDetected(v);
  }

  const showVideo = status === "initialising" || status === "scanning";

  // Label-mode hands off to a dedicated scanner with its own camera
  // stream and Claude Vision flow. Returning to barcode mode resets
  // back into this component.
  if (labelMode && onLabelSaved) {
    return (
      <LabelScanner
        onSaved={onLabelSaved}
        onClose={onClose}
        onSwitchToBarcode={() => setLabelMode(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-ink-0/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Scan barcode
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scanner"
          className="text-ink-3 hover:text-ink-4 text-base"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
        {showVideo && (
          <div className="relative w-full max-w-md aspect-square rounded-lg overflow-hidden bg-ink-1 border border-ink-2">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-[70%] h-[30%] border-2 border-glow-2 rounded-lg shadow-[0_0_24px_var(--glow-2)]" />
            </div>
          </div>
        )}

        <div className="text-center max-w-md">
          {status === "initialising" && (
            <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
              Starting camera…
            </p>
          )}
          {status === "scanning" && (
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Hold the barcode inside the box.
            </p>
          )}
          {status === "permission_denied" && (
            <p className="text-sm text-warn font-[family-name:var(--font-display)] italic">
              Camera access needed to scan barcodes. Allow access in browser
              settings and reload.
            </p>
          )}
          {status === "no_camera" && (
            <p className="text-sm text-ink-3 font-[family-name:var(--font-display)] italic">
              No camera available. Use the manual entry below.
            </p>
          )}
          {status === "library_error" && (
            <p className="text-sm text-danger font-[family-name:var(--font-display)] italic">
              Couldn&apos;t load the scanner. Use the manual entry below.
            </p>
          )}
          {rejectedMsg && (
            <p className="mt-2 text-xs text-warn font-[family-name:var(--font-mono)] uppercase tracking-[0.18em]">
              {rejectedMsg}
            </p>
          )}
        </div>

        {onLabelSaved && (
          <button
            type="button"
            onClick={() => setLabelMode(true)}
            className="text-[11px] uppercase tracking-[0.18em] text-accent hover:text-text-0 font-[family-name:var(--font-mono)]"
          >
            Scan label instead →
          </button>
        )}

        <form
          onSubmit={submitManual}
          className="w-full max-w-md flex items-center gap-2 bg-ink-1 rounded-md border border-ink-2 px-3 py-2"
        >
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Manual
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Enter barcode digits"
            className="flex-1 bg-transparent outline-none text-sm text-text-0 placeholder:text-ink-3"
          />
          <button
            type="submit"
            disabled={!manual.trim()}
            className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-text-0 disabled:opacity-40 disabled:cursor-not-allowed font-[family-name:var(--font-mono)]"
          >
            LOOK UP ↵
          </button>
        </form>
      </div>
    </div>
  );
}
