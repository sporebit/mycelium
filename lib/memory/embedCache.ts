import { generateEmbedding } from "@/lib/openai/embeddings";

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 100;

type Entry = { embedding: number[]; expiresAt: number };
const cache = new Map<string, Entry>();

function evictExpired() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
  // If still over the cap, drop oldest insertion-order entries
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getQueryEmbedding(query: string): Promise<number[]> {
  const key = normalize(query);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.embedding;
  const embedding = await generateEmbedding(query);
  cache.set(key, { embedding, expiresAt: Date.now() + TTL_MS });
  evictExpired();
  return embedding;
}
