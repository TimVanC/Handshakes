# JOURNEYMAN — Addendum: Player Pool Tracks, Stint Thresholds & Selection Rules

Combined add-on to `journeyman-build-brief.md`. Insert as **§4.5** (between "Puzzle generation" and "Data pipeline"). All of this affects the Phase 2 puzzle generator — not needed for Phase 1's hardcoded puzzles, but worth building into the generator's data model from the start rather than retrofitting.

---

## 4.5a — Player pool tracks (replaces the single "4+ franchises" rule)

The original brief (§4) qualified players on one axis: 4+ distinct franchises. That's still the core identity of the game, but it excludes single- or two-team legends entirely — which turns out to be too strict. The fix is to split qualification into **tracks**, each with its own path-splitting key. A puzzle's `path_type` tells the generator (and the reveal-order algorithm in §4) which dimension to slice stints on.

| Track | Qualification | Path split key (`path_type`) | Typical jersey count |
|---|---|---|---|
| **A — Nomad** (original rule) | 4+ franchises, GP ≥ 250 | `team` — one jersey per franchise stint | 4-7 |
| **B — Number-Change** | 2-3 franchises, but 2+ distinct jersey-number eras (e.g. Kobe #8→#24, Jordan #23→#45→#23) | `number_era` — one jersey per number era, can cross or stay within a team | 2-4 |
| **C — Long Odyssey** | 12+ seasons, only 2-3 franchises | `role_phase` — jerseys split by career phase (see 4.5b), independent of team change | 3-4 |
| **D — Lifer** | 15+ seasons, single franchise | `role_phase`, plus any number changes from Track B logic layered in if present | 2-3 |

A player can technically qualify for more than one track (e.g., a long-career guy who also changed numbers) — when that happens, prefer whichever track yields more jerseys, since more reveal steps means more puzzle.

**Why bother with C and D:** without them the pool is capped at guys who moved around, which excludes some of the most-recognized players in the sport. With them, "journeyman" becomes the *default* identity of the daily puzzle rather than the *only* identity — which is the right balance, as long as C/D stay a minority of the rotation (see 4.5f).

## 4.5b — Role-phase detection (the new mechanic Tracks C/D depend on)

For a single-team or short-path career, split stints by **career phase** instead of team, using trendlines on MPG and PPG (or usage rate, if available) across seasons:

1. Compute season-over-season MPG/PPG for the player.
2. Detect phase boundaries where the rolling trend crosses a slope threshold — e.g., a sustained rise (rookie → developing), a plateau (peak), and a sustained decline (decline phase). A simple 3-phase split (early / peak / late) is enough for MVP; don't over-engineer this into true changepoint detection.
3. Each phase becomes a "jersey" showing that phase's years and averaged stats — visually it's still the same team's colorway/era, so the number and any subtle roster-year cosmetic changes (if the team's colorway shifted mid-career, that also naturally creates a phase boundary — check `colorways.json` for an era change within the player's tenure and prefer that as a boundary when one exists) are what differentiate the cards, plus the stat line itself, which is now doing real work (rookie-year averages look nothing like peak-year averages).
4. Minimum phase length: same as the stint-inclusion floor below (4.5c) — a phase needs enough games to produce a meaningful stat line, not a small end-of-bench cameo season.

## 4.5c — Stint/phase-inclusion floor

Regardless of track, nothing should become its own jersey card on a technicality:

1. **Per-stint or per-phase minimum: ≥ 10-15 GP** to be shown as its own jersey. Below that, merge into the adjacent stint/phase's stats, or drop it from the reveal sequence (still keep it in the full-career data for the results-screen timeline).
2. **Track A franchise-count integrity:** when checking a player against Track A's "4+ franchises" rule, only count franchises where they clear the per-stint GP floor — a 10-day-contract team doesn't count as a real chapter.

## 4.5d — Player signal-floor (distinguishes "hard" from "unfair")

A player qualifies for any track only if **at least one stint or phase** has ≥ 15 MPG for a full season. This still admits lifelong backups and role players — it just excludes players who never had a real rotation role anywhere, whose stat lines would be flat and uninformative at every stop (meaning the jerseys alone would have to carry the entire puzzle, every time — that's unfair rather than hard).

## 4.5e — Selection parameters to randomize/balance across the pool

These are weighting inputs for *which* qualifying player gets picked on a given day, so the daily puzzle doesn't feel like it's sampling the same shape of career every week.

| Parameter | Why it matters | Balancing approach |
|---|---|---|
| **Track (A/B/C/D)** | All-Nomad weeks feel repetitive; all-Lifer weeks lose the game's identity | See 4.5f — Track A should dominate, B/C/D are minority pulls |
| **Era** (decade of peak/debut) | Repetition risk if clustered | Rolling 7-day quota; cap ~2 puzzles/week per decade |
| **Position** | Same repetition risk | Same rolling quota approach |
| **Franchise/jersey count** | More jerseys = more reveal steps = built-in difficulty | Mild upward trend toward weekend (pairs with 4.5f) |
| **Draft pedigree** | Lottery pick vs. late 2nd vs. undrafted changes hint-ladder strength | Track distribution so hint-strength doesn't cluster |
| **Country/college** | International players swap "country" for "college" on the hint ladder | Rough weekly quota so it's not all-domestic |
| **Career length bucket** | A 250-game floor guy feels different from a 900+-game vet even at the same jersey count | Avoid same-bucket runs |

## 4.5f — Weekly rotation across tracks and difficulty

- **Track A (Nomad) is the default**, most days of the week — it's the core identity of the game.
- **Track B (Number-Change)** is a good mid-week "twist" pull — occasional, not scheduled rigidly.
- **Tracks C/D (Long Odyssey / Lifer)** are structurally easier (fewer, longer-duration jerseys) — reserve for a specific lighter slot, e.g. Sunday "everyone can play," rather than mixing randomly into weekday puzzles where they'd feel like a letdown after a run of proper journeymen.
- Within Track A itself, keep the existing weekday/weekend split: weekday puzzles favor players with a multi-year rotation stint (stats carry real signal); weekend (Fri/Sat) opens to true bench nomads with flatter stat lines, where the jerseys have to do more of the work. Saturday can be the "hardest of the week" slot if you want an NYT-Connections-style reference point.

## 4.5g — Anti-repeat logic

- **No-repeat window:** exclude any player used in the last 60-90 days (tune to actual pool size once built).
- **No-repeat opening jersey:** avoid opening consecutive days on the same team/colorway, regardless of track — keeps the first beat of the puzzle from feeling repetitive even across different players.
- **Rolling quota tracking:** maintain a 7-day rolling window of {track, era, position, jersey-count bucket} used, and bias selection weight inversely to how recently/often each bucket has appeared — weighted random sampling, not pure uniform random and not a rigid rotation.

## Implementation notes

- `players` table needs a `qualifying_tracks` field (array — a player can qualify for multiple) and `last_used_date`.
- `puzzles` table needs `path_type` (`team` / `number_era` / `role_phase`) so the client and reveal-order algorithm know which dimension the jerseys are split on — the "least identifying first" scoring logic (§4) works the same way regardless of split key, it just needs to know which one it's slicing.
- Role-phase detection (4.5b) is the one genuinely new piece of logic, not just a filter — budget real dev time for it in Phase 2, likely as its own small module separate from the main stint ETL.
- Keep Phase 1's 5 hand-picked puzzles as-is (Track A only is fine for the demo); none of this matters until the generator is auto-selecting from the full pool.
