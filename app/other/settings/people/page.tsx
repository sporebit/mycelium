"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Mono } from "@/components/dashboard/Mono";
import {
  GROUPS_BY_SECTION,
  SHAREABLE_SECTIONS,
  VERBS,
  type Grant,
  type TeamDetail,
  type TeamMember,
  type TeamRole,
} from "@/lib/access/teams";
import { createBrowserClient } from "@/lib/supabase/client";

type TeamRow = { id: string; name: string; slug: string; owner_user_id: string; my_role: TeamRole | null };

const INPUT =
  "min-h-[40px] px-3 rounded-v2-md bg-surface-0 border border-hairline text-text-hi text-sm " +
  "placeholder:text-text-lo focus:outline-none focus:border-glow transition-colors";
const SELECT = INPUT + " pr-8";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-v2-md bg-surface-1 p-5">
      <Mono className="text-[11px] text-ink-3 tracking-[0.18em] mb-4 block">{title}</Mono>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Note({ children, tone = "mid" }: { children: React.ReactNode; tone?: "mid" | "error" | "ok" }) {
  const colour = tone === "error" ? "text-v2-error" : tone === "ok" ? "text-ok" : "text-text-mid";
  return <p className={`text-sm ${colour}`}>{children}</p>;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `${res.status}`);
  return body;
}

/**
 * Settings → People & teams. Teams (create, members, roles, section
 * toggles, invites, successor, leave), sharing my personal space with a
 * person (grants), and what others have shared with me. Every write is an
 * RPC into migration 0112's functions; this page only shows what RLS lets
 * the caller see. Finance and platform never appear anywhere here.
 */
export default function PeopleAndTeamsPage() {
  const [supabase] = useState(() => createBrowserClient());
  const [me, setMe] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [grants, setGrants] = useState<{ given: Grant[]; received: Grant[] }>({ given: [], received: [] });
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const loadTeams = useCallback(async () => {
    const { teams } = await api<{ teams: TeamRow[] }>("/api/teams");
    setTeams(teams);
    return teams;
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const { team } = await api<{ team: TeamDetail }>(`/api/teams/${id}`);
    setDetail(team);
  }, []);
  const loadGrants = useCallback(async () => {
    setGrants(await api<{ given: Grant[]; received: Grant[] }>("/api/grants"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setMe(data.user?.id ?? null);
      const list = await loadTeams();
      await loadGrants();
      if (cancelled) return;
      if (list.length > 0) {
        setSelected(list[0].id);
        await loadDetail(list[0].id);
      }
      setLoaded(true);
    })().catch((e) => setMsg({ tone: "error", text: String(e.message ?? e) }));
    return () => {
      cancelled = true;
    };
  }, [supabase, loadTeams, loadGrants, loadDetail]);

  async function select(id: string) {
    setSelected(id);
    setDetail(null);
    await loadDetail(id);
  }

  async function run(fn: () => Promise<void>, okText?: string) {
    setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ tone: "ok", text: okText });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }

  if (!loaded) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">People &amp; teams</h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Who can see what. Finance is never shared and never appears here.
        </p>
      </header>

      {msg && <Note tone={msg.tone}>{msg.text}</Note>}

      <TeamsCard
        teams={teams}
        selected={selected}
        onSelect={select}
        onCreate={(name) =>
          run(async () => {
            const { id } = await api<{ id: string }>("/api/teams", { method: "POST", body: JSON.stringify({ name }) });
            await loadTeams();
            await select(id);
          }, "Team created.")
        }
      />

      {selected && detail && me && (
        <TeamCard
          team={detail}
          me={me}
          refresh={() => loadDetail(detail.id)}
          run={run}
          onLeft={async () => {
            const list = await loadTeams();
            setSelected(list[0]?.id ?? null);
            setDetail(null);
            if (list[0]) await loadDetail(list[0].id);
          }}
        />
      )}

      <ShareCard given={grants.given} refresh={loadGrants} run={run} />
      <SharedWithMeCard received={grants.received} refresh={loadGrants} run={run} />
    </div>
  );
}

