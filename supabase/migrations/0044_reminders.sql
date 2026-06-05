-- Reminders: scheduled messages delivered via Telegram.

create table reminders (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,
  message      text not null,
  due_at       timestamptz not null,
  recurrence   text,                 -- null = one-shot, or: daily, weekly, monthly
  sent_at      timestamptz,          -- null = pending, set when delivered
  cancelled    boolean not null default false,
  created_at   timestamptz not null default now()
);

create index idx_reminders_user on reminders (user_id);
create index idx_reminders_due  on reminders (due_at) where sent_at is null and cancelled = false;

alter table reminders enable row level security;

create policy "reminders_user" on reminders
  for all using (user_id = current_setting('app.user_id', true))
  with check  (user_id = current_setting('app.user_id', true));
