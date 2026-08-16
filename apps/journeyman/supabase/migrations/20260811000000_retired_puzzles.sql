-- Holding pen for puzzles pulled from the schedule (e.g. GHOST-tier purge).
-- Keeps the full puzzle JSON so a removal is reversible; nothing serves from
-- this table.

create table if not exists public.retired_puzzles (
  schedule_id bigint not null,
  sport text not null check (sport in ('nba', 'nfl', 'mlb')),
  day integer not null,
  answer text not null,
  puzzle jsonb not null,
  source text not null,
  status text not null,
  frozen boolean not null,
  generated_at timestamptz,
  reason text,
  retired_at timestamptz not null default now()
);

alter table public.retired_puzzles enable row level security;

drop policy if exists "owner reads retired puzzles" on public.retired_puzzles;
create policy "owner reads retired puzzles"
  on public.retired_puzzles for select
  to authenticated
  using ((select public.has_schedule_admin_access()));

revoke all on public.retired_puzzles from public, anon, authenticated;
grant select on public.retired_puzzles to authenticated;
