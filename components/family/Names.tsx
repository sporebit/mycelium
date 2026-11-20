"use client";

/**
 * Name ideas with voting. Either of you adds a name; each of you says love,
 * like or not this one, and changes your mind as often as you want. The
 * names you both like rise to the top. A vote is yours alone to cast or
 * take back (the database refuses anyone else's hand on it).
 */
import { useState } from "react";
import { Button } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { INPUT, send, type NameRow, type Overview } from "./api";

const VOTES = [
  { value: 2, label: "Love" },
  { value: 1, label: "Like" },
  { value: -1, label: "Not this one" },
] as const;

export function Names({ family }: { family: Overview }) {
  const { data, mutate } = useApi<{ names: NameRow[] }>("/api/family/names");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = family.members.filter((m) => !m.me);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const said = (n: NameRow, voter: string) => VOTES.find((v) => v.value === n.votes.find((x) => x.voter_id === voter)?.vote)?.label ?? null;

  return (
    <div className="flex flex-col gap-4" data-testid="family-names">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void act(async () => {
            await send("POST", "/api/family/names", { name });
            setName("");
          });
        }}
      >
        <input className={`${INPUT} flex-1`} aria-label="A name" placeholder="A name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
          Add
        </Button>
      </form>
      {error ? <p role="alert" className="text-sm text-v2-error">{error}</p> : null}

      {data && data.names.length === 0 ? <p className="text-sm text-text-mid">No names yet. Add the first one above.</p> : null}
      <ul className="flex flex-col gap-2">
        {(data?.names ?? []).map((n) => (
          <li key={n.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-v2-lg border px-4 py-3 ${n.everyone ? "border-glow" : "border-hairline"} bg-surface-1`} data-testid="name-row">
            <div className="min-w-[8rem] flex-1">
              <span className="text-base text-text-hi">{n.name}</span>
              {n.everyone ? <span className="ml-2 text-[11px] uppercase tracking-[0.08em] text-glow">you both like it</span> : null}
              {others.map((o) => (said(n, o.id) ? <span key={o.id} className="ml-2 text-xs text-text-lo">{o.name}: {said(n, o.id)}</span> : null))}
            </div>
            <div className="flex gap-1" role="group" aria-label={`Your vote on ${n.name}`}>
              {VOTES.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  aria-pressed={n.mine === v.value}
                  disabled={busy}
                  onClick={() => void act(() => send("POST", `/api/family/names/${n.id}/vote`, { vote: n.mine === v.value ? null : v.value }))}
                  className={`min-h-[36px] rounded-v2-md border px-3 text-xs ${n.mine === v.value ? "border-glow text-glow" : "border-hairline text-text-mid hover:text-text-hi"}`}
                >
                  {v.label}
                </button>
              ))}
              <button type="button" className="ml-1 px-2 text-xs text-text-lo underline hover:text-text-hi" disabled={busy} aria-label={`Remove ${n.name}`} onClick={() => void act(() => send("DELETE", `/api/family/names/${n.id}`))}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
