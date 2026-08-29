"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useApi } from "@/lib/data/useApi";
import { reportApiError } from "@/lib/data/apiWrite";
import { Mono } from "@/components/dashboard/Mono";
import {
  ACCEPTED_MEDIA_TYPES,
  MAX_RECEIPT_IMAGES,
  type Receipt,
  type ReceiptDetail,
  type ReceiptLine,
  type ReceiptStatus,
} from "@/lib/types/receipt";

const LIST_KEY = "/api/receipts";

/** Amounts use --font-mono, which resolves to Berkeley Mono where installed. */
const AMOUNT_CLS =
  "font-[family-name:var(--font-mono)] tabular-nums text-loam-4";

const STATUS_TONE: Record<ReceiptStatus, string> = {
  uploaded: "bg-loam-2 text-loam-3 border-hairline",
  parsing: "bg-loam-2 text-loam-3 border-hairline",
  parsed: "bg-glow-wash text-glow border-glow-dim/40",
  needs_review: "bg-warn/15 text-warn border-warn/40",
  failed: "bg-danger/15 text-danger border-danger/40",
};

const STATUS_LABEL: Record<ReceiptStatus, string> = {
  uploaded: "UPLOADED",
  parsing: "PARSING",
  parsed: "PARSED",
  needs_review: "NEEDS REVIEW",
  failed: "FAILED",
};

