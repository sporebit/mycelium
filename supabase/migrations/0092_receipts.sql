-- Migration: receipts — scanned till receipts, their source images, and the
-- line items parsed out of them.
-- Depends on: nothing (self-contained); follows the RLS/grant pattern in 0017.
-- Rollback:
--   DROP TABLE receipt_lines;
--   DROP TABLE receipt_images;
--   DROP TABLE receipts;
--   DELETE FROM storage.buckets WHERE id = 'receipts';

create table if not exists receipts (
  id            uuid           primary key default gen_random_uuid(),
  user_id       text           not null,
  retailer      text,
  purchased_at  date,
  currency      text           not null default 'GBP',
  subtotal      numeric(12,2),
  vat_total     numeric(12,2),
  total         numeric(12,2),
  -- Sum of receipt_lines.line_total, recomputed on every parse. Kept beside
  -- `total` (what the receipt itself claims) so the two can be reconciled.
  parsed_total  numeric(12,2),
  status        text           not null default 'uploaded'
                               check (status in ('uploaded', 'parsing', 'parsed', 'needs_review', 'failed')),
  review_reason text,
  raw_parse     jsonb,
  created_at    timestamptz    not null default now(),
  updated_at    timestamptz    not null default now()
);

alter table receipts enable row level security;
create policy "deny all" on receipts as restrictive using (false);

create index if not exists receipts_user_purchased_idx on receipts (user_id, purchased_at);

create table if not exists receipt_images (
  id           uuid        primary key default gen_random_uuid(),
  receipt_id   uuid        not null references receipts(id) on delete cascade,
  storage_path text        not null,
  sort_order   int         not null,
  media_type   text        not null,
  created_at   timestamptz not null default now()
);

alter table receipt_images enable row level security;
create policy "deny all" on receipt_images as restrictive using (false);

create index if not exists receipt_images_receipt_id_idx on receipt_images (receipt_id);

create table if not exists receipt_lines (
  id          uuid           primary key default gen_random_uuid(),
  receipt_id  uuid           not null references receipts(id) on delete cascade,
  sort_order  int            not null,
  item_code   text,
  description text           not null,
  quantity    numeric(10,3)  not null default 1,
  unit_price  numeric(12,2),
  vat         numeric(12,2),
  line_total  numeric(12,2)  not null,
  vat_code    text,
  raw_text    text,
  created_at  timestamptz    not null default now()
);

alter table receipt_lines enable row level security;
create policy "deny all" on receipt_lines as restrictive using (false);

create index if not exists receipt_lines_receipt_id_idx on receipt_lines (receipt_id);

grant all on receipts, receipt_images, receipt_lines to service_role;

-- Private storage bucket for the source images. Access is server-side only,
-- via signed URLs minted with the service-role key.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;
