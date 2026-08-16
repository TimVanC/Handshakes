-- Committed same-session as applied (rule in supabase/migrations/README.md).
-- ADDITIVE ONLY: new server-side tables, RLS on, zero policies -> invisible
-- to client roles. No existing table touched. Revertible with DROPs.

create table if not exists public.players (
  id bigint generated always as identity primary key,
  sport text not null check (sport in ('nba','nfl','mlb')),
  canonical_name text not null,
  aliases text[] not null default '{}',
  position text,
  height text,
  draft_year int,
  draft_pick text,
  college text,
  first_year int,
  last_year int,
  source_ids jsonb not null default '{}'::jsonb,
  unique (sport, canonical_name)
);

create table if not exists public.stints (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.players(id) on delete cascade,
  franchise text not null,
  display_team text,
  start_year int not null,
  end_year int not null,
  jersey_numbers jsonb not null default '[]'::jsonb,
  season_stats jsonb not null default '[]'::jsonb,
  unique (player_id, franchise, start_year)
);

create table if not exists public.franchise_seasons (
  sport text not null check (sport in ('nba','nfl','mlb')),
  franchise text not null,
  year int not null,
  w int not null,
  l int not null,
  t int,
  po text not null default '',
  fw smallint,
  source text not null default 'nflverse-games',
  primary key (sport, franchise, year)
);

create table if not exists public.source_records (
  id bigint generated always as identity primary key,
  source text not null,
  record_key text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  unique (source, record_key)
);

create table if not exists public.puzzles_import (
  sport text not null check (sport in ('nba','nfl','mlb')),
  day int not null,
  answer text not null,
  puzzle jsonb not null,
  source text not null check (source in ('authored','generated','test')),
  frozen boolean not null default false,
  imported_at timestamptz not null default now(),
  primary key (sport, day)
);

create or replace function public.reject_frozen_puzzle_change()
returns trigger language plpgsql as $$
begin
  if old.frozen then
    raise exception 'puzzle (%, day %) is frozen: aired days are immutable', old.sport, old.day;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists puzzles_import_frozen_guard on public.puzzles_import;
create trigger puzzles_import_frozen_guard
  before update or delete on public.puzzles_import
  for each row execute function public.reject_frozen_puzzle_change();

alter table public.players enable row level security;
alter table public.stints enable row level security;
alter table public.franchise_seasons enable row level security;
alter table public.source_records enable row level security;
alter table public.puzzles_import enable row level security;
