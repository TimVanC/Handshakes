-- ============================================================
-- MULTI-SPORT MERGE — VERIFICATION SET
--
-- Companion to docs/2026-07-26-cloud-merge-reconciliation.md.
-- Every query below is READ-ONLY except the single clearly marked
-- top-up in section 3, which is the existing statement from
-- multisport-migration.sql and is idempotent.
--
-- Run 1, 2 BEFORE the top-up. Run 3. Run 4, 5, 6 after.
-- ============================================================


-- ------------------------------------------------------------
-- 1. BASELINE — capture before, so "after" means something
-- ------------------------------------------------------------
select 'results (old, all)'       as bucket, count(*) as rows, count(distinct user_id) as users, min(day) as min_day, max(day) as max_day from public.results
union all select 'results day<9000',         count(*), count(distinct user_id), min(day), max(day) from public.results where day < 9000
union all select 'results day>=9000 (test)', count(*), count(distinct user_id), min(day), max(day) from public.results where day >= 9000
union all select 'results_v2 nba',           count(*), count(distinct user_id), min(day), max(day) from public.results_v2 where sport='nba'
union all select 'results_v2 nfl',           count(*), count(distinct user_id), min(day), max(day) from public.results_v2 where sport='nfl'
union all select 'results_v2 mlb',           count(*), count(distinct user_id), min(day), max(day) from public.results_v2 where sport='mlb'
order by 1;

-- EXPECTED 2026-07-26: results 19 rows / 5 users / days 1-7, zero test rows.
-- results_v2 nba 44/9/1-12, nfl 19/5/1-5, mlb 16/5/1-5.


-- ------------------------------------------------------------
-- 2. PRE-FLIGHT ANTI-JOIN — what `on conflict do nothing` would discard
--
-- THIS IS THE ONE THAT MATTERS. A matching row count proves nothing:
-- a discarded row that DIFFERS from its v2 twin and a discarded row
-- that is an exact duplicate produce identical counts. Only this
-- comparison distinguishes them, and it must run BEFORE the insert.
-- ------------------------------------------------------------
select
  case
    when v.user_id is null then 'WOULD INSERT (new row)'
    when (r.won, r.revealed, r.score, r.is_archive)
         is not distinct from (v.won, v.revealed, v.score, v.is_archive)
      then 'DISCARDED - identical (safe)'
    else 'DISCARDED - DIFFERS (REVIEW BEFORE PROCEEDING)'
  end as verdict,
  count(*) as rows
from public.results r
left join public.results_v2 v
  on v.user_id = r.user_id and v.sport = 'nba' and v.day = r.day
group by 1 order by 1;

-- EXPECTED: 0 / 19 / 0.
-- ANY row in the DIFFERS bucket: STOP. Do not run the top-up. The row-level
-- diff below shows exactly which rows and how they disagree.

select right(r.user_id::text, 6) as user_tail, r.day,
       r.won as old_won, v.won as v2_won, r.revealed as old_rev, v.revealed as v2_rev,
       r.score as old_score, v.score as v2_score,
       r.is_archive as old_arch, v.is_archive as v2_arch,
       r.played_at as old_played_at, v.played_at as v2_played_at,
       case when v.user_id is null then 'MISSING FROM V2'
            when (r.won,r.revealed,r.score,r.is_archive)
                 is not distinct from (v.won,v.revealed,v.score,v.is_archive) then 'match'
            else 'DIFFERS' end as status
from public.results r
left join public.results_v2 v
  on v.user_id = r.user_id and v.sport='nba' and v.day = r.day
order by r.user_id, r.day;

-- NOTE FOR FUTURE SESSIONS: `do nothing` skips the insert, it does NOT delete
-- from `results`. That is why these 19 rows were still diffable four days
-- after the 2026-07-22 run. Dropping `results` makes this check impossible to
-- repeat -- re-run it immediately before any drop and keep the output.


-- ------------------------------------------------------------
-- 3. THE TOP-UP  << the only statement here that writes >>
--    Run by a human. Unchanged from multisport-migration.sql.
-- ------------------------------------------------------------
-- insert into public.results_v2
--   (user_id, sport, day, won, revealed, score, is_archive, played_at)
-- select user_id, 'nba', day, won, revealed, score, is_archive, played_at
-- from public.results
-- on conflict (user_id, sport, day) do nothing;
--
-- EXPECTED OUTPUT: `INSERT 0 0`
-- Any other number means something wrote to `results` since section 2 was
-- run. Re-run section 2 before going further.


