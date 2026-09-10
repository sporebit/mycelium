import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEmbedding } from "@/lib/openai/embeddings";

export async function embedAndStore(opts: {
  /** Client to write with: `await createUserClient()` on the request
   *  path, or the client withUser() handed a caller with no session
   *  (Telegram webhook, crons). */
  supabase: SupabaseClient;
  sourceType: string;
  sourceId: string;
  text: string;
}): Promise<void> {
  try {
    const embedding = await generateEmbedding(opts.text);
    const supabase = opts.supabase;
    const { error } = await supabase.from("memory_chunks").insert({ source_type: opts.sourceType,
      source_id: opts.sourceId,
      text: opts.text,
      embedding,
    });
    if (error) {
      console.error("[embedAndStore] insert failed:", error);
    }
  } catch (err) {
    console.error("[embedAndStore] failed:", err);
  }
}
