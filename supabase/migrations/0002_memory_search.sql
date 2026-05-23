-- ---------------------------------------------------------------------------
-- search_memory_chunks
-- Cosine-similarity search over memory_chunks scoped to a single user.
-- Returns matches above similarity_threshold, ranked best-first.
-- ---------------------------------------------------------------------------
create or replace function search_memory_chunks(
  query_embedding vector(1536),
  p_user_id text,
  match_count int default 20,
  similarity_threshold float default 0.3
)
returns table (
  id uuid,
  source_type text,
  source_id uuid,
  text text,
  similarity float,
  created_at timestamptz
)
language sql
stable
as $$
  select
    mc.id,
    mc.source_type,
    mc.source_id,
    mc.text,
    1 - (mc.embedding <=> query_embedding) as similarity,
    mc.created_at
  from memory_chunks mc
  where mc.user_id = p_user_id
    and 1 - (mc.embedding <=> query_embedding) > similarity_threshold
  order by mc.embedding <=> query_embedding asc
  limit match_count;
$$;

grant execute on function search_memory_chunks to service_role;
