"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Mono } from "@/components/dashboard/Mono";
import { ticketFetch } from "@/components/tickets/pickers";
import { canConvert } from "@/lib/gifts/convert";
import { money } from "@/lib/gifts/money";
import { GIFT_FLOW, type GiftCommentRow, type GiftRow, type GiftStatus, type OccasionRow } from "@/lib/gifts/types";
import { fmtDay, StatusBadge } from "./GiftCard";

export type PersonOption = { id: string; name: string };

const input = "w-full bg-surface-2 rounded-sm text-sm text-text-hi px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2";
const btn = "px-3 py-1.5 rounded-sm border border-text-hi text-xs text-text-mid hover:text-text-hi hover:bg-surface-2 font-[family-name:var(--font-mono)] tracking-[0.1em] disabled:opacity-50";

function fromGift(g: GiftRow) {
  return {
    title: g.title,
    for_person_id: g.for_person_id ?? "",
    for_label: g.for_label ?? "",
    occasion_id: g.occasion_id ?? "",
    needed_by: g.needed_by ?? "",
    reason: g.reason ?? "",
    description: g.description ?? "",
    url: g.url ?? "",
    retailer: g.retailer ?? "",
    category: g.category ?? "",
    target_price: g.target_price === null ? "" : String(g.target_price),
    paid_amount: g.paid_amount === null ? "" : String(g.paid_amount),
  };
}

/** Detail (spec §10): every editable field, the status moved in place, Buy this, Reject with a reason, the notes thread and the raw transcript. */
export function GiftSheet({ gift, people, occasions, onClose, onChanged, onDeleted }: { gift: GiftRow | null; people: PersonOption[]; occasions: OccasionRow[]; onClose: () => void; onChanged: (g: GiftRow) => void; onDeleted: (id: string) => void }) {
  return (
    <Sheet open={!!gift} onClose={onClose} title="Gift idea">
      {gift && <GiftSheetBody key={gift.id} gift={gift} people={people} occasions={occasions} onClose={onClose} onChanged={onChanged} onDeleted={onDeleted} />}
    </Sheet>
  );
}

