# Migrations — reconstructed from the database, 2026-07-27

**These files were recovered from the database, not authored ahead of it.**

Every `.sql` file here was pulled verbatim from
`supabase_migrations.schema_migrations` on 2026-07-27 — the ledger of what
Supabase actually applied. They are a *record* of the live schema, written
after the fact. They are not the source the schema was built from, and they
have never been run.

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

All eight matched when this directory was created.

## ⚠ Do not replay these against a database that has data

Two of these migrations are actively destructive if re-run, and most of the
rest are non-idempotent. They are a record, not a rebuild script. Replaying
the set is only safe into a genuinely empty database.

| Migration | Hazard |
|---|---|
| `20260716172505_score_scale_1000` | **Ends with an unfiltered `delete from public.plays;`** — wipes the entire anonymous play pool. Its own comment misdescribes it as a filtered cleanup of old-scale rows. It is not filtered. |
| `20260722033745_multisport_results_v2` | **Unguarded `insert into public.plays_v2 ... from public.plays`** — no `on conflict`, no `where`. Duplicates the whole pool; `plays_v2` has no natural key to detect or undo it with. |
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
