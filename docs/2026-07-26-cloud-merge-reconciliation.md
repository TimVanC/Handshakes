# Cloud merge reconciliation — findings, 2026-07-26

Session 2 (`SESSION_2_cloud_merge.md`). Read-only investigation of the live
Supabase project against `supabase/multisport-migration.sql`.

Re-runnable queries: [`supabase/verify-multisport-merge.sql`](../supabase/verify-multisport-merge.sql).

**Nothing was dropped, altered, or written by this session.** `results`, `plays`
and `day_score_stats(integer,integer)` are all still present. The drops remain
deferred to a later, deliberate session.

---

## 1. The `results` top-up is a no-op

The top-up at the head of the migration:

```sql
insert into public.results_v2 (user_id, sport, day, won, revealed, score, is_archive, played_at)
select user_id, 'nba', day, won, revealed, score, is_archive, played_at
from public.results
on conflict (user_id, sport, day) do nothing;
```

Pre-flight anti-join, run **before** the statement:

| Verdict | Rows |
|---|---|
| WOULD INSERT (new row) | **0** |
| DISCARDED — identical (safe) | **19** |
| DISCARDED — DIFFERS (review) | **0** |

All 19 rows in `results` already exist in `results_v2`, identical on `won`,
`revealed`, `score`, `is_archive` **and** `played_at` — the 2026-07-22 copy
preserved original timestamps rather than stamping `now()`.

`results` spans days 1–7 (max day 7 = 2026-07-21) and has received no writes
since the migration. The feared collision window — old client and new client
both writing the same day — never opened, because the old client stopped
writing before the merge landed.

### Why the no-drops rule made this checkable

`on conflict do nothing` **skips the insert; it does not delete from the
source.** All 19 original rows were still sitting in `public.results`
untouched four days after the 2026-07-22 run, which is the only reason they
could be diffed against `results_v2` today. Nothing was lost in that run, and
that is a verified statement rather than an assumption.

Once `results` is dropped, this check becomes impossible to repeat. Anyone
planning the drop session should re-run the anti-join immediately beforehand
and keep the output.

## 2. `plays` was copied into `plays_v2` out of band

**Not recorded in any migration file.** `supabase/multisport-migration.sql`
contains no `plays` → `plays_v2` statement, and no other SQL exists in the
repo. The database says otherwise.

Evidence:

- `plays_v2` holds **41 NBA rows with `created_at` earlier than 2026-07-22**,
  the date the table was created. A `now()` default cannot produce those; they
  were inserted with explicit timestamps.
- **41 of the 44 rows in `plays` have an exact twin in `plays_v2`**, matching
  on `created_at` at microsecond precision plus `day`, `won`, `revealed`,
  `score`, `hard`, `is_archive`.
- Per-day counts for NBA days 2–6 are identical across both tables, with the
  same score ranges and dates.

Neither client dual-writes — the pre-merge `logPlay` targeted `plays`, the
current one targets `plays_v2` — so this was a manual copy, direction
`plays` → `plays_v2`.

> **Provenance: OPEN.** Whether this was run by hand by the owner on merge day
> is unconfirmed at time of writing. Fill this in — if it was not, the
> provenance of other tables needs review too.

### Consequence: do not UNION the two tables

Making `day_score_stats_v2` read `plays_v2 UNION plays` was considered and
**rejected**. The tables are not disjoint: the union would double-count 41 of
the 44 rows, roughly doubling the pool for NBA days 2–7 and pulling every
percentile on those days toward the middle.

For the record, the parts that *were* clean: `day` and `score` semantics line
up exactly (both `day 1..8999`, both `score 0..1000 not null` — old
`plays.score` is `not null`, so the null-score problem that affects a `results`
copy does not exist for plays at all). Only the overlap kills it.

### Residue: 3 rows

Written after the copy ran and never carried over:

| `plays.id` | day | score | is_archive | created (ET) |
|---|---|---|---|---|
| 61 | 7 | 1000 | false | 2026-07-21 |
| 62 | 6 | 1000 | **true** | 2026-07-21 |
| 63 | 8 | 1000 | false | 2026-07-22 |

Row 62 is an archive play and `day_score_stats_v2` already filters
`not is_archive`, so it is irrelevant to percentiles. Live impact is two rows:

- NBA day 7: pool 8 → 9
- NBA day 8: pool 17 → 18

Both are perfect 1000s, so including them shifts percentiles slightly *down*
for everyone else on those two days.

**Planned remedy** (its own session, not yet written): a targeted insert of
those three rows by explicit `plays.id`. Enumerable by primary key, therefore
trivially idempotent and reversible, and it needs no `alter` on `plays_v2`.
Do not reach for a general copy or a union.

## 3. Launch date constants — all three confirmed

Derived from plays logged **at play time** (`plays.created_at` /
`plays_v2.created_at`), which are never back-stamped, unlike
`results_v2.played_at`. For a non-archive play,
`play_date_ET - (day - 1)` must be constant per sport and equal the launch date.

| Sport | Constant | Derived | Rows agreeing | Disagreeing |
|---|---|---|---|---|
| NBA | `2026-07-15` | `2026-07-15` | 122 | **0** |
| NFL | `2026-07-22` | `2026-07-22` | 33 | **0** |
| MLB | `2026-07-22` | `2026-07-22` | 25 | **0** |

