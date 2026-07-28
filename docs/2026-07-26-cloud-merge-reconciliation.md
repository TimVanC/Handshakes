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

## 2. The repo file never matched the migration that ran

> ## ⚠ The applied migration is NOT idempotent. Do not re-run it.
>
> Migration `20260722033745` ends with an **unguarded** copy:
>
> ```sql
> insert into public.plays_v2 (sport, day, won, revealed, score, hard, is_archive, created_at)
> select 'nba', day, won, revealed, score, hard, is_archive, created_at
> from public.plays;
> ```
>
> No `on conflict`, no `where`, no guard. Running it again copies all of
> `plays` into `plays_v2` a second time, **doubling the anonymous play pool
> and corrupting every NBA percentile** `day_score_stats_v2` serves. There is
> no natural key on `plays_v2` to detect the duplication with, and no way to
> tell an original row from its copy afterwards.
>
> **The specific trap:** the repo file's header used to say *"It is idempotent,
> so re-running it is safe."* That claim was false — it described a file that
> was missing this statement, not the migration that ran. The claim has been
> removed and the file replaced with the applied text. Any older copy still
> carrying that header is dangerous; discard it.

### What was found

`plays_v2` holds **41 NBA rows with `created_at` earlier than 2026-07-22**, the
date the table was created. A `now()` default cannot produce those. **41 of the
44 rows in `plays` have an exact twin in `plays_v2`**, matched on `created_at`
at microsecond precision plus `day`, `won`, `revealed`, `score`, `hard`,
`is_archive`. Neither client dual-writes — the pre-merge `logPlay` targeted
`plays`, the current one targets `plays_v2`.

The explanation is not a rogue operation. **The migration recorded in
`supabase_migrations.schema_migrations` contains the copy; the repo file did
not.** They were two different documents. Diffing them, ignoring comments, the
*only* SQL difference in the entire file is those three lines.

### Provenance — probable, not confirmed

The owner confirms they ran no SQL by hand, and that the migration was authored
in an AI-assisted session with the Supabase MCP connected.

**Most probable mechanism: MCP `apply_migration`.** The reasoning, so it can be
re-examined rather than taken on faith:

- Running SQL in the Supabase **dashboard SQL editor does not write a ledger
  entry at all**. A ledger entry exists, so this came through migration
  tooling, not the dashboard.
- It was **not the CLI**: there is no `supabase/config.toml`, no
  `supabase/migrations/` directory, and neither has ever existed in git
  history. `supabase db push` had no project to push from.
- That leaves `apply_migration`, which matches the observed shape: SQL authored
  inline in an agent session and applied straight to production, with a
  hand-maintained repo copy that was never reconciled to it.

The ledger records the *mechanism*, not the operator. This is well-supported,
not proven.

### The ledger's timestamps are not an execution audit trail

The copy is unconditional, so whatever existed when it ran got copied. That
pins execution to a window that **contradicts the ledger's own version stamp**:

| | |
|---|---|
| Latest **copied** play | 2026-07-21 19:18:59 UTC |
| Earliest **uncopied** play | 2026-07-22 01:50:51 UTC |
| Ledger version stamp | 2026-07-22 **03:37:45** |

Rows 61 and 62 existed at 01:50 and 01:55 UTC. An unconditional copy running at
03:37 would have taken them; it didn't. **The SQL executed at least two hours
before its own version stamp.** Most likely the version is generated when the
record is written rather than when the SQL runs. Unconfirmed — the Postgres and
API logs that would settle it are past their 24-hour retention.

Do not use ledger version numbers to reconstruct a sequence of events.

It ran exactly once: no duplicate `(created_at, day, score)` groups exist among
the copied rows, and an unguarded insert running twice would have doubled all 44.

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

11 accounts.

### DECISION: `test@test.com` is kept. Deletion deferred past Session 6.

`SESSION_2_cloud_merge.md` §2.3 asks for this account to be removed, and
acceptance criterion 5 reads "Staging account gone." **That criterion is
deliberately not met, by the owner's decision on 2026-07-27.** This is a
decision, not an oversight — do not "finish the job" by deleting it.

Reasoning, so it does not have to be relitigated:

- **It is the owner's active test identity**, not an abandoned staging
  artifact. It is the only account available for exercising signed-in code
  paths, and Sessions 4, 5 and 6 all need one. It was signed in and recording
  results as recently as 2026-07-27.
- **Deleting it would not achieve the thing deletion is for.** Its games live
  in `plays_v2`, which has no `user_id` — see §4. Removing the account removes
  7 rows from `results_v2` (visible only on its own stats page) and leaves
  **every one of its plays in the percentile pool, permanently and
  unidentifiably**. The pool contamination survives the deletion either way.
- The security case is thin: RLS confines the account to its own `results_v2`
  rows, and the `plays_v2` insert policy is already open to `anon`, so it holds
  no privilege an anonymous visitor lacks.

