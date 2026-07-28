# Migrations — reconstructed from the database, 2026-07-27

**These files were recovered from the database, not authored ahead of it.**

Every `.sql` file here was pulled from
`supabase_migrations.schema_migrations` on 2026-07-27 — the ledger of what
Supabase actually applied. They are a *record* of the live schema, written
after the fact. They are not the source the schema was built from.

## ⚠ Two files are deliberately NOT faithful transcriptions

Two migrations contained statements that were harmless when they ran and are
destructive today. **Those statements have been commented out**, with the
original preserved verbatim in a comment block directly above, and an
explanation of why it is disabled:

| File | Defused statement |
|---|---|
| `20260716172505_score_scale_1000` | `delete from public.plays;` (unfiltered — wipes the entire play pool) |
| `20260722033745_multisport_results_v2` | `insert into public.plays_v2 ... from public.plays` (unguarded — duplicates the entire play pool) |

A README warning does not survive an agent replaying this directory
programmatically, which is exactly what the directory exists for. Flagging was
not enough; the statements are disabled.

**Consequence: this directory is a safe-to-replay reconstruction, not a record
of what ran.** For what actually executed against production, read
`supabase_migrations.schema_migrations`. **The ledger is the source of truth.**
The other six files are unmodified.

## ⚠ Never replayed end-to-end — a recovery aid, not a verified rebuild path

**These migrations have never been run in sequence against an empty database,
by anyone.** Nothing here is proven to reconstruct the schema. It is a recovery
aid: enough to rebuild by hand, read for reference, or diff against the live
database.

Do not assume `supabase db reset` or an equivalent replay will succeed. If you
ever do verify the full sequence against a scratch database, record the result
here — that is the step that would turn this into a real rebuild path.

Until this reconstruction, **seven of the eight applied migrations existed
nowhere in the repo**, and the eighth (`20260722033745`) was present only as a
hand-maintained copy that was missing a statement. The project could not have
been rebuilt from source. See
[`docs/2026-07-26-cloud-merge-reconciliation.md`](../../docs/2026-07-26-cloud-merge-reconciliation.md) §2 and §7.

## The rule, going forward

**Anything applied via `apply_migration` gets committed here in the same
session it is applied.** Not "later", not "when the branch merges" — the same
session. Every problem documented in the reconciliation note traces back to
that not happening.

This applies to agent-run migrations especially. SQL authored inline in an
assistant session and applied straight to production leaves no artifact
anywhere except the ledger, and the ledger is not something anyone reads by
habit.

## How to verify these against the database

Each file carries an added provenance header; everything below it is verbatim.
To confirm nothing drifted, compare SQL-only content (comments and blank lines
stripped) against the ledger:

```sql
select m.version, m.name,
  md5(string_agg(t.ln, E'\n' order by t.ord)) as sql_only_md5
from supabase_migrations.schema_migrations m
cross join lateral (
  select ord, regexp_replace(line, '[[:space:]]+$', '') as ln
  from unnest(string_to_array(replace(m.statements[1], E'\r', ''), E'\n'))
       with ordinality as u(line, ord)
  where line !~ '^[[:space:]]*--' and line !~ '^[[:space:]]*$'
) t
group by m.version, m.name order by m.version;
```

```bash
for f in supabase/migrations/*.sql; do
  c=$(tr -d '\r' < "$f" | grep -v '^[[:space:]]*--' | grep -v '^[[:space:]]*$' | sed 's/[[:space:]]*$//')
  printf '%s  %s\n' "$(printf '%s' "$c" | md5sum | cut -d' ' -f1)" "$f"
done
```

All eight matched when this directory was created, **before two of them were
defused**. Expected results now:

| File | SQL lines | md5 | Matches ledger? |
|---|---|---|---|
| `20260716062117_init_profiles_and_results` | 47 | `f40edd45bbf94a119f6720459b5c7b15` | ✅ |
| `20260716062159_lock_down_handle_new_user` | 1 | `3d7921b86d05f48028215dd210f5d03e` | ✅ |
| `20260716160718_plays_log_and_percentile` | 28 | `d8a83dac7171f3b537b433b85db5ff85` | ✅ |
| `20260716160754_tighten_plays_insert_policy` | 8 | `d9e3e5b6124636613fa914c632cac4fe` | ✅ |
| `20260716172505_score_scale_1000` | 10 | `7c910b190bdfb59e694a325fd64cddb5` | ❌ **defused** (was 11 lines / `48a567ed7d40ae578c1d38ba37fe92ef`) |
| `20260716173302_results_score_column` | 2 | `6b636d5cc1a99ee006a193f967abca76` | ✅ |
| `20260717043630_raise_revealed_cap_for_mega_journeymen` | 8 | `38bd841fb44c7c1d04764142d9ff99dd` | ✅ |
| `20260722033745_multisport_results_v2` | 59 | `e0f907ce56d37beb997a5ef71b893928` | ❌ **defused** (was 62 lines / `3cb640670b7d0ebfa4023b823fa7b088`) |

A mismatch on the six ✅ rows means real drift — investigate. A mismatch on the
two ❌ rows is expected and intentional; the difference is exactly the defused
statement and nothing else.

## ⚠ Do not replay these against a database that has data

Two of these migrations are actively destructive if re-run, and most of the
rest are non-idempotent. They are a record, not a rebuild script. Replaying
the set is only safe into a genuinely empty database.

| Migration | Hazard |
|---|---|
| `20260716172505_score_scale_1000` | **DEFUSED.** Ended with an unfiltered `delete from public.plays;` — wipes the entire anonymous play pool. Its own comment misdescribes it as a filtered cleanup of old-scale rows. It is not filtered. Now commented out. |
| `20260722033745_multisport_results_v2` | **DEFUSED.** Contained an unguarded `insert into public.plays_v2 ... from public.plays` — no `on conflict`, no `where`. Duplicates the whole pool; `plays_v2` has no natural key to detect or undo it with. Now commented out. |
| `20260716062117`, `20260716160718`, `20260716160754`, `20260716173302`, `20260717043630` | Non-idempotent but **fail loudly** — `create table` / `create policy` / `drop policy` / `add column` without `if [not] exists`. They error rather than corrupt. |
| `20260716062159_lock_down_handle_new_user` | Idempotent. A repeated `revoke` is a no-op. |

The two in the first rows are the same shape of bug: **a destructive or
duplicating statement whose neighbouring comment describes something narrower
and safer than the SQL does.** Both were harmless when applied and dangerous
afterwards. Read the SQL, not the comment.

## Relationship to `supabase/multisport-migration.sql`

`20260722033745_multisport_results_v2.sql` here and
[`../multisport-migration.sql`](../multisport-migration.sql) are the same
applied text. The parent-directory copy is kept because its companion,
`multisport-migration.pre-reconciliation.sql`, preserves the superseded version
and makes the drift diffable — that history is worth keeping visible.

**This directory is authoritative.** If the two ever disagree again, the ledger
decides.

## Ledger timestamps are not execution times

`20260722033745` is stamped 2026-07-22 03:37:45, but its own effect on the data
proves it ran at least two hours earlier. Do not reconstruct a sequence of
events from version numbers. Reasoning in the reconciliation note, §2.