Unanimous. **No mismatch in any of the three.** Per `00_CONSTRAINTS.md` §2 these
are now confirmed against real data and immutable.

Constants live in exactly three load-bearing places —
[`src/sports/nba.tsx`](../src/sports/nba.tsx),
[`src/sports/nfl.tsx`](../src/sports/nfl.tsx),
[`src/sports/mlb.tsx`](../src/sports/mlb.tsx) — each passed to
`createStorage(prefix, launchDate)`. Other mentions (`PROJECT_OVERVIEW.md`,
`README.md`, `00_CONSTRAINTS.md`) are prose.

Note NFL and MLB **do** have recorded results (days 1–5, 5 users each), contrary
to the handoff's assumption that they had not launched. Their day numbering is
therefore already anchored to real rows, not still adjustable.

### The one disagreeing row

A single `results_v2` NFL row implies `2026-07-21`, a day earlier than the
constant. It belongs to the `test@test.com` staging account and was written by
a bulk `syncUp` (it shares a microsecond-identical `played_at` with two other
rows), not at play time. It disappears when that account is deleted. The clean
plays-based derivation is unaffected.

The wider scatter visible when deriving from `results_v2` (NBA rows implying
2026-07-16 through 07-21) is expected and benign: rows inserted by `syncUp` get
`played_at = now()`, so they derive a *later* date than the truth. **Only
`plays`/`plays_v2` are a sound basis for this derivation.** `MIN` over
`results_v2` is the tightest available bound, not an answer.

## 4. `plays_v2` cannot attribute a play to a user — ever

`plays_v2` has **no `user_id` column** by design (it is the anonymous pool
behind "better than X% of today's players"). Two consequences:

1. Deleting an auth user removes their `results_v2` rows via
   `on delete cascade`, but **does not remove their plays**. Those rows stay in
   the percentile pool permanently.
2. After deletion they are **unidentifiable** — nothing links a play row to the
   account that wrote it. Characterise before deleting, never after.

### NBA early-day pool, as served today

| Day | Pool | Perfect 1000s | Avg | One row is worth |
|---|---|---|---|---|
| 1 | **0** | — | — | — |
| 2 | **2** | 0 | 800 | **50.0%** |
| 3 | 9 | 0 | 406 | 11.1% |
| 4 | 5 | 0 | 640 | 20.0% |
| 5 | 5 | 0 | 100 | 20.0% |
| 6 | 9 | 0 | 600 | 11.1% |
| 7 | 8 | 6 | 969 | 12.5% |
| 8 | 17 | 5 | 643 | 5.9% |
| 9 | 11 | 7 | 791 | 9.1% |
| 10 | 6 | 0 | 250 | 16.7% |

NBA **day 1 has an empty pool** — `plays` starts at day 2, so play logging
post-dates launch day. `fetchDayStanding` returns `others: 0` there.

Day 2's pool is **two rows**, so a single test play moves any percentile on that
day by 50 points. The staging account holds an NBA day 2 result, but it is
`is_archive = true` and therefore already excluded from the pool.

Days where the staging account's non-archive plays are likely sitting in the
pool: **NBA 7 and 8, NFL 1, 2 and 5, MLB 1** — one row each, i.e. up to 12.5% of
NBA day 7. Deleting the account will not remove them. This is an estimate from
its `results_v2` rows, not an attribution; the pool genuinely cannot be queried
that way.

## 5. Account inventory

11 accounts. **`test@test.com` (`Staging Test`) is the only clearly non-real
one** — and it was signed in and recording results on 2026-07-26, so confirm it
is idle before deleting.

Two things worth flagging before anyone deletes anything else:

- **The three null-email accounts are `provider: phone` — real phone-auth
  users, not anonymous sessions and not junk.** Two of them
  (`…efbf81` 22 rows, `…2a73fe` 20 rows) are among the highest-history accounts
  in the database. Do not treat a null email as a deletion signal.
- Three Google accounts are name-variants of the owner (`timmyvc123`,
  `timotvanc`, `timmvanc`) and hold 1, 5 and 8 result rows. Probably the
  owner's own alts; left alone pending confirmation.
- Two accounts hold zero rows (`a.chiusano9524`, never signed in;
  `josephchiusano14`). Real-looking abandoned signups, not staging artifacts.

Deleting `test@test.com` cascades cleanly to `results_v2` (7 rows) and
`results` (0 rows) via `results_v2_user_id_fkey ... on delete cascade`. **No
orphans.** Its `plays_v2` rows survive — see §4.

## 6. `syncUp` — silent total-failure bug

Fixed separately in `fix/syncup-archive-collision`. Summary: an archive replay
is allowed on a day already played live, putting that day in both localStorage
ledgers; `syncUp` then sent two rows sharing one conflict target in a single
upsert, which Postgres rejects wholesale, and the error was discarded.

Affected-user count is an **upper bound of 5, with 2 confirmed unaffected, and
is structurally underivable** — `results_v2`'s PK cannot represent the
overlapping pair, so the evidence only ever existed on the device. Full
reasoning is preserved in that PR's description.
