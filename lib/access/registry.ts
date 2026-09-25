/**
 * Entity registry — the single source of truth for how every table in the
 * public schema is scoped under multi-user (P12).
 *
 * Every public BASE TABLE must appear in exactly one of:
 *   1. ENTITY_GROUPS      — gets a space_id in Part 2; policies in Part 3 are
 *                           keyed on (section, group) via app.accessible_spaces.
 *   2. SHARED_REFERENCE   — no space_id; read-only for authenticated (or
 *                           service-role only where noted).
 *   3. Supabase-internal  — schemas other than public; never listed here.
 *
 * Views are a fourth, derived category: they carry no space_id and inherit
 * scoping from what they select from (security_invoker). They are listed in
 * DERIVED_RELATIONS so the coverage test can prove nothing was missed.
 *
 * `lib/access/registry.test.ts` enforces all of this against the running
 * local stack. Part 2 seeds the `entity_groups` table from
 * `entityGroupSeedRows()`, so the database and this file cannot disagree.
 *
 * Changing a table's group here changes who can be granted access to it.
 * Finance groups are owner-only by policy shape and by check constraint
 * (Part 3/4); nothing in this file can widen that.
 */

export const SECTIONS = [
  "organisation",
  "fitness",
  "health",
  "finance",
  "studio",
  "drops",
  "ventures",
  "journal",
  "places",
  "reminders",
  "media",
  "platform",
] as const;

export type Section = (typeof SECTIONS)[number];

/** The section that can never be shared. Enforced by Part 3 policies and a check constraint on user_grants. */
export const FINANCE_SECTION: Section = "finance";

export type EntityGroupDef = {
  readonly section: Section;
  readonly group: string;
  readonly tables: readonly string[];
  /** Free text for decisions that a reader of the registry needs to know about. */
  readonly note?: string;
};

