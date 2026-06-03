export type BankAccount = {
  id: string;
  user_id: string;
  bank: string;
  external_key: string;
  account_number: string | null;
  sort_code: string | null;
  label: string | null;
  account_type: string;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  account_id: string;
  txn_date: string;
  txn_type: string;
  description: string;
  amount: number;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  category: string | null;
  dedup_hash: string;
  fee: number | null;
  currency: string;
  state: string | null;
  started_at: string | null;
  completed_at: string | null;
  enriched_merchant: string | null;
  enrichment_source: string | null;
  created_at: string;
  account_number?: string | null;
  account_label?: string | null;
};

export type ImportResult = {
  file: string;
  imported: number;
  skipped: number;
  skipped_by_state?: number;
  paypal_summary?: {
    total_payments: number;
    balance_funded: number;
    card_funded: number;
    bank_funded: number;
  };
  errors: { line: number; raw: string; reason: string }[];
};