-- ------------------------------------------------------------
-- 4. POST-TOP-UP COMPLETENESS
-- ------------------------------------------------------------

-- 4a. Every old row now has a v2 counterpart. Must return zero rows.
select right(r.user_id::text,6) as user_tail, r.day, 'MISSING FROM V2' as problem
from public.results r
where not exists (
  select 1 from public.results_v2 v
  where v.user_id=r.user_id and v.sport='nba' and v.day=r.day);

-- 4b. Per-user counts, old vs new, highest-history users first.
select right(u.id::text,6) as user_tail,
       (select count(*) from public.results  r where r.user_id=u.id) as old_rows,
       (select count(*) from public.results_v2 v where v.user_id=u.id and v.sport='nba') as v2_nba_rows,
       (select count(*) from public.results_v2 v where v.user_id=u.id) as v2_all_rows
from auth.users u
order by v2_all_rows desc, old_rows desc;

-- v2_nba_rows must be >= old_rows for every user. A user whose v2_nba_rows is
-- LOWER than old_rows means the top-up did not land for them.

-- 4c. Earliest and latest day spot-check per sport.
select sport, day, count(*) as rows, min(played_at) as first, max(played_at) as last
from public.results_v2
where (sport, day) in (
  select sport, min(day) from public.results_v2 group by sport
  union
  select sport, max(day) from public.results_v2 group by sport)
group by sport, day order by sport, day;

-- 4d. PK integrity: `(user_id, sport, day)` must be unique, and no old row may
--     map to two v2 rows. Both must return zero rows.
select user_id, sport, day, count(*) from public.results_v2
group by user_id, sport, day having count(*) > 1;

select r.user_id, r.day, count(*) as v2_matches
from public.results r
join public.results_v2 v on v.user_id=r.user_id and v.sport='nba' and v.day=r.day
group by r.user_id, r.day having count(*) <> 1;


-- ------------------------------------------------------------
-- 5. LAUNCH DATE DERIVATION
--
-- Derive from plays only. `results_v2.played_at` defaults to now(), so rows
-- written by syncUp are stamped at SYNC time, not play time, and derive a
-- spuriously LATER date. plays/plays_v2 are only ever written at play time.
-- ------------------------------------------------------------
with src as (
  select 'nba'::text as sport, day, created_at from public.plays where not is_archive
  union all
  select sport, day, created_at from public.plays_v2 where not is_archive)
select sport,
       ((created_at at time zone 'America/New_York')::date - (day - 1)) as derived_launch,
       count(*) as rows, min(day) as min_day, max(day) as max_day
from src group by sport, derived_launch order by sport, rows desc;

-- EXPECTED: exactly ONE row per sport.
--   nba 2026-07-15 (122 rows) | nfl 2026-07-22 (33) | mlb 2026-07-22 (25)
-- More than one row for a sport = a client wrote a day number inconsistent
-- with its own clock. Investigate before trusting the constant.


-- ------------------------------------------------------------
-- 6. PERCENTILE POOL HEALTH (NBA early days)
--
-- plays_v2 has NO user_id, so a play can never be attributed to an account.
-- Characterise the pool BEFORE deleting any user -- after deletion their
-- plays remain and are unidentifiable forever.
-- ------------------------------------------------------------
select day, count(*) as pool_size,
       count(*) filter (where score = 1000) as perfect_1000s,
       count(*) filter (where score = 0) as zeros,
       round(avg(score)) as avg_score,
       round(100.0 / greatest(count(*),1), 1) as pct_weight_of_one_row
from public.plays_v2
where sport='nba' and not is_archive and day between 1 and 10
group by day order by day;

-- NBA day 1 has an EMPTY pool (plays start at day 2). Day 2's pool is two
-- rows, so one row is worth 50 percentile points.

-- 6b. The 3 `plays` rows never copied into plays_v2. See the docs note --
--     remedy is a targeted insert by explicit id in a separate session.
select o.id, o.day, o.won, o.revealed, o.score, o.hard, o.is_archive, o.created_at
from public.plays o
where not exists (
  select 1 from public.plays_v2 n
  where n.sport='nba' and n.created_at=o.created_at and n.day=o.day and n.score=o.score
    and n.won=o.won and n.is_archive=o.is_archive and n.hard=o.hard
    and n.revealed is not distinct from o.revealed)
order by o.created_at;

-- EXPECTED: ids 61, 62, 63.
