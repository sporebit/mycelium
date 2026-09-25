import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { normaliseAlias } from "@/lib/people/normalise";
import { addEmail, addPhone, attachContactPoints, parseTier, PERSON_SELECT } from "@/lib/people/contacts";
import type { Person, PersonAlias, PersonWithAliases } from "@/lib/people/types";

export const runtime = "nodejs";

/**
 * GET /api/people?tier=person|contact|all&needs_review=true — live people
 * (deleted hidden, people-contacts C4). Contacts (C1) only when asked for:
 * the pickers and the default list see persons.
 */
export async function GET(req: NextRequest) {
  const needsReview = req.nextUrl.searchParams.get("needs_review") === "true";
  const tier = parseTier(req.nextUrl.searchParams.get("tier"), "person");

  try {
    const supabase = await createUserClient();
    let q = supabase
      .from("people")
      .select(PERSON_SELECT)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (tier !== "all") q = q.eq("tier", tier);
    if (needsReview) q = q.eq("needs_review", true);
    const { data: peopleRows, error } = await q;
    if (error) {
      console.error("[/api/people GET]", error);
      return NextResponse.json({ error: "fetch failed" }, { status: 500 });
    }
    auditListRead(req, peopleRows, "organisation", "people");
    const people = await attachContactPoints(supabase, (peopleRows ?? []) as Person[]);

    // Attach aliases + mention counts in a couple of batched queries
    const ids = people.map((p) => p.id);
    const aliasByPerson = new Map<string, PersonAlias[]>();
    const mentionCountByPerson = new Map<string, number>();
    const quoteCountByPerson = new Map<string, number>();
    const daysByPerson = new Map<string, number>();
    const lastMentionByPerson = new Map<string, string>();
    if (ids.length > 0) {
      const [aliasRes, mentionRes, quoteRes, daysRes] = await Promise.all([
        supabase
          .from("people_aliases")
          .select("id, person_id, alias, is_primary, created_at")
          .in("person_id", ids),
        supabase
          .from("people_mentions")
          .select("person_id, created_at")
          .in("person_id", ids),
        supabase.from("quotes").select("said_by_person_id").in("said_by_person_id", ids),
        supabase.from("people_daylog_stats").select("person_id, days_together").in("person_id", ids),
      ]);
      for (const d of (daysRes.data ?? []) as Array<{ person_id: string; days_together: number }>) daysByPerson.set(d.person_id, d.days_together);
      for (const q of (quoteRes.data ?? []) as Array<{ said_by_person_id: string }>) {
        quoteCountByPerson.set(q.said_by_person_id, (quoteCountByPerson.get(q.said_by_person_id) ?? 0) + 1);
      }
      for (const a of (aliasRes.data ?? []) as PersonAlias[]) {
        const list = aliasByPerson.get(a.person_id) ?? [];
        list.push(a);
        aliasByPerson.set(a.person_id, list);
      }
      type MentionAgg = { person_id: string; created_at: string };
      for (const m of (mentionRes.data ?? []) as MentionAgg[]) {
        mentionCountByPerson.set(
          m.person_id,
          (mentionCountByPerson.get(m.person_id) ?? 0) + 1
        );
        const prev = lastMentionByPerson.get(m.person_id);
        if (!prev || m.created_at > prev) lastMentionByPerson.set(m.person_id, m.created_at);
      }
      // Sort aliases — primary first, then by created_at
      for (const list of aliasByPerson.values()) {
        list.sort((a, b) => {
          if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
          return a.created_at.localeCompare(b.created_at);
        });
      }
    }

    const withAliases: PersonWithAliases[] = people.map((p) => ({
      ...p,
      aliases: aliasByPerson.get(p.id) ?? [],
      mention_count: mentionCountByPerson.get(p.id) ?? 0,
      quote_count: quoteCountByPerson.get(p.id) ?? 0,
      days_together: daysByPerson.get(p.id) ?? 0,
      last_mention_at: lastMentionByPerson.get(p.id) ?? null,
    }));

    // Review-count for the UI badge
    const reviewCount = withAliases.filter((p) => p.needs_review).length;

    return NextResponse.json({ people: withAliases, review_count: reviewCount, tier });
  } catch (err) {
    console.error("[/api/people GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = {
  first_name?: string;
  last_name?: string | null;
  display_name?: string | null;
  relationship?: string | null;
  /** One number / address on create; more on the person page. */
  phone?: string | null;
  email?: string | null;
  phones?: Array<{ number_raw: string; label?: string | null }>;
  emails?: Array<{ email: string; label?: string | null }>;
  birthday?: string | null;
  address?: string | null;
  where_we_met?: string | null;
  mutual_interests?: string | null;
  notes?: string | null;
  aliases?: string[];
  tier?: "person" | "contact";
};

/** POST — create a person + at least one primary alias. */
export async function POST(req: NextRequest) {

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const firstName = body.first_name?.trim();
  if (!firstName) {
    return NextResponse.json({ error: "first_name required" }, { status: 400 });
  }
  const displayName = body.display_name?.trim() || null;
  const lastName = body.last_name?.trim() || null;

  try {
    const supabase = await createUserClient();

    // Refuse duplicates with the exact same first+last name
    const { data: dup } = await supabase
      .from("people")
      .select("id, display_name")
      .is("deleted_at", null)
      .ilike("first_name", firstName)
      .is("last_name", lastName)
      .maybeSingle();
    if (dup?.id && !displayName) {
      return NextResponse.json(
        {
          error:
            "A person with this name exists. Use a different display_name to distinguish.",
        },
        { status: 409 }
      );
    }

    const { data: created, error } = await supabase
      .from("people")
      .insert({ first_name: firstName,
        last_name: lastName,
        display_name: displayName,
        relationship: body.relationship ?? null,
        birthday: body.birthday ?? null,
        address: body.address ?? null,
        where_we_met: body.where_we_met ?? null,
        mutual_interests: body.mutual_interests ?? null,
        notes: body.notes ?? null,
        tier: body.tier === "contact" ? "contact" : "person",
        needs_review: false,
      })
      .select(PERSON_SELECT)
      .single();
    if (error || !created) {
      console.error("[/api/people POST]", error);
      return NextResponse.json({ error: "create failed" }, { status: 500 });
    }
    const personId = (created as Person).id;

    // Numbers and emails live in their own tables (0140)
    const phones = [...(body.phone?.trim() ? [{ number_raw: body.phone }] : []), ...(Array.isArray(body.phones) ? body.phones : [])];
    const emails = [...(body.email?.trim() ? [{ email: body.email }] : []), ...(Array.isArray(body.emails) ? body.emails : [])];
    let i = 0;
    for (const p of phones) if (p?.number_raw) await addPhone(supabase, personId, { number_raw: p.number_raw, label: p.label ?? null, sort_order: i++ });
    i = 0;
    for (const e of emails) if (e?.email) await addEmail(supabase, personId, { email: e.email, label: e.label ?? null, sort_order: i++ });

    // Primary alias — display_name if present, else first_name
    const primary = normaliseAlias(displayName || firstName);
    const extras = (body.aliases ?? [])
      .map((a) => normaliseAlias(a))
      .filter((a) => a && a !== primary);
    const aliasRows: { person_id: string; alias: string; is_primary: boolean }[] = [
      { person_id: personId, alias: primary, is_primary: true },
      ...Array.from(new Set(extras)).map((alias) => ({
        person_id: personId,
        alias,
        is_primary: false,
      })),
    ];
    await supabase.from("people_aliases").insert(aliasRows);

    const [person] = await attachContactPoints(supabase, [created as Person]);
    return NextResponse.json({ person });
  } catch (err) {
    console.error("[/api/people POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
