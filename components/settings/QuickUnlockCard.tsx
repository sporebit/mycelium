"use client";

import { useState } from "react";
import { useApi } from "@/lib/data/useApi";

const KEY = "/api/settings/quick-unlock";

/**
 * Settings → Security → Quick unlock (master run §11): the PIN that opens
 * your own view on a wall for ten minutes. Not a password: it opens nothing
 * else, and only on a wall already paired into your family team.
 */
export function QuickUnlockCard() {
  const { data, mutate } = useApi<{ set: boolean }>(KEY);
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    if (pin !== again) return setMsg("The two do not match.");
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(KEY, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `failed (${res.status})`);
      setPin("");
      setAgain("");
      setMsg("Set.");
      await mutate();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Remove your quick unlock? The wall will no longer offer your view.")) return;
    await fetch(KEY, { method: "DELETE" });
    await mutate();
  }

  return (
    <section className="rounded-lg border border-hairline p-4 flex flex-col gap-3" aria-labelledby="quick-unlock-title">
      <h2 id="quick-unlock-title" className="text-xs font-semibold tracking-wider text-text-lo">
        QUICK UNLOCK
      </h2>
      <p className="text-sm text-text-mid">Four to eight digits for the wall. It opens your own day there for ten minutes and nothing else. {data?.set ? "One is set." : "None set yet."}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-text-lo">
          PIN
          <input type="password" inputMode="numeric" pattern="\d{4,8}" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} className="w-28 rounded-md border border-hairline bg-transparent px-2 py-1 text-sm text-text-hi" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-lo">
          Again
          <input type="password" inputMode="numeric" pattern="\d{4,8}" autoComplete="off" value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, "").slice(0, 8))} className="w-28 rounded-md border border-hairline bg-transparent px-2 py-1 text-sm text-text-hi" />
        </label>
        <button type="submit" disabled={busy || pin.length < 4} className="rounded-md border border-hairline px-3 py-1 text-sm text-text-hi disabled:opacity-50">
          {data?.set ? "Replace" : "Set"}
        </button>
        {data?.set ? (
          <button type="button" onClick={() => void remove()} className="text-xs text-danger underline">
            Remove
          </button>
        ) : null}
      </form>
      {msg ? (
        <div className="text-xs text-text-mid" role="status">
          {msg}
        </div>
      ) : null}
    </section>
  );
}
