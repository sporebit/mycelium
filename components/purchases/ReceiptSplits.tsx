"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/lib/data/useApi";
import { Mono } from "@/components/dashboard/Mono";
import { Money } from "@/components/finance/Money";
import { ownerRemainder, shareAmount } from "@/lib/receipts/shares";
import type { PersonWithAliases } from "@/lib/people/types";
import type {
  ReceiptLine,
  ReceiptLineShare,
  ReceiptParticipantWithPerson,
} from "@/lib/types/receipt";

/**
 * The split UI: who is on a receipt, what each of them owes on each line, and
 * what is left for the owner.
 *
 * The owner is never a chip and never a participant. His portion is the
 * remainder, computed here with the same functions the API uses, so the screen
 * cannot disagree with the balances page about what a line is worth.
 */

/** First name only where it is unambiguous — chips are small. */
function shortName(full: string, all: string[]): string {
  const first = full.split(" ")[0];
  const clashes = all.filter((n) => n.split(" ")[0] === first).length > 1;
  return clashes ? full : first;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// ---------------------------------------------------------------- participants

/**
 * The strip of people on this receipt, plus the search box that adds one.
 *
 * Search runs over the people already loaded rather than round-tripping per
 * keystroke: the list is small, and aliases have to be searched alongside
 * names, which the people endpoint returns in the same payload.
 */
export function ParticipantsStrip({
  participants,
  onAdd,
  onRemove,
  busy,
}: {
  participants: ReceiptParticipantWithPerson[];
  onAdd: (personId: string) => void;
  onRemove: (personId: string) => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = useApi<{ people?: PersonWithAliases[] }>("/api/people");

  const people = useMemo<PersonWithAliases[]>(
    () => (Array.isArray(data?.people) ? data.people : []),
    [data],
  );

  const already = useMemo(
    () => new Set(participants.map((p) => p.person_id)),
    [participants],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return people
      .filter((p) => !already.has(p.id))
      .filter((p) => {
        const names = [p.first_name, p.last_name, p.display_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (names.includes(q)) return true;
        return (p.aliases ?? []).some((a) => a.alias.toLowerCase().includes(q));
      })
      .slice(0, 6);
  }, [people, query, already]);

  function label(p: PersonWithAliases): string {
    if (p.display_name?.trim()) return p.display_name.trim();
    return [p.first_name, p.last_name].filter(Boolean).join(" ");
  }

  return (
    <div className="flex flex-col gap-2 rounded-v2-md border border-hairline bg-surface-1 px-4 py-3">
      <Mono className="text-[9px] tracking-[0.18em] text-loam-3">SPLIT WITH</Mono>

      <div className="flex items-center gap-2 flex-wrap">
        {participants.length === 0 && (
          <span className="text-[11px] text-loam-3 italic font-[family-name:var(--font-display)]">
            Nobody yet — the whole receipt is yours.
          </span>
        )}
        {participants.map((p) => (
          <span
            key={p.person_id}
            className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-v2-sm border border-hairline bg-surface-2 text-[11px] text-loam-4"
          >
            {p.display_name}
            {p.default_share_pct !== null && (
              <Mono className="text-[9px] text-loam-3">
                {Number(p.default_share_pct)}%
              </Mono>
            )}
            <button
              type="button"
              onClick={() => onRemove(p.person_id)}
              disabled={busy}
              aria-label={`Remove ${p.display_name} from this receipt`}
              title={`Remove ${p.display_name}. Their shares on every line go too.`}
              className="px-1 text-loam-3 hover:text-danger disabled:opacity-50 transition-colors"
            >
              ×
            </button>
          </span>
        ))}

        <div className="relative">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            placeholder="Add someone…"
            aria-label="Add a person to this receipt"
            disabled={busy}
            className="w-36 bg-transparent outline-none text-[11px] text-loam-4 placeholder:text-loam-3 border-b border-hairline focus:border-glow-dim px-1 py-1 disabled:opacity-50 transition-colors"
          />
          {open && matches.length > 0 && (
            <ul className="absolute z-30 left-0 top-full mt-1 min-w-44 rounded-v2-md border border-hairline bg-surface-3 shadow-xl overflow-hidden">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onAdd(p.id);
                      setQuery("");
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-loam-4 hover:bg-surface-2 transition-colors"
                  >
                    {label(p)}
                    {(p.aliases ?? []).length > 0 && (
                      <Mono className="ml-2 text-[9px] text-loam-3">
                        {p.aliases[0].alias}
                      </Mono>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- popover

/**
 * Sets one person's share on one line explicitly, as a percentage or as a
 * count of units.
 *
 * The two are mutually exclusive by construction — picking a mode clears the
 * other field — because the stored row may hold exactly one of them.
 */
function SharePopover({
  personName,
  share,
  quantity,
  onApply,
  onClose,
}: {
  personName: string;
  share: ReceiptLineShare | null;
  quantity: number;
  onApply: (next: { share_pct: number | null; units: number | null }) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"pct" | "units">(
    share?.units !== null && share?.units !== undefined ? "units" : "pct",
  );
  const [value, setValue] = useState(() => {
    if (share?.units !== null && share?.units !== undefined) return String(share.units);
    if (share?.share_pct !== null && share?.share_pct !== undefined) {
      return String(share.share_pct);
    }
    return "";
  });
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function apply() {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    onApply(
      mode === "pct"
        ? { share_pct: Math.round(n * 100) / 100, units: null }
        : { share_pct: null, units: Math.round(n * 1000) / 1000 },
    );
  }

  return (
    <div
      ref={ref}
      className="absolute z-40 left-0 top-full mt-1 w-52 rounded-v2-md border border-hairline bg-surface-3 shadow-xl p-3 flex flex-col gap-2"
    >
      <Mono className="text-[9px] tracking-[0.18em] text-loam-3">
        {personName.toUpperCase()}
      </Mono>

      <div className="flex gap-1">
        {(["pct", "units"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setValue("");
            }}
            className={`flex-1 px-2 py-1 rounded-v2-sm border text-[10px] uppercase tracking-[0.14em] font-[family-name:var(--font-mono)] transition-colors ${
              mode === m
                ? "border-glow-dim/40 bg-glow-wash text-glow"
                : "border-hairline bg-surface-2 text-loam-3 hover:text-loam-4"
            }`}
          >
            {m === "pct" ? "%" : "Units"}
          </button>
        ))}
      </div>

      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
        inputMode="decimal"
        placeholder={mode === "pct" ? "e.g. 50" : `of ${quantity}`}
        aria-label={mode === "pct" ? "Percentage of the line" : "Number of units"}
        className="w-full bg-surface-1 border border-hairline rounded-v2-sm px-2 py-1 text-[11px] text-loam-4 outline-none focus:border-glow-dim font-[family-name:var(--font-mono)] tabular-nums"
      />

      <div className="flex gap-1">
        <button
          type="button"
          onClick={apply}
          className="flex-1 px-2 py-1 rounded-v2-sm border border-hairline bg-surface-2 text-[10px] uppercase tracking-[0.14em] font-[family-name:var(--font-mono)] text-loam-4 hover:bg-surface-1 transition-colors"
        >
          Set
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 rounded-v2-sm text-[10px] uppercase tracking-[0.14em] font-[family-name:var(--font-mono)] text-loam-3 hover:text-loam-4 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- line shares

/**
 * One chip per participant, under the line it applies to.
 *
 * A plain click tags or untags at the receipt's default. A secondary click or
 * a long press opens the popover for an exact figure — the same affordance on
 * a mouse and on a phone, which has no contextmenu event of its own.
 */
export function LineShareChips({
  line,
  participants,
  shares,
  currency,
  onTag,
  onUntag,
  onSetShare,
  busy,
}: {
  line: ReceiptLine;
  participants: ReceiptParticipantWithPerson[];
  shares: ReceiptLineShare[];
  currency: string;
  onTag: (personId: string) => void;
  onUntag: (personId: string) => void;
  onSetShare: (
    personId: string,
    next: { share_pct: number | null; units: number | null },
  ) => void;
  busy: boolean;
}) {
  const [popoverFor, setPopoverFor] = useState<string | null>(null);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const lineTotal = Number(line.line_total) || 0;
  const quantity = Number(line.quantity) || 0;
  const shareByPerson = useMemo(
    () => new Map(shares.map((s) => [s.person_id, s])),
    [shares],
  );
  const allNames = useMemo(
    () => participants.map((p) => p.display_name),
    [participants],
  );

  const remainder = ownerRemainder(
    shares.map((s) => ({
      person_id: s.person_id,
      share_pct: s.share_pct === null ? null : Number(s.share_pct),
      units: s.units === null ? null : Number(s.units),
    })),
    lineTotal,
    quantity,
  );

  if (participants.length === 0) return null;

  function cancelPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap pt-1">
      {participants.map((p) => {
        const share = shareByPerson.get(p.person_id) ?? null;
        const tagged = share !== null;
        const amount = share
          ? shareAmount(
              {
                person_id: p.person_id,
                share_pct: share.share_pct === null ? null : Number(share.share_pct),
                units: share.units === null ? null : Number(share.units),
              },
              lineTotal,
              quantity,
            )
          : 0;

        return (
          <div key={p.person_id} className="relative">
            <button
              type="button"
              disabled={busy}
              onContextMenu={(e) => {
                e.preventDefault();
                setPopoverFor(p.person_id);
              }}
              onPointerDown={() => {
                longPressed.current = false;
                cancelPress();
                pressTimer.current = window.setTimeout(() => {
                  longPressed.current = true;
                  setPopoverFor(p.person_id);
                }, 500);
              }}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onClick={() => {
                // A long press has already opened the popover; the click that
                // ends it must not also toggle the tag.
                if (longPressed.current) {
                  longPressed.current = false;
                  return;
                }
                if (tagged) onUntag(p.person_id);
                else onTag(p.person_id);
              }}
              title={
                tagged
                  ? `${p.display_name} — click to remove, long press or right-click to set an exact share`
                  : `Tag ${p.display_name} on this line`
              }
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-v2-sm border text-[10px] select-none disabled:opacity-50 transition-colors ${
                tagged
                  ? "border-glow-dim/40 bg-glow-wash text-glow"
                  : "border-hairline bg-surface-2 text-loam-3 hover:text-loam-4"
              }`}
            >
              <span className="font-[family-name:var(--font-mono)]">
                {initials(p.display_name)}
              </span>
              <span>{shortName(p.display_name, allNames)}</span>
              {tagged && (
                <>
                  <Mono className="text-[9px] opacity-80">
                    {share!.units !== null
                      ? `${Number(share!.units)}u`
                      : `${Number(share!.share_pct)}%`}
                  </Mono>
                  <span className="tabular-nums">
                    <Money value={amount} format="balance" currency={currency} />
                  </span>
                </>
              )}
            </button>

            {popoverFor === p.person_id && (
              <SharePopover
                personName={p.display_name}
                share={share}
                quantity={quantity}
                onApply={(next) => {
                  onSetShare(p.person_id, next);
                  setPopoverFor(null);
                }}
                onClose={() => setPopoverFor(null)}
              />
            )}
          </div>
        );
      })}

      {shares.length > 0 && (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-v2-sm border border-hairline bg-surface-1 text-[10px] text-loam-3">
          <Mono className="text-[9px]">YOURS</Mono>
          <span className="tabular-nums">
            <Money value={remainder} format="balance" currency={currency} />
          </span>
        </span>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- footer

/**
 * Per-person totals for this receipt, with the owner's remainder alongside.
 *
 * Totalled from the same per-line arithmetic rather than from a stored figure,
 * so it always agrees with the chips above it.
 */
export function SplitFooter({
  lines,
  participants,
  shares,
  currency,
}: {
  lines: ReceiptLine[];
  participants: ReceiptParticipantWithPerson[];
  shares: ReceiptLineShare[];
  currency: string;
}) {
  const totals = useMemo(() => {
    const sharesByLine = new Map<string, ReceiptLineShare[]>();
    for (const s of shares) {
      const list = sharesByLine.get(s.receipt_line_id) ?? [];
      list.push(s);
      sharesByLine.set(s.receipt_line_id, list);
    }

    const byPerson = new Map<string, number>();
    let owner = 0;

    for (const line of lines) {
      const lineTotal = Number(line.line_total) || 0;
      const quantity = Number(line.quantity) || 0;
      const lineShares = (sharesByLine.get(line.id) ?? []).map((s) => ({
        person_id: s.person_id,
        share_pct: s.share_pct === null ? null : Number(s.share_pct),
        units: s.units === null ? null : Number(s.units),
      }));

      for (const s of lineShares) {
        byPerson.set(
          s.person_id,
          (byPerson.get(s.person_id) ?? 0) + shareAmount(s, lineTotal, quantity),
        );
      }
      owner += ownerRemainder(lineShares, lineTotal, quantity);
    }

    return { byPerson, owner: Math.round(owner * 100) / 100 };
  }, [lines, shares]);

  if (participants.length === 0) return null;

  return (
    <div className="flex items-center gap-5 flex-wrap rounded-v2-md border border-hairline bg-surface-1 px-4 py-3">
      <Mono className="text-[9px] tracking-[0.18em] text-loam-3">THIS RECEIPT</Mono>
      {participants.map((p) => (
        <div key={p.person_id} className="flex flex-col">
          <Mono className="text-[9px] tracking-[0.14em] text-loam-3">
            {p.display_name.toUpperCase()}
          </Mono>
          <span className="text-sm tabular-nums text-loam-4">
            <Money
              value={Math.round((totals.byPerson.get(p.person_id) ?? 0) * 100) / 100}
              format="balance"
              currency={currency}
            />
          </span>
        </div>
      ))}
      <div className="flex flex-col">
        <Mono className="text-[9px] tracking-[0.14em] text-loam-3">YOURS</Mono>
        <span className="text-sm tabular-nums text-loam-4">
          <Money value={totals.owner} format="balance" currency={currency} />
        </span>
      </div>
    </div>
  );
}
