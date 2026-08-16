-- ============================================================
-- ⚠  THIS MIGRATION IS **NOT** IDEMPOTENT. DO NOT RE-RUN IT.  ⚠
--
-- The `insert into public.plays_v2 ... from public.plays` near the
-- bottom has NO `on conflict` clause and NO guard. Running this file a
-- second time copies the entire `plays` table into `plays_v2` AGAIN,
-- silently doubling the anonymous play pool and corrupting every NBA
-- percentile that `day_score_stats_v2` serves. There is no natural key
-- on `plays_v2` to detect or undo it with.
--
-- An earlier version of this file carried a header claiming the
-- migration was idempotent and safe to re-run. That claim was FALSE and
-- has been removed. If you are holding a copy that still says it, throw
-- that copy away.
--
-- ------------------------------------------------------------
-- PROVENANCE — reconciled 2026-07-26
--
-- Below this header is the EXACT text of migration `20260722033745`
-- (`multisport_results_v2`) as recorded in
-- `supabase_migrations.schema_migrations`, i.e. what actually ran
-- against production. Nothing has been edited, reordered or omitted.
--
-- It is NOT what this file used to contain. The previous version was
-- missing the `plays` → `plays_v2` insert entirely, and was never at any
-- point in its git history an accurate record of what was applied. The
-- superseded text is kept verbatim alongside as
-- `multisport-migration.pre-reconciliation.sql` so the drift stays
-- visible and diffable.
--
-- Already applied. Recorded here for the repo's history.
-- See docs/2026-07-26-cloud-merge-reconciliation.md §2.
--
-- Everything below this line is the applied migration, verbatim.
-- ============================================================

-- Multi-sport results/plays as NEW tables so the currently-live NBA client
-- (which upserts results on_conflict user_id,day) keeps working untouched.
-- The multi-sport client reads/writes these; at merge time the originals
-- can be topped up and retired.

create table if not exists public.results_v2 (
  user_id uuid not null references auth.users(id) on delete cascade,
  sport text not null check (sport in ('nba','nfl','mlb')),
  day integer not null,
  won boolean not null,
  revealed smallint,
  score smallint check (score is null or (score >= 0 and score <= 1000)),
  is_archive boolean not null default false,
  played_at timestamptz not null default now(),
  primary key (user_id, sport, day)
);

create table if not exists public.plays_v2 (
  id bigint generated always as identity primary key,
  sport text not null check (sport in ('nba','nfl','mlb')),
  day integer not null check (day >= 1 and day <= 8999),
  won boolean not null,
  revealed smallint,
  score smallint not null check (score >= 0 and score <= 1000),
  hard boolean not null default false,
  is_archive boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists plays_v2_sport_day_idx
  on public.plays_v2 (sport, day) where not is_archive;

alter table public.results_v2 enable row level security;
alter table public.plays_v2 enable row level security;

-- mirror the policies the originals use
drop policy if exists "own results_v2 read" on public.results_v2;
create policy "own results_v2 read" on public.results_v2
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "own results_v2 insert" on public.results_v2;
create policy "own results_v2 insert" on public.results_v2
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "own results_v2 update" on public.results_v2;
create policy "own results_v2 update" on public.results_v2
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "anyone logs a sane play v2" on public.plays_v2;
create policy "anyone logs a sane play v2" on public.plays_v2
  for insert to anon, authenticated with check (
    day >= 1 and day <= 8999
    and score >= 0 and score <= 1000
    and (revealed is null or (revealed >= 1 and revealed <= 20))
  );

-- carry the existing NBA history over
insert into public.results_v2 (user_id, sport, day, won, revealed, score, is_archive, played_at)
select user_id, 'nba', day, won, revealed, score, is_archive, played_at
from public.results
on conflict (user_id, sport, day) do nothing;

insert into public.plays_v2 (sport, day, won, revealed, score, hard, is_archive, created_at)
select 'nba', day, won, revealed, score, hard, is_archive, created_at
from public.plays;

-- sport-aware percentile RPC (the original stays for the live client)
create or replace function public.day_score_stats_v2(
  p_sport text, p_day integer, p_score integer
)
returns table(total bigint, lower_scores bigint)
language sql stable security definer set search_path to ''
as $$
  select count(*)::bigint,
         (count(*) filter (where score < p_score))::bigint
  from public.plays_v2
  where sport = p_sport and day = p_day and not is_archive;
$$;

grant execute on function public.day_score_stats_v2(text, integer, integer) to anon, authenticated;
