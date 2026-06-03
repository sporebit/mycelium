-- PayPal payment legs for classification and Part 2 matching.

CREATE TABLE IF NOT EXISTS paypal_payments (
  id                      uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 text           NOT NULL,
  transaction_id          text           NOT NULL UNIQUE,
  ref_txn_id              text,
  paypal_date             date           NOT NULL,
  merchant_name           text,
  description             text           NOT NULL,
  currency                text           NOT NULL DEFAULT 'GBP',
  gross                   numeric(12,2)  NOT NULL,
  fee                     numeric(12,2)  NOT NULL,
  net                     numeric(12,2)  NOT NULL,
  amount                  numeric(12,2)  NOT NULL,
  funded                  boolean        NOT NULL DEFAULT false,
  funding_type            text,
  match_status            text           NOT NULL DEFAULT 'pending',
  matched_transaction_id  uuid           REFERENCES transactions(id),
  created_at              timestamptz    NOT NULL DEFAULT now()
);

ALTER TABLE paypal_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny all" ON paypal_payments AS RESTRICTIVE USING (false);

CREATE INDEX IF NOT EXISTS paypal_payments_user_id_idx ON paypal_payments (user_id);
CREATE INDEX IF NOT EXISTS paypal_payments_ref_txn_id_idx ON paypal_payments (ref_txn_id);
CREATE INDEX IF NOT EXISTS paypal_payments_match_status_idx ON paypal_payments (match_status);

-- Enrichment columns for Part 2 (unused now, avoids a future migration).
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS enriched_merchant text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS enrichment_source text;
