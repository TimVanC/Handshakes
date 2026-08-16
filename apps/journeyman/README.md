# JOURNEYMAN

Daily career-guessing games: a mystery journeyman's career revealed one
era-accurate jersey at a time. **Three separate games in one site** — NBA
(the original), NFL, and MLB — each with its own daily puzzle, streak,
archive, and jersey art. Switch leagues from the start screen or header;
the game engine (reveal loop, scoring, share, storage shapes) is shared,
everything sport-specific lives in a per-sport config.

## Run it

```sh
npm install
npm run dev
```

## Dev helpers

- `?s=nba|nfl|mlb` — pick the game (also remembered per device).
- `?p=1` … `?p=5` — force a specific puzzle for the current sport (each
  plays in its own save slot, numbered #9001+ so it never collides with
  real days). Dev builds only.
- `?jerseys` — jersey QA sheet: every renderer × era style × sample
  colorways on one page. Dev builds only.
- Clear progress: `localStorage.clear()` in the console.

## Where things live

| Path | What |
| --- | --- |
| `src/sports/{nba,nfl,mlb}.tsx` | Per-sport config: puzzles, colorways, renderer, stat cells, hint ladder, grade labels, storage namespace |
| `src/sports/active.ts` | The sport this page-load is playing (`?s=` param) |
| `src/components/JerseyRenderer.tsx` | NBA jersey SVG (provided art, unchanged) |
| `src/components/FootballJerseyRenderer.tsx` + `footballJerseyPaths.ts` | NFL jersey, extracted from the user-supplied NovaeMakersMart SVG (front view), 4 era treatments |
| `src/components/BaseballBackJerseyRenderer.tsx` + `baseballBackPaths.ts` | MLB jersey — the BACK view (numbers live on the back in baseball). The vendor sheet lays each jersey out twice: front on the top row, back on the bottom; this is the bottom row. 4 era treatments incl. pullovers + pinstripes |
| `src/data/colorways.json` | NBA franchise colorways (unchanged) |
| `src/data/{nfl,mlb}/colorways.json` | NFL (32) / MLB (30) franchise era colorways, relocations carried as era entries with era tricodes (OIL→HOU, MON Expos…) |
| `src/data/{nfl,mlb}/puzzles.ts` | 5 hand-written puzzles per sport (see provenance below) |
| `src/data/{nfl,mlb}/playerIndex.json` | Full search indexes — 8.4k NFL skill players (nflverse), 10.9k MLB players (Lahman, re-accented from MLB StatsAPI). Loaded per league via dynamic `import()`, so only the sport you're playing downloads one |
| `src/data/{nfl,mlb}/teamSeasons.json` | Per-season W-L + playoff results for the card backs |
| `src/game/` | Shared engine: reducer, scoring, grading, share, colorway resolution, per-sport storage factory |
| `supabase/multisport-migration.sql` | **Already applied.** Creates `results_v2` / `plays_v2` / `day_score_stats_v2` alongside the originals so the live NBA-only client keeps working; see the file for the merge-day top-up |
| `_brief/jersey-graphics-backlog.md` | Deferred: patterns/graphics on the jerseys (side panels, yokes, the Suns comet). Plan, tiers, and where the `pattern` hook already lives |

## Before this branch ships

1. **Top up the cloud tables at merge** — the multi-sport client uses
   `results_v2`/`plays_v2`; the live NBA build still writes `results`.
   Run the top-up query at the head of `supabase/multisport-migration.sql`
   once main is serving this build, then the old tables can be dropped.
2. **Verify the NFL/MLB data.** NBA puzzles were verified against
   Basketball-Reference (2026-07-15). The NFL/MLB puzzles, colorways, and
   team seasons were generated from general knowledge (2026-07-19) and
   must be verified against Pro-Football-Reference / Baseball-Reference /
   uniform databases before launch — grep for `VERIFY` and `confidence`.
3. **Remove the staging test account** (`test@test.com`) from Supabase
   auth before launch — it exists so the preview can be exercised without
   Google OAuth, which only redirects to the production domain.
4. NFL/MLB launch dates are placeholders (`2026-07-20`) in
   `src/sports/nfl.tsx` / `mlb.tsx` — set them to the real launch day so
   puzzle #1 lands correctly and the archive calendar starts there.

Not affiliated with the NBA, NFL, or MLB.