function money(v: number | null | undefined, currency = "GBP"): string {
  if (v === null || v === undefined) return "—";
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "£";
  return `${symbol}${Number(v).toFixed(2)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ReceiptsClient() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { data: listData, isLoading, mutate: mutateList } =
    useApi<{ receipts?: Receipt[] }>(LIST_KEY);
  const receipts = useMemo<Receipt[]>(
    () => (Array.isArray(listData?.receipts) ? listData.receipts : []),
    [listData],
  );

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      if (list.length > MAX_RECEIPT_IMAGES) {
        reportApiError(
          new Error(`Select at most ${MAX_RECEIPT_IMAGES} images`),
          "Too many images",
        );
        return;
      }
      const form = new FormData();
      for (const f of list) form.append("images", f);

      setUploading(true);
      try {
        const res = await fetch("/api/receipts", { method: "POST", body: form });
        const json = (await res.json().catch(() => ({}))) as {
          receipt?: Receipt;
          error?: string;
        };
        if (!res.ok) {
          // The HEIC rejection arrives here with an actionable message.
          reportApiError(new Error(json.error ?? `Upload failed (${res.status})`));
          return;
        }
        await mutateList();
        if (json.receipt) setSelectedId(json.receipt.id);
      } catch (e) {
        reportApiError(e, "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [mutateList],
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Receipts
        </h1>
        <p className="text-sm text-loam-3 italic font-[family-name:var(--font-display)]">
          Photograph a till receipt and it is read into lines.
        </p>
      </header>

      {/* Upload */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) void upload(e.dataTransfer.files);
        }}
        className={`rounded-v2-lg border border-dashed p-6 text-center transition-colors ${
          dragging ? "border-glow-dim bg-glow-wash" : "border-hairline bg-surface-1"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPTED_MEDIA_TYPES.join(",")}
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="text-sm text-loam-4">
          {uploading ? "Reading receipt…" : "Drop receipt photos here"}
        </p>
        <p className="text-[11px] text-loam-3 mt-1">
          JPEG or PNG, up to {MAX_RECEIPT_IMAGES} pages. Overlapping photos are fine.
        </p>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="mt-3 px-3 py-1.5 rounded-v2-md border border-hairline bg-surface-2 text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] text-loam-4 hover:bg-surface-3 disabled:opacity-50 transition-colors"
        >
          {uploading ? "Working…" : "Choose photos"}
        </button>
      </div>

      {selectedId ? (
        <ReceiptDetailView id={selectedId} onClose={() => setSelectedId(null)} onChanged={() => void mutateList()} />
      ) : (
        <ReceiptList
          receipts={receipts}
          loading={isLoading}
          onOpen={(id) => setSelectedId(id)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ReceiptStatus }) {
  return (
    <span
      className={`shrink-0 px-1.5 py-0.5 rounded-v2-sm border text-[9px] uppercase tracking-[0.14em] font-[family-name:var(--font-mono)] ${STATUS_TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function ReceiptList({
  receipts,
  loading,
  onOpen,
}: {
  receipts: Receipt[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  if (loading) {
    return (
      <p className="text-sm text-loam-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </p>
    );
  }
  if (receipts.length === 0) {
    return (
      <p className="text-sm text-loam-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        No receipts yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col rounded-v2-lg border border-hairline overflow-hidden">
      {receipts.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onOpen(r.id)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left bg-surface-1 hover:bg-surface-2 border-b border-hairline last:border-b-0 transition-colors"
          >
            <Mono className="text-[11px] text-loam-3 w-24 shrink-0">
              {fmtDate(r.purchased_at)}
            </Mono>
            <span className="flex-1 min-w-0 truncate text-sm text-loam-4">
              {r.retailer ?? "Unknown retailer"}
            </span>
            <span className={`${AMOUNT_CLS} text-sm`}>
              {money(r.total, r.currency)}
            </span>
            <StatusBadge status={r.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ReceiptDetailView({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const key = `/api/receipts/${id}`;
  const { data, isLoading, mutate } = useApi<ReceiptDetail>(key);
  const [reparsing, setReparsing] = useState(false);

  const receipt = data?.receipt ?? null;
  const lines = useMemo<ReceiptLine[]>(
    () => (Array.isArray(data?.lines) ? data.lines : []),
    [data],
  );
  const images = useMemo(() => (Array.isArray(data?.images) ? data.images : []), [data]);

  async function reparse() {
    setReparsing(true);
    try {
      const res = await fetch(`/api/receipts/${id}/reparse`, { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        reportApiError(new Error(j.error ?? `Reparse failed (${res.status})`));
        return;
      }
      await mutate();
      onChanged();
    } catch (e) {
      reportApiError(e, "Reparse failed");
    } finally {
      setReparsing(false);
    }
  }

  async function patchLine(lineId: string, patch: Partial<ReceiptLine>) {
    try {
      const res = await fetch(`/api/receipts/${id}/lines/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        reportApiError(new Error(j.error ?? "Could not update line"));
        return;
      }
      await mutate();
      onChanged();
    } catch (e) {
      reportApiError(e, "Could not update line");
    }
  }

  if (isLoading || !receipt) {
    return (
      <p className="text-sm text-loam-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </p>
    );
  }

  const delta =
    receipt.total !== null && receipt.parsed_total !== null
      ? Math.round((receipt.parsed_total - receipt.total) * 100) / 100
      : null;
  const reconciled = delta !== null && Math.abs(delta) <= 0.05;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] text-loam-3 hover:text-loam-4 transition-colors"
        >
          ← All receipts
        </button>
        <StatusBadge status={receipt.status} />
        {receipt.review_reason && (
          <Mono className="text-[10px] text-warn">{receipt.review_reason}</Mono>
        )}
        <button
          type="button"
          onClick={() => void reparse()}
          disabled={reparsing}
          className="ml-auto px-3 py-1.5 rounded-v2-md border border-hairline bg-surface-2 text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] text-loam-4 hover:bg-surface-3 disabled:opacity-50 transition-colors"
        >
          {reparsing ? "Reparsing…" : "Reparse"}
        </button>
      </div>

      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-lg text-loam-4">{receipt.retailer ?? "Unknown retailer"}</span>
        <Mono className="text-[11px] text-loam-3">{fmtDate(receipt.purchased_at)}</Mono>
      </div>

      {/* Source images */}
      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img) =>
            img.signed_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.id}
                src={img.signed_url}
                alt={`Receipt page ${img.sort_order + 1}`}
                className="h-28 w-auto rounded-v2-md border border-hairline shrink-0 object-cover"
              />
            ) : (
              <div
                key={img.id}
                className="h-28 w-20 rounded-v2-md border border-hairline bg-surface-2 shrink-0 flex items-center justify-center"
              >
                <Mono className="text-[9px] text-loam-3">no url</Mono>
              </div>
            ),
          )}
        </div>
      )}

      {/* Reconciliation */}
      <div
        className={`flex items-center gap-4 flex-wrap rounded-v2-md border px-4 py-3 ${
          reconciled
            ? "border-hairline bg-surface-1"
            : "border-warn/40 bg-warn/10"
        }`}
      >
        <div className="flex flex-col">
          <Mono className="text-[9px] tracking-[0.18em] text-loam-3">RECEIPT TOTAL</Mono>
          <span className={`${AMOUNT_CLS} text-sm`}>
            {money(receipt.total, receipt.currency)}
          </span>
        </div>
        <div className="flex flex-col">
          <Mono className="text-[9px] tracking-[0.18em] text-loam-3">LINES ADD UP TO</Mono>
          <span className={`${AMOUNT_CLS} text-sm`}>
            {money(receipt.parsed_total, receipt.currency)}
          </span>
        </div>
        <div className="flex flex-col">
          <Mono className="text-[9px] tracking-[0.18em] text-loam-3">DIFFERENCE</Mono>
          <span
            className={`font-[family-name:var(--font-mono)] tabular-nums text-sm ${
              reconciled ? "text-glow" : "text-warn"
            }`}
          >
            {delta === null ? "—" : money(delta, receipt.currency)}
          </span>
        </div>
      </div>

      {/* Lines */}
      {lines.length === 0 ? (
        <p className="text-sm text-loam-3 italic font-[family-name:var(--font-display)] py-8 text-center">
          No lines parsed.
        </p>
      ) : (
        <div className="rounded-v2-lg border border-hairline overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 640 }}>
            <thead>
              <tr className="border-b border-hairline">
                {["Item", "Qty", "Unit", "VAT", "Total"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-loam-3 font-[family-name:var(--font-mono)] ${
                      i === 0 ? "text-left" : "text-right"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <LineRow
                  key={l.id}
                  line={l}
                  currency={receipt.currency}
                  onPatch={(patch) => void patchLine(l.id, patch)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LineRow({
  line,
  currency,
  onPatch,
}: {
  line: ReceiptLine;
  currency: string;
  onPatch: (patch: Partial<ReceiptLine>) => void;
}) {
  const [description, setDescription] = useState(line.description);
  const [quantity, setQuantity] = useState(String(line.quantity ?? ""));
  const [unitPrice, setUnitPrice] = useState(
    line.unit_price === null ? "" : String(line.unit_price),
  );
  const [vat, setVat] = useState(line.vat === null ? "" : String(line.vat));
  const [lineTotal, setLineTotal] = useState(String(line.line_total ?? ""));

  const numOrNull = (s: string): number | null => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const cell =
    "w-full bg-transparent outline-none text-right font-[family-name:var(--font-mono)] tabular-nums text-loam-4 focus:bg-surface-2 rounded-v2-sm px-1 py-0.5";

  return (
    <tr className="border-b border-hairline last:border-b-0 hover:bg-surface-2 transition-colors">
      <td className="px-3 py-1.5">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if (description.trim() && description !== line.description) {
              onPatch({ description: description.trim() });
            }
          }}
          className="w-full bg-transparent outline-none text-loam-4 focus:bg-surface-2 rounded-v2-sm px-1 py-0.5"
        />
        {line.item_code && (
          <Mono className="text-[9px] text-loam-3">{line.item_code}</Mono>
        )}
      </td>
      <td className="px-3 py-1.5 w-16">
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onBlur={() => {
            const n = numOrNull(quantity);
            if (n !== null && n !== line.quantity) onPatch({ quantity: n });
          }}
          className={cell}
        />
      </td>
      <td className="px-3 py-1.5 w-24">
        <input
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          onBlur={() => {
            const n = numOrNull(unitPrice);
            if (n !== line.unit_price) onPatch({ unit_price: n });
          }}
          className={cell}
        />
      </td>
      <td className="px-3 py-1.5 w-20">
        <input
          value={vat}
          onChange={(e) => setVat(e.target.value)}
          onBlur={() => {
            const n = numOrNull(vat);
            if (n !== line.vat) onPatch({ vat: n });
          }}
          className={cell}
        />
      </td>
      <td className="px-3 py-1.5 w-24">
        <input
          value={lineTotal}
          onChange={(e) => setLineTotal(e.target.value)}
          onBlur={() => {
            const n = numOrNull(lineTotal);
            if (n !== null && n !== line.line_total) onPatch({ line_total: n });
          }}
          className={cell}
          title={line.raw_text ?? undefined}
        />
        <span className="sr-only">{currency}</span>
      </td>
    </tr>
  );
}
