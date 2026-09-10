"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Mono } from "@/components/dashboard/Mono";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

type User = {
  id: string; email: string | null; display_name: string | null; is_instance_owner: boolean;
  disabled_at: string | null; created_at: string; last_sign_in_at: string | null;
  teams: number; grants_given: number; grants_received: number;
};
type Team = { id: string; name: string; slug: string; owner_user_id: string; successor_user_id: string | null; created_at: string; members: number };
type Membership = { team_id: string; user_id: string; role: string; joined_at: string };
type Grant = { id: string; grantor_id: string; grantee_id: string; section: string; entity_groups: string[]; verbs: string[]; expires_at: string | null; revoked_at: string | null; created_at: string };
type Invite = { id: string; email: string; team_id: string | null; role: string; expires_at: string; accepted_at: string | null; invited_by: string; created_at: string };
type AuditEvent = {
  id: number; at: string; actor_id: string | null; principal: string; action: string; section: string | null;
  entity_group: string | null; subject_user_id: string | null; team_id: string | null; ip: string | null; meta: Record<string, unknown>;
};

const TABS = [
  { value: "users", label: "Users" },
  { value: "teams", label: "Teams" },
  { value: "grants", label: "Grants" },
  { value: "invites", label: "Invites" },
  { value: "audit", label: "Audit" },
];

const INPUT = "min-h-[36px] px-3 rounded-v2-md bg-surface-0 border border-hairline text-text-hi text-sm placeholder:text-text-lo focus:outline-none focus:border-glow";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; reason?: string };
  if (!res.ok) {
    if (res.status === 403 && body.reason === "reauth_required") {
      window.location.assign(`/other/settings/security?reauth=1&next=${encodeURIComponent("/admin")}`);
    }
    throw new Error(body.error ?? `${res.status}`);
  }
  return body;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—");

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-v2-md bg-surface-1 p-5">
      <Mono className="text-[11px] text-ink-3 tracking-[0.18em] mb-4 block">{title}</Mono>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