export const ENTITY_GROUPS: readonly EntityGroupDef[] = [
  // -- organisation ---------------------------------------------------------
  {
    section: "organisation",
    group: "tickets",
    tables: [
      "tickets",
      "ticket_comments",
      "ticket_activity",
      "projects",
      "areas",
      "ticket_workflows",
      "ticket_statuses",
      "ticket_links",
      "ticket_completions",
      "ticket_dependencies",
      "ticket_templates",
      "sprints",
    ],
  },
  {
    section: "organisation",
    group: "people",
    tables: ["people", "people_mentions", "people_aliases", "entities"],
  },
  {
    section: "organisation",
    group: "captures",
    tables: [
      "raw_captures",
      "capture_learning",
      "pending_entities",
      "routing_rules",
      "entity_review_rules",
      "context_options",
    ],
  },
  {
    section: "organisation",
    group: "purchases",
    tables: [
      "purchases",
      "receipts",
      "receipt_images",
      "receipt_lines",
      "receipt_participants",
      "receipt_line_shares",
      "receipt_settlements",
    ],
  },
  {
    section: "organisation",
    group: "quotes",
    tables: ["quotes"],
    note: "Quotes v1 (0126): things people said, attributed to a Person or to the owner.",
  },
  {
    section: "organisation",
    group: "events",
    tables: ["events"],
    note: "Calendar lives under Organisation in the nav. events has no user_id column; Part 2 backfills created_by from the space owner.",
  },

  // -- fitness --------------------------------------------------------------
  {
    section: "fitness",
    group: "programmes",
    tables: [
      "workout_programmes",
      "workout_programme_phases",
      "workout_programme_sessions",
      "workout_programme_exercises",
      "workouts",
    ],
  },
  {
    section: "fitness",
    group: "sessions",
    tables: [
      "workout_sessions",
      "workout_session_exercises",
      "workout_sets",
      "workout_session_types",
      "pending_workout_routes",
    ],
  },
  {
    section: "fitness",
    group: "body",
    tables: [
      "body_metrics",
      "health_metrics",
      "health_workouts",
      "exercise_baselines",
      "exercise_pain_logs",
      "exercise_aliases",
    ],
  },

  // -- health ---------------------------------------------------------------
  {
    section: "health",
    group: "nutrition",
    tables: [
      "foods",
      "meal_groups",
      "nutrition_logs",
      "recipes",
      "shopping_lists",
      "meal_plan",
      "nutrition_targets",
    ],
    note: "nutrition_targets (migration 0098) post-dates the P12 prompt. Placed here; confirmed by Phil on 10 September 2026 before Part 2 added space_id to it.",
  },
  {
    section: "health",
    group: "supplements",
    tables: ["supplements", "supplement_logs"],
  },
  {
    section: "health",
    group: "clinical",
    tables: [
      "blood_test_sessions",
      "blood_test_results",
      "gut_health_logs",
      "eye_prescriptions",
    ],
  },

  // -- finance (owner-only, never shareable) --------------------------------
  {
    section: "finance",
    group: "banking",
    tables: ["bank_accounts", "transactions", "paypal_payments"],
  },
  {
    section: "finance",
    group: "investments",
    tables: ["investments"],
  },
  {
    section: "finance",
    group: "subscriptions",
    tables: ["accounts"],
    note: "accounts is the recurring-cost / subscriptions ledger (cost_amount, cost_period, renewal_date), not bank accounts.",
  },

  // -- studio ---------------------------------------------------------------
  {
    section: "studio",
    group: "pc",
    tables: ["pc_components", "pc_metrics", "pc_metrics_hourly"],
  },
  {
    section: "studio",
    group: "spotify",
    tables: ["spotify_tokens", "spotify_plays"],
  },

  // -- drops ----------------------------------------------------------------
  {
    section: "drops",
    group: "drops",
    tables: ["drops", "wishlist_items", "raffle_entries", "drop_monitors"],
  },

  // -- ventures -------------------------------------------------------------
  {
    section: "ventures",
    group: "ventures",
    tables: ["ventures", "venture_steps", "venture_ads", "venture_inspiration"],
  },

  // -- media ----------------------------------------------------------------
  {
    section: "media",
    group: "media",
    tables: ["media_items", "media_episodes"],
  },

  // -- journal --------------------------------------------------------------
  {
    section: "journal",
    group: "journal",
    tables: ["journal_entries", "journal_daily_summaries"],
  },
  {
    section: "journal",
    group: "daylog",
    tables: ["daylog_days", "daylog_scenes", "daylog_scene_people", "daylog_facts", "daylog_media"],
    note: "Day log / Journal v2 (0127). Keep ungranted: facts about other people live here (daylog spec §11 flag 2).",
  },
  {
    section: "journal",
    group: "daily_logs",
    tables: ["daily_logs"],
    note: "A dated notes-and-mood log; sits with the journal rather than with habits.",
  },

  // -- places ---------------------------------------------------------------
  // (the reminders table was folded into tickets — 0119 — and dropped in 0125;
  //  the "reminders" section constant stays for existing user_grants rows)
  { section: "places", group: "places", tables: ["places"] },

  // -- platform -------------------------------------------------------------
  {
    section: "platform",
    group: "core",
    tables: [
      "user_settings",
      "dashboard_layouts",
      "push_subscriptions",
      "audit_log",
      "agent_conversations",
      "agent_messages",
      "bin_schedule_config",
      "bin_garden_seasons",
      "bin_google_events",
    ],
  },
  {
    section: "platform",
    group: "memory",
    tables: ["memory_chunks"],
    note: "Embeddings derived from a user's own captures and journal; per-user content, never shared.",
  },
  {
    section: "platform",
    group: "api_usage",
    tables: ["api_usage"],
    note: "Per-call LLM cost rows (tickets spec §9.1); the monthly rundown cap is per user.",
  },
  {
    section: "platform",
    group: "api_tokens",
    tables: ["api_tokens"],
    note: "Scoped bearer tokens (tickets spec §14.4); hashes only, resolved by the middleware with the service role.",
  },
];

export type SharedReferenceDef = {
  readonly table: string;
  /** "authenticated" = read for any signed-in user; "service_role" = system code only. */
  readonly readableBy: "authenticated" | "service_role";
};

/** Tables with NO space_id. Read-only reference data. */
export const SHARED_REFERENCE: readonly SharedReferenceDef[] = [
  { table: "agents", readableBy: "authenticated" },
  { table: "agent_memory", readableBy: "service_role" },
  { table: "workout_exercises", readableBy: "authenticated" },
  { table: "blood_test_markers", readableBy: "authenticated" },
  { table: "cook_guides", readableBy: "authenticated" },
  { table: "weather_cache", readableBy: "authenticated" },
];

