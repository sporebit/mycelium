-- 0034 — Entity review rules + pending-entity queue.
--
-- When a voice/Telegram capture mentions a NEW entity (a name not in
-- people, a project not in projects, etc.) we don't want to silently
-- auto-create. The pending_entities row diverts the entity to
-- /compost/review for explicit approval. Manual UI creation (clicking
-- "+ New person") bypasses this entirely — those are explicit by
-- definition.
--
-- The rules table lets the user configure which entity types should
-- pause for review and which should auto-create. Seeded with sensible
-- defaults for the configured user.

CREATE TABLE IF NOT EXISTS entity_review_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  entity_type text NOT NULL
    CHECK (entity_type IN ('person', 'project', 'workout', 'food')),
  review_new boolean NOT NULL DEFAULT true,
  review_low_confidence boolean NOT NULL DEFAULT true,
  auto_create_threshold integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type)
);

ALTER TABLE entity_review_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny all" ON entity_review_rules;
CREATE POLICY "deny all" ON entity_review_rules AS RESTRICTIVE USING (false);

CREATE TABLE IF NOT EXISTS pending_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  capture_id uuid REFERENCES raw_captures(id) ON DELETE CASCADE,
  entity_type text NOT NULL
    CHECK (entity_type IN ('person', 'project', 'workout', 'food')),
  entity_name text NOT NULL,
  additional_data jsonb,
  resolved_at timestamptz,
  resolved_action text
    CHECK (resolved_action IS NULL OR resolved_action IN ('create_new', 'link_existing', 'reject')),
  resolved_entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pending_entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny all" ON pending_entities;
CREATE POLICY "deny all" ON pending_entities AS RESTRICTIVE USING (false);

CREATE INDEX IF NOT EXISTS pending_entities_user_unresolved_idx
  ON pending_entities (user_id, created_at DESC)
  WHERE resolved_at IS NULL;

DO $$
DECLARE
  uid text := current_setting('app.user_id', true);
BEGIN
  IF uid IS NULL OR uid = '' THEN
    uid := 'phil';
  END IF;
  INSERT INTO entity_review_rules (user_id, entity_type, review_new) VALUES
    (uid, 'person',  true),
    (uid, 'project', true),
    (uid, 'workout', false),
    (uid, 'food',    false)
  ON CONFLICT (user_id, entity_type) DO NOTHING;
END $$;
