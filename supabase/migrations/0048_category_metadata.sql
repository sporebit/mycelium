-- Category metadata: source tracking, AI confidence, manual lock.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_source text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ai_confidence numeric(3,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_locked boolean NOT NULL DEFAULT false;
