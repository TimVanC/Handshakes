-- Editorial difficulty tiers for puzzle answers.
--
-- Keyed by (sport, player_name) rather than schedule_id so labels survive
-- admin_reorder_schedules (which deletes and reinserts future rows) and can
-- also annotate priority_queue names before they are ever scheduled.
--
-- Tier key (easiest to hardest for the average player):
--   LEG   outlier: all-time icon / one-team legend; trivially easy, avoid
--   B-C   casual-bait household star; easy day
--   S     sweet-spot journeyman; most fans get it with some digging
--   A     well known but a deeper pull; needs real digging
--   B-K   ball-knower only; hard day
--   GHOST outlier: too deep even for ball knowers; avoid

create table if not exists public.player_tiers (
  sport text not null check (sport in ('nba', 'nfl', 'mlb')),
  player_name text not null,
  tier text not null check (tier in ('LEG', 'B-C', 'S', 'A', 'B-K', 'GHOST')),
  note text,
  updated_at timestamptz not null default now(),
  primary key (sport, player_name)
);

alter table public.player_tiers enable row level security;

-- Matches the access rule the advisor-fixes migration settled on for the
-- other admin tables: allowlisted owner via has_schedule_admin_access().
drop policy if exists "owner reads player tiers" on public.player_tiers;
create policy "owner reads player tiers"
  on public.player_tiers for select
  to authenticated
  using ((select public.has_schedule_admin_access()));

drop policy if exists "owner manages player tiers" on public.player_tiers;
create policy "owner manages player tiers"
  on public.player_tiers for all
  to authenticated
  using ((select public.has_schedule_admin_access()))
  with check ((select public.has_schedule_admin_access()));

revoke all on public.player_tiers from public, anon, authenticated;
grant select, insert, update, delete on public.player_tiers to authenticated;
