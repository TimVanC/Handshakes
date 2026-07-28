-- Reconstructed from supabase_migrations.schema_migrations on 2026-07-27.
-- Verbatim below this header. See supabase/migrations/README.md.
--
-- NOT IDEMPOTENT (fails loudly): `drop policy` has no `if exists`, and
-- `create policy` has no guard. Re-running errors out.
--
-- Superseded twice: the score bound by 20260716172505, the revealed cap by
-- 20260717043630. This is not the live policy.

drop policy "anyone logs a play" on public.plays;
create policy "anyone logs a sane play" on public.plays
  for insert to anon, authenticated
  with check (
    day between 1 and 8999
    and score between 0 and 110
    and (revealed is null or revealed between 1 and 12)
  );
