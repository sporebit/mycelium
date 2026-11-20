"use client";

import { useState } from "react";
import { useApi } from "@/lib/data/useApi";

type Wall = { id: string; label: string; team_name: string | null; paired_at: string | null; pairing_open: boolean };
type Space = { id: string; label: string };

const KEY = "/api/settings/walls";

/**
 * Settings → Security → Walls (master run §11): add a wall to a team's
 * space, get its pairing code (shown once, good for ten minutes), re-pair
 * a frame, revoke one. A wall is a household device in the team: it sees
 * what any member sees and nothing of anyone's own.
 */
export function WallsCard() {
  const { data, mutate } = useApi<{ walls: Wall[] }>(KEY);
  const { data: fam } = useApi<{ family: { space_id: string } | null; candidates?: Space[] }>("/api/family");
  const [label, setLabel] = useState("Kitchen");
  const [space, setSpace] = useState("");
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const walls = data?.walls ?? [];
  // The family space first; any other team space after it.
  const spaces: Space[] = [...(fam?.family ? [{ id: fam.family.space_id, label: "Family" }] : []), ...(fam?.candidates ?? [])];
  const chosen = space || spaces[0]?.id || "";

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(KEY, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json()) as { code?: string; expires_at?: string; error?: string };
      if (!res.ok || !j.code) throw new Error(j.error ?? `failed (${res.status})`);
      setCode({ code: j.code, expires_at: j.expires_at ?? "" });
      await mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this wall? It goes dark at its next refresh.")) return;
    await fetch(`${KEY}?id=${id}`, { method: "DELETE" });
    await mutate();
  }

  return (
    <section className="rounded-lg border border-hairline p-4 flex flex-col gap-3" aria-labelledby="walls-title">
      <h2 id="walls-title" className="text-xs font-semibold tracking-wider text-text-lo">
        WALLS
      </h2>
      <p className="text-sm text-text-mid">A screen on the kitchen wall. It joins a team as a household device: it shows what the family shares, and a person&apos;s own day only after their quick unlock.</p>
      {code ? (
        <div className="rounded-md border border-hairline p-3 flex flex-col gap-1">
          <div className="text-sm text-text-mid">Type this on the wall within ten minutes. It is shown once.</div>
          <div className="font-[family-name:var(--font-mono)] text-3xl tracking-[0.3em] text-text-hi">{code.code}</div>
          <button type="button" onClick={() => setCode(null)} className="self-start text-xs text-text-lo underline">
            Done
          </button>
        </div>
      ) : null}
      {walls.length ? (
        <ul className="flex flex-col divide-y divide-hairline">
          {walls.map((w) => (
            <li key={w.id} className="py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-hi truncate">{w.label}</div>
                <div className="text-xs text-text-lo">
                  {w.team_name ?? "team"} · {w.paired_at ? `paired ${new Date(w.paired_at).toLocaleDateString("en-GB")}` : w.pairing_open ? "code open" : "not paired"}
                </div>
              </div>
              <button type="button" disabled={busy} onClick={() => void post({ action: "pair", id: w.id })} className="text-xs text-text-mid underline disabled:opacity-50">
                New code
              </button>
              <button type="button" disabled={busy} onClick={() => void revoke(w.id)} className="text-xs text-danger underline disabled:opacity-50">
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-text-lo">No walls yet.</div>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (chosen) void post({ space_id: chosen, label });
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-text-lo">
          Name
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} className="rounded-md border border-hairline bg-transparent px-2 py-1 text-sm text-text-hi" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-lo">
          Team
          <select value={chosen} onChange={(e) => setSpace(e.target.value)} className="rounded-md border border-hairline bg-transparent px-2 py-1 text-sm text-text-hi">
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy || !chosen} className="rounded-md border border-hairline px-3 py-1 text-sm text-text-hi disabled:opacity-50">
          Add wall
        </button>
      </form>
      {!spaces.length ? <div className="text-xs text-text-lo">A wall needs a team. Set the family up first (Family → set up), or make a team.</div> : null}
      {err ? <div className="text-xs text-danger">{err}</div> : null}
    </section>
  );
}
