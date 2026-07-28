-- Reconstructed from supabase_migrations.schema_migrations on 2026-07-27.
-- Verbatim below this header. See supabase/migrations/README.md.
--
-- NOT IDEMPOTENT (fails loudly, does not corrupt): `create table`,
-- `create policy` and `create trigger` here have no `if not exists` /
-- `drop ... if exists` guard. Re-running errors out rather than damaging
-- data. Safe to replay only into an empty database.

-- one row per user, auto-created on signup
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile read" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "own profile update" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- auto-create the profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- one game result per user per puzzle day
create table public.results (
  user_id uuid not null references auth.users(id) on delete cascade,
  day integer not null,
  won boolean not null,
  revealed smallint,                          -- jerseys flipped when solved; null on a loss
  is_archive boolean not null default false,  -- archive plays don't affect the daily streak
  played_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.results enable row level security;

create policy "own results read" on public.results
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own results insert" on public.results
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own results update" on public.results
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
