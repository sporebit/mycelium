import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChunkMeta,
  EnrichedSource,
  SearchMatch,
} from "./types";

export type RawRpcRow = {
  id: string;
  source_type: string;
  source_id: string | null;
  text: string;
  similarity: number;
  created_at: string;
};

export async function searchChunks(
  supabase: SupabaseClient,
  userId: string,
  embedding: number[],
  matchCount = 20,
  similarityThreshold = 0.3
): Promise<ChunkMeta[]> {
  const { data, error } = await supabase.rpc("search_memory_chunks", {
    query_embedding: embedding,
    p_user_id: userId,
    match_count: matchCount,
    similarity_threshold: similarityThreshold,
  });
  if (error) throw new Error(`search_memory_chunks failed: ${error.message}`);
  return ((data ?? []) as RawRpcRow[]).map((r) => ({
    id: r.id,
    source_type: r.source_type,
    source_id: r.source_id,
    text: r.text,
    similarity: r.similarity,
    created_at: r.created_at,
  }));
}

type CaptureRow = {
  id: string;
  raw_text: string | null;
  classification: unknown;
  source: string | null;
  created_at: string;
};

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  urgency: string | null;
  completed_at: string | null;
  created_at: string;
  entities: { name: string } | { name: string }[] | null;
};

export async function enrichSources(
  supabase: SupabaseClient,
  chunks: ChunkMeta[]
): Promise<Map<string, EnrichedSource>> {
  const captureIds = chunks
    .filter((c) => c.source_type === "capture" && c.source_id)
    .map((c) => c.source_id as string);
  const taskIds = chunks
    .filter((c) => c.source_type === "task" && c.source_id)
    .map((c) => c.source_id as string);

  const captureMap = new Map<string, CaptureRow>();
  if (captureIds.length > 0) {
    const { data } = await supabase
      .from("raw_captures")
      .select("id, raw_text, classification, source, created_at")
      .in("id", captureIds);
    for (const row of (data ?? []) as CaptureRow[]) captureMap.set(row.id, row);
  }

  const taskMap = new Map<string, TaskRow>();
  if (taskIds.length > 0) {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, description, urgency, completed_at, created_at, entities(name)")
      .in("id", taskIds);
    for (const row of (data ?? []) as unknown as TaskRow[]) taskMap.set(row.id, row);
  }

  const out = new Map<string, EnrichedSource>();
  for (const chunk of chunks) {
    if (chunk.source_type === "capture" && chunk.source_id) {
      const row = captureMap.get(chunk.source_id);
      if (row) {
        out.set(chunk.id, {
          type: "capture",
          id: row.id,
          raw_text: row.raw_text,
          classification: row.classification,
          source_origin: row.source,
          created_at: row.created_at,
        });
        continue;
      }
    } else if (chunk.source_type === "task" && chunk.source_id) {
      const row = taskMap.get(chunk.source_id);
      if (row) {
        const ent = Array.isArray(row.entities) ? row.entities[0] : row.entities;
        out.set(chunk.id, {
          type: "task",
          id: row.id,
          title: row.title,
          description: row.description,
          entity_name: ent?.name ?? null,
          urgency: row.urgency,
          completed_at: row.completed_at,
          created_at: row.created_at,
        });
        continue;
      }
    }
    out.set(chunk.id, {
      type: "other",
      source_type: chunk.source_type,
      created_at: chunk.created_at,
    });
  }

  return out;
}

export function buildMatches(
  chunks: ChunkMeta[],
  enrichedMap: Map<string, EnrichedSource>
): SearchMatch[] {
  return chunks.map((c) => ({
    chunk: c,
    source: enrichedMap.get(c.id) ?? null,
  }));
}
