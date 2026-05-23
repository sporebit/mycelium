import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveEntityId(
  supabase: SupabaseClient,
  userId: string,
  entityName: string | null
): Promise<string | null> {
  if (!entityName) return null;

  const { data, error } = await supabase
    .from("entities")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", entityName)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[resolveEntity] lookup error:", error);
    return null;
  }
  return data?.id ?? null;
}