function GiftSheetBody({ gift, people, occasions, onClose, onChanged, onDeleted }: { gift: GiftRow; people: PersonOption[]; occasions: OccasionRow[]; onClose: () => void; onChanged: (g: GiftRow) => void; onDeleted: (id: string) => void }) {
  const [draft, setDraft] = useState(() => fromGift(gift));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [comments, setComments] = useState<GiftCommentRow[] | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let on = true;
    fetch(`/api/gifts/${gift.id}/comments`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { comments: [] }))
      .then((j: { comments?: GiftCommentRow[] }) => on && setComments(j.comments ?? []))
      .catch(() => on && setComments([]));
    return () => {
      on = false;
    };
  }, [gift.id]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const r = (await fn()) as { gift?: GiftRow };
      if (r?.gift) onChanged({ ...r.gift, comment_count: gift.comment_count });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const save = () =>
    run(() =>
      ticketFetch(`/api/gifts/${gift.id}`, {
        method: "PATCH",
        body: {
          title: draft.title,
          for_person_id: draft.for_person_id || null,
          for_label: draft.for_person_id ? null : draft.for_label || null,
          occasion_id: draft.occasion_id || null,
          needed_by: draft.needed_by || null,
          reason: draft.reason || null,
          description: draft.description || null,
          url: draft.url || null,
          retailer: draft.retailer || null,
          category: draft.category || null,
          target_price: num(draft.target_price),
          paid_amount: num(draft.paid_amount),
        },
      }),
    );
  const setStatus = (status: GiftStatus, extra: Record<string, unknown> = {}) => run(() => ticketFetch(`/api/gifts/${gift.id}`, { method: "PATCH", body: { status, ...extra } }));
  const buy = () => run(() => ticketFetch(`/api/gifts/${gift.id}/convert`, { method: "POST" }));
  const del = async () => {
    if (!window.confirm("Delete this gift idea? Rejecting keeps it as a record; deleting does not.")) return;
    setBusy(true);
    try {
      await ticketFetch(`/api/gifts/${gift.id}`, { method: "DELETE" });
      onDeleted(gift.id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };
  const addNote = async () => {
    const body = note.trim();
    if (!body) return;
    setBusy(true);
    try {
      const r = await ticketFetch<{ comment: GiftCommentRow }>(`/api/gifts/${gift.id}/comments`, { method: "POST", body: { body } });
      setComments((cur) => [...(cur ?? []), r.comment]);
      setNote("");
      onChanged({ ...gift, comment_count: (gift.comment_count ?? 0) + 1 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const nextStatus = GIFT_FLOW[GIFT_FLOW.indexOf(gift.status) + 1] ?? null;
  const cannotBuy = canConvert(gift);

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="gift-sheet">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={gift.status} />
        <Mono className="text-[10px] text-text-lo">
          {gift.origin} · added {fmtDay(gift.created_at)}
          {gift.given_at ? ` · given ${fmtDay(gift.given_at)}` : gift.paid_at ? ` · bought ${fmtDay(gift.paid_at)}` : ""}
        </Mono>
        {gift.purchase_id && (
          <a href={`/organisation/purchases?focus=${gift.purchase_id}`} className="text-[10px] text-glow-2 hover:underline font-[family-name:var(--font-mono)]">
            purchase →
          </a>
        )}
      </div>
      <label className="flex flex-col gap-1">
        <span className="card-eyebrow">Gift</span>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={`${input} font-[family-name:var(--font-display)] text-lg`} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">For</span>
          <select value={draft.for_person_id} onChange={(e) => setDraft({ ...draft, for_person_id: e.target.value })} className={input}>
            <option value="">{draft.for_label ? `“${draft.for_label}” (not in People)` : "— nobody yet —"}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {!draft.for_person_id && (
          <label className="flex flex-col gap-1">
            <span className="card-eyebrow">Or a name</span>
            <input value={draft.for_label} onChange={(e) => setDraft({ ...draft, for_label: e.target.value })} placeholder="when they are not in People" className={input} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Occasion</span>
          <select value={draft.occasion_id} onChange={(e) => setDraft({ ...draft, occasion_id: e.target.value })} className={input}>
            <option value="">— none —</option>
            {occasions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {fmtDay(o.occurs_on)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Needed by</span>
          <input type="date" value={draft.needed_by} onChange={(e) => setDraft({ ...draft, needed_by: e.target.value })} className={input} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="card-eyebrow">Why it suits them</span>
          <input value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} placeholder="he said…, she's always…" className={input} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="card-eyebrow">Link</span>
          <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://" className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Target price</span>
          <input type="number" min={0} step={0.01} value={draft.target_price} onChange={(e) => setDraft({ ...draft, target_price: e.target.value })} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Paid</span>
          <input type="number" min={0} step={0.01} value={draft.paid_amount} onChange={(e) => setDraft({ ...draft, paid_amount: e.target.value })} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Retailer</span>
          <input value={draft.retailer} onChange={(e) => setDraft({ ...draft, retailer: e.target.value })} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="card-eyebrow">Category</span>
          <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="books, kitchen…" className={input} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="card-eyebrow">Description</span>
          <textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={`${input} resize-y`} />
        </label>
      </div>
      {gift.raw_text && (
        <div>
          <div className="card-eyebrow mb-1">As captured</div>
          <div className="rounded-sm border border-surface-2 bg-surface-0/40 px-3 py-2 text-xs text-text-lo whitespace-pre-wrap">{gift.raw_text}</div>
        </div>
      )}
      {gift.rejected_reason && <div className="text-xs text-text-lo">Rejected: {gift.rejected_reason}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => void save()} disabled={busy || !draft.title.trim()}>
          SAVE
        </button>
        {gift.status === "idea" && (
          <button type="button" className={btn} onClick={() => void setStatus("shortlisted")} disabled={busy}>
            SHORTLIST
          </button>
        )}
        {gift.status === "shortlisted" && (
          <button type="button" className={btn} onClick={() => void buy()} disabled={busy || !!cannotBuy} title={cannotBuy ?? "Make it a shopping-list purchase and mark it bought"}>
            BUY THIS
          </button>
        )}
        {gift.status === "shortlisted" && (
          <button type="button" className={btn} onClick={() => void setStatus("bought")} disabled={busy} title="Bought elsewhere; no purchase row">
            MARK BOUGHT
          </button>
        )}
        {gift.status === "bought" && (
          <button type="button" className={btn} onClick={() => void setStatus("given")} disabled={busy}>
            GIVEN
          </button>
        )}
        {gift.status === "rejected" && (
          <button type="button" className={btn} onClick={() => void setStatus("idea", { rejected_reason: null })} disabled={busy}>
            BACK TO IDEAS
          </button>
        )}
        {nextStatus && gift.status !== "rejected" && gift.status !== "bought" && gift.status !== "given" && (
          <button type="button" className={`${btn} hover:border-warn/60 hover:text-warn`} onClick={() => setRejecting((v) => !v)} disabled={busy}>
            REJECT
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className={`${btn} hover:border-error/60 hover:text-error`} onClick={() => void del()} disabled={busy}>
          DELETE
        </button>
      </div>
      {rejecting && (
        <div className="flex items-center gap-2">
          <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="why not (kept so it is not suggested again)" className={input} autoFocus />
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={() => {
              setRejecting(false);
              void setStatus("rejected", { rejected_reason: rejectReason || null });
            }}
          >
            CONFIRM
          </button>
        </div>
      )}
      {err && <div className="text-xs text-error">{err}</div>}
      {gift.target_price !== null && gift.paid_amount !== null && gift.paid_amount > gift.target_price && (
        <div className="text-xs text-warn">
          Paid {money(gift.paid_amount, gift.currency)} against a target of {money(gift.target_price, gift.currency)}.
        </div>
      )}

      <div className="rounded-md border border-surface-2 p-3 flex flex-col gap-2">
        <span className="card-eyebrow">Notes</span>
        {comments === null ? (
          <div className="text-xs text-text-lo italic">Loading…</div>
        ) : comments.length === 0 ? (
          <div className="text-xs text-text-lo italic">Nothing yet. Ideas evolve: a size, a colour, a better link.</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {comments.map((c) => (
              <li key={c.id} className="text-xs text-text-mid flex flex-col gap-0.5" data-testid="gift-comment">
                <span className="whitespace-pre-wrap">{c.body}</span>
                <Mono className="text-[10px] text-text-lo">{fmtDay(c.created_at)}</Mono>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note…"
            className={input}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addNote();
              }
            }}
          />
          <button type="button" className={btn} onClick={() => void addNote()} disabled={busy || !note.trim()}>
            ADD
          </button>
        </div>
      </div>
    </div>
  );
}
