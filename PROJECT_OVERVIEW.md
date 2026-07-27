# Journeyman — Project Overview

**A daily career-guessing game.** A mystery journeyman athlete's career is revealed one era-accurate jersey at a time; you guess who it is. Three separate games in one site — **NBA**, **NFL**, and **MLB** — each with its own daily puzzle, streak, archive, and jersey art.

- **Live:** journeymanjersey.com
- **Repo:** `TimVanC/Journeyman`
- **Status:** NBA is live. NFL and MLB are built and data-complete but pre-launch (see [Known Gaps](#known-gaps--pre-launch-checklist)).

---

## 1. The product

### What the player sees

**Home hub** ([StartScreen.tsx](src/components/StartScreen.tsx)) — three fanned hero jersey cards, the wordmark, a "How to play" opener, then one row per league showing today's puzzle number, whether it's Solved or Done, a streak flame, and a Play / Continue / Recap button. Below that: the Archive, and for signed-out players a "Keep every result — free" account card.

**The board** ([App.tsx](src/App.tsx)) — one jersey is dealt face-up at load: deliberately the *least* identifying stint of the career. Each card shows:

- An era-accurate **generic** SVG jersey — correct colorway for that franchise in those years, the player's actual number, an era tricode label. **No logos, no team names.** That's the whole puzzle.
- The stint's year range
- A 5-cell stat block

Tap a card to flip it: per-season W-L, playoff results, and written-out accolades on the back.

**Guessing** ([GuessInput.tsx](src/components/GuessInput.tsx)) — a type-ahead over a per-league player index (8k–11k names). A wrong guess is never free: it auto-flips the next jersey, then starts walking the hint ladder, then ends the game.

**Hint ladder** — after every jersey is out, five profile hints. NBA/NFL: position → height → draft year → draft pick → college. MLB: position → bats/throws → height → debut → born. After all five: one final guess, or give up.

**Result** ([ResultModal.tsx](src/components/ResultModal.tsx)) — a sport-flavored grade, a score out of 1000, the full career timeline with real team names finally revealed, "Better than X% of today's players," a share button, and links to the same date's puzzle in the other two leagues.

Plus: confetti with per-player easter eggs ([easterEggs.tsx](src/game/easterEggs.tsx) — crowns rain for LeBron), a flip-all-cards control, and a FLIP-animated card spread where a ghost card flies from the deck into its chronological slot.

### Scoring and grading

| | |
|---|---|
| Start | 1000 points |
| Each jersey after the first | −100 |
| Each hint | −125 |
| Any win | floor of 100 |
| Did not finish | 0 |

Wrong guesses carry no separate penalty — a miss burns the next reveal, so guessing and skipping cost the same. ([score.ts](src/game/score.ts))

Grades are hint-count-aware and league-flavored ([grade.ts](src/game/grade.ts)):

- **NBA:** Hall of Fame · All-NBA · Starter · 6th Man · 10-Day · Buzzer Beater · Waived
- **NFL:** Hall of Fame · All-Pro · Starter · Backup · Practice Squad · Hail Mary · Cut
- **MLB:** Cooperstown · All-Star · Everyday Starter · Utility Man · September Call-Up · Walk-Off · Released

### Sharing

One idea per line, spoiler-free ([share.ts](src/game/share.ts)):

```
Journeyman NFL #12 · All-Pro
375 pts
🏈🏈🏈 3/7
🔍🔍 2/5
https://journeymanjersey.com/nfl
```

Native share sheet on mobile, clipboard fallback — identical payload either
way. Percentile is deliberately left out.

The last line is a **deep link**, not the bare domain: it lands the recipient
on that league's live puzzle, playable, instead of on the three-league hub
facing a choice. The sport rides in the path so the URL stays bare — a share
sits in a message body next to Wordle and Framed, and a query string of
tracking params reads as spam there. Attribution comes from the path itself:
Vercel Analytics breaks down by page natively and PostHog gets `$pathname` on
every `$pageview`, so `/nfl` separates league share traffic in both tools with
nothing in the URL.

A share of the **live** day carries no day number, so the link still works when
it's opened the next morning — the common case. Only an archive replay pins the
day (`/nfl?d=3`), because a stale day-stamped link resolves to a replay, which
for a signed-out recipient is the members-only archive gate rather than a
puzzle.

---

## 2. Architecture

The spine is **one sport-agnostic game engine plus a `SportConfig` per league**. Adding a fourth sport means writing one config object and its data files — no engine changes.

[`src/sports/types.ts`](src/sports/types.ts) is the contract. A `SportConfig` supplies: puzzles, scheduling mode, roster, lazy search-index loader, colorways, the jersey renderer component, a stat-cell mapper, an accolade icon/label map, the hint ladder, grade labels, its season database, and its own localStorage namespace.

```
src/
├── main.tsx        root render, PostHog init, dev-only QA routes
├── App.tsx         the game screen — day resolution, reducer wiring,
│                   cloud push, FLIP animation, modal orchestration
├── index.css       design tokens + every component style
├── components/     JerseyCard/DeckCard/GhostCard, 3 jersey renderers,
│                   GuessInput, HintTray, Header, StartScreen, HeroCards,
│                   Confetti, Icons, 5 modals, AccountSavePrompt, QA previews
├── game/           engine: types, state (reducer), score, grade, share,
│                   storage, colorways (era resolution + WCAG contrast), easterEggs
├── sports/         nba.tsx · nfl.tsx · mlb.tsx · types.ts · index.ts · active.ts
├── data/           puzzles, roster, colorways, teamSeasons, playerIndex
│                   (NBA at root; nfl/ and mlb/ subfolders) + playerSearch,
│                   seasonDB, validatePuzzles
└── lib/            supabase client, useAuth, cloud (DB reads/writes + stats), analytics
```

Supporting directories: `_brief/` (original product and design briefs), `design/` (generated marketing PNG/SVG), `scripts/` (Node asset tooling), `supabase/` (the one SQL migration), `public/og.png`, `vercel.json` (SPA rewrite for the `/nfl`-style share paths).

### Tech stack

- **React 19.1** + TypeScript 5.8 (strict), **Vite 6.3**
- **Tailwind CSS v4.1** via `@tailwindcss/vite`, CSS-first `@theme` tokens
- **Supabase** (`@supabase/supabase-js`) — auth, Postgres, RPC
- **PostHog** for product analytics; **Vercel Analytics** for traffic
- Asset tooling: `@resvg/resvg-js`, `sharp`, `esbuild`
- Deployed on **Vercel** as a static SPA

No router, no state library, no test framework, no linter config.

---

## 3. Daily puzzle logic

Day numbering is *days since that sport's launch date, in America/New_York*. Launch dates: NBA `2026-07-15`, NFL and MLB `2026-07-22`.

Two scheduling modes ([App.tsx](src/App.tsx)):

- **`roster`** (NBA) — `ROSTER[day-1]` names the answer; a puzzle whose answer matches goes live automatically. Unauthored days fall back to cycling a small pool of verified puzzles.
- **`release`** (NFL, MLB) — `puzzles[day-1]` in authoring order, which makes the array **append-only once a day has aired**.

**Routing.** Still no router — sport resolution reads the URL directly ([sports/index.ts](src/sports/index.ts)):

| Form | Meaning |
|---|---|
| `/nba` · `/nfl` · `/mlb` | the share-link shape — picks the league **and** implies play-now, skipping the start screen |
| `?s=nba\|nfl\|mlb` | picks the league; **resolved before the path**, so every link that predates paths behaves exactly as it always did |
| `/` | no sport specified — falls through to last-played, then NBA |
| `?d=N` | replays archive day N (free-account gated; counts in stats, not the streak) |
| `?play=1` | skips the start screen — what a sport path now implies |
| `?p=N` | dev-only test slot (day 9000+N, its own save, never touches streaks or the cloud, ignored in production so future answers can't be browsed) |

Skipping the start screen never skips the rules: the board auto-opens the
how-to-play modal for anyone who has never dismissed it.

`vercel.json` rewrites unmatched paths to `index.html` so `/nfl` doesn't 404.
Vercel serves real static files ahead of rewrites, so assets are unaffected.
Anything that isn't a sport (`/foo`) matches no league and falls through to the
normal resolution order.

---

## 4. Data

### Content (committed, hand-authored)

| File | Contents |
|---|---|
| `src/data/puzzles.ts` | 27 NBA puzzles, verified against Basketball-Reference |
| `src/data/nfl/puzzles.ts` | 10 NFL puzzles |
| `src/data/mlb/puzzles.ts` | 15 MLB puzzles (incl. Negro-League players) |
| `roster.ts` per sport | 101 NBA / 47 NFL / 54 MLB names — the schedule or wishlist |
| `colorways.json` per sport | Franchise → era entries with identity, primary/secondary/trim, era style, tricode, pattern, and a confidence rating |
| `teamSeasons.json` per sport | tricode → year → W-L-T, playoff result — powers the card backs |
| `playerIndex.json` per sport | `[name, yearsActive]` tuples for the guess box; lazily imported so only the played league downloads (172 KB NBA / 255 KB NFL / 330 KB MLB) |

All data is hand-authored and committed. There is no ETL pipeline — the brief's Phase-2 Python ingest is unbuilt.

**Authoring guards** ([validatePuzzles.ts](src/data/validatePuzzles.ts)) run for all three sports on every dev load: duplicate answers, schedule runway ("repeats begin day N"), stints spanning a relocation, missing colorways, malformed stat lines, and missing `teamSeasons` rows.

### Local state — localStorage

Namespaced per sport (`journeyman` for NBA to preserve live players' history, plus `journeyman:nfl`, `journeyman:mlb`). Per sport: profile (streak, last solved day, history), scores, archive ledger, and a resumable save per day. Global: hard-mode preference, seen-help flag, last league played.

### Cloud — Supabase

One migration, [`supabase/multisport-migration.sql`](supabase/multisport-migration.sql), idempotent, applied 2026-07-22:

- **`results_v2`** — the player's own record, PK `(user_id, sport, day)`, RLS with own-row policies
- **`plays_v2`** — anonymous, write-only play pool for percentiles
- **`day_score_stats_v2(sport, day, score)`** — security-definer function returning `(total, lower_scores)`

The v2 tables exist rather than an ALTER because the live NBA client and the multi-sport client have to coexist through the merge.

There are **no application server routes** — it's a pure static SPA talking to Supabase. All DB access lives in [`src/lib/cloud.ts`](src/lib/cloud.ts): `pushResult`, `syncUp` (bulk-upload local history on sign-in), `logPlay`, `fetchDayStanding`, `fetchResults`, and a pure client-side `computeStats`.

---

## 5. Features

**Accounts** ([AccountModal.tsx](src/components/AccountModal.tsx)) — one field accepts email *or* phone (bare 10 digits become `+1`). Phone accounts still use a password, so only the one sign-up SMS ever sends. Duplicate sign-ups are detected and routed to sign-in. Google OAuth as the alternative. Signing in bulk-syncs all three sports' local history to the cloud.

**Streaks** — per sport. Recorded once per day, reset on a loss, incremented only when yesterday was solved. A stale streak displays as 0. Archive replays live in a separate ledger and count toward stats but **not** the streak.

**Archive** ([ArchiveModal.tsx](src/components/ArchiveModal.tsx)) — free-account gated (anonymous players get a pitch, not a wall). One calendar for all three leagues, each date color-coded by how the whole slate went.

**Hard mode** — no card backs, no accolade hardware anywhere. A global preference.

**Analytics** ([analytics.ts](src/lib/analytics.ts)) — typed wrappers only; components never touch PostHog directly. Events: `game_started`, `game_completed` (sport/day/won/revealed/hints/score/grade/hard/archive), `share_clicked`, `account_cta`. Configured to stay in the free tier; no-ops entirely without a key. Inbound share traffic deliberately has **no** event of its own — the `/nfl` landing path is already on `$pageview`, so the share loop is measurable without one.

**Accessibility** — `prefers-reduced-motion` honored on every reveal path, keyboard-navigable combobox, Escape closes every modal, aria throughout, 16px inputs so iOS doesn't zoom.

---

## 6. Development

```bash
npm run dev
```

| Script | Purpose |
|---|---|
| `dev` | Vite dev server (port 5173) |
| `build` | `tsc --noEmit && vite build` — typecheck gates the build |
| `preview` | Serve the production build |
| `build:og` | Regenerate `public/og.png` link-preview image |
| `build:playercards` | SSR the real jersey renderers into `design/` PNG/SVG |

**QA routes** (dev and Vercel previews only, blocked on the live domain): `?jerseys` renders every renderer × era × colorway plus the icon set, `?cards` and `?playercards` preview marketing art.

**Environment variables** — two, both optional and client-side:

- `VITE_PUBLIC_POSTHOG_KEY` — absent means analytics no-ops
- `VITE_PUBLIC_POSTHOG_HOST` — defaults to `https://us.i.posthog.com`

The Supabase URL and publishable key are hardcoded in [`src/lib/supabase.ts`](src/lib/supabase.ts) by design — all access is gated by RLS. Server-side config not in the repo: Google OAuth provider and redirect URLs, email templates, and the SMS/OTP provider.

---

## 7. Known gaps / pre-launch checklist

1. **Merge-day cloud top-up not yet run.** The multi-sport client writes `results_v2`/`plays_v2` while live main still writes `results`. The top-up SQL sits at the head of the migration file; afterward `results`, `plays`, and the old `day_score_stats` can be dropped.
2. **NFL/MLB data unverified.** Puzzles, colorways, and team seasons were generated from general knowledge and need checking against PFR/BR/uniform databases. 26 colorway eras are still marked low-confidence (20 NBA — mostly ABA — 5 MLB, 1 NFL).
3. **Staging test account** `test@test.com` should be removed from Supabase auth before launch.
4. **Confirm NFL/MLB launch dates** (`2026-07-22`) — they determine puzzle #1 and the archive calendar start.

Longer-horizon:

- **No anti-cheat.** Every puzzle including the answer ships in the JS bundle, and day rollover uses the client clock. The original brief specified server-side `check_guess`/`reveal_next` RPCs; that's Phase 2.
- **Phase-2 ETL and automatic puzzle generation are unbuilt** — no players/stints tables, no reveal-order algorithm, no role-phase detection. The `PathType` union supports `number_era` and `role_phase` but every authored puzzle is `"team"`.
- **Jersey patterns deferred** — the `pattern` hook exists; only MLB pinstripes ship.
- NBA puzzles 6–9 are unverified UX-test puzzles, reachable only via `?p=`.
- No tests, no CI, no linter config.
