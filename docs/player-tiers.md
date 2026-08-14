# Journeyman Player Tiers

The tier system grades every puzzle answer by **fit for the game** — not by how
good the player was, but by how the day feels to the person guessing. The
bullseye is a true journeyman most fans can dig out of their memory; the edges
are the easy days and the diehard days sprinkled in for pacing.

Tiers live in the `player_tiers` table in Supabase, keyed by sport + player
name (so labels survive schedule reorders), and appear as colored pills on
every card in the Schedule Room.

## The six tiers, easiest → hardest

### LEG — Legend *(outlier, avoid scheduling)*

An all-time icon or a one-team great. The first jersey gives the answer away —
Kobe's Lakers gold, Babe Ruth's pinstripes — so there is no puzzle, just a
formality. These are outliers that sit outside the four playable tiers.

> Examples: Kobe Bryant, Manu Ginóbili, Moses Malone, Babe Ruth, Jimmie Foxx

### B-C — B · Casual *(easy day, ~5% of the schedule)*

A household star even casual fans know, with enough team movement to still be
a real puzzle. These are the confidence-builder days that keep casual players
in the habit.

> Examples: Vince Carter, Allen Iverson, Dwyane Wade, Ichiro Suzuki,
> Sammy Sosa, Michael Vick, Kurt Warner, Odell Beckham Jr.

### S — Sweet spot *(the bullseye, ~80% of the schedule)*

The heart of the game: a genuine journeyman with real name recognition. Most
fans get there if they think — "oh right, HE was on that team too." The name
rings a bell the moment it's revealed, and the team path is a satisfying
memory-walk rather than a trivia wall.

> Examples: Jamal Crawford, Al Harrington, Ryan Fitzpatrick, Joe Flacco,
> Kenny Lofton, Bartolo Colón, Gary Sheffield, Marco Belinelli, Jae Crowder

### A — Deeper bag *(~10% of the schedule)*

Still well known, but a deeper pull that takes real digging. A regular fan
gets there some days and narrowly misses on others; a good "hard but fair"
beat between S days.

> Examples: Channing Frye, Ish Smith, Dan Haren, LaTroy Hawkins,
> Case Keenum, Ted Ginn Jr., Raja Bell

### B-K — B · Ball knower *(hard day, ~5% of the schedule)*

Only diehards land this. The name is real and the career is long, but casual
players will lose — which is fine as an occasional spike day, never several
in a row.

> Examples: Chucky Brown, Matt Stairs, Bernard Pollard, Anthony Tolliver,
> Endy Chávez, Captain Munnerlyn

### GHOST — Ghost *(outlier, avoid scheduling)*

Too deep even for ball knowers. A lost day for almost everyone — the game
reads as unfair rather than hard. All GHOST-tier days were purged from the
schedules on 2026-08-10 and sit in the retired pool.

> Examples: Omir Santos, Jeff Keppinger, Jacob Tamme, Michael Doleac

## Target mix

The schedule aims for roughly **80% S · 10% A · 5% B-K · 5% B-C** per sport,
with A and B days spread evenly (about one A per week, one B-C and one B-K
every 2–3 weeks). LEG and GHOST are never scheduled intentionally.

## How the pieces fit

- **`player_tiers` (Supabase)** — one row per sport + player name with the
  tier and an optional note. Editing a row re-grades the player everywhere.
- **Schedule Room pills** — every upcoming card, archive row, and the player
  drawer show the tier; the collapsible "Tier key" panel above the board
  summarizes this document. The filter bar can isolate any tier combination.
- **`retired_puzzles` (Supabase)** — where purged GHOSTs, surplus A/B-K days,
  and anything deleted from the Schedule Room land, with full puzzle data.
  Retired B-K days are the future budget for hard-day sprinkles; nothing in
  the pool can re-enter the schedule accidentally.
- **`pipeline/rebalance-stier.mjs`** — the script that re-sequences each
  sport toward the target mix whenever new batches are authored.

## Re-grading a player

Tiers are editorial judgment — if a pill feels wrong, change it:

```sql
update player_tiers set tier = 'S', updated_at = now()
where sport = 'nba' and player_name = 'Player Name';
```

The pill updates on the next Schedule Room load; no deploy needed.
