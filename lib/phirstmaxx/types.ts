/**
 * PhirstMaxx — the shapes shared by the engine, the research pipeline, the
 * routes and the screens (claude/phirstmaxx-spec.md §3). Isomorphic: no I/O.
 *
 * Times are ISO strings in UTC on the wire and in the database; the screens
 * show Europe/London. Money is integer pence. Distances are kilometres,
 * durations are minutes.
 */

/** The seven engine kinds a block type maps to (old app decision 2026-09-10). */
export const ENGINE_KINDS = ["work", "shift", "walk", "sit", "busy", "free", "faith"] as const;
export type EngineKind = (typeof ENGINE_KINDS)[number];

export const FIRMNESS = ["firm", "flexible"] as const;
export type Firmness = (typeof FIRMNESS)[number];

export type PmPerson = {
  /** auth.users id */
  id: string;
  name: string;
  colour: string;
  has_car: boolean;
  /** "HH:mm" London. An end at or before the start means the next day. */
  waking: { weekday: { start: string; end: string }; weekend: { start: string; end: string } };
  /** Minutes added after a hard block of each kind before the person counts as free. */
  buffers: { shift: number; sit: number; walk: number };
  home_place_id: string | null;
};

export type PmPlace = {
  id: string;
  label: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  kind: "home" | "work" | "other";
  saved: boolean;
  /** Whose saved start point it is; null = shared. */
  person_id: string | null;
};

export type PmBlockType = {
  id: string;
  name: string;
  engine_kind: EngineKind;
  colour: string | null;
  default_firmness: Firmness;
  default_place_id: string | null;
  is_seed: boolean;
  sort: number;
};

export type PmBlock = {
  id: string;
  person_id: string;
  entered_by: string;
  type_id: string;
  engine_kind: EngineKind;
  starts_at: string;
  ends_at: string;
  firmness: Firmness;
  place_id: string | null;
  title: string | null;
  series_id: string | null;
  /** Comes from the mirror of the old app (§10): never touched by the importer's undo of local rows. */
  local: boolean;
};

export type PmWakingOverride = { day: string; day_end: string };

export const DROP_SOURCES = ["app", "share_sheet", "shortcut", "telegram", "inbox", "import", "capture"] as const;
export type DropSource = (typeof DROP_SOURCES)[number];

export type PmDrop = {
  id: string;
  person_id: string;
  client_id: string;
  source: DropSource;
  url: string | null;
  text: string | null;
  media_paths: string[];
  received_at: string;
  thing_id: string | null;
  /** The one question research may ask by push, and its answer. */
  question: string | null;
  answer: string | null;
  old_id: string | null;
};

export const THING_STATUS = ["researching", "ready", "needs_answer", "archived"] as const;
export type ThingStatus = (typeof THING_STATUS)[number];

export type PmThing = {
  id: string;
  name: string;
  kind: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  status: ThingStatus;
  /** Set once research (or a hand edit) has an answer; the engine reads these columns, not the facts table. */
  min_minutes: number | null;
  max_minutes: number | null;
  indoor: boolean | null;
  dog_rule: "yes" | "no" | "outside_only" | "unknown";
  cost_pence: number | null;
  image_path: string | null;
  summary: string | null;
  done_count: number;
  created_at: string;
  updated_at: string;
  old_id: string | null;
};

export const SOURCE_KINDS = ["jsonld", "official_site", "opengraph", "osm", "google_places", "web_search", "youtube", "oembed", "vision", "exif", "person", "estimate", "import"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export type PmFact = {
  id: string;
  thing_id: string;
  key: string;
  value: unknown;
  source_url: string | null;
  source_kind: SourceKind;
  /** 0–1 */
  confidence: number;
  checked_at: string;
  edited_by_user: boolean;
};

/** Research stages, run independently and re-runnable (spec §6). */
export const RESEARCH_STAGES = ["read", "resolve", "enrich", "travel", "fit", "notify"] as const;
export type ResearchStage = (typeof RESEARCH_STAGES)[number];
export type RunStatus = "queued" | "running" | "done" | "failed" | "skipped" | "waiting";

export type PmResearchRun = {
  id: string;
  drop_id: string;
  stage: ResearchStage;
  status: RunStatus;
  attempts: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  run_after: string;
  cost_pence: number;
  provider: string | null;
};

export const TRAVEL_MODES = ["drive", "walk", "cycle", "transit"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];
export type TravelProvider = "google" | "ors" | "estimate" | "override";

export type PmTravel = {
  id: string;
  thing_id: string;
  origin_place_id: string;
  mode: TravelMode;
  minutes: number;
  km: number | null;
  provider: TravelProvider;
  fetched_at: string;
};

export const PLAN_STATUS = ["proposed", "accepted", "declined", "expired", "done", "cancelled"] as const;
export type PlanStatus = (typeof PLAN_STATUS)[number];

export type PmPlan = {
  id: string;
  kind: "hold" | "plan";
  thing_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  status: PlanStatus;
  /** A person id, or "engine". */
  proposed_by: string;
  /** family_entries id once accepted (the adapter owns the write). */
  calendar_entry_id: string | null;
  notes: string | null;
  score: Record<string, number> | null;
  old_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PmPlanResponse = { plan_id: string; person_id: string; answer: "yes" | "no" | "another_time"; at: string };

export type PmPlanLeg = {
  plan_id: string;
  person_id: string;
  position: number;
  kind: "leave" | "travel" | "arrive" | "there" | "home";
  from_label: string | null;
  to_label: string | null;
  starts_at: string;
  ends_at: string;
  minutes: number;
  mode: TravelMode | null;
  provider: TravelProvider | null;
};

// ---------------------------------------------------------------------------
// Engine input/output shapes (lib/phirstmaxx/engine): pure data, no ids needed
// beyond person ids.

/** A half-open interval [start, end) in epoch milliseconds. */
export type Interval = { start: number; end: number };

export type EngineBlock = {
  person_id: string;
  kind: EngineKind;
  firmness: Firmness;
  start: number;
  end: number;
  /** Where the person is at the end of the block (the start point of their next journey). */
  place_id: string | null;
};

export type EnginePerson = {
  id: string;
  waking: PmPerson["waking"];
  buffers: PmPerson["buffers"];
  home_place_id: string | null;
};

/** A span in which everyone is free and awake. */
export type TogetherWindow = {
  start: number;
  end: number;
  /** "firm" when every person's free time is firm; "flexible" when a flexible block was treated as free. */
  firmness: Firmness;
  /** The London day the window starts on, YYYY-MM-DD. */
  day: string;
};

export type FitVerdict = "fits" | "tight" | "no";

export type FitLeg = {
  person_id: string;
  from_place_id: string | null;
  leave_at: number;
  travel_minutes: number;
  arrive_at: number;
  mode: TravelMode;
  provider: TravelProvider;
};

export type FitResult = {
  verdict: FitVerdict;
  /** One sentence in words, British English: why it fits or does not. */
  reason: string;
  window: TogetherWindow;
  legs: FitLeg[];
  /** Everyone is there from here… */
  arrive_at: number | null;
  /** …until here, when the first person must leave. */
  leave_at: number | null;
  minutes_there: number;
  /** "together" when both leave from the same place; "meet" when they start apart. */
  mode: "together" | "meet";
};
