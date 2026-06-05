import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveExerciseNames(
  supabase: SupabaseClient,
  uid: string,
  name: string
): Promise<string[]> {
  const { data: aliasRow } = await supabase
    .from("exercise_aliases")
    .select("canonical_name")
    .eq("user_id", uid)
    .ilike("alias", name)
    .limit(1)
    .maybeSingle();

  const canonical = aliasRow?.canonical_name ?? name;

  const { data: aliases } = await supabase
    .from("exercise_aliases")
    .select("alias")
    .eq("user_id", uid)
    .ilike("canonical_name", canonical);

  const names = [canonical, ...(aliases ?? []).map((a: { alias: string }) => a.alias)];
  return [...new Set(names)];
}
