-- Multi-bank support: add external_key/account_type to bank_accounts,
-- add fee/currency/state/timestamps to transactions.

-- ── bank_accounts ──

ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS external_key text;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'current';

UPDATE bank_accounts SET external_key = account_number WHERE external_key IS NULL;

ALTER TABLE bank_accounts ALTER COLUMN external_key SET NOT NULL;
ALTER TABLE bank_accounts ALTER COLUMN account_number DROP NOT NULL;
ALTER TABLE bank_accounts ALTER COLUMN bank DROP DEFAULT;

ALTER TABLE bank_accounts DROP CONSTRAINT IF EXISTS bank_accounts_user_id_account_number_key;
ALTER TABLE bank_accounts ADD CONSTRAINT bank_accounts_user_bank_external_key_key
  UNIQUE (user_id, bank, external_key);

-- ── transactions ──

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee numeric(12,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GBP';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE transactions ALTER COLUMN balance DROP NOT NULL;
