-- Migration: receipt splits — who else a receipt's lines belong to, and what
-- has been paid back.
--
-- The owner is never a participant and never has a share row. His portion is
-- the remainder: line_total minus everyone else's share. Storing only one side
-- of the split means the two sides cannot drift apart, and there is no row to
-- keep in step when a line total is edited.
--
-- Depends on: 0092_receipts.sql (receipts, receipt_lines),
--             0010_people_overhaul.sql (people),
--             0036_bank_transactions.sql (transactions)
-- Rollback:
--   DROP TABLE receipt_settlements;
--   DROP TABLE receipt_line_shares;
--   DROP TABLE receipt_participants;

-- Who is on this receipt at all. A participant with no line shares is still a
-- meaningful row: it is who the chips on each line offer.
create table if not exists receipt_participants (
  id                uuid           primary key default gen_random_uuid(),
  receipt_id        uuid           not null references receipts(id) on delete cascade,
  person_id         uuid           not null references people(id),
  -- The share this person takes when a line is tagged for them without an
  -- explicit figure. Null means "split evenly with whoever else is tagged".
  default_share_pct numeric(5,2)   check (default_share_pct is null
                                          or (default_share_pct > 0 and default_share_pct <= 100)),
  created_at        timestamptz    not null default now(),
  unique (receipt_id, person_id)
);

alter table receipt_participants enable row level security;
create policy "deny all" on receipt_participants as restrictive using (false);

create index if not exists receipt_participants_receipt_idx
  on receipt_participants (receipt_id);
create index if not exists receipt_participants_person_idx
  on receipt_participants (person_id);

-- One person's claim on one line, expressed either as a percentage of the line
-- or as a count of the line's units. Exactly one of the two, never both and
-- never neither — a row with both set would have two different answers to what
-- it is worth.
create table if not exists receipt_line_shares (
  id              uuid          primary key default gen_random_uuid(),
  receipt_line_id uuid          not null references receipt_lines(id) on delete cascade,
  person_id       uuid          not null references people(id),
  share_pct       numeric(5,2)  check (share_pct is null or (share_pct > 0 and share_pct <= 100)),
  units           numeric(10,3) check (units is null or units > 0),
  created_at      timestamptz   not null default now(),
  constraint receipt_line_shares_one_measure
    check ((share_pct is null) <> (units is null)),
  unique (receipt_line_id, person_id)
);

alter table receipt_line_shares enable row level security;
create policy "deny all" on receipt_line_shares as restrictive using (false);

create index if not exists receipt_line_shares_line_idx
  on receipt_line_shares (receipt_line_id);
create index if not exists receipt_line_shares_person_idx
  on receipt_line_shares (person_id);

-- Money actually handed back. Independent of any one receipt: a person settles
-- a balance, not a line. transaction_id links a settlement to the bank
-- transaction that carried it, once the finance matcher exists — null until
-- then, and null forever for cash.
create table if not exists receipt_settlements (
  id             uuid          primary key default gen_random_uuid(),
  user_id        text          not null,
  person_id      uuid          not null references people(id),
  amount         numeric(12,2) not null,
  paid_at        date          not null,
  transaction_id uuid          references transactions(id),
  note           text,
  created_at     timestamptz   not null default now()
);

alter table receipt_settlements enable row level security;
create policy "deny all" on receipt_settlements as restrictive using (false);

create index if not exists receipt_settlements_user_person_idx
  on receipt_settlements (user_id, person_id);
create index if not exists receipt_settlements_paid_at_idx
  on receipt_settlements (user_id, paid_at);

grant all on receipt_participants, receipt_line_shares, receipt_settlements
  to service_role;