Revisit after Session 6, when a signed-in test identity is no longer needed.
One residual argument for eventual removal: it produced the single row in the
database that disagrees with the NFL launch date (§3). That row is documented
and can be excluded by user id without deleting anything.

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

If `test@test.com` is ever deleted, it cascades cleanly to `results_v2` (7
rows) and `results` (0 rows) via `results_v2_user_id_fkey ... on delete
cascade`. **No orphans.** Its `plays_v2` rows survive regardless — see §4.

## 6. `syncUp` — silent total-failure bug

Fixed separately in `fix/syncup-archive-collision`. Summary: an archive replay
is allowed on a day already played live, putting that day in both localStorage
ledgers; `syncUp` then sent two rows sharing one conflict target in a single
upsert, which Postgres rejects wholesale, and the error was discarded.

Affected-user count is an **upper bound of 5, with 2 confirmed unaffected, and
is structurally underivable** — `results_v2`'s PK cannot represent the
overlapping pair, so the evidence only ever existed on the device. Full
reasoning is preserved in that PR's description.

## 7. `supabase/` is not a schema record

The drift found in §2 is not an isolated slip. Checking every applied migration
against the repo:

| Ledger version | Name | In repo? |
|---|---|---|
| 20260716062117 | `init_profiles_and_results` | **no** |
| 20260716062159 | `lock_down_handle_new_user` | **no** |
| 20260716160718 | `plays_log_and_percentile` | **no** |
| 20260716160754 | `tighten_plays_insert_policy` | **no** |
| 20260716172505 | `score_scale_1000` | **no** |
| 20260716173302 | `results_score_column` | **no** |
| 20260717043630 | `raise_revealed_cap_for_mega_journeymen` | **no** |
| 20260722033745 | `multisport_results_v2` | yes — and it did not match until now |

**Seven of the eight applied migrations have no counterpart in the repo at
all**, and the eighth was wrong. Everything that defines the base schema exists
only in the database:

- the `profiles` table and its RLS policies
- the `results` and `plays` tables, their constraints and policies
- the `handle_new_user` signup trigger and the `revoke` that locks it down
- the original `day_score_stats` RPC
- the 0–110 → 0–1000 score rescale, and the `revealed` cap raised to 20 for
  deep careers (Ish Smith, 16 stints)

### Resolved 2026-07-27

All eight applied migrations have now been pulled verbatim from the ledger into
[`supabase/migrations/`](../supabase/migrations/), named to match their ledger
versions, with [a README](../supabase/migrations/README.md) recording that they
were **reconstructed from the database rather than authored ahead of it**.
Fidelity was verified by comparing SQL-only content (comments and blank lines
stripped) by md5 against `schema_migrations` — all eight matched.

The project can now be rebuilt from the repo. It could not be before.

### The rule that would have prevented all of this

> **Anything applied via `apply_migration` gets committed to
> `supabase/migrations/` in the same session it is applied.**

Not "later", not "when the branch merges" — the same session. Every problem in
this document traces back to that not happening: the drifted file in §2, the
unrecorded base schema above, and the two destructive statements in §8 that
nobody had read since the day they ran.

This matters most for agent-applied migrations. SQL authored inline in an
assistant session and applied straight to production leaves no artifact
anywhere but the ledger, and nobody reads the ledger by habit.

## 8. Two traps found in the recovered migrations

Both are the same shape of bug, and it is worth naming the shape: **a
destructive or duplicating statement whose neighbouring comment describes
something narrower and safer than the SQL actually does.** Both were harmless
when applied and dangerous afterwards.

### `20260716172505_score_scale_1000` ends with `delete from public.plays;`

Unfiltered. No `where`, no transaction, no undo. Re-running that migration
**deletes the entire anonymous play pool** — every row, every day, every sport.

Its own comment reads *"wipe any plays logged under the old 0-110 scale
(pre-launch; scales can't be compared, and the pool restarts clean)"*, which
describes a **filtered** cleanup of stale rows. The SQL is not filtered. When
it ran on 2026-07-16 the distinction did not matter — the table held nothing
but old-scale rows and the game had not launched. It matters now: `public.plays`
holds 44 live rows, 41 of which are the sole pre-merge percentile history.

### `20260722033745_multisport_results_v2` ends with an unguarded copy

Covered in §2. Same shape: a comment reading "carry the existing NBA history
over" above an insert with no `on conflict` guard.

### Everything else

The remaining five recovered migrations are non-idempotent but **fail loudly** —
`create table` / `create policy` / `drop policy` / `add column` without
`if [not] exists`. They error out rather than corrupting anything.
`20260716062159` is genuinely idempotent.

Full table in [`supabase/migrations/README.md`](../supabase/migrations/README.md).
