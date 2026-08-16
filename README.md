# Handshakes monorepo

Daily sports puzzle games sharing one dataset, jersey renderer, and UI toolkit.

```
apps/journeyman       → journeymanjersey.com   (imported from the standalone repo, history preserved)
apps/handshakes       → handshakes.game        (daily teammate-chain puzzle)
packages/sport-data   → players, team_seasons, appearances + graph, solver, puzzle generator
packages/jerseys      → era-accurate SVG jersey renderers + canonical colorway JSONs
packages/ui           → player typeahead search, daily-game storage factory, share plumbing
```

## Setup

```
npm install
npm run dev:handshakes     # http://localhost:5175/hoops
npm run dev:journeyman
npm test                   # solver + game-core suites
```

## Handshakes data pipeline (offline, never at request time)

```
python packages/sport-data/ingest/nba/fetch_seasons.py    # one stats.nba.com call per season, cached
python packages/sport-data/ingest/nba/build_artifact.py   # → packages/sport-data/data/nba.json (+ checksum meta)
npm run generate --workspace packages/sport-data -- 2026-09-07   # → apps/handshakes/src/data/puzzles.nba.json
node packages/sport-data/scripts/inspect.mjs 30           # human review of the schedule
```

The generator argument is the launch date (day #1); pick a Monday so the
weekly difficulty rhythm (easy Mon → hardest Thu/Fri → mid weekend) lines up.
The app's day numbering reads the same date from the puzzle table, so the two
can never disagree.

Dev preview: `/hoops?p=N` plays puzzle N in a quarantined save slot that never
touches streaks (dev builds only).

## What counts as a handshake (decided once, surfaced in-app)

Both players have an `appearances` row for the same `team_season` with
`games_played >= 1`. Regular season only; mid-season trades count; ABA,
preseason, playoffs-only, and dressed-but-never-played don't.

## Deployment

- **Handshakes**: new Vercel project, root directory `apps/handshakes`,
  build `npm run build`, SPA rewrite ships in its `vercel.json`. Domain
  (`handshakes.game` preferred) still needs purchasing.
- **Journeyman cutover**: the original standalone repo at `../journeyman` is
  still what Vercel deploys. Once this monorepo is pushed, point the existing
  Vercel project's root directory at `apps/journeyman` here and retire the
  standalone repo. Until then, changes made here to `apps/journeyman` do not
  reach production. Note for the sync: the standalone repo has an in-flight
  `ncaab-poc` branch that will need rebasing over the extraction shims
  (three renderers, `game/colorways.ts`, `game/storage.ts`,
  `data/playerSearch.ts`, and the colorway JSON paths now living in
  `packages/jerseys`).

## Open decisions (from the build brief)

- Par band 3–4, NBA-only, no ABA, playoff-only appearances excluded — all
  shipped as recommended; revisit with real solve-rate data.
- Sport #2: NHL over soccer (three live soccer competitors; the handshake
  line is a hockey ritual). The registry in `apps/handshakes/src/sports.ts`
  and the `sport` column everywhere are ready for it.
