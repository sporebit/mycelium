-- Bank accounts discovered during CSV import.
-- Auto-created the first time an unseen account_number appears.
create table if not exists bank_accounts (
  id             uuid        primary key default gen_random_uuid(),
  user_id        text        not null,
  bank           text        not null default 'Halifax',
  account_number text        not null,
  sort_code      text,
  label          text,
  created_at     timestamptz not null default now(),
  unique (user_id, account_number)
);

alter table bank_accounts enable row level security;
create policy "deny all" on bank_accounts as restrictive using (false);
create index if not exists bank_accounts_user_id_idx on bank_accounts (user_id);

-- Individual bank transactions imported from CSV exports.
create table if not exists transactions (
  id             uuid           primary key default gen_random_uuid(),
  user_id        text           not null,
  account_id     uuid           not null references bank_accounts(id),
  txn_date       date           not null,
  txn_type       text           not null,
  description    text           not null,
  amount         numeric(12,2)  not null,  -- signed: credit +, debit -
  debit          numeric(12,2),
  credit         numeric(12,2),
  balance        numeric(12,2)  not null,
  category       text,
  dedup_hash     text           not null unique,
  created_at     timestamptz    not null default now()
);

alter table transactions enable row level security;
create policy "deny all" on transactions as restrictive using (false);
create index if not exists transactions_user_date_idx on transactions (user_id, txn_date desc);
create index if not exists transactions_account_idx on transactions (account_id);
