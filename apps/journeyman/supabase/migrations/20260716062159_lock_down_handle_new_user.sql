-- Reconstructed from supabase_migrations.schema_migrations on 2026-07-27.
-- Verbatim below this header. See supabase/migrations/README.md.
--
-- Idempotent: `revoke` on an already-revoked grant is a no-op.

-- trigger-only function: nobody should call it through the API
revoke execute on function public.handle_new_user() from public, anon, authenticated;
