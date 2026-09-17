"use client";

import { useState } from "react";
import { useApi } from "@/lib/data/useApi";

type TokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: { projects: string[]; verbs: string[]; routes: string[] };
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

const KEY = "/api/settings/api-tokens";

/**
 * Settings → Security → API tokens (tickets spec §14.4): create (shown
 * once), revoke, last used. Scopes: project prefixes, read/write, route
 * families. The `tix` CLI and the Claude Code skill use these.
 */
export function ApiTokensCard() {
  const { data, mutate } = useApi<{ tokens: TokenRow[] }>(KEY);
  const [name, setName] = useState("");
  const [projects, setProjects] = useState("MYC");
  const [write, setWrite] = useState(true);
  const [minted, setMinted] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tokens = (data?.tokens ?? []).filter((t) => !t.revoked_at);

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          scopes: {
            projects: projects.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
            verbs: write ? ["read", "write"] : ["read"],
            routes: ["tickets"],
          },
        }),
      });
      const j = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !j.token) throw new Error(j.error ?? `failed (${res.status})`);
      setMinted(j.token);
      setName("");
      await mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this token? Anything using it stops working immediately.")) return;
    await fetch(`${KEY}?id=${id}`, { method: "DELETE" });
    await mutate();
  }

  return (
    <section className="rounded-v2-lg border border-hairline bg-surface-1 p-4">
      <h3 className="text-[11px] uppercase tracking-[0.14em] text-ink-3">API tokens</h3>
      <p className="mt-1 text-[12px] text-ink-3">
        For the <code>tix</code> CLI and Claude Code. Sent as <code>Authorization: Bearer mtk_…</code>; scoped to route
        families and project prefixes. The value is shown once.
      </p>

      {minted && (
        <div className="mt-3 rounded-sm border border-ok/40 bg-ok/5 p-3 text-sm">
          <div className="text-[11px] uppercase tracking-[0.12em] text-ok">Copy it now — it will not be shown again</div>
          <code className="mt-1 block break-all font-[family-name:var(--font-mono)] text-[12px] text-text-0">{minted}</code>
          <div className="mt-2 text-[11px] text-ink-3">
            Put it in your shell as <code>MYCELIUM_TICKETS_TOKEN</code> with <code>MYCELIUM_URL=https://mycelium.sporebit.com</code>.
          </div>
          <button type="button" onClick={() => setMinted(null)} className="mt-2 text-[11px] text-ink-3 hover:text-ink-4">
            done
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-ink-3">
          name
          <input className="rounded-sm bg-ink-2 px-2 py-1 text-sm text-text-0" value={name} onChange={(e) => setName(e.target.value)} placeholder="claude-code on the PC" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ink-3">
          projects (prefixes, comma)
          <input className="w-36 rounded-sm bg-ink-2 px-2 py-1 text-sm text-text-0" value={projects} onChange={(e) => setProjects(e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-[11px] text-ink-3">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} /> write
        </label>
        <button type="button" disabled={busy || !name.trim()} onClick={() => void create()} className="rounded-sm bg-glow-2/20 px-3 py-1 text-sm text-glow-2 disabled:opacity-40">
          Create
        </button>
        {err && <span className="text-[11px] text-danger">{err}</span>}
      </div>

      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {tokens.length === 0 && <li className="text-[12px] text-ink-3">No tokens yet.</li>}
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-sm border border-hairline px-3 py-1.5">
            <span className="text-text-0">{t.name}</span>
            <code className="font-[family-name:var(--font-mono)] text-[11px] text-ink-3">mtk_{t.token_prefix}…</code>
            <span className="text-[11px] text-ink-3">
              {t.scopes.projects.length ? t.scopes.projects.join(",") : "all projects"} · {t.scopes.verbs.join("/")}
            </span>
            <span className="ml-auto text-[11px] text-ink-3">
              {t.last_used_at ? `used ${new Date(t.last_used_at).toLocaleDateString("en-GB")}` : "never used"}
            </span>
            <button type="button" onClick={() => void revoke(t.id)} className="text-[11px] text-ink-3 hover:text-danger">
              revoke
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
