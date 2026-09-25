/**
 * Entity form registry (MYC-161).
 *
 * One entry per entity the capture pipeline or the app can create: what
 * fields it has, how they validate, the exact key whitelist its POST route
 * accepts, and how a filled form becomes (a) a classification for the
 * review queue and (b) a body for the POST route. The capture modal, the
 * review card and every app create form render from this file through
 * `components/forms/EntityForm.tsx`; the POST routes read their body
 * through `pickPostBody`, so the whitelist is the registry's.
 *
 * `lib/capture/registry.test.ts` fails when an entry's `postFields` names a
 * key its `fields` lack.
 *
 * Isomorphic on purpose: no React, no Supabase, no Next imports.
 */
import { DUE_WINDOWS, DUE_WINDOW_LABEL } from "@/lib/tickets/when";
import { PURCHASE_CATEGORIES, PURCHASE_LIST_TYPES, PURCHASE_URGENCIES, PURCHASE_WANT_OR_NEED } from "@/lib/types/purchase";
import { MEDIA_STATUSES, MEDIA_TYPES } from "@/lib/types/media";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "date"
  | "time"
  | "datetime"
  | "tags"
  | "boolean"
  | "person"
  | "project"
  | "entity";

export type FieldOption = { value: string; label: string };

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly FieldOption[];
  placeholder?: string;
  /** Accepted by the POST route but never rendered: the caller sets it (a parent id, a project from context, a derived value). */
  hidden?: boolean;
  /** Spans the full width of the form grid. */
  wide?: boolean;
  rows?: number;
  min?: number;
  max?: number;
  step?: number;
  /** Person picker: offer "Me" (value `__me`) above the people list. */
  selfOption?: boolean;
  /** Project picker: only Tickets (technical) projects. */
  technicalOnly?: boolean;
  help?: string;
};

export type FieldValues = Record<string, unknown>;
export type FieldErrors = Record<string, string>;

/** Kinds the capture screen can be told explicitly. The classifier's own kinds plus the two review-only ones. */
export type TypedKind =
  | "task"
  | "ticket"
  | "reminder"
  | "purchase"
  | "media"
  | "quote"
  | "account"
  | "pain_log"
  | "journal"
  | "decision"
  | "idea"
  | "note"
  | "workout"
  | "person";

