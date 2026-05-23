export type ChunkMeta = {
  id: string;
  source_type: string;
  source_id: string | null;
  text: string;
  similarity: number;
  created_at: string;
};

export type CaptureSource = {
  type: "capture";
  id: string;
  raw_text: string | null;
  classification: unknown;
  source_origin: string | null;
  created_at: string;
};

export type TaskSource = {
  type: "task";
  id: string;
  title: string;
  description: string | null;
  entity_name: string | null;
  urgency: string | null;
  completed_at: string | null;
  created_at: string;
};

export type OtherSource = {
  type: "other";
  source_type: string;
  created_at: string;
};

export type EnrichedSource = CaptureSource | TaskSource | OtherSource;

export type SearchMatch = {
  chunk: ChunkMeta;
  source: EnrichedSource | null;
};

export type AskSource = SearchMatch & {
  citation_tag: string; // "C1", "C2", ...
};
