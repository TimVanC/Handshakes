-- Reconstructed from supabase_migrations.schema_migrations on 2026-07-27.
-- Verbatim below this header. See supabase/migrations/README.md.
--
-- NOT IDEMPOTENT (fails loudly): `drop policy` has no `if exists`.
--
-- This IS the live insert policy on `public.plays` as of 2026-07-27.

-- Ish Smith's puzzle has 16 stints (13 franchises); the old sanity cap of
-- 12 would reject legitimate plays of the deepest careers
drop policy "anyone logs a sane play" on public.plays;
create policy "anyone logs a sane play" on public.plays
  for insert to anon, authenticated
  with check (
    day between 1 and 8999
    and score between 0 and 1000
    and (revealed is null or revealed between 1 and 20)
  );
