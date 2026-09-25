-- 0138_capture_learning.sql
-- Typed capture form (MYC-161): one learning row per capture — what the
-- classifier predicted, what the user chose on the typed form, what was
-- approved in review or accepted from the Tickets Inbox. The corrections
-- are fed back into the classifier prompt as few-shot examples
-- (lib/capture/learning.ts). Adopted into spaces under
-- organisation.captures with the 0111 policy + grant loop inlined for this
-- table (the 0124 lesson). Depends on: 0137.

create table if not exists public.capture_learning (
	id                    uuid primary key default gen_random_uuid(),
	capture_id            uuid not null references public.raw_captures(id) on delete cascade,
	text                  text not null,
	source                text not null default 'web',
	predicted_kind        text,
	predicted_fields      jsonb,
	predicted_llm_source  text,
	chosen_kind           text,
	chosen_fields         jsonb,
	approved_kind         text,
	approved_fields       jsonb,
	approved_at           timestamptz,
	created_at            timestamptz not null default now(),
	updated_at            timestamptz not null default now(),
	constraint capture_learning_one_per_capture unique (capture_id)
);

select app.adopt_table('capture_learning', 'raw_captures', 'capture_id');
alter table public.capture_learning enable row level security;
create index if not exists capture_learning_space_updated_idx on public.capture_learning (space_id, updated_at desc);
create index if not exists capture_learning_corrections_idx on public.capture_learning (space_id, updated_at desc)
	where approved_kind is not null or chosen_kind is not null;

insert into public.entity_groups (table_name, section, entity_group)
values ('capture_learning', 'organisation', 'captures')
on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;

-- the 0111 policy + grant loop, for this table only
do $$
declare
	r    record;
	k    text;
begin
	for r in select table_name, section, entity_group from public.entity_groups where table_name = 'capture_learning' loop
		k := r.section || '.' || r.entity_group;
		execute format('drop policy if exists "deny all" on public.%I', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_select', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_insert', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_update', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_delete', r.table_name);
		execute format('create policy %I on public.%I for select to authenticated using (space_id in (select app.accessible_spaces(%L, %L)))',
			r.table_name || '_select', r.table_name, k, 'view');
		execute format('create policy %I on public.%I for insert to authenticated with check (space_id in (select app.accessible_spaces(%L, %L)))',
			r.table_name || '_insert', r.table_name, k, 'create_delete');
		execute format('create policy %I on public.%I for update to authenticated using (space_id in (select app.accessible_spaces(%L, %L))) with check (space_id in (select app.accessible_spaces(%L, %L)))',
			r.table_name || '_update', r.table_name, k, 'edit', k, 'edit');
		execute format('create policy %I on public.%I for delete to authenticated using (space_id in (select app.accessible_spaces(%L, %L)))',
			r.table_name || '_delete', r.table_name, k, 'create_delete');
		execute format('grant select, insert, update, delete on public.%I to authenticated', r.table_name);
		execute format('alter table public.%I alter column space_id set default app.personal_space()', r.table_name);
		execute format('alter table public.%I alter column created_by set default auth.uid()', r.table_name);
	end loop;
end
$$;
