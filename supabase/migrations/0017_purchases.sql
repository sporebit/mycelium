-- Migration: purchase capture kind — dedicated table for buy/pay/order intents.
-- Depends on: 0001 (raw_captures)
-- Rollback: DROP TABLE purchases;

create table if not exists purchases (
  id              uuid        primary key default gen_random_uuid(),
  user_id         text        not null,
  title           text        not null,
  amount          numeric,
  currency        text        default 'GBP',
  want_or_need    text        check (want_or_need in ('want', 'need', 'unclear')),
  urgency         text        not null default 'someday'
                              check (urgency in ('today', 'this_week', 'this_month', 'someday')),
  completed_at    timestamptz,
  raw_capture_id  uuid        references raw_captures(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table purchases enable row level security;
create policy "deny all" on purchases as restrictive using (false);

create index if not exists purchases_user_id_idx      on purchases (user_id);
create index if not exists purchases_completed_at_idx on purchases (completed_at);
