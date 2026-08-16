# Difficulty calibration — first pass, 2026-07-28

Observed outcomes from `plays_v2` (non-archive), all aired days. **This
sample is far too small to fit anything** — 25 aired day-sports, 2–17
plays per day. Numbers below are reporting, not a model.

| Sport | Days aired | Total plays | Win rate | Target |
|---|---|---|---|---|
| NBA | 13 (day 1 pool empty) | 88 | 80% | ~50% |
| NFL | 6 | 37 | 81% | ~50% |
| MLB | 6 | 29 | 79% | ~50% |

Per-day extremes worth knowing:
- Hardest so far: NBA day 5 (Antawn Jamison) 1/5 = 20%, NBA day 10
  (Matt Barnes) 2/6 = 33%.
- Everything else sits between 50% and 100%, mostly near 80%.
- NBA day 13 (Ish Smith) was won by 5/6 players but needed an average
  of 10.8 jerseys — long puzzles are not automatically hard to *win*,
  they are hard to win *early*. Difficulty should target revealed-count,
  not just win rate.

## Provisional read (stated with its weakness)

The game is currently running ~30 points HOT versus the ~50% target on
every sport. But the early audience is friends-and-family — likely far
more engaged than an organic audience — and n≈150 plays total. Do not
recalibrate content off this. Re-run after 4+ weeks of organic traffic.

Per 00_CONSTRAINTS.md §2 and the session doc: if a rolling 14-day window
drifts >10 points off target, FLAG it (this report is that flag); the
owner decides. No auto-correction is implemented, deliberately.

Heuristic difficulty scores for candidates are in
`pipeline/out/candidates-nfl.json`; they are unfitted pending real data.
