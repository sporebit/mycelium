import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localSql, localStackEnv } from "@/lib/access/introspect";
import { mintUserJwt } from "@/lib/system/jwt";
import { PHIL_AUTH_UID } from "@/lib/system/identity";
import { queuePendingPerson, resolveMention } from "./resolve-mention";
import { extractNameMentions } from "./regex-extract";
import { addIgnoredTerms, filterIgnored, ignoredForClassifier, ignoredTermKeys, invalidateIgnoredCache } from "./ignored";
import { rejectPerson, restorePerson, setPersonArchived } from "./contacts";
import { resolveSpeaker } from "@/lib/quotes/server";

/**
 * People review on the LOCAL stack (0149, MYC-175, people-review R1–R5):
 * a ticket's unknown Title Case phrase creates no person and one pending
 * row; an ignored term creates neither; an archived alias neither matches
 * nor queues; reject → restore clears the ignore entries; the classifier
 * post-filter drops an ignored mention. Fixtures are synthetic
 * ("review-test:" people, "Zorblat…" phrases) and removed in afterAll.
 * Fails, not skips, when the stack is down.
 */

const env = localStackEnv();
let db: SupabaseClient;
let space = "";

const TICKET_A = "00000000-0000-4000-8000-00000000a149";
const TICKET_B = "00000000-0000-4000-8000-00000000b149";

function one(q: string): string {
  const rows = localSql(q);
  return rows[0]?.[0] ?? "";
}
function count(q: string): number {
  return Number(one(q) || 0);
}

