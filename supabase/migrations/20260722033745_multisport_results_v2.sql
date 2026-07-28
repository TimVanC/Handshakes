-- Reconstructed from supabase_migrations.schema_migrations on 2026-07-27.
--
-- ⚠ **NOT A FAITHFUL TRANSCRIPTION.** One statement in this file has been
-- DEFUSED (commented out) — see the block near the bottom. This file is a
-- safe-to-replay reconstruction, NOT a record of what ran.
--
-- For what actually ran, read `supabase_migrations.schema_migrations`
-- version 20260722033745. **The ledger is the source of truth.**
--
-- See supabase/migrations/README.md.
-- ============================================================
-- WHAT WAS DEFUSED AND WHY
--
-- This migration originally contained an UNGUARDED
-- `insert into public.plays_v2 ... from public.plays` — no `on conflict`,
-- no `where`. Executing it again duplicates the entire anonymous play
-- pool and corrupts every NBA percentile, and `plays_v2` has no natural
-- key to detect or undo the duplication with.
--
-- Its comment reads "carry the existing NBA history over", which sounds
-- like a one-time idempotent backfill. It is not guarded in any way.
--
-- A hand-maintained copy of this migration in
-- supabase/multisport-migration.sql was missing that insert entirely and
-- claimed the migration was idempotent. It is not.
--
-- A README warning does not survive an agent replaying this directory
-- programmatically, which is the exact scenario the directory exists
-- for. So the statement is disabled here rather than merely flagged.
--
-- See docs/2026-07-26-cloud-merge-reconciliation.md §2.
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

-- ============================================================
-- ⚠ DEFUSED 2026-07-27 — DISABLED, DO NOT RE-ENABLE
--
-- The original statement at this position, verbatim:
--
--     insert into public.plays_v2 (sport, day, won, revealed, score, hard, is_archive, created_at)
--     select 'nba', day, won, revealed, score, hard, is_archive, created_at
--     from public.plays;
--
-- Left commented out because it has no `on conflict` guard and no
-- `where`. It ran exactly once, on 2026-07-22, copying 41 rows. Running
-- it a second time against a database that still holds those rows
-- duplicates the whole pool, and nothing in plays_v2's schema can detect
-- or reverse it afterwards.
--
-- Against an EMPTY database this is a no-op (there is nothing in
-- public.plays to copy). Against the live database it is destructive.
-- There is no case where re-enabling it is correct.
-- ============================================================

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
