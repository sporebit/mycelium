"use client";

import { useState } from "react";
import { useApi } from "@/lib/data/useApi";
import type { Teammate } from "@/lib/daylog/linked";

type Payload = { linked: Teammate | null; linked_at: string | null; candidates: Teammate[] };
const tiny = "text-[10px] font-[family-name:var(--font-mono)] tracking-[0.1em] disabled:opacity-50";

/**
 * Link / unlink a People row to a Mycelium user (daylog spec §5, decision
 * 26). Only teammates are offered — sharing a team is the consent step
 * (flag 3). Once linked, that user sees the scenes this person was in on
 * their own day pages; never a fact.
 */
export function LinkControl({ personId }: { personId: string }) {
  const key = `/api/people/${personId}/link`;
  const { data, mutate, error } = useApi<Payload>(key);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const act = async (method: "POST" | "DELETE", body?: unknown) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(key, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `${r.status}`);
      }
      setOpen(false);
      setPick("");
      await mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  if (error || !data) return null;
  const name = (t: Teammate) => t.display_name ?? `${t.user_id.slice(0, 8)}…`;

  return (
    <div className="flex flex-col items-end gap-1">
      {data.linked ? (
        <div className="flex items-center gap-2 text-xs text-text-2">
          <span title="They see the scenes this person was in on their own day pages — dates, places, names, the scene line. Never a fact.">
            Linked to <span className="text-text-0">{name(data.linked)}</span>
          </span>
          <button type="button" className={`${tiny} text-text-2 hover:text-warn`} disabled={busy} onClick={() => void act("DELETE")}>
            UNLINK
          </button>
        </div>
      ) : data.candidates.length === 0 ? (
        <span className="text-[11px] text-text-2" title="Linking needs a shared team — invite them to one first.">
          No teammates to link
        </span>
      ) : open ? (
        <div className="flex items-center gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="bg-ink-2 rounded-sm text-xs text-text-0 px-2 py-1" aria-label="Teammate">
            <option value="">— teammate —</option>
            {data.candidates.map((c) => (
              <option key={c.user_id} value={c.user_id}>
                {name(c)} · {c.teams.join(", ")}
              </option>
            ))}
          </select>
          <button type="button" className={`${tiny} text-glow-1`} disabled={busy || !pick} onClick={() => void act("POST", { user_id: pick })}>
            LINK
          </button>
          <button type="button" className={`${tiny} text-text-2`} onClick={() => setOpen(false)}>
            CANCEL
          </button>
        </div>
      ) : (
        <button type="button" className={`${tiny} text-text-2 hover:text-text-0`} onClick={() => setOpen(true)} title="Let this person, as a Mycelium user, see the scenes they were in">
          LINK TO A TEAMMATE
        </button>
      )}
      {err && <span className="text-xs text-error">{err}</span>}
    </div>
  );
}
