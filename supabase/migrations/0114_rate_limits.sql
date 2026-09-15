-- Migration: rate limiting and second-factor lockout. P12 Part 5.
--
-- One token bucket per key, kept in Postgres so every Vercel instance
-- shares it. rate_limit_take(key, capacity, refill_per_minute, cost) is
-- the only entry point: it refills by elapsed time, takes the cost if the
-- bucket can afford it and says whether it did. Callers pick keys such as
-- 'login:ip:1.2.3.4' or 'invite:user:<uuid>'. Callable by anon because
-- login and magic-link requests happen before there is a session.
--
-- Second factor: ten failed verifications in fifteen minutes lock the
-- account's second factor; a success clears the counter. Failures are
-- recorded by the API route that proxies verification (the browser never
-- talks to GoTrue's MFA endpoint directly for sign-in any more).
--
-- Depends on: 0113 (app.audit).
-- Rollback: drop function rate_limit_take, second_factor_failed,
--   second_factor_locked, second_factor_succeeded; drop table rate_limits,
--   second_factor_failures.

create table if not exists public.rate_limits (
	key        text             primary key,
	tokens     double precision not null,
	updated_at timestamptz      not null default now()
);

alter table public.rate_limits enable row level security;
-- No policies: only the function below touches it.

create or replace function public.rate_limit_take(
	p_key text,
	p_capacity integer,
	p_refill_per_minute double precision,
	p_cost integer default 1
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_tokens  double precision;
	v_updated timestamptz;
	v_now     timestamptz := clock_timestamp();
begin
	insert into public.rate_limits (key, tokens, updated_at)
	values (p_key, p_capacity, v_now)
	on conflict (key) do nothing;

	select tokens, updated_at into v_tokens, v_updated
	from public.rate_limits where key = p_key for update;

	v_tokens := least(p_capacity::double precision,
		v_tokens + extract(epoch from (v_now - v_updated)) / 60.0 * p_refill_per_minute);

	if v_tokens >= p_cost then
		update public.rate_limits set tokens = v_tokens - p_cost, updated_at = v_now where key = p_key;
		return true;
	end if;
	update public.rate_limits set tokens = v_tokens, updated_at = v_now where key = p_key;
	return false;
end
$$;

revoke all on function public.rate_limit_take(text, integer, double precision, integer) from public;
grant execute on function public.rate_limit_take(text, integer, double precision, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------

create table if not exists public.second_factor_failures (
	user_id uuid        not null,
	at      timestamptz not null default now()
);

create index if not exists second_factor_failures_user_idx on public.second_factor_failures (user_id, at desc);

alter table public.second_factor_failures enable row level security;

create or replace function public.second_factor_locked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select count(*) >= 10
	from public.second_factor_failures f
	where f.user_id = auth.uid() and f.at > now() - interval '15 minutes'
$$;

create or replace function public.second_factor_failed()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_locked boolean;
begin
	if auth.uid() is null then raise exception 'Not signed in'; end if;
	insert into public.second_factor_failures (user_id) values (auth.uid());
	delete from public.second_factor_failures where user_id = auth.uid() and at < now() - interval '1 day';
	select public.second_factor_locked() into v_locked;
	if v_locked then
		perform app.audit('second_factor_locked', p_subject_user_id => auth.uid());
	end if;
	return v_locked;
end
$$;

create or replace function public.second_factor_succeeded()
returns void
language sql
security definer
set search_path = ''
as $$
	delete from public.second_factor_failures where user_id = auth.uid()
$$;

do $$
declare f text;
begin
	foreach f in array array[
		'public.second_factor_locked()',
		'public.second_factor_failed()',
		'public.second_factor_succeeded()'
	] loop
		execute format('revoke all on function %s from public', f);
		execute format('grant execute on function %s to authenticated, service_role', f);
	end loop;
end
$$;
