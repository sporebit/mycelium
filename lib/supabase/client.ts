import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser-side client using the anon/publishable key.
 * Subject to RLS — only sees what RLS policies allow.
 */
export function createBrowserClient() {
  return createClient(supabaseUrl, anonKey);
}
