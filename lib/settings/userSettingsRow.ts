import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Update the caller's user_settings row.
 *
 * PostgREST refuses an UPDATE with no WHERE clause ("UPDATE requires a WHERE
 * clause"), so the old `.from("user_settings").update(...)` calls that relied
 * on RLS to scope the row fail. RLS still scopes the *read*; we take the one
 * visible row's id and update by it. When no row exists yet (a new user), one
 * is inserted with the patch applied.
 */
export async function updateUserSettings<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  patch: T,
  opts: { select?: string } = {},
): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  const select = opts.select ?? "*";
  const { data: existing, error: readErr } = await supabase
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (readErr) return { data: null, error: readErr };

  const payload = { ...patch, updated_at: new Date().toISOString() };
  if (!existing?.id) {
    const { data, error } = await supabase
      .from("user_settings")
      .insert(payload)
      .select(select)
      .single();
    return { data: (data as Record<string, unknown> | null) ?? null, error };
  }
  const { data, error } = await supabase
    .from("user_settings")
    .update(payload)
    .eq("id", existing.id as string)
    .select(select)
    .single();
  return { data: (data as Record<string, unknown> | null) ?? null, error };
}
