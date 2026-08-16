-- The owner chose passwordless phone OTP as the sole authentication factor.
-- Authorization still binds the session to the immutable allowlisted user UUID.

create or replace function public.has_schedule_admin_access()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and (select public.is_schedule_admin());
$$;

revoke execute on function public.has_schedule_admin_access() from public, anon;
grant execute on function public.has_schedule_admin_access() to authenticated;

comment on function public.has_schedule_admin_access() is
  'True only for an authenticated Supabase session whose immutable user UUID is in admin_users.';
