-- Committed same-session as applied. ADDITIVE ONLY: scheduler tables +
-- read-only serving RPCs. Dormant until the client flag flips -- the live
-- game does not call any of this. Revertible with DROPs.

create table if not exists public.scheduled_puzzles (
  sport text not null check (sport in ('nba','nfl','mlb')),
  day int not null check (day >= 1 and day <= 8999),
  answer text not null,
  puzzle jsonb not null,
  source text not null check (source in ('authored','generated','test')),
  status text not null default 'scheduled' check (status in ('scheduled','aired','skipped')),
  frozen boolean not null default false,
  generated_at timestamptz not null default now(),
  primary key (sport, day)
);

create table if not exists public.priority_queue (
  sport text not null check (sport in ('nba','nfl','mlb')),
  position int not null,
  player_name text not null,
  note text,
  added_at timestamptz not null default now(),
  primary key (sport, position)
);

drop trigger if exists scheduled_puzzles_frozen_guard on public.scheduled_puzzles;
create trigger scheduled_puzzles_frozen_guard
  before update or delete on public.scheduled_puzzles
  for each row execute function public.reject_frozen_puzzle_change();

alter table public.scheduled_puzzles enable row level security;
alter table public.priority_queue enable row level security;

create or replace function public.current_day(p_sport text)
returns integer language sql stable
set search_path to ''
as $$
  select ((now() at time zone 'America/New_York')::date
        - case p_sport when 'nba' then date '2026-07-15' else date '2026-07-22' end)::int + 1;
$$;

create or replace function public.get_daily_puzzle(p_sport text)
returns jsonb language sql stable security definer
set search_path to ''
as $$
  select puzzle from public.scheduled_puzzles
  where sport = p_sport and day = public.current_day(p_sport);
$$;

create or replace function public.get_archive_puzzle(p_sport text, p_day integer)
returns jsonb language sql stable security definer
set search_path to ''
as $$
  select puzzle from public.scheduled_puzzles
  where sport = p_sport and day = p_day
    and p_day >= 1 and p_day < public.current_day(p_sport);
$$;

revoke execute on function public.current_day(text) from public;
revoke execute on function public.get_daily_puzzle(text) from public;
revoke execute on function public.get_archive_puzzle(text, integer) from public;
grant execute on function public.current_day(text) to anon, authenticated;
grant execute on function public.get_daily_puzzle(text) to anon, authenticated;
grant execute on function public.get_archive_puzzle(text, integer) to anon, authenticated;
