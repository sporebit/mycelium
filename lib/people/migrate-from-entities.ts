import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseAlias } from "./normalise";

export type MigrationStats = {
  entities_seen: number;
  people_created: number;
  people_existing: number;
  aliases_created: number;
  mentions_created: number;
};

/**
 * Idempotent: migrate person-typed entities into the people table.
 *
 * Strategy:
 *  - For each entities row with kind = 'person' (case-insensitive), check if
 *    a person already exists for this user by primary alias match — if so,
 *    skip the creation. Otherwise create a new people row + primary alias.
 *  - Tasks keep their entity_id (NOT migrated). For each task with a
 *    person-entity, we DO create a people_mentions row so the task is
 *    discoverable from the person detail page. Mention rows are deduped
 *    on (source_type, source_id, person_id).
 *
 * Re-running is safe: existing people, aliases, and mentions are detected
 * via the unique constraints and skipped.
 */
export async function migrateFromEntities(
  supabase: SupabaseClient,
  userId: string
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    entities_seen: 0,
    people_created: 0,
    people_existing: 0,
    aliases_created: 0,
    mentions_created: 0,
  };

  const { data: entityRows } = await supabase
    .from("entities")
    .select("id, name, kind")
    .eq("user_id", userId);
  type EntityRow = { id: string; name: string; kind: string };
  const entities = ((entityRows ?? []) as EntityRow[]).filter(
    (e) => e.kind?.toLowerCase() === "person"
  );
  stats.entities_seen = entities.length;

  // entity_id → person_id mapping for the mentions pass below
  const entityToPerson = new Map<string, string>();

  for (const ent of entities) {
    const name = normaliseAlias(ent.name);
    if (!name) continue;
    const [first, ...rest] = name.split(" ");
    const last = rest.length > 0 ? rest.join(" ") : null;

    // Existing match — find by primary alias = name OR by exact first/last
    const { data: aliasMatch } = await supabase
      .from("people_aliases")
      .select("person_id, people:person_id!inner(user_id)")
      .ilike("alias", name);
    type AliasRow = {
      person_id: string;
      people: { user_id: string } | { user_id: string }[];
    };
    const owned = ((aliasMatch ?? []) as AliasRow[]).find((r) => {
      const j = Array.isArray(r.people) ? r.people[0] : r.people;
      return j?.user_id === userId;
    });

    let personId: string;
    if (owned) {
      personId = owned.person_id;
      stats.people_existing += 1;
    } else {
      const { data: created, error } = await supabase
        .from("people")
        .insert({
          user_id: userId,
          first_name: first,
          last_name: last,
          notes: "Migrated from entities table",
        })
        .select("id")
        .single();
      if (error || !created) continue;
      personId = created.id as string;
      stats.people_created += 1;
      const { error: aliasErr } = await supabase
        .from("people_aliases")
        .insert({ person_id: personId, alias: name, is_primary: true });
      if (!aliasErr) stats.aliases_created += 1;
    }
    entityToPerson.set(ent.id, personId);
  }

  // Mentions pass: for each task with a person-typed entity_id, link the task.
  if (entityToPerson.size > 0) {
    const entityIds = Array.from(entityToPerson.keys());
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("id, entity_id, entity_name")
      .eq("user_id", userId)
      .in("entity_id", entityIds);
    type TaskRow = {
      id: string;
      entity_id: string;
      entity_name: string | null;
    };
    const tasks = (taskRows ?? []) as TaskRow[];
    for (const t of tasks) {
      const personId = entityToPerson.get(t.entity_id);
      if (!personId) continue;
      // Dedupe: skip if a mention with this source already exists.
      const { data: existing } = await supabase
        .from("people_mentions")
        .select("id")
        .eq("source_type", "task")
        .eq("source_id", t.id)
        .eq("person_id", personId)
        .maybeSingle();
      if (existing?.id) continue;
      const raw = t.entity_name ?? "";
      const { error } = await supabase.from("people_mentions").insert({
        user_id: userId,
        person_id: personId,
        source_type: "task",
        source_id: t.id,
        raw_alias: raw || "(migrated)",
        confidence: "high",
        needs_review: false,
        resolved_at: new Date().toISOString(),
      });
      if (!error) stats.mentions_created += 1;
    }
  }

  return stats;
}
