/**
 * Shared types and readers for teams, membership and grants. Everything
 * here runs through the user-scoped client: RLS decides what the caller
 * may see, and every write is an RPC into the SECURITY DEFINER functions
 * of migration 0112, which hold the role rules.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ENTITY_GROUPS, OWNER_ONLY_SECTIONS, SECTIONS, type Section } from "@/lib/access/registry";

export type TeamRole = "owner" | "admin" | "member" | "viewer";
export const TEAM_ROLES: readonly TeamRole[] = ["owner", "admin", "member", "viewer"];
export const VERBS = ["view", "edit", "create_delete", "share"] as const;
export type Verb = (typeof VERBS)[number];

/** Sections a team or a grant can reach. Finance and platform never appear. */
export const SHAREABLE_SECTIONS: readonly Section[] = SECTIONS.filter(
  (s) => !OWNER_ONLY_SECTIONS.includes(s),
);

/** Entity groups per shareable section, for the grant UI. */
export const GROUPS_BY_SECTION: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  SHAREABLE_SECTIONS.map((s) => [s, ENTITY_GROUPS.filter((g) => g.section === s).map((g) => g.group)]),
);

export type SectionToggle = {
  section: string;
  can_view: boolean;
  can_edit: boolean;
  can_create_delete: boolean;
  can_share: boolean;
};

export type TeamMember = {
  user_id: string;
  role: TeamRole;
  joined_at: string;
  display_name: string | null;
  sections: SectionToggle[];
};

export type PendingInvite = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
};

export type TeamDetail = {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  successor_user_id: string | null;
  created_at: string;
  my_role: TeamRole | null;
  members: TeamMember[];
  invites: PendingInvite[];
};

export type Grant = {
  id: string;
  grantor_id: string;
  grantee_id: string;
  section: string;
  entity_groups: string[];
  verbs: string[];
  expires_at: string | null;
  revoked_at: string | null;
  reason: string | null;
  created_at: string;
  other_name: string | null;
};

export async function listTeams(db: SupabaseClient, me: string) {
  const { data: teams, error } = await db
    .from("teams")
    .select("id, name, slug, owner_user_id, successor_user_id, created_at")
    .order("created_at");
  if (error) throw new Error(error.message);
  const { data: memberships } = await db
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", me);
  const roles = new Map((memberships ?? []).map((m) => [m.team_id as string, m.role as TeamRole]));
  return (teams ?? []).map((t) => ({ ...t, my_role: roles.get(t.id as string) ?? null }));
}

export async function getTeamDetail(db: SupabaseClient, me: string, teamId: string): Promise<TeamDetail | null> {
  const { data: team } = await db
    .from("teams")
    .select("id, name, slug, owner_user_id, successor_user_id, created_at")
    .eq("id", teamId)
    .maybeSingle();
  if (!team) return null;

  const [{ data: members }, { data: sections }, { data: invites }] = await Promise.all([
    db.from("team_members").select("user_id, role, joined_at").eq("team_id", teamId).order("joined_at"),
    db.from("team_member_sections").select("user_id, section, can_view, can_edit, can_create_delete, can_share").eq("team_id", teamId),
    db.from("invites").select("id, email, role, expires_at, created_at").eq("team_id", teamId).is("accepted_at", null).order("created_at"),
  ]);
  const ids = (members ?? []).map((m) => m.user_id as string);
  const { data: profiles } = ids.length
    ? await db.from("profiles").select("id, display_name").in("id", ids)
    : { data: [] as { id: string; display_name: string | null }[] };
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string | null]));

  const memberRows: TeamMember[] = (members ?? []).map((m) => ({
    user_id: m.user_id as string,
    role: m.role as TeamRole,
    joined_at: m.joined_at as string,
    display_name: names.get(m.user_id as string) ?? null,
    sections: (sections ?? [])
      .filter((s) => s.user_id === m.user_id)
      .map((s) => ({
        section: s.section as string,
        can_view: Boolean(s.can_view),
        can_edit: Boolean(s.can_edit),
        can_create_delete: Boolean(s.can_create_delete),
        can_share: Boolean(s.can_share),
      })),
  }));

  return {
    id: team.id as string,
    name: team.name as string,
    slug: team.slug as string,
    owner_user_id: team.owner_user_id as string,
    successor_user_id: (team.successor_user_id as string | null) ?? null,
    created_at: team.created_at as string,
    my_role: memberRows.find((m) => m.user_id === me)?.role ?? null,
    members: memberRows,
    invites: (invites ?? []).filter((i) => new Date(i.expires_at as string) > new Date()) as PendingInvite[],
  };
}

export async function listGrants(db: SupabaseClient, me: string): Promise<{ given: Grant[]; received: Grant[] }> {
  const { data, error } = await db
    .from("user_grants")
    .select("id, grantor_id, grantee_id, section, entity_groups, verbs, expires_at, revoked_at, reason, created_at")
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const others = [...new Set(rows.flatMap((g) => [g.grantor_id as string, g.grantee_id as string]))].filter((id) => id !== me);
  const { data: profiles } = others.length
    ? await db.from("profiles").select("id, display_name").in("id", others)
    : { data: [] as { id: string; display_name: string | null }[] };
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string | null]));
  const shape = (g: (typeof rows)[number]): Grant => ({
    id: g.id as string,
    grantor_id: g.grantor_id as string,
    grantee_id: g.grantee_id as string,
    section: g.section as string,
    entity_groups: (g.entity_groups as string[]) ?? [],
    verbs: (g.verbs as string[]) ?? [],
    expires_at: (g.expires_at as string | null) ?? null,
    revoked_at: (g.revoked_at as string | null) ?? null,
    reason: (g.reason as string | null) ?? null,
    created_at: g.created_at as string,
    other_name: names.get(g.grantor_id === me ? (g.grantee_id as string) : (g.grantor_id as string)) ?? null,
  });
  return {
    given: rows.filter((g) => g.grantor_id === me).map(shape),
    received: rows.filter((g) => g.grantee_id === me).map(shape),
  };
}

/** Turn a PostgREST/PL error into the message the function raised. */
export function rpcMessage(error: { message?: string; details?: string } | null): string {
  return error?.message ?? error?.details ?? "Request failed";
}
