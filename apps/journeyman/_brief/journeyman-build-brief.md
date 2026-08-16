# JOURNEYMAN — Implementation Brief

Daily NBA guessing game. A mystery player's career is revealed one jersey at a time — rendered as era-accurate generic jerseys (colorway + number, no logos) with per-stint stats. Guess the player in as few jerseys as possible. New puzzle every day.

**Positioning:** This is a game for sickos. The player pool is journeymen — 4+ franchise careers — not superstars. The competing product (airball.gg "Career Path") dumps the full logo path at once and mixes in household names. Journeyman differentiates on: (1) progressive reveal tension, (2) jerseys-not-logos as the clue object (era aesthetics + jersey number are extra deduction channels), (3) per-stint stats turning recall into deduction, (4) journeyman-only pool as identity.

**Stack:** React 19 + TypeScript + Vite, Supabase (Postgres + RPC), Vercel. Tailwind for styling. No auth in MVP — streaks/history in localStorage.

---

## 1. Core game loop

1. Page loads today's puzzle. **One jersey is visible** (the least-identifying stint — see §4 reveal ordering). Each jersey card shows:
   - SVG jersey: era colorway, player's actual number for that stint, era-appropriate cut/trim style
   - Stint years (e.g., "2013–2015")
   - Per-stint stats: GP, MPG, PPG (RPG/APG optional, behind a tap)
   - **Team name is NOT shown.** The colorway + era is the clue. (Tap-to-reveal team name is allowed but costs a hint — see §3.)
2. Player guesses via **searchable dropdown** (type-ahead against full player index — free text invites spelling disputes).
3. Wrong guess (or "Next jersey" button) → reveal the next jersey. Repeat until solved or all jerseys revealed.
4. After all jerseys are out, wrong guesses walk down the **hint ladder**: position → draft year → draft pick # → college/country. After hints are exhausted, one final guess, then reveal.
5. Result screen: full career timeline with team names + share button.

### Guess rules
- Unlimited "reveal next jersey" — the cost is your score.
- A wrong *guess* also auto-reveals the next jersey (guessing is never free).
- Solve = correct guess at any point.

## 2. Scoring & share format

Score = jerseys visible when solved. Lower is better, golf-style. Suggested display: "Solved in 2 jerseys" or "DNF".

Share artifact (clipboard):

```
JOURNEYMAN #47
👕👕✅ (2/6)
🔥 streak: 12
journeymangame.com
```

- One 👕 per jersey revealed before the solving guess, ✅ on solve, ❌ per wrong guess interleaved (e.g., 👕❌👕✅), 🪦 for DNF.
- Streak = consecutive days solved (any score). Track in localStorage: `{lastSolvedPuzzleId, streak, history: {puzzleId: score}}`.

## 3. Hint ladder (post-jerseys)

Order matters — least → most identifying:
1. Position
2. Draft year
3. Draft pick (round + number; "undrafted" is itself a juicy hint)
4. College / country

Optional per-jersey hint: tap a jersey to reveal its team name, at the cost of counting as one extra jersey in your score. (Ship this in v1.1, not MVP — it complicates the share grid.)

## 4. Puzzle generation (the actual hard part)

### Player pool
- Played for **4+ distinct franchises** (franchise = modern identity; SEA→OKC counts as one)
- ≥ 250 career games (filters 10-day-contract noise nobody remembers)
- Career ended 1980 or later, or active
- Manual curation flag `is_bad_puzzle` to blacklist unfun answers

### Reveal ordering — "least identifying first"
For each stint, compute an **identifiability score**: how many players in the pool share a stint with the same franchise overlapping the same seasons. High count = anonymous stint = reveal early. Sort stints descending by that count. Tiebreak: shorter stints first, draft-team stint always last or second-to-last.

Refinement (v1.1): score *cumulative* subsets — after each reveal, how many pool players match ALL revealed stints so far. Choose the order that keeps the candidate set largest for longest. MVP: the simple per-stint score is fine.

### Difficulty calibration
Target: candidate set after jersey 1 > 50 players; after final jersey ≤ 3. If a player's full stint set is shared with others (it happens), skip them.

### Daily rotation
Pre-generate puzzles in batches (script, not runtime). Store in `puzzles` table keyed by date (ET rollover at midnight ET — pick ET and say so on the About page). Never serve the answer to the client: guesses validate via Supabase RPC (`check_guess(puzzle_id, player_id) → boolean + next reveal payload`). Client receives stints/hints only as they're earned. This is the anti-cheat model — no answer in the JS bundle or network payload until solved.

## 5. Data pipeline

**Source:** Basketball-Reference for stint history + per-stint stats; NBA Stats API (`nba_api` Python package, `commonplayerinfo` / `playerprofilev2`) for jersey numbers by season. Build as a one-off Python ETL script, output → Supabase.

Steps:
1. Pull all players since 1976-77, season-by-season team rows.
2. Collapse consecutive same-franchise seasons into stints `{player_id, franchise, start_year, end_year, gp, mpg, ppg, rpg, apg, jersey_number}`. Mid-career return stints are separate rows (great puzzle material).
3. Jersey number per stint: mode of that player's numbers across the stint's seasons. If it changed mid-stint, use the longest-worn.
4. Map each stint to a colorway via `colorways.json` (franchise + year → era entry). A stint spanning two colorway eras uses the era covering more of the stint.
5. Draft info (year, round, pick, college/country) from BR draft tables; mark undrafted.

