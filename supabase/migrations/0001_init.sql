-- Enable pgvector for semantic search on memory_chunks
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- entities
-- ---------------------------------------------------------------------------
create table if not exists entities (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  name        text        not null,
  kind        text        not null,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

alter table entities enable row level security;
create policy "deny all" on entities as restrictive using (false);

-- ---------------------------------------------------------------------------
-- raw_captures
-- ---------------------------------------------------------------------------
create table if not exists raw_captures (
  id              uuid        primary key default gen_random_uuid(),
  user_id         text        not null,
  source          text        not null,
  raw_text        text,
  audio_url       text,
  classification  jsonb,
  llm_source      text,
  routed_to       text,
  routed_id       uuid,
  created_at      timestamptz not null default now()
);

alter table raw_captures enable row level security;
create policy "deny all" on raw_captures as restrictive using (false);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table if not exists tasks (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            text        not null,
  title              text        not null,
  description        text,
  urgency            text,
  key                boolean     not null default false,
  priority_score     numeric,
  time_estimate_min  int,
  tags               text[],
  due_date           date,
  owner              text,
  entity_id          uuid        references entities (id),
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table tasks enable row level security;
create policy "deny all" on tasks as restrictive using (false);

-- ---------------------------------------------------------------------------
-- daily_logs
-- ---------------------------------------------------------------------------
create table if not exists daily_logs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  log_date    date        not null,
  -- notes holds JSON for habits / nutrition / finance / goals
  notes       text,
  mood        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, log_date)
);

alter table daily_logs enable row level security;
create policy "deny all" on daily_logs as restrictive using (false);

-- ---------------------------------------------------------------------------
-- memory_chunks
-- ---------------------------------------------------------------------------
create table if not exists memory_chunks (
  id           uuid        primary key default gen_random_uuid(),
  user_id      text        not null,
  source_type  text        not null,
  source_id    uuid,
  text         text        not null,
  embedding    vector(1536),
  created_at   timestamptz not null default now()
);

alter table memory_chunks enable row level security;
create policy "deny all" on memory_chunks as restrictive using (false);

-- IVFFlat index for approximate cosine-similarity search
create index if not exists memory_chunks_embedding_idx
  on memory_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
create table if not exists audit_log (
  id             uuid        primary key default gen_random_uuid(),
  user_id        text        not null,
  action         text        not null,
  resource_type  text        not null,
  resource_id    uuid,
  metadata       jsonb,
  created_at     timestamptz not null default now()
);

alter table audit_log enable row level security;
create policy "deny all" on audit_log as restrictive using (false);
