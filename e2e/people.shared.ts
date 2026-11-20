/**
 * Helpers shared by the People, People review and Quotes specs.
 *
 * Everything these specs create carries `E2E-people-<run>` or
 * `E2E-quotes-<run>` and is tracked by id, so cleanup only ever touches
 * rows the spec made. The run id is letters only: some checks need words
 * the Title Case name extractor will pick up.
 */
import { expect as baseExpect, request as playwrightRequest, type APIRequestContext, type APIResponse } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_API_SECRET, E2E_ORIGIN } from "./support/env.ts";

/**
 * These journeys are longer than a smoke check (an import, a merge, three
 * captures reviewed in a row), so a test gets three minutes rather than the
 * config's ninety seconds. The per-step waits are close to the config's.
 */
export const expect = baseExpect.configure({ timeout: 20_000 });
export const PATIENT = { timeout: 180_000 } as const;
export const PATIENT_USE = { actionTimeout: 20_000, navigationTimeout: 45_000 } as const;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

/** `n` random lowercase letters. */
export function letters(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

/** A Title Case word no real alias is within two edits of: "Zq" + 10 random letters. */
export function titleWord(): string {
  return `Zq${letters(10)}`;
}

/** A request context that acts as Phil through the API secret, for specs running as someone else. */
export async function philApi(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: E2E_ORIGIN, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET } });
}

/** The write budget is shared by every tester acting as Phil; wait out a 429 rather than fail on it. */
export async function send(call: () => Promise<APIResponse>): Promise<APIResponse> {
  let res = await call();
  await expect
    .poll(
      async () => {
        if (res.status() === 429) res = await call();
        return res.status();
      },
      { timeout: 60_000, intervals: [2_000, 5_000] },
    )
    .not.toBe(429);
  return res;
}

export type PersonRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  display_name: string | null;
  tier?: string;
  needs_review: boolean;
  archived_at?: string | null;
  deleted_at?: string | null;
  phones?: Array<{ id: string; number_raw: string; number_e164: string | null; label: string | null; include_in_export: boolean }>;
  emails?: Array<{ id: string; email: string; label: string | null }>;
  aliases?: Array<{ id: string; alias: string; is_primary: boolean }>;
  quote_count?: number;
  snippet?: string | null;
};

export async function createPerson(api: APIRequestContext, body: Record<string, unknown>): Promise<PersonRow> {
  const res = await api.post("/api/people", { data: body });
  expect(res.status(), `create person: ${await res.text()}`).toBe(200);
  return ((await res.json()) as { person: PersonRow }).person;
}

export async function getPerson(api: APIRequestContext, id: string): Promise<PersonRow | null> {
  const res = await api.get(`/api/people/${id}`);
  if (res.status() === 404) return null;
  expect(res.status()).toBe(200);
  return ((await res.json()) as { person: PersonRow }).person;
}

export async function listPeople(api: APIRequestContext, query = "tier=all&archived=all"): Promise<PersonRow[]> {
  const res = await api.get(`/api/people?${query}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { people: PersonRow[] }).people;
}

/** Remove a person the spec created, for good, whatever state it was left in. */
export async function removePerson(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/api/people/${id}?hard=1`);
}

export type IgnoredRow = { id: string; term_key: string; term_raw: string; source: string; person_id: string | null };

export async function listIgnored(api: APIRequestContext): Promise<IgnoredRow[]> {
  const res = await api.get("/api/people/ignored");
  expect(res.status()).toBe(200);
  return ((await res.json()) as { terms: IgnoredRow[] }).terms;
}

/** Take the spec's own words off the ignore list. */
export async function removeIgnored(api: APIRequestContext, words: string[]): Promise<void> {
  const keys = new Set(words.map((w) => w.trim().toLowerCase()));
  for (const t of await listIgnored(api)) if (keys.has(t.term_key)) await api.delete(`/api/people/ignored?id=${t.id}`);
}

export type PendingRow = { id: string; entity_type: string; entity_name: string; additional_data: Record<string, unknown> | null; resolved_at: string | null; resolved_action: string | null };

export async function listPending(api: APIRequestContext, includeResolved = false): Promise<PendingRow[]> {
  const res = await api.get(`/api/pending-entities${includeResolved ? "?resolved=true" : ""}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { pending: PendingRow[] }).pending;
}

export type QuoteRow = {
  id: string;
  text: string;
  raw_text: string | null;
  said_by_person_id: string | null;
  is_own: boolean;
  speaker_confidence: string;
  context: string | null;
  merch: boolean;
  attributed_to: string | null;
  research_status: string;
  research: Record<string, unknown> | null;
  capture_id: string | null;
};

export async function listQuotes(api: APIRequestContext, query = ""): Promise<QuoteRow[]> {
  const res = await api.get(`/api/quotes${query ? `?${query}` : ""}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { quotes: QuoteRow[] }).quotes;
}

export async function createQuote(api: APIRequestContext, body: Record<string, unknown>): Promise<QuoteRow> {
  const res = await send(() => api.post("/api/quotes", { data: { force: true, ...body } }));
  expect(res.status(), `create quote: ${await res.text()}`).toBe(201);
  return ((await res.json()) as { quote: QuoteRow }).quote;
}

/** How many people rows (any state, any space) carry this exact first name. SQL because the bin and other spaces are not one API read. */
export function peopleNamed(firstName: string): number {
  const safe = firstName.replace(/'/g, "''");
  return Number(localSql(`select count(*) from public.people where lower(first_name) = lower('${safe}')`)[0]?.[0] ?? "0");
}

/**
 * Close the spec's own pending rows the way the app does (a reject), then
 * take the words that put on the ignore list off again. The app has no
 * delete for a pending row; a resolved one is out of every queue.
 */
export async function closePending(api: APIRequestContext, names: string[]): Promise<void> {
  const keys = new Set(names.map((n) => n.trim().toLowerCase()));
  for (const p of await listPending(api)) {
    if (keys.has(p.entity_name.trim().toLowerCase())) await api.post(`/api/pending-entities/${p.id}/resolve`, { data: { action: "reject" } });
  }
  await removeIgnored(api, names);
}
