import { createServerClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/openai/embeddings";

export async function embedAndStore(opts: {
  userId: string;
  sourceType: string;
  sourceId: string;
  text: string;
}): Promise<void> {
  try {
    const embedding = await generateEmbedding(opts.text);
    const supabase = createServerClient();
    const { error } = await supabase.from("memory_chunks").insert({
      user_id: opts.userId,
      source_type: opts.sourceType,
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