beforeAll(async () => {
  const jwt = await mintUserJwt({ sub: PHIL_AUTH_UID, secret: env.jwtSecret, issuer: `${env.apiUrl}/auth/v1` });
  db = createClient(env.apiUrl, env.anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  space = one(`select personal_space_id from public.profiles where id = '${PHIL_AUTH_UID}'`);
  cleanup();
});

afterAll(() => cleanup());

function cleanup() {
  localSql(`delete from public.people_mentions where source_type = 'task' and source_id in ('${TICKET_A}', '${TICKET_B}')`);
  localSql(`delete from public.pending_entities where entity_type = 'person' and entity_name ilike 'zorblat%'`);
  localSql(`delete from public.people_ignored_terms where term_key like 'zorblat%' or term_key like 'review-test:%' or term_key like 'contacts-test:%'`);
  localSql(`delete from public.people where first_name like 'review-test:%' or first_name ilike 'zorblat%'`);
  invalidateIgnoredCache();
}

function person(first: string, opts: { archived?: boolean } = {}): string {
  const id = one(
    `insert into public.people (first_name, last_name, space_id, created_by, tier${opts.archived ? ", archived_at" : ""}) values ('review-test:${first}', 'Fixture', '${space}', '${PHIL_AUTH_UID}', 'person'${opts.archived ? ", now()" : ""}) returning id`,
  );
  localSql(`insert into public.people_aliases (person_id, alias, is_primary, space_id, created_by) values ('${id}', 'Review-Test:${first}', true, '${space}', '${PHIL_AUTH_UID}')`);
  return id;
}

/** What rebuildTicketMentions does per phrase, without the Next request plumbing. */
async function ticketSave(ticketId: string, title: string): Promise<void> {
  const ignored = await ignoredTermKeys(db);
  for (const e of filterIgnored(extractNameMentions(title), ignored)) {
    const res = await resolveMention(db, e.name_hint);
    await queuePendingPerson(db, res, { sourceKind: "ticket", snippet: title, ticketId });
  }
}

describe("no path creates a person (R1)", () => {
  it("a ticket with an unknown Title Case phrase creates no person and exactly one pending row, even when saved twice", async () => {
    await ticketSave(TICKET_A, "Zorblat Quibbleton fixture title");
    expect(count(`select count(*) from public.people where first_name ilike 'zorblat%'`)).toBe(0);
    expect(count(`select count(*) from public.pending_entities where entity_type = 'person' and entity_name = 'Zorblat Quibbleton' and resolved_at is null`)).toBe(1);
    await ticketSave(TICKET_A, "Zorblat Quibbleton fixture title");
    expect(count(`select count(*) from public.pending_entities where entity_type = 'person' and entity_name = 'Zorblat Quibbleton' and resolved_at is null`)).toBe(1);
    const snippet = one(`select additional_data ->> 'snippet' from public.pending_entities where entity_name = 'Zorblat Quibbleton' and resolved_at is null`);
    expect(snippet).toContain("Zorblat Quibbleton");
  });

  it("the resolver never auto-creates", async () => {
    const r = await resolveMention(db, "Zorblat Nobody");
    expect(r.person_id).toBeNull();
    expect(r.auto_created).toBe(false);
    expect(r.confidence).toBe("unresolved");
    expect(count(`select count(*) from public.people where first_name ilike 'zorblat%'`)).toBe(0);
  });
});

describe("the ignore list (R4)", () => {
  it("an ignored term creates neither a person nor a pending row, and the resolver says why", async () => {
    expect(await addIgnoredTerms(db, ["zorblat  wibble"], "manual")).toBe(1);
    expect(await addIgnoredTerms(db, ["Zorblat Wibble"], "manual")).toBe(0); // same key, kept once
    await ticketSave(TICKET_B, "Zorblat Wibble on the list");
    expect(count(`select count(*) from public.pending_entities where entity_name ilike 'zorblat wibble' and resolved_at is null`)).toBe(0);
    expect(count(`select count(*) from public.people where first_name ilike 'zorblat wibble'`)).toBe(0);
    const r = await resolveMention(db, "Zorblat Wibble");
    expect(r.suppressed).toBe("ignored");
    expect(await queuePendingPerson(db, r, { sourceKind: "ticket" })).toBeNull();
  });

  it("is exact: ignoring Zorblat Smoke leaves Zorblat Smokey alone", async () => {
    await addIgnoredTerms(db, ["Zorblat Smoke"], "manual");
    const r = await resolveMention(db, "Zorblat Smokey");
    expect(r.suppressed).toBeUndefined();
    expect(await queuePendingPerson(db, r, { sourceKind: "ticket" })).not.toBeNull();
  });
});

describe("archive (R3)", () => {
  it("an archived alias neither matches nor queues; unarchive matches again", async () => {
    const id = person("Nathdrix", { archived: true });
    const r = await resolveMention(db, "Review-Test:Nathdrix");
    expect(r.person_id).toBeNull();
    expect(r.suppressed).toBe("archived");
    expect(await queuePendingPerson(db, r, { sourceKind: "ticket" })).toBeNull();
    expect((await resolveSpeaker(db, "Review-Test:Nathdrix")).person_id).toBeNull();
    expect(await setPersonArchived(db, id, false)).toBe(true);
    expect((await resolveMention(db, "Review-Test:Nathdrix")).person_id).toBe(id);
    expect((await resolveSpeaker(db, "Review-Test:Nathdrix")).person_id).toBe(id);
  });

  it("archiving clears needs_review and keeps the row", async () => {
    const id = person("Keepme");
    localSql(`update public.people set needs_review = true where id = '${id}'`);
    expect(await setPersonArchived(db, id, true)).toBe(true);
    expect(one(`select needs_review::text from public.people where id = '${id}'`)).toBe("false");
    expect(one(`select (archived_at is not null)::text from public.people where id = '${id}'`)).toBe("true");
    expect(one(`select (deleted_at is null)::text from public.people where id = '${id}'`)).toBe("true");
  });
});

describe("reject → restore (R2)", () => {
  it("reject bins the person and ignores every alias; restore brings them back and clears the entries", async () => {
    const id = person("Blorptash");
    localSql(`insert into public.people_aliases (person_id, alias, is_primary, space_id, created_by) values ('${id}', 'Review-Test:Blorp', false, '${space}', '${PHIL_AUTH_UID}')`);
    const r = await rejectPerson(db, id);
    expect(r.ok).toBe(true);
    expect(r.ignored).toBeGreaterThanOrEqual(2);
    expect(one(`select (deleted_at is not null)::text from public.people where id = '${id}'`)).toBe("true");
    expect(count(`select count(*) from public.people_ignored_terms where person_id = '${id}' and source = 'reject'`)).toBeGreaterThanOrEqual(2);
    expect((await resolveMention(db, "Review-Test:Blorp")).suppressed).toBe("ignored");

    expect(await restorePerson(db, id)).toBe(true);
    expect(one(`select (deleted_at is null)::text from public.people where id = '${id}'`)).toBe("true");
    expect(count(`select count(*) from public.people_ignored_terms where person_id = '${id}'`)).toBe(0);
    expect((await resolveMention(db, "Review-Test:Blorp")).person_id).toBe(id);
  });
});

describe("the classifier post-filter (R5)", () => {
  it("drops a returned mention whose key is ignored and lists the term in the prompt block", async () => {
    await addIgnoredTerms(db, ["Zorblat Classifier"], "manual");
    invalidateIgnoredCache();
    const { block, keys } = await ignoredForClassifier(db, PHIL_AUTH_UID);
    expect(keys.has("zorblat classifier")).toBe(true);
    expect(block).toContain("Zorblat Classifier");
    const kept = filterIgnored(
      [
        { raw: "zorblat classifier", name_hint: "Zorblat Classifier" },
        { raw: "Luke", name_hint: "Luke" },
      ],
      keys,
    );
    expect(kept.map((m) => m.name_hint)).toEqual(["Luke"]);
  });
});
