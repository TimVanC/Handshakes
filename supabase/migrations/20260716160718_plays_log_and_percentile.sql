-- Reconstructed from supabase_migrations.schema_migrations on 2026-07-27.
-- Verbatim below this header. See supabase/migrations/README.md.
--
-- NOT IDEMPOTENT (fails loudly, does not corrupt): `create table`,
-- `create index` and `create policy` have no `if not exists` guard.
--
-- NOTE: the score constraint here is the ORIGINAL 0-110 scale. It is
-- replaced by 20260716172505_score_scale_1000. Do not treat this file as
-- describing the current shape of `public.plays`.

-- every finished game, signed-in or anonymous — the pool that powers
-- "you did better than X% of today's players"
create table public.plays (
  id bigint generated always as identity primary key,
  day integer not null check (day between 1 and 8999), -- test slots (9000+) never logged
  won boolean not null,
  revealed smallint,
  score smallint not null check (score between 0 and 110),
  hard boolean not null default false,
  is_archive boolean not null default false,
  created_at timestamptz not null default now()
);

create index plays_day_idx on public.plays (day) where not is_archive;

alter table public.plays enable row level security;

-- write-only for clients: anyone may log a play, nobody may read rows.
-- aggregates come out through the security-definer function below.
create policy "anyone logs a play" on public.plays
  for insert to anon, authenticated with check (true);

create or replace function public.day_score_stats(p_day integer, p_score integer)
returns table (total bigint, lower_scores bigint)
language sql
security definer
set search_path = ''
stable
as $$
  select count(*)::bigint as total,
         (count(*) filter (where score < p_score))::bigint as lower_scores
  from public.plays
  where day = p_day and not is_archive;
$$;

revoke execute on function public.day_score_stats(integer, integer) from public;
grant execute on function public.day_score_stats(integer, integer) to anon, authenticated;
