export type BankAccount = {
  id: string;
  user_id: string;
  bank: string;
  account_number: string;
  sort_code: string | null;
  label: string | null;
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
  balance: number;
  category: string | null;
  dedup_hash: string;
  created_at: string;
  /** Hydrated client-side or via join. */
  account_number?: string;
  account_label?: string;
};

export type ImportResult = {
  file: string;
  imported: number;
  skipped: number;
  errors: { line: number; raw: string; reason: string }[];
};
