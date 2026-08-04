# Journeyman Schedule Room

The schedule room is a separate Vite build in the same repository as the
public game. It reads and reorders `scheduled_puzzles` in Supabase; the public
site continues to receive only the daily/archive puzzle JSON exposed by its
existing RPCs.

## Security model

Access requires both layers:

1. The visitor must authenticate with the SMS code sent to the existing owner phone account.
2. That account's immutable `auth.users.id` must exist in `admin_users`.

The browser uses only the existing Supabase publishable key. No service-role or
database credential belongs in the admin build. RLS applies the authenticated owner
check to schedule reads and writes, schedule versions, and the audit trail.
The reorder RPC is `SECURITY INVOKER`, so it cannot bypass those policies.

In production, Vercel Authentication is a fourth, edge-level layer that keeps
the application shell and JavaScript from loading for anyone outside the
Vercel team.

## One-time database setup

Apply:

`supabase/migrations/20260804000000_owner_admin_schedule.sql`

Then find the UUID of the existing account that should own the schedule room:

```sql
select id, email, phone
from auth.users
order by created_at;
```

Allowlist exactly that UUID from the Supabase SQL editor:

```sql
insert into public.admin_users (user_id)
values ('OWNER_AUTH_USER_UUID')
on conflict (user_id) do nothing;
```

There is deliberately no browser-accessible admin promotion operation. To
replace the owner account, change this row through the Supabase SQL editor.

## Local use

```text
npm run dev:admin
```

Every owner sign-in sends a fresh six-digit SMS code. The dashboard becomes
available only after Supabase verifies that code and the resulting immutable
user UUID matches the sole `admin_users` row.

## Production deployment

Create a second Vercel project connected to this same repository and branch.
Keep the existing public project unchanged.

- Build command: `npm run build:admin`
- Output directory: `dist-admin`
- Deployment Protection: enable Vercel Authentication for production and
  previews
- Optional domain: `admin.journeymanjersey.com`

Do not publish the admin project until Deployment Protection is enabled. The
public game and admin project may both build from `main`; they share only the
Supabase database.

For saved schedule changes to drive the public game, set
`VITE_SERVE_FROM_DB=1` on the existing public Vercel project and verify the
preview deployment before enabling it in production. Until then, the public
client intentionally falls back to its bundled puzzle arrays.

## Save behavior

- Only unfrozen rows strictly after the server-calculated current day can move.
- A save can include NBA, NFL, and MLB and commits in one database transaction.
- Each sport has a version counter; a stale tab is rejected and reloads rather
  than overwriting a newer edit.
- Every successful reorder writes the old and new order to
  `admin_schedule_audit`.
- The existing frozen-row trigger remains a second safeguard for aired days.