/**
 * Views in public. They take no space_id and inherit scoping from the tables
 * they select from (all are security_invoker). Listed so the coverage test
 * notices a new view rather than silently ignoring it.
 */
export const DERIVED_RELATIONS: readonly string[] = ["pc_metrics_machines", "people_daylog_stats"];

/**
 * Tables that define identity and access itself: who a user is, which
 * spaces exist, who may see what. They take no space_id — they are what a
 * space_id points at — and each carries hand-written policies in the
 * migration that creates it rather than the generated per-group policies of
 * Part 3. Part 1 adds profiles; Part 2 spaces, entity_groups and the teams
 * scaffold; Part 3 team_members, team_member_sections, user_grants; Part 4
 * invites; Part 5 audit_events and rate limits; Part 6 the rundown tables.
 * Listed so the coverage test proves nothing was missed without forcing a
 * space_id onto them.
 */
export const ACCESS_TABLES: readonly string[] = [
  "profiles",
  "spaces",
  "entity_groups",
  "teams",
  "team_members",
  "team_member_sections",
  "user_grants",
  "invites",
  "audit_events",
  "rate_limits",
  "second_factor_failures",
  "rundown_settings",
  "rundown_subscriptions",
  "rundown_issues",
];

/**
 * Sections that are never shared: their policies test
 * `space_id = app.personal_space()` and never call app.accessible_spaces().
 * finance by decision; platform because user_settings holds OAuth tokens and
 * push subscriptions are per device (see 0110). user_grants refuses both by
 * check constraint.
 */
export const OWNER_ONLY_SECTIONS: readonly Section[] = ["finance", "platform"];

// -- Derived lookups ----------------------------------------------------------

export type TableClassification =
  | { kind: "entity"; section: Section; group: string }
  | { kind: "shared"; readableBy: SharedReferenceDef["readableBy"] }
  | { kind: "access" }
  | { kind: "derived" }
  | { kind: "unregistered" };

export function entityGroupKey(def: Pick<EntityGroupDef, "section" | "group">): string {
  return `${def.section}.${def.group}`;
}

const TABLE_TO_GROUP: ReadonlyMap<string, EntityGroupDef> = (() => {
  const m = new Map<string, EntityGroupDef>();
  for (const g of ENTITY_GROUPS) for (const t of g.tables) m.set(t, g);
  return m;
})();

const SHARED_BY_TABLE: ReadonlyMap<string, SharedReferenceDef> = new Map(
  SHARED_REFERENCE.map((s) => [s.table, s]),
);

export function classifyTable(table: string): TableClassification {
  const g = TABLE_TO_GROUP.get(table);
  if (g) return { kind: "entity", section: g.section, group: g.group };
  const s = SHARED_BY_TABLE.get(table);
  if (s) return { kind: "shared", readableBy: s.readableBy };
  if (ACCESS_TABLES.includes(table)) return { kind: "access" };
  if (DERIVED_RELATIONS.includes(table)) return { kind: "derived" };
  return { kind: "unregistered" };
}

/** Every table that gets a space_id, in registry order. */
export function registeredTables(): readonly string[] {
  return ENTITY_GROUPS.flatMap((g) => g.tables);
}

/** Every registered table in a given section. */
export function tablesInSection(section: Section): readonly string[] {
  return ENTITY_GROUPS.filter((g) => g.section === section).flatMap((g) => g.tables);
}

export function isFinanceTable(table: string): boolean {
  const c = classifyTable(table);
  return c.kind === "entity" && c.section === FINANCE_SECTION;
}

export type EntityGroupSeedRow = {
  table_name: string;
  section: Section;
  entity_group: string;
};

/** Rows for the `entity_groups` table Part 2 creates. Same data, no drift. */
export function entityGroupSeedRows(): EntityGroupSeedRow[] {
  return ENTITY_GROUPS.flatMap((g) =>
    g.tables.map((table_name) => ({ table_name, section: g.section, entity_group: g.group })),
  );
}