export type EntityDef = {
  kind: TypedKind;
  label: string;
  description: string;
  /** The field that receives the capture text when a type is chosen on the capture screen. */
  primary: string;
  /** The POST route that creates this entity directly, or null when it only exists through capture + review. */
  route: string | null;
  /** Every body key the POST route accepts. Enforced at runtime by `pickPostBody`; proven to be fields by the registry test. */
  postFields: readonly string[];
  fields: readonly FieldDef[];
  /** A review approve creates a row for this kind (false: it stays a capture). */
  materialises: boolean;
  validate: (values: FieldValues) => FieldErrors;
  /** The classification a typed capture carries into review. Merged over the base classification. */
  toClassification: (values: FieldValues, text: string) => Record<string, unknown>;
  /** The body for `route`. Only when `route` is set. */
  toPostBody?: (values: FieldValues) => Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// value helpers
// ---------------------------------------------------------------------------

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
export function strOrNull(v: unknown): string | null {
  const s = str(v);
  return s ? s : null;
}
export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
export function bool(v: unknown): boolean {
  return v === true || v === "true" || v === "1";
}
export function tags(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((x) => x.trim()).filter(Boolean);
  return [];
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
function oneOfOrNull<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** A London wall-clock date + time as a UTC ISO string (the same arithmetic the reminders and tasks forms used). */
export function londonToUtcIso(date: string, time: string): string {
  const localIso = `${date}T${time || "09:00"}:00`;
  const naive = new Date(localIso);
  const asLondon = new Date(naive.toLocaleString("en-US", { timeZone: "Europe/London" }));
  return new Date(naive.getTime() - (asLondon.getTime() - naive.getTime())).toISOString();
}

function urgencyFromWindow(w: unknown): "today" | "this_week" | "this_month" | "someday" {
  switch (w) {
    case "week":
    case "weekend":
      return "this_week";
    case "month":
    case "month_end":
      return "this_month";
    case "date":
      return "this_week";
    default:
      return "someday";
  }
}

function labelise(s: string): string {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
function opts(values: readonly string[]): FieldOption[] {
  return values.map((v) => ({ value: v, label: labelise(v) }));
}

// ---------------------------------------------------------------------------
// task / ticket
// ---------------------------------------------------------------------------

const WHEN_OPTIONS: FieldOption[] = [{ value: "", label: "No deadline" }, ...DUE_WINDOWS.map((w) => ({ value: w, label: DUE_WINDOW_LABEL[w] }))];

/**
 * Every key `POST /api/tickets` accepts (MYC-163, the /api/tasks compat routes
 * are gone): ticketFieldsFromBody's whitelist, whenFieldsFromBody's
 * `due_window`, the classic views' legacy columns (legacyFieldsFromBody), and
 * the create-only `category`, `template`, `vars`.
 */
const TASK_POST_FIELDS = [
  "title",
  "description",
  "kind",
  "where_ctx",
  "time_window",
  "source",
  "scheduled_on",
  "deadline_on",
  "due_window",
  "someday",
  "key",
  "sync_to_github",
  "project_id",
  "parent_task_id",
  "entity_id",
  "place_id",
  "assignee_id",
  "waiting_on_person_id",
  "status_id",
  "sprint_id",
  "points",
  "tools",
  "tags",
  "time_from",
  "time_to",
  "days",
  "remind_at",
  "suggested",
  "category",
  "template",
  "vars",
  // legacy Tasks columns the drawer and board still write
  "status",
  "priority_score",
  "due_date",
  "scheduled_at",
  "time_estimate_min",
  "owner",
  "context_where",
  "context_device",
  "context_energy",
  "context_tag",
  "sort_order",
] as const;

function taskFields(opts: { ticket: boolean }): FieldDef[] {
  return [
    { name: "title", label: "Title", type: "text", required: true, wide: true, placeholder: "What needs doing" },
    { name: "description", label: "Description", type: "textarea", wide: true, rows: 3 },
    ...(opts.ticket
      ? [{ name: "project_id", label: "Project", type: "project", required: true, technicalOnly: true } as FieldDef]
      : [{ name: "project_id", label: "Project", type: "project" } as FieldDef]),
    { name: "due_window", label: "When", type: "select", options: WHEN_OPTIONS },
    { name: "deadline_on", label: "Date", type: "date", help: "Used when When is “Pick a date”" },
    { name: "key", label: "Key task", type: "boolean" },
    { name: "tags", label: "Tags", type: "tags", placeholder: "comma, separated" },
    { name: "scheduled_at", label: "Scheduled", type: "datetime" },
    { name: "time_estimate_min", label: "Estimate (min)", type: "number", min: 0, step: 5 },
    { name: "owner", label: "Owner", type: "text" },
    { name: "entity_id", label: "Entity", type: "entity" },
    // accepted by the route, set by callers or derived server-side
    { name: "status", label: "Status (legacy)", type: "select", hidden: true },
    { name: "status_id", label: "Status", type: "text", hidden: true },
    { name: "category", label: "Category", type: "text", hidden: true },
    { name: "priority_score", label: "Priority score", type: "number", hidden: true },
    { name: "due_date", label: "Due date (legacy)", type: "date", hidden: true },
    { name: "parent_task_id", label: "Parent task", type: "text", hidden: true },
    { name: "context_where", label: "Context: where", type: "text", hidden: true },
    { name: "context_device", label: "Context: device", type: "text", hidden: true },
    { name: "context_energy", label: "Context: energy", type: "select", hidden: true },
    { name: "context_tag", label: "Context: tag", type: "text", hidden: true },
    { name: "sort_order", label: "Sort order", type: "number", hidden: true },
    { name: "kind", label: "Kind", type: "text", hidden: true },
    { name: "someday", label: "Someday", type: "boolean", hidden: true },
    { name: "points", label: "Points", type: "number", hidden: true },
    { name: "where_ctx", label: "Where", type: "text", hidden: true },
    { name: "place_id", label: "Place", type: "text", hidden: true },
    { name: "tools", label: "Tools", type: "tags", hidden: true },
    { name: "time_window", label: "Time window", type: "text", hidden: true },
    { name: "time_from", label: "Time from", type: "time", hidden: true },
    { name: "time_to", label: "Time to", type: "time", hidden: true },
    { name: "days", label: "Days", type: "tags", hidden: true },
    { name: "scheduled_on", label: "Scheduled on", type: "date", hidden: true },
    { name: "remind_at", label: "Remind at", type: "datetime", hidden: true },
    { name: "waiting_on_person_id", label: "Waiting on", type: "person", hidden: true },
    { name: "assignee_id", label: "Assignee", type: "text", hidden: true },
    { name: "sprint_id", label: "Sprint", type: "text", hidden: true },
    { name: "sync_to_github", label: "Sync to GitHub", type: "boolean", hidden: true },
    { name: "suggested", label: "Suggested", type: "text", hidden: true },
    { name: "template", label: "Template", type: "text", hidden: true },
    { name: "vars", label: "Template vars", type: "text", hidden: true },
    { name: "source", label: "Source", type: "text", hidden: true },
  ];
}

function validateTask(values: FieldValues, ticket: boolean): FieldErrors {
  const e: FieldErrors = {};
  if (!str(values.title)) e.title = "Title is required";
  if (ticket && !str(values.project_id)) e.project_id = "A ticket needs a Tickets project";
  if (values.due_window === "date" && !DATE_RE.test(str(values.deadline_on))) e.deadline_on = "Pick the date";
  const est = num(values.time_estimate_min);
  if (values.time_estimate_min !== undefined && values.time_estimate_min !== "" && values.time_estimate_min !== null && est === null) e.time_estimate_min = "Minutes";
  return e;
}

function taskPostBody(values: FieldValues): Record<string, unknown> {
  const body: Record<string, unknown> = { title: str(values.title) };
  const desc = str(values.description);
  body.description = desc || null;
  const w = str(values.due_window);
  body.due_window = w || null;
  if (w === "date" && DATE_RE.test(str(values.deadline_on))) body.deadline_on = str(values.deadline_on);
  body.key = bool(values.key);
  const t = tags(values.tags);
  body.tags = t.length ? t : null;
  const sched = str(values.scheduled_at);
  body.scheduled_at = sched ? new Date(sched).toISOString() : null;
  body.time_estimate_min = num(values.time_estimate_min);
  body.owner = strOrNull(values.owner);
  body.entity_id = strOrNull(values.entity_id);
  body.project_id = strOrNull(values.project_id);
  for (const k of ["parent_task_id", "status", "where_ctx", "time_window", "points", "tools", "someday", "source", "kind", "category"] as const) {
    if (values[k] !== undefined && values[k] !== "") body[k] = values[k];
  }
  return body;
}

function taskClassification(values: FieldValues, ticket: boolean): Record<string, unknown> {
  const w = str(values.due_window);
  const suggested: Record<string, unknown> = {};
  if (w) suggested.due_window = w;
  if (w === "date" && DATE_RE.test(str(values.deadline_on))) suggested.deadline_on = str(values.deadline_on);
  for (const k of ["where_ctx", "time_window", "points"] as const) if (values[k] !== undefined && values[k] !== "") suggested[k] = values[k];
  const tools = tags(values.tools);
  if (tools.length) suggested.tools = tools;
  if (ticket) suggested.project_id = str(values.project_id);
  return {
    kind: "task",
    title: str(values.title),
    summary: str(values.description),
    urgency: w === "date" && DATE_RE.test(str(values.deadline_on)) ? "this_week" : urgencyFromWindow(w),
    key: bool(values.key),
    tags: tags(values.tags),
    typed_suggested: suggested,
    ...(ticket ? { project_id: str(values.project_id), ticket: true } : {}),
    scheduled_at: str(values.scheduled_at) ? new Date(str(values.scheduled_at)).toISOString() : null,
    entity_id: strOrNull(values.entity_id),
  };
}

const TASK: EntityDef = {
  kind: "task",
  label: "Task",
  description: "Something to do. Lands in the Inbox for Clarify.",
  primary: "title",
  route: "/api/tickets",
  postFields: TASK_POST_FIELDS,
  fields: taskFields({ ticket: false }),
  materialises: true,
  validate: (v) => validateTask(v, false),
  toClassification: (v) => taskClassification(v, false),
  toPostBody: taskPostBody,
};

const TICKET: EntityDef = {
  kind: "ticket",
  label: "Ticket",
  description: "A task in a technical project. Gets the project's key.",
  primary: "title",
  route: "/api/tickets",
  postFields: TASK_POST_FIELDS,
  fields: taskFields({ ticket: true }),
  materialises: true,
  validate: (v) => validateTask(v, true),
  toClassification: (v) => taskClassification(v, true),
  toPostBody: taskPostBody,
};

// ---------------------------------------------------------------------------
// reminder
// ---------------------------------------------------------------------------

const RECURRENCE_OPTIONS: FieldOption[] = [
  { value: "", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const REMINDER: EntityDef = {
  kind: "reminder",
  label: "Reminder",
  description: "Be told at a time. London wall clock.",
  primary: "message",
  route: "/api/reminders",
  postFields: ["message", "due_at", "recurrence"],
  fields: [
    { name: "message", label: "Reminder", type: "text", required: true, wide: true, placeholder: "What to be reminded of" },
    { name: "date", label: "Date", type: "date", required: true },
    { name: "time", label: "Time", type: "time", required: true },
    { name: "recurrence", label: "Repeat", type: "select", options: RECURRENCE_OPTIONS },
    { name: "due_at", label: "Due at (UTC)", type: "datetime", hidden: true },
  ],
  materialises: true,
  validate: (v) => {
    const e: FieldErrors = {};
    if (!str(v.message)) e.message = "Say what to remind you of";
    if (!DATE_RE.test(str(v.date))) e.date = "Date";
    if (!TIME_RE.test(str(v.time))) e.time = "Time";
    return e;
  },
  toClassification: (v) => {
    const message = str(v.message);
    return {
      kind: "reminder",
      title: message,
      urgency: "this_week",
      reminder: { reminder_message: message, date: str(v.date) || null, time: str(v.time) || null, relative_minutes: null, recurrence: strOrNull(v.recurrence) },
      due_at: DATE_RE.test(str(v.date)) ? londonToUtcIso(str(v.date), str(v.time)) : null,
    };
  },
  toPostBody: (v) => ({
    message: str(v.message),
    due_at: str(v.due_at) || (DATE_RE.test(str(v.date)) ? londonToUtcIso(str(v.date), str(v.time)) : ""),
    recurrence: strOrNull(v.recurrence),
  }),
};

// ---------------------------------------------------------------------------
// purchase
// ---------------------------------------------------------------------------

const PURCHASE: EntityDef = {
  kind: "purchase",
  label: "Purchase",
  description: "Something to buy, or a wishlist item.",
  primary: "title",
  route: "/api/purchases",
  postFields: ["title", "amount", "currency", "want_or_need", "urgency", "list_type", "category", "project_id"],
  fields: [
    { name: "title", label: "Item", type: "text", required: true, wide: true, placeholder: "e.g. milk, batteries, keyboard" },
    { name: "list_type", label: "List", type: "select", options: opts(PURCHASE_LIST_TYPES) },
    { name: "amount", label: "Amount", type: "number", min: 0, step: 0.01 },
    { name: "currency", label: "Currency", type: "text", placeholder: "GBP" },
    { name: "want_or_need", label: "Want or need", type: "select", options: [{ value: "", label: "Unclear" }, ...opts(PURCHASE_WANT_OR_NEED.filter((x) => x !== "unclear"))] },
    { name: "urgency", label: "Urgency", type: "select", options: opts(PURCHASE_URGENCIES) },
    { name: "category", label: "Category", type: "select", options: [{ value: "", label: "—" }, ...opts(PURCHASE_CATEGORIES)] },
    { name: "project_id", label: "Project", type: "project", hidden: true },
  ],
  materialises: true,
  validate: (v) => {
    const e: FieldErrors = {};
    if (!str(v.title)) e.title = "Item is required";
    if (v.amount !== undefined && v.amount !== "" && v.amount !== null && num(v.amount) === null) e.amount = "Number";
    return e;
  },
  toClassification: (v) => ({
    kind: "purchase",
    title: str(v.title),
    urgency: oneOf(v.urgency, PURCHASE_URGENCIES, "someday"),
    purchase: {
      amount: num(v.amount),
      currency: str(v.currency).toUpperCase() || "GBP",
      want_or_need: oneOf(v.want_or_need, PURCHASE_WANT_OR_NEED, "unclear"),
      list_type: oneOf(v.list_type, PURCHASE_LIST_TYPES, "shopping"),
      category: oneOfOrNull(v.category, PURCHASE_CATEGORIES),
    },
  }),
  toPostBody: (v) => ({
    title: str(v.title),
    amount: num(v.amount),
    currency: str(v.currency).toUpperCase() || "GBP",
    want_or_need: oneOfOrNull(v.want_or_need, PURCHASE_WANT_OR_NEED),
    urgency: oneOf(v.urgency, PURCHASE_URGENCIES, "someday"),
    list_type: oneOf(v.list_type, PURCHASE_LIST_TYPES, "shopping"),
    category: oneOfOrNull(v.category, PURCHASE_CATEGORIES),
    project_id: strOrNull(v.project_id),
  }),
};

// ---------------------------------------------------------------------------
// media
// ---------------------------------------------------------------------------

const MEDIA: EntityDef = {
  kind: "media",
  label: "Media",
  description: "Something to watch, listen to or read.",
  primary: "title",
  route: "/api/media",
  postFields: ["title", "creator", "media_type", "media_status", "notes", "tags", "url"],
  fields: [
    { name: "title", label: "Title", type: "text", required: true, wide: true, placeholder: "Film, show, album, podcast, book…" },
    { name: "media_type", label: "Type", type: "select", required: true, options: opts(MEDIA_TYPES) },
    { name: "creator", label: "Creator", type: "text", placeholder: "director / artist / author" },
    { name: "media_status", label: "Status", type: "select", options: opts(MEDIA_STATUSES) },
    { name: "url", label: "URL", type: "text" },
    { name: "tags", label: "Tags", type: "tags" },
    { name: "notes", label: "Notes", type: "textarea", wide: true, rows: 2 },
  ],
  materialises: true,
  validate: (v) => {
    const e: FieldErrors = {};
    if (!str(v.title)) e.title = "Title is required";
    if (!oneOfOrNull(v.media_type, MEDIA_TYPES)) e.media_type = "Watch, listen or read";
    return e;
  },
  toClassification: (v) => ({
    kind: "media",
    title: str(v.title),
    tags: tags(v.tags),
    media: { media_type: oneOf(v.media_type, MEDIA_TYPES, "watch"), creator: strOrNull(v.creator) },
    media_extra: { media_status: oneOf(v.media_status, MEDIA_STATUSES, "backlog"), url: strOrNull(v.url), notes: strOrNull(v.notes) },
  }),
  toPostBody: (v) => ({
    title: str(v.title),
    creator: strOrNull(v.creator),
    media_type: oneOf(v.media_type, MEDIA_TYPES, "watch"),
    media_status: oneOf(v.media_status, MEDIA_STATUSES, "backlog"),
    notes: strOrNull(v.notes),
    tags: tags(v.tags),
    url: strOrNull(v.url),
  }),
};

// ---------------------------------------------------------------------------
// quote
// ---------------------------------------------------------------------------

const QUOTE: EntityDef = {
  kind: "quote",
  label: "Quote",
  description: "Something memorable that was said. Never creates a person.",
  primary: "text",
  route: "/api/quotes",
  postFields: ["text", "said_by_person_id", "is_own", "context", "source", "said_at", "merch", "speaker_confidence", "skip_research", "force"],
  fields: [
    { name: "text", label: "Quote", type: "textarea", required: true, wide: true, rows: 2, placeholder: "The quote, as said" },
    { name: "said_by_person_id", label: "Who", type: "person", selfOption: true },
    { name: "context", label: "Context", type: "text", placeholder: "optional" },
    { name: "source", label: "Source", type: "text" },
    { name: "said_at", label: "Said on", type: "date" },
    { name: "merch", label: "Merch", type: "boolean" },
    { name: "is_own", label: "My own", type: "boolean", hidden: true },
    { name: "speaker_confidence", label: "Speaker confidence", type: "select", hidden: true },
    { name: "skip_research", label: "Skip research", type: "boolean", hidden: true },
    { name: "force", label: "Force (skip duplicate check)", type: "boolean", hidden: true },
  ],
  materialises: true,
  validate: (v) => {
    const e: FieldErrors = {};
    if (!str(v.text)) e.text = "The quote is required";
    return e;
  },
  toClassification: (v) => {
    const who = str(v.said_by_person_id);
    const is_own = who === "__me" || bool(v.is_own);
    return {
      kind: "quote",
      title: str(v.text),
      quote: {
        text: str(v.text),
        speaker: null,
        is_own,
        speaker_confidence: "certain",
        context: strOrNull(v.context),
        said_at_relative: null,
        source: strOrNull(v.source),
        likely_original: false,
      },
      quote_person_id: is_own || !who ? null : who,
      quote_extra: { said_at: DATE_RE.test(str(v.said_at)) ? str(v.said_at) : null, merch: bool(v.merch) },
    };
  },
  toPostBody: (v) => {
    const who = str(v.said_by_person_id);
    const is_own = who === "__me" || bool(v.is_own);
    return {
      text: str(v.text),
      is_own,
      said_by_person_id: is_own || !who ? null : who,
      context: strOrNull(v.context),
      source: strOrNull(v.source),
      said_at: DATE_RE.test(str(v.said_at)) ? str(v.said_at) : null,
      merch: bool(v.merch),
      force: bool(v.force),
    };
  },
};

// ---------------------------------------------------------------------------
// account (service account)
// ---------------------------------------------------------------------------

export const ACCOUNT_STATUSES = ["active", "cancelled", "paused", "trial"] as const;
export const ACCOUNT_PERIODS = ["monthly", "annual", "one_off"] as const;
export const ACCOUNT_CATEGORIES = ["Entertainment", "Productivity", "Infrastructure", "Finance", "Health", "Shopping", "Other"] as const;

const ACCOUNT: EntityDef = {
  kind: "account",
  label: "Account",
  description: "A service or subscription account (not a bank account).",
  primary: "name",
  route: "/api/finance/service-accounts",
  postFields: ["name", "email", "url", "category", "status", "cost_amount", "cost_currency", "cost_period", "renewal_date", "payment_method", "opened_date", "notes"],
  fields: [
    { name: "name", label: "Service", type: "text", required: true, wide: true, placeholder: "Netflix, AWS, …" },
    { name: "status", label: "Status", type: "select", options: opts(ACCOUNT_STATUSES) },
    { name: "category", label: "Category", type: "select", options: ACCOUNT_CATEGORIES.map((c) => ({ value: c, label: c })) },
    { name: "cost_amount", label: "Cost", type: "number", min: 0, step: 0.01 },
    { name: "cost_period", label: "Per", type: "select", options: [{ value: "", label: "—" }, ...opts(ACCOUNT_PERIODS)] },
    { name: "cost_currency", label: "Currency", type: "text", placeholder: "GBP" },
    { name: "renewal_date", label: "Renews", type: "date" },
    { name: "email", label: "Email", type: "text" },
    { name: "url", label: "URL", type: "text" },
    { name: "payment_method", label: "Paid with", type: "text" },
    { name: "opened_date", label: "Opened", type: "date" },
    { name: "notes", label: "Notes", type: "textarea", wide: true, rows: 2 },
  ],
  materialises: true,
  validate: (v) => {
    const e: FieldErrors = {};
    if (!str(v.name)) e.name = "Service name is required";
    if (v.cost_amount !== undefined && v.cost_amount !== "" && v.cost_amount !== null && num(v.cost_amount) === null) e.cost_amount = "Number";
    return e;
  },
  toClassification: (v) => ({
    kind: "account",
    title: str(v.name),
    account: { cost_amount: num(v.cost_amount), cost_period: oneOfOrNull(v.cost_period, ACCOUNT_PERIODS), status: oneOf(v.status, ACCOUNT_STATUSES, "active") },
    account_extra: {
      category: oneOf(v.category, ACCOUNT_CATEGORIES, "Other"),
      cost_currency: str(v.cost_currency).toUpperCase() || "GBP",
      renewal_date: DATE_RE.test(str(v.renewal_date)) ? str(v.renewal_date) : null,
      email: strOrNull(v.email),
      url: strOrNull(v.url),
      payment_method: strOrNull(v.payment_method),
      opened_date: DATE_RE.test(str(v.opened_date)) ? str(v.opened_date) : null,
      notes: strOrNull(v.notes),
    },
  }),
  toPostBody: (v) => ({
    name: str(v.name),
    email: strOrNull(v.email),
    url: strOrNull(v.url),
    category: oneOf(v.category, ACCOUNT_CATEGORIES, "Other"),
    status: oneOf(v.status, ACCOUNT_STATUSES, "active"),
    cost_amount: num(v.cost_amount),
    cost_currency: str(v.cost_currency).toUpperCase() || "GBP",
    cost_period: oneOfOrNull(v.cost_period, ACCOUNT_PERIODS),
    renewal_date: DATE_RE.test(str(v.renewal_date)) ? str(v.renewal_date) : null,
    payment_method: strOrNull(v.payment_method),
    opened_date: DATE_RE.test(str(v.opened_date)) ? str(v.opened_date) : null,
    notes: strOrNull(v.notes),
  }),
};

// ---------------------------------------------------------------------------
// pain log (standalone — the session-bound POST is a different thing)
// ---------------------------------------------------------------------------

export const PAIN_FEELS = ["great", "good", "ok", "mild", "moderate", "painful", "stopped"] as const;

const PAIN_LOG: EntityDef = {
  kind: "pain_log",
  label: "Pain log",
  description: "A body region and how it feels, outside a workout.",
  primary: "notes",
  route: null,
  postFields: [],
  fields: [
    { name: "notes", label: "What happened", type: "textarea", required: true, wide: true, rows: 2, placeholder: "e.g. left knee twinged going downstairs" },
    { name: "pain_regions", label: "Regions", type: "tags", required: true, placeholder: "knee, lower back" },
    { name: "severity", label: "Severity (0–10)", type: "number", required: true, min: 0, max: 10, step: 1 },
    { name: "feel_rating", label: "Feel", type: "select", options: [{ value: "", label: "—" }, ...opts(PAIN_FEELS)] },
  ],
  materialises: true,
  validate: (v) => {
    const e: FieldErrors = {};
    if (!str(v.notes)) e.notes = "Say what happened";
    if (!tags(v.pain_regions).length) e.pain_regions = "At least one region";
    const s = num(v.severity);
    if (s === null || s < 0 || s > 10) e.severity = "0 to 10";
    return e;
  },
  toClassification: (v) => ({
    kind: "pain_log",
    title: `${tags(v.pain_regions).join(", ")} ${num(v.severity) ?? ""}`.trim(),
    summary: str(v.notes),
    pain: { pain_regions: tags(v.pain_regions), severity: num(v.severity), feel_rating: oneOfOrNull(v.feel_rating, PAIN_FEELS) },
  }),
};

// ---------------------------------------------------------------------------
// journal
// ---------------------------------------------------------------------------

export const MOODS = ["energised", "calm", "anxious", "frustrated", "reflective", "grateful", "tired", "neutral"] as const;

const JOURNAL: EntityDef = {
  kind: "journal",
  label: "Journal",
  description: "A reflection. Appended to today's Day log.",
  primary: "text",
  route: null,
  postFields: [],
  fields: [
    { name: "text", label: "Entry", type: "textarea", required: true, wide: true, rows: 4 },
    { name: "mood", label: "Mood", type: "select", options: [{ value: "", label: "—" }, ...opts(MOODS)] },
  ],
  materialises: true,
  validate: (v): FieldErrors => (str(v.text) ? {} : { text: "Write something" }),
  toClassification: (v) => ({ kind: "journal", title: str(v.text).slice(0, 80), summary: str(v.text), mood: oneOfOrNull(v.mood, MOODS) }),
};

// ---------------------------------------------------------------------------
// decision / idea / note / workout — captures that stay captures
// ---------------------------------------------------------------------------

function captureOnly(kind: "decision" | "idea" | "note" | "workout", label: string, description: string, placeholder: string): EntityDef {
  return {
    kind,
    label,
    description,
    primary: "title",
    route: null,
    postFields: [],
    fields: [
      { name: "title", label, type: "text", required: true, wide: true, placeholder },
      { name: "summary", label: "Detail", type: "textarea", wide: true, rows: 3 },
      { name: "tags", label: "Tags", type: "tags" },
    ],
    materialises: false,
    validate: (v): FieldErrors => (str(v.title) ? {} : { title: `${label} is required` }),
    toClassification: (v) => ({ kind, title: str(v.title), summary: str(v.summary), tags: tags(v.tags) }),
  };
}

const DECISION = captureOnly("decision", "Decision", "A choice you made, kept on record.", "What was decided");
const IDEA = captureOnly("idea", "Idea", "Something to build, make, try or start.", "The idea");
const NOTE = captureOnly("note", "Note", "A fact to remember.", "The fact");
const WORKOUT = captureOnly("workout", "Workout", "A session you did, as text (the fitness parser reads it).", "e.g. bench 5x5 80kg");

// ---------------------------------------------------------------------------
// person — an UPDATE to an existing person. Never creates one (the capture rule).
// ---------------------------------------------------------------------------

export const PERSON_PATCH_FIELDS = ["birthday", "address", "phone", "email", "relationship", "where_we_met", "mutual_interests", "notes"] as const;

const PERSON: EntityDef = {
  kind: "person",
  label: "Person update",
  description: "Something you learned about someone you already have. Never creates a person.",
  primary: "notes",
  route: null,
  postFields: [],
  fields: [
    { name: "person_id", label: "Who", type: "person", required: true, wide: true },
    { name: "notes", label: "Add to notes", type: "textarea", wide: true, rows: 2 },
    { name: "birthday", label: "Birthday", type: "date" },
    { name: "relationship", label: "Relationship", type: "text" },
    { name: "phone", label: "Phone", type: "text" },
    { name: "email", label: "Email", type: "text" },
    { name: "address", label: "Address", type: "text", wide: true },
    { name: "where_we_met", label: "Where we met", type: "text", wide: true },
    { name: "mutual_interests", label: "Mutual interests", type: "text", wide: true },
  ],
  materialises: true,
  validate: (v) => {
    const e: FieldErrors = {};
    const who = str(v.person_id);
    if (!who || who === "__me") e.person_id = "Pick the person";
    if (!PERSON_PATCH_FIELDS.some((k) => str(v[k]))) e.notes = "Give at least one thing to update";
    if (str(v.birthday) && !DATE_RE.test(str(v.birthday))) e.birthday = "YYYY-MM-DD";
    return e;
  },
  toClassification: (v) => {
    const patch: Record<string, string> = {};
    for (const k of PERSON_PATCH_FIELDS) if (str(v[k])) patch[k] = str(v[k]);
    return { kind: "person", title: str(v.notes) || Object.values(patch)[0] || "Person update", summary: str(v.notes), person_update: { id: str(v.person_id), patch } };
  },
};

// ---------------------------------------------------------------------------
// the registry
// ---------------------------------------------------------------------------

export const ENTITY_REGISTRY: Readonly<Record<TypedKind, EntityDef>> = {
  task: TASK,
  ticket: TICKET,
  reminder: REMINDER,
  purchase: PURCHASE,
  media: MEDIA,
  quote: QUOTE,
  account: ACCOUNT,
  pain_log: PAIN_LOG,
  journal: JOURNAL,
  decision: DECISION,
  idea: IDEA,
  note: NOTE,
  workout: WORKOUT,
  person: PERSON,
};

/** Dropdown order on the capture screen. */
export const TYPED_KINDS: readonly TypedKind[] = ["task", "ticket", "reminder", "purchase", "media", "quote", "journal", "idea", "decision", "note", "person", "account", "pain_log", "workout"];

export function isTypedKind(v: unknown): v is TypedKind {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ENTITY_REGISTRY, v);
}

export function getEntityDef(kind: unknown): EntityDef | null {
  return isTypedKind(kind) ? ENTITY_REGISTRY[kind] : null;
}

/** Fields the form renders (not hidden). */
export function visibleFields(def: EntityDef, only?: readonly string[]): FieldDef[] {
  const list = def.fields.filter((f) => !f.hidden);
  if (!only) return list;
  return only.map((n) => list.find((f) => f.name === n)).filter((f): f is FieldDef => !!f);
}

/** Initial values: every visible field present so controlled inputs never flip. Selects take their first option. */
export function emptyValues(def: EntityDef, seed: FieldValues = {}): FieldValues {
  const out: FieldValues = {};
  for (const f of def.fields) {
    if (f.hidden) continue;
    if (f.type === "boolean") out[f.name] = false;
    else if (f.type === "tags") out[f.name] = [];
    else if (f.type === "select") out[f.name] = f.options?.[0]?.value ?? "";
    else out[f.name] = "";
  }
  return { ...out, ...seed };
}

/**
 * The runtime whitelist for a POST route: only the registry's keys survive.
 * Unknown keys are dropped silently — the route never sees them.
 */
export function pickPostBody(kind: TypedKind, raw: unknown): Record<string, unknown> {
  const def = ENTITY_REGISTRY[kind];
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== "object") return out;
  const body = raw as Record<string, unknown>;
  for (const k of def.postFields) if (k in body) out[k] = body[k];
  return out;
}

/** Values → the classification a typed capture carries, with the base fields every classification has. */
export function classificationForTyped(kind: TypedKind, values: FieldValues, text: string): Record<string, unknown> {
  const def = ENTITY_REGISTRY[kind];
  const base: Record<string, unknown> = {
    kind: kind === "ticket" ? "task" : kind,
    urgency: "someday",
    key: false,
    entity_name: null,
    tags: [],
    summary: "",
    title: text.slice(0, 120),
    mood: null,
    mentions: [],
    purchase: null,
    pain: null,
    reminder: null,
    media: null,
    account: null,
    quote: null,
    context_where: null,
    context_device: null,
    context_energy: null,
    context_tag: null,
  };
  return { ...base, ...def.toClassification(values, text), typed: true, typed_kind: kind, typed_fields: values };
}

/** The text a typed capture stores as raw_text: the primary field, or every filled field joined. */
export function textForTyped(kind: TypedKind, values: FieldValues): string {
  const def = ENTITY_REGISTRY[kind];
  const primary = str(values[def.primary]);
  if (primary) return primary;
  return def.fields
    .filter((f) => !f.hidden)
    .map((f) => {
      const v = values[f.name];
      const s = Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "yes" : "") : str(v);
      return s ? `${f.label}: ${s}` : "";
    })
    .filter(Boolean)
    .join("\n");
}