export function AdminConsole({ me }: { me: string }) {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filters, setFilters] = useState({ actor: "", subject: "", team: "", section: "", action: "", from: "", to: "" });
  const [msg, setMsg] = useState<string | null>(null);

  const names = new Map(users.map((u) => [u.id, u.display_name ?? u.email ?? u.id.slice(0, 8)]));
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const name = (id: string | null) => (id ? (names.get(id) ?? id.slice(0, 8)) : "—");

  const load = useCallback(async () => {
    const [u, t, g, i] = await Promise.all([
      api<{ users: User[] }>("/api/admin/users"),
      api<{ teams: Team[]; memberships: Membership[] }>("/api/admin/teams"),
      api<{ grants: Grant[] }>("/api/admin/grants"),
      api<{ invites: Invite[] }>("/api/admin/invites"),
    ]);
    setUsers(u.users);
    setTeams(t.teams);
    setMemberships(t.memberships);
    setGrants(g.grants);
    setInvites(i.invites);
  }, []);

  const loadAudit = useCallback(async () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    const { events } = await api<{ events: AuditEvent[] }>(`/api/admin/audit?${qs}`);
    setEvents(events);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
        if (cancelled) return;
        await loadAudit();
      } catch (e) {
        if (!cancelled) setMsg(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function run(fn: () => Promise<void>) {
    setMsg(null);
    try {
      await fn();
      await load();
      await loadAudit();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">Admin</h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Access, not content. Nothing here reads anyone&apos;s data.
        </p>
      </header>
      <SegmentedControl options={TABS} value={tab} onChange={setTab} ariaLabel="Admin area" />
      {msg && <p className="text-sm text-v2-error">{msg}</p>}

      {tab === "users" && (
        <Card title="USERS">
          <table className="text-sm w-full">
            <thead className="text-text-lo text-left">
              <tr><th className="font-normal pb-2">User</th><th className="font-normal pb-2">Email</th><th className="font-normal pb-2">Teams</th><th className="font-normal pb-2">Grants</th><th className="font-normal pb-2">Last sign-in</th><th className="font-normal pb-2">State</th><th /></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-hairline">
                  <td className="py-2 text-text-hi">{u.display_name ?? "—"}{u.is_instance_owner && <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-ok">owner</span>}</td>
                  <td className="py-2 text-text-mid">{u.email ?? "—"}</td>
                  <td className="py-2"><Mono>{u.teams}</Mono></td>
                  <td className="py-2"><Mono>{u.grants_given}↑ {u.grants_received}↓</Mono></td>
                  <td className="py-2"><Mono className="text-[11px] text-ink-3">{when(u.last_sign_in_at)}</Mono></td>
                  <td className="py-2">{u.disabled_at ? <span className="text-v2-error">disabled</span> : <span className="text-ok">active</span>}</td>
                  <td className="py-2 text-right">
                    {u.id !== me && (
                      <Button size="sm" variant={u.disabled_at ? "ghost" : "danger"} onClick={() => run(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ disabled: !u.disabled_at }) }))}>
                        {u.disabled_at ? "Enable" : "Disable"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "teams" && (
        <Card title="TEAMS">
          {teams.map((t) => {
            const ownerGone = !users.some((u) => u.id === t.owner_user_id && !u.disabled_at);
            const members = memberships.filter((m) => m.team_id === t.id);
            return (
              <div key={t.id} className="py-2 border-t border-hairline first:border-t-0 flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <span className="text-text-hi">{t.name}</span>
                  <Mono className="text-[11px] text-ink-3">{t.slug} · owner {name(t.owner_user_id)}{t.successor_user_id ? ` · successor ${name(t.successor_user_id)}` : ""}</Mono>
                  {ownerGone && <span className="text-[10px] uppercase tracking-[0.08em] text-v2-error">owner gone</span>}
                </div>
                <Mono className="text-[11px] text-ink-3">{members.map((m) => `${name(m.user_id)} (${m.role})`).join(", ") || "no members"}</Mono>
                {ownerGone && members.filter((m) => m.user_id !== t.owner_user_id).length > 0 && (
                  <div className="flex items-center gap-2">
                    <Label>Appoint successor</Label>
                    <select className={INPUT} defaultValue="" onChange={(e) => e.target.value && run(() => api(`/api/admin/teams/${t.id}/successor`, { method: "POST", body: JSON.stringify({ user_id: e.target.value }) }))}>
                      <option value="">— choose —</option>
                      {members.filter((m) => m.user_id !== t.owner_user_id).map((m) => <option key={m.user_id} value={m.user_id}>{name(m.user_id)} ({m.role})</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
          {teams.length === 0 && <p className="text-sm text-text-mid">No teams.</p>}
        </Card>
      )}

      {tab === "grants" && (
        <Card title="DIRECT GRANTS">
          {grants.map((g) => (
            <Mono key={g.id} className="text-[11px] text-ink-3 block py-1 border-t border-hairline first:border-t-0">
              {name(g.grantor_id)} → {name(g.grantee_id)} · {g.section}{g.entity_groups.length ? ` (${g.entity_groups.join(", ")})` : ""} · {g.verbs.join(", ")}
              {g.expires_at ? ` · until ${when(g.expires_at)}` : ""}{g.revoked_at ? ` · revoked ${when(g.revoked_at)}` : ""}
            </Mono>
          ))}
          {grants.length === 0 && <p className="text-sm text-text-mid">No grants.</p>}
        </Card>
      )}

      {tab === "invites" && (
        <Card title="INVITES">
          {invites.map((i) => (
            <Mono key={i.id} className="text-[11px] text-ink-3 block py-1 border-t border-hairline first:border-t-0">
              {i.email} · {i.team_id ? teamNames.get(i.team_id) ?? i.team_id.slice(0, 8) : "no team"} · {i.role} · by {name(i.invited_by)} ·{" "}
              {i.accepted_at ? `accepted ${when(i.accepted_at)}` : new Date(i.expires_at) < new Date() ? "expired" : `expires ${when(i.expires_at)}`}
            </Mono>
          ))}
          {invites.length === 0 && <p className="text-sm text-text-mid">No invites.</p>}
        </Card>
      )}

      {tab === "audit" && (
        <Card title="AUDIT">
          <div className="flex flex-wrap gap-2 items-end">
            {(["actor", "subject", "team"] as const).map((k) => (
              <div key={k} className="flex flex-col gap-1">
                <Label>{k}</Label>
                <select className={INPUT} value={filters[k]} onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))}>
                  <option value="">any</option>
                  {(k === "team" ? teams.map((t) => ({ id: t.id, label: t.name })) : users.map((u) => ({ id: u.id, label: name(u.id) }))).map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}
            {(["section", "action"] as const).map((k) => (
              <div key={k} className="flex flex-col gap-1">
                <Label>{k}</Label>
                <input className={INPUT} value={filters[k]} onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))} placeholder="any" />
              </div>
            ))}
            {(["from", "to"] as const).map((k) => (
              <div key={k} className="flex flex-col gap-1">
                <Label>{k}</Label>
                <input className={INPUT} type="datetime-local" value={filters[k]} onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value ? new Date(e.target.value).toISOString() : "" }))} />
              </div>
            ))}
            <Button size="sm" variant="primary" onClick={() => run(async () => {})}>Apply</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead className="text-text-lo text-left">
                <tr><th className="font-normal pb-1">When</th><th className="font-normal pb-1">Actor</th><th className="font-normal pb-1">Principal</th><th className="font-normal pb-1">Action</th><th className="font-normal pb-1">Subject</th><th className="font-normal pb-1">Section</th><th className="font-normal pb-1">Team</th><th className="font-normal pb-1">Meta</th></tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-hairline align-top">
                    <td className="py-1 pr-2 whitespace-nowrap"><Mono>{when(e.at)}</Mono></td>
                    <td className="py-1 pr-2">{name(e.actor_id)}</td>
                    <td className="py-1 pr-2">{e.principal}</td>
                    <td className="py-1 pr-2 text-text-hi">{e.action}</td>
                    <td className="py-1 pr-2">{name(e.subject_user_id)}</td>
                    <td className="py-1 pr-2">{e.section ?? ""}{e.entity_group ? `.${e.entity_group}` : ""}</td>
                    <td className="py-1 pr-2">{e.team_id ? teamNames.get(e.team_id) ?? e.team_id.slice(0, 8) : ""}</td>
                    <td className="py-1 text-ink-3"><Mono className="text-[10px] break-all">{JSON.stringify(e.meta)}</Mono></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {events.length === 0 && <p className="text-sm text-text-mid pt-2">No events match.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