**Note on BR scraping:** respect their rate limits (they ban aggressively — 1 req/3s minimum, cache everything locally). Alternative: the `nba_api` package alone can cover most of this via `playercareerstats` + `commonplayerinfo`; prefer it where possible.

## 6. Supabase schema

```sql
create table players (
  id bigint primary key,          -- nba.com person_id
  full_name text not null,
  position text,
  draft_year int, draft_round int, draft_pick int,  -- nulls = undrafted
  college text, country text,
  franchise_count int,
  career_gp int,
  is_bad_puzzle boolean default false
);

create table stints (
  id bigserial primary key,
  player_id bigint references players(id),
  franchise text not null,        -- modern tricode: ATL, BOS...
  start_year int, end_year int,   -- season start years
  gp int, mpg numeric, ppg numeric, rpg numeric, apg numeric,
  jersey_number int,
  colorway_key text,              -- FK-by-convention into colorways.json
  stint_order int,                -- chronological
  reveal_order int                -- computed by generator
);

create table puzzles (
  id serial primary key,
  puzzle_date date unique not null,
  player_id bigint references players(id)
);
-- RLS: puzzles.player_id never selectable by anon.
-- All gameplay through security-definer RPCs:
--   get_puzzle(date) → puzzle number + first stint payload (no player_id)
--   reveal_next(puzzle_id, n) → nth stint payload
--   check_guess(puzzle_id, guessed_player_id) → {correct, next_stint?|hint?}
--   get_solution(puzzle_id) → only after N wrong guesses or a solved flag; simplest MVP: return it when the client has exhausted all reveals+hints+final guess, enforced server-side by a per-session guess counter or just accept the minor cheese vector for MVP
create table player_index (       -- for the search dropdown
  id bigint primary key, full_name text, years_active text
);
```

## 7. Component architecture

```
<App>
  <Header />               // logo, streak flame, help modal, stats modal
  <PuzzleBoard>
    <JerseyCard />×N       // revealed stints, newest animates in
    <HintTray />           // revealed ladder hints
  </PuzzleBoard>
  <GuessInput />           // combobox, keyboard-navigable
  <RevealButton />         // "show next jersey (+1)"
  <ResultModal />          // timeline w/ team names, share button
</App>
```

`JerseyRenderer.tsx` is provided in this package — self-contained SVG, no assets. Props: `{ primary, secondary, trim, number, eraStyle }`.

## 8. Design direction (do NOT default to generic AI aesthetics)

The subject is basketball ephemera — trading cards, locker rooms, jersey nostalgia. Design from that world:
- **Signature element:** the jersey cards themselves, presented like a card-collector spread — slight rotation scatter, card-stock texture, a foil-shine hover. The reveal animation (card flip or slide-from-deck) is the moment of the game; spend the polish there.
- **Typography:** a condensed athletic display face for numbers/headers (e.g., a varsity/jersey-block style — Tungsten-like; free options: "Anton", "Archivo Black", or a true block-number font for the SVG numbers), paired with a plain grotesque for UI text. Do not use a warm-cream + serif + terracotta palette or near-black + acid-green — both read as AI defaults.
- **Palette:** neutral court-and-cardstock base (off-whites, hardwood tone) so the jersey colorways are the only saturated things on screen. The jerseys ARE the color system.
- Mobile-first: this is a phone game. Cards in a horizontal snap-scroll row on small screens.
- Quality floor: keyboard-navigable combobox, visible focus, `prefers-reduced-motion` respected.

## 9. MVP build order

1. **Phase 1 — playable core:** JerseyRenderer + hardcoded 5 puzzles in local JSON, full game loop, scoring, share text, localStorage streaks. No backend. (This alone is demo-able to friends.)
2. **Phase 2 — data:** ETL script → Supabase, RPC validation, puzzle generator with reveal-order algorithm, batch-generate 60 days.
3. **Phase 3 — polish:** result timeline, stats modal (guess distribution like Wordle), archive/calendar of past puzzles, OG image per day for link previews.
4. **Phase 4 — growth hooks:** "hard mode" (no stats shown), per-jersey team-name hints, weekly themed pools.

## 10. Known risks / open decisions

- **Colorway data accuracy:** `colorways.json` is ~90% right; every entry has a `confidence` field. Before launch, verify `low`-confidence entries against teamcolorcodes.com and Basketball-Reference season pages. Off-by-one era years are the main failure mode and they actively mislead players — treat as launch-blocking QA.
- **IP:** no NBA/team logos, no wordmarks, no real jersey designs, no team names on jerseys. Generic silhouettes + colorways + factual data only. Add the standard "not affiliated with the NBA" footer. Avoid team names in marketing imagery.
- **Duplicate stint profiles:** the generator must verify answer uniqueness given all reveals + hints; skip ambiguous players.
- **Timezone:** ET rollover, computed server-side (RPC uses `now() at time zone 'America/New_York'`), never client clock.
