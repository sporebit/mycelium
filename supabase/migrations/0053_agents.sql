-- 0053 — agents: AI agent conversations + memory

CREATE TABLE agents (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  tagline text NOT NULL,
  accent_colour text NOT NULL
);

CREATE TABLE agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL REFERENCES agents(id),
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

CREATE TABLE agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE agent_memory (
  agent_id text PRIMARY KEY REFERENCES agents(id),
  summary text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

INSERT INTO agents (id, display_name, tagline, accent_colour) VALUES
  ('fitness', 'The Fitness Coach', 'Training, movement, recovery', '#84f5b8'),
  ('finance', 'The Advisor', 'Spending, saving, investing', '#6db8f5'),
  ('tasks', 'The Assistant', 'Tasks, projects, life admin', '#f5b56d'),
  ('da_boi', 'Da Boi', 'Knows everything. Says it straight.', '#5de8e0');

INSERT INTO agent_memory (agent_id, summary) VALUES
  ('fitness', ''),
  ('finance', ''),
  ('tasks', ''),
  ('da_boi', '');
