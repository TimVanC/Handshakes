-- Reconstructed from supabase_migrations.schema_migrations on 2026-07-27.
--
-- ⚠ **NOT A FAITHFUL TRANSCRIPTION.** One statement in this file has been
-- DEFUSED (commented out) — see the block at the bottom. This file is a
-- safe-to-replay reconstruction, NOT a record of what ran.
--
-- For what actually ran, read `supabase_migrations.schema_migrations`
-- version 20260716172505. **The ledger is the source of truth.**
--
-- See supabase/migrations/README.md.
-- ============================================================
-- WHAT WAS DEFUSED AND WHY
--
-- This migration originally ended with an UNFILTERED
-- `delete from public.plays;` — no `where`, no transaction, no undo.
-- Executing it deletes the ENTIRE anonymous play pool: every row, every
-- day, every sport. It would destroy the data behind every percentile
-- the game has ever shown.
--
-- The comment above that statement MISDESCRIBES it. It reads "wipe any
-- plays logged under the old 0-110 scale (pre-launch...)", which
-- describes a FILTERED delete of stale rows. The SQL is unfiltered.
--
-- On 2026-07-16 the distinction did not matter: pre-launch, the table
-- held nothing but old-scale rows, so "delete the old-scale rows" and
-- "delete everything" were the same operation. That is why it was
-- written this way and why it was harmless then.
--
-- It is not harmless now. As of 2026-07-27 `public.plays` holds 44 live
-- rows, 41 of which are the sole pre-merge percentile history.
--
-- A README warning does not survive an agent replaying this directory
-- programmatically, which is the exact scenario the directory exists
-- for. So the statement is disabled here rather than merely flagged.
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

-- ============================================================
-- ⚠ DEFUSED 2026-07-27 — DISABLED, DO NOT RE-ENABLE
--
-- The original final statement of this migration, verbatim:
--
--     -- wipe any plays logged under the old 0-110 scale (pre-launch; scales
--     -- can't be compared, and the pool restarts clean)
--     delete from public.plays;
--
-- Left commented out because it is an unfiltered delete of the entire
-- anonymous play pool. Harmless when applied on 2026-07-16 (pre-launch,
-- the table held only old-scale rows); destructive today.
--
-- If you are replaying this migration into a genuinely EMPTY database,
-- re-enabling it is a no-op and pointless. If you are running it against
-- a database with data, it is a catastrophe. There is no case where
-- re-enabling it is correct.
-- ============================================================
