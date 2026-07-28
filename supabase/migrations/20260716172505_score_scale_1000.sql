-- Reconstructed from supabase_migrations.schema_migrations on 2026-07-27.
-- Verbatim below this header. See supabase/migrations/README.md.
--
-- ============================================================
-- ⚠⚠  DANGER — THIS MIGRATION ENDS WITH AN UNFILTERED
--     `delete from public.plays;`  DO NOT RE-RUN IT.  ⚠⚠
--
-- Re-running this file DELETES THE ENTIRE ANONYMOUS PLAY POOL — every
-- row in `public.plays`, for every day and every sport — and there is no
-- transaction, no filter and no undo. It would destroy the data behind
-- every percentile the game has ever shown.
--
-- THE COMMENT ON THAT STATEMENT MISDESCRIBES IT. It reads "wipe any
-- plays logged under the old 0-110 scale (pre-launch...)", which
-- describes a FILTERED delete of stale rows. The SQL is UNFILTERED and
-- deletes everything. That was harmless when it ran on 2026-07-16
-- (pre-launch, the table held only old-scale rows). It is not harmless
-- now: as of 2026-07-27 `public.plays` holds 44 live rows, 41 of which
-- are the sole pre-merge percentile history and are already mirrored
-- into `plays_v2`.
--
-- This is the second trap of exactly this shape found in this project.
-- See docs/2026-07-26-cloud-merge-reconciliation.md §2 for the first
-- (the unguarded `insert into plays_v2` in 20260722033745).
-- ============================================================

-- scoring moves from 0-110 to 0-1000
alter table public.plays drop constraint if exists plays_score_check;
alter table public.plays add constraint plays_score_check check (score between 0 and 1000);

drop policy "anyone logs a sane play" on public.plays;
create policy "anyone logs a sane play" on public.plays
  for insert to anon, authenticated
  with check (
    day between 1 and 8999
    and score between 0 and 1000
    and (revealed is null or revealed between 1 and 12)
  );

-- wipe any plays logged under the old 0-110 scale (pre-launch; scales
-- can't be compared, and the pool restarts clean)
delete from public.plays;
