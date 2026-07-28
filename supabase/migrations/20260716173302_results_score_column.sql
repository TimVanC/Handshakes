-- Reconstructed from supabase_migrations.schema_migrations on 2026-07-27.
-- Verbatim below this header. See supabase/migrations/README.md.
--
-- NOT IDEMPOTENT (fails loudly): `add column` has no `if not exists`.

-- per-user score so personal stats can chart a fixed-scale distribution
-- (jersey counts vary per puzzle; the 0-1000 score doesn't)
alter table public.results
  add column score smallint check (score is null or score between 0 and 1000);
