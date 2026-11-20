"use client";

/**
 * Prep lists (nursery, hospital bag, buying list) as a sheet: every cell is
 * edited where it sits, Enter moves down, Tab moves across, and the row at
 * the bottom is always empty and ready for the next thing. Each list keeps
 * a running total: all of it, what is bought, what is still to buy.
 */
import { useRef, useState, type KeyboardEvent } from "react";

/** One row of the sheet: tick, what it is, price, link (wide screens), remove. */
const ROW = "grid grid-cols-[2rem_minmax(0,1fr)_4.5rem_1.75rem] items-center border-b border-hairline sm:grid-cols-[2rem_minmax(0,1fr)_6rem_13rem_4.5rem]";
import { Label } from "@/components/ui";
import { parsePounds, pounds } from "@/lib/family/money";
import { useApi } from "@/lib/data/useApi";
import { CELL, send, type ListItem, type ListTotals, type PrepList } from "./api";

type View = { lists: PrepList[]; totals: ListTotals };

const priceText = (p: number | null) => (p === null ? "" : (p / 100).toFixed(p % 100 === 0 ? 0 : 2));

function Totals({ t }: { t: ListTotals }) {
  return (
    <span className="text-xs text-text-mid" data-testid="list-totals">
      {t.bought} of {t.items} bought · {pounds(t.spent_pence)} spent · {pounds(t.left_pence)} still to buy
      {t.unpriced ? ` · ${t.unpriced} with no price yet` : ""}
    </span>
  );
}

function Row({ item, onSaved, onError }: { item: ListItem; onSaved: () => Promise<unknown>; onError: (m: string | null) => void }) {
  const [title, setTitle] = useState(item.title);
  const [price, setPrice] = useState(priceText(item.price_pence));
  const [link, setLink] = useState(item.link ?? "");

  const save = async (body: Record<string, unknown>) => {
    onError(null);
    try {
      await send("PATCH", `/api/family/list-items/${item.id}`, body);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "That did not save. Try again.");
    }
  };
  // Enter moves to the same column in the next row, as in a spreadsheet.
  const down = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const col = e.currentTarget.dataset.col;
    const rows = Array.from(e.currentTarget.closest("[data-sheet]")?.querySelectorAll<HTMLElement>(`[data-col="${col}"]`) ?? []);
    const next = rows[rows.indexOf(e.currentTarget) + 1] ?? document.querySelector<HTMLElement>(`[data-new-for="${item.list_id}"]`);
    e.currentTarget.blur();
    next?.focus();
  };

  return (
    <div role="row" className={`${ROW} ${item.bought ? "opacity-60" : ""}`} data-testid="list-item">
      <div className="text-center">
        <input type="checkbox" aria-label={`Bought: ${item.title}`} checked={item.bought} onChange={(e) => void save({ bought: e.target.checked })} className="h-4 w-4 accent-[var(--glow)]" />
      </div>
      <div>
        {/* a text area that grows with its words, so a long name wraps on a phone instead of being cut off */}
        <textarea data-col="title" rows={1} aria-label="What it is" className={`${CELL} block resize-none py-2 [field-sizing:content] ${item.bought ? "line-through" : ""}`} value={title} onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))} onKeyDown={down} onBlur={() => title.trim() && title.trim() !== item.title && void save({ title })} />
      </div>
      <div>
        <input
          data-col="price"
          aria-label={`Price of ${item.title}`}
          inputMode="decimal"
          placeholder="£"
          className={`${CELL} text-right`}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={down}
          onBlur={() => {
            const p = price.trim() === "" ? null : parsePounds(price);
            if (price.trim() !== "" && p === null) return onError("A price is an amount, like 12.50.");
            if (p !== item.price_pence) void save({ price_pence: p });
          }}
        />
      </div>
      <div className="hidden sm:block">
        <input data-col="link" aria-label={`Link for ${item.title}`} placeholder="https://" className={CELL} value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={down} onBlur={() => (link.trim() || null) !== item.link && void save({ link: link.trim() || null })} />
      </div>
      <div className="text-right">
        {item.link ? (
          <a href={item.link} target="_blank" rel="noreferrer" className="mr-2 hidden text-xs text-glow-2 hover:underline sm:inline">
            Open
          </a>
        ) : null}
        <button
          type="button"
          aria-label={`Remove ${item.title}`}
          className="text-xs text-text-lo hover:text-text-hi"
          onClick={() => {
            onError(null);
            void send("DELETE", `/api/family/list-items/${item.id}`)
              .then(onSaved)
              .catch((e: Error) => onError(e.message));
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function NewRow({ listId, onSaved, onError }: { listId: string; onSaved: () => Promise<unknown>; onError: (m: string | null) => void }) {
  const [title, setTitle] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const add = async () => {
    if (!title.trim()) return;
    onError(null);
    try {
      await send("POST", "/api/family/list-items", { list_id: listId, title });
      setTitle("");
      await onSaved();
      ref.current?.focus();
    } catch (e) {
      onError(e instanceof Error ? e.message : "That did not save. Try again.");
    }
  };
  return (
    <div role="row" className="grid grid-cols-[2rem_minmax(0,1fr)]">
      <div />
      <div>
        <input
          ref={ref}
          data-new-for={listId}
          aria-label="Add something to this list"
          placeholder="Add something, then Enter"
          className={CELL}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
        />
      </div>
    </div>
  );
}

export function PrepLists() {
  const { data, mutate } = useApi<View>("/api/family/list-items");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => mutate();

  return (
    <div className="flex flex-col gap-6" data-testid="prep-lists">
      {data ? (
        <p className="text-sm text-text-mid">
          Everything together: <span className="text-text-hi">{pounds(data.totals.total_pence)}</span> priced, {pounds(data.totals.spent_pence)} spent, {pounds(data.totals.left_pence)} still to buy.
        </p>
      ) : null}
      {error ? <p role="alert" className="text-sm text-v2-error">{error}</p> : null}
      {(data?.lists ?? []).map((l) => (
        <section key={l.id} aria-label={l.title} data-testid="prep-list">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <Label>{l.title}</Label>
            <Totals t={l.totals} />
          </div>
          <div role="table" aria-label={l.title} data-sheet>
            {l.items.map((i) => (
              <Row key={`${i.id}:${i.title}:${i.price_pence}:${i.link}`} item={i} onSaved={refresh} onError={setError} />
            ))}
            <NewRow listId={l.id} onSaved={refresh} onError={setError} />
          </div>
        </section>
      ))}
    </div>
  );
}