function TeamsCard({
  teams,
  selected,
  onSelect,
  onCreate,
}: {
  teams: TeamRow[];
  selected: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <Card title="TEAMS">
      {teams.length === 0 ? (
        <Note>You are not in a team yet.</Note>
      ) : (
        <div className="flex flex-wrap gap-2">
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              aria-current={t.id === selected ? "true" : undefined}
              className={`px-3 py-1.5 rounded-v2-md text-sm border transition-colors ${
                t.id === selected ? "bg-surface-2 text-text-hi border-hairline-strong" : "text-ink-3 border-hairline hover:text-ink-4"
              }`}
            >
              {t.name} <span className="text-[10px] uppercase tracking-[0.08em] text-text-lo ml-1">{t.my_role}</span>
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) {
            onCreate(name.trim());
            setName("");
          }
        }}
      >
        <div className="flex flex-col gap-1 flex-1">
          <Label>New team</Label>
          <input className={INPUT} placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" size="sm" variant="primary" disabled={!name.trim()}>
          Create
        </Button>
      </form>
    </Card>
  );
}

function TeamCard({
  team,
  me,
  refresh,
  run,
  onLeft,
}: {
  team: TeamDetail;
  me: string;
  refresh: () => Promise<void>;
  run: (fn: () => Promise<void>, ok?: string) => Promise<void>;
  onLeft: () => Promise<void>;
}) {
  const canManage = team.my_role === "owner" || team.my_role === "admin";
  const isOwner = team.my_role === "owner";
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<TeamRole, "owner">>("member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  return (
    <Card title={`TEAM · ${team.name.toUpperCase()}`}>
      <div className="flex flex-col divide-y divide-hairline">
        {team.members.map((m) => (
          <MemberRow key={m.user_id} team={team} member={m} me={me} canManage={canManage} isOwner={isOwner} refresh={refresh} run={run} />
        ))}
      </div>

      {team.invites.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label>Pending invites</Label>
          {team.invites.map((i) => (
            <Mono key={i.id} className="text-[11px] text-ink-3">
              {i.email} · {i.role} · expires {new Date(i.expires_at).toLocaleDateString()}
            </Mono>
          ))}
        </div>
      )}

      {canManage && (
        <form
          className="flex flex-wrap gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await api<{ delivered: boolean; link?: string }>("/api/invites", {
                method: "POST",
                body: JSON.stringify({ email: inviteEmail, team_id: team.id, role: inviteRole }),
              });
              setInviteLink(r.delivered ? null : (r.link ?? null));
              setInviteEmail("");
              await refresh();
            }, "Invite created.");
          }}
        >
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <Label>Invite by email</Label>
            <input className={INPUT} type="email" placeholder="person@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Role</Label>
            <select className={SELECT} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Exclude<TeamRole, "owner">)}>
              {isOwner && <option value="admin">admin</option>}
              <option value="member">member</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
          <Button type="submit" size="sm" variant="primary">
            Send invite
          </Button>
        </form>
      )}
      {inviteLink && (
        <Note>
          Email is not configured here; give the person this link (valid 7 days, once):{" "}
          <Mono className="text-xs break-all select-all">{inviteLink}</Mono>
        </Note>
      )}

      {isOwner && (
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex flex-col gap-1">
            <Label>Successor (required before you can leave)</Label>
            <select
              className={SELECT}
              value={team.successor_user_id ?? ""}
              onChange={(e) =>
                run(async () => {
                  await api(`/api/teams/${team.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ successor_user_id: e.target.value || null }),
                  });
                  await refresh();
                }, "Successor updated.")
              }
            >
              <option value="">— none —</option>
              {team.members
                .filter((m) => m.user_id !== me)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name ?? m.user_id.slice(0, 8)} ({m.role})
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      <div>
        <Button
          size="sm"
          variant="danger"
          onClick={() =>
            run(async () => {
              await api(`/api/teams/${team.id}/leave`, { method: "POST" });
              await onLeft();
            }, "You left the team. Your contributions stay with it.")
          }
        >
          Leave team
        </Button>
      </div>
    </Card>
  );
}

function MemberRow({
  team,
  member,
  me,
  canManage,
  isOwner,
  refresh,
  run,
}: {
  team: TeamDetail;
  member: TeamMember;
  me: string;
  canManage: boolean;
  isOwner: boolean;
  refresh: () => Promise<void>;
  run: (fn: () => Promise<void>, ok?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const editable = canManage && member.role !== "owner" && member.user_id !== me && (isOwner || member.role !== "admin");

  function toggle(section: string) {
    return member.sections.find((s) => s.section === section) ?? { section, can_view: true, can_edit: true, can_create_delete: true, can_share: true };
  }

  async function setToggle(section: string, key: "can_view" | "can_edit" | "can_create_delete" | "can_share", value: boolean) {
    const t = { ...toggle(section), [key]: value };
    await run(async () => {
      await api(`/api/teams/${team.id}/members/${member.user_id}`, { method: "PATCH", body: JSON.stringify({ sections: [t] }) });
      await refresh();
    });
  }

  return (
    <div className="py-3 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <span className="text-sm text-text-hi">{member.display_name ?? member.user_id.slice(0, 8)}</span>
          {member.user_id === me && <span className="text-[10px] uppercase tracking-[0.08em] text-ok ml-2">you</span>}
          {team.successor_user_id === member.user_id && (
            <span className="text-[10px] uppercase tracking-[0.08em] text-text-lo ml-2">successor</span>
          )}
        </div>
        {editable ? (
          <select
            className={SELECT}
            value={member.role}
            onChange={(e) =>
              run(async () => {
                await api(`/api/teams/${team.id}/members/${member.user_id}`, { method: "PATCH", body: JSON.stringify({ role: e.target.value }) });
                await refresh();
              }, "Role updated.")
            }
          >
            {isOwner && <option value="admin">admin</option>}
            <option value="member">member</option>
            <option value="viewer">viewer</option>
          </select>
        ) : (
          <Mono className="text-[11px] text-ink-3 uppercase tracking-[0.08em]">{member.role}</Mono>
        )}
        {editable && (
          <>
            <Button size="sm" onClick={() => setOpen((o) => !o)}>
              {open ? "Hide sections" : "Sections"}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() =>
                run(async () => {
                  await api(`/api/teams/${team.id}/members/${member.user_id}`, { method: "DELETE" });
                  await refresh();
                }, "Member removed. Their contributions stay with the team.")
              }
            >
              Remove
            </Button>
          </>
        )}
      </div>

      {open && editable && (
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="text-text-lo">
                <th className="text-left font-normal pb-1">Section</th>
                {VERBS.map((v) => (
                  <th key={v} className="font-normal pb-1 px-2">
                    {v.replace("_", "/")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SHAREABLE_SECTIONS.map((section) => {
                const t = toggle(section);
                return (
                  <tr key={section} className="border-t border-hairline">
                    <td className="py-1 text-text-mid">{section}</td>
                    {(["can_view", "can_edit", "can_create_delete", "can_share"] as const).map((key) => (
                      <td key={key} className="text-center px-2">
                        <input type="checkbox" checked={t[key]} onChange={(e) => setToggle(section, key, e.target.checked)} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Note>Toggles only narrow what the role allows; they never widen it.</Note>
        </div>
      )}
    </div>
  );
}

function ShareCard({
  given,
  refresh,
  run,
}: {
  given: Grant[];
  refresh: () => Promise<void>;
  run: (fn: () => Promise<void>, ok?: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [found, setFound] = useState<{ id: string; display_name: string | null } | null>(null);
  const [section, setSection] = useState<string>(SHAREABLE_SECTIONS[0]);
  const [groups, setGroups] = useState<string[]>([]);
  const [verbs, setVerbs] = useState<string[]>(["view"]);
  const [expires, setExpires] = useState("");

  async function lookup() {
    await run(async () => {
      const r = await api<{ user: { id: string; display_name: string | null } | null }>(`/api/users/lookup?email=${encodeURIComponent(email)}`);
      setFound(r.user);
    });
  }

  return (
    <Card title="SHARE WITH A PERSON">
      <Note>Shares part of your personal space. The other person sees only the section and groups you pick, with the verbs you allow.</Note>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <Label>Their email</Label>
          <input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@example.com" />
        </div>
        <Button size="sm" onClick={lookup} disabled={!email.includes("@")}>
          Find
        </Button>
        {found && <Note tone="ok">{found.display_name ?? "Found"}</Note>}
      </div>
      {found && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api("/api/grants", {
                method: "POST",
                body: JSON.stringify({ grantee_id: found.id, section, entity_groups: groups, verbs, expires_at: expires ? new Date(expires).toISOString() : null }),
              });
              setGroups([]);
              setVerbs(["view"]);
              setExpires("");
              await refresh();
            }, "Shared.");
          }}
        >
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <Label>Section</Label>
              <select
                className={SELECT}
                value={section}
                onChange={(e) => {
                  setSection(e.target.value);
                  setGroups([]);
                }}
              >
                {SHAREABLE_SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Groups (none = whole section)</Label>
              <div className="flex flex-wrap gap-2">
                {(GROUPS_BY_SECTION[section] ?? []).map((g) => (
                  <label key={g} className="text-xs text-text-mid flex items-center gap-1">
                    <input type="checkbox" checked={groups.includes(g)} onChange={(e) => setGroups((cur) => (e.target.checked ? [...cur, g] : cur.filter((x) => x !== g)))} />
                    {g}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Verbs</Label>
              <div className="flex flex-wrap gap-2">
                {VERBS.map((v) => (
                  <label key={v} className="text-xs text-text-mid flex items-center gap-1">
                    <input type="checkbox" checked={verbs.includes(v)} onChange={(e) => setVerbs((cur) => (e.target.checked ? [...cur, v] : cur.filter((x) => x !== v)))} />
                    {v}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Expires (optional)</Label>
              <input className={INPUT} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </div>
          </div>
          <div>
            <Button type="submit" size="sm" variant="primary" disabled={verbs.length === 0}>
              Share
            </Button>
          </div>
        </form>
      )}

      {given.length > 0 && (
        <ul className="flex flex-col divide-y divide-hairline">
          {given.map((g) => (
            <li key={g.id} className="py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0 text-sm text-text-hi">
                {g.other_name ?? g.grantee_id.slice(0, 8)}
                <Mono className="block text-[11px] text-ink-3">
                  {g.section}
                  {g.entity_groups.length ? ` · ${g.entity_groups.join(", ")}` : " · whole section"} · {g.verbs.join(", ")}
                  {g.expires_at ? ` · until ${new Date(g.expires_at).toLocaleDateString()}` : ""}
                </Mono>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  run(async () => {
                    await api(`/api/grants/${g.id}`, { method: "DELETE" });
                    await refresh();
                  }, "Revoked.")
                }
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SharedWithMeCard({
  received,
  refresh,
  run,
}: {
  received: Grant[];
  refresh: () => Promise<void>;
  run: (fn: () => Promise<void>, ok?: string) => Promise<void>;
}) {
  return (
    <Card title="SHARED WITH ME">
      {received.length === 0 ? (
        <Note>Nobody has shared anything with you.</Note>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {received.map((g) => (
            <li key={g.id} className="py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0 text-sm text-text-hi">
                {g.other_name ?? g.grantor_id.slice(0, 8)}
                <Mono className="block text-[11px] text-ink-3">
                  {g.section}
                  {g.entity_groups.length ? ` · ${g.entity_groups.join(", ")}` : " · whole section"} · {g.verbs.join(", ")}
                  {g.expires_at ? ` · until ${new Date(g.expires_at).toLocaleDateString()}` : ""}
                </Mono>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  run(async () => {
                    await api(`/api/grants/${g.id}`, { method: "DELETE" });
                    await refresh();
                  }, "Declined.")
                }
              >
                Decline
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
