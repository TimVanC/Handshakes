-- Follow-up from the live Supabase security/performance advisors.

create or replace function public.has_schedule_admin_access()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select auth.jwt())->>'aal', '') = 'aal2'
     and (select public.is_schedule_admin());
$$;

revoke execute on function public.has_schedule_admin_access() from public, anon;
grant execute on function public.has_schedule_admin_access() to authenticated;

drop policy if exists "owner reads schedule" on public.scheduled_puzzles;
create policy "owner reads schedule"
  on public.scheduled_puzzles for select
  to authenticated
  using ((select public.has_schedule_admin_access()));

drop policy if exists "owner inserts schedule" on public.scheduled_puzzles;
create policy "owner inserts schedule"
  on public.scheduled_puzzles for insert
  to authenticated
  with check ((select public.has_schedule_admin_access()));

drop policy if exists "owner updates schedule" on public.scheduled_puzzles;
create policy "owner updates schedule"
  on public.scheduled_puzzles for update
  to authenticated
  using ((select public.has_schedule_admin_access()))
  with check ((select public.has_schedule_admin_access()));

drop policy if exists "owner deletes schedule" on public.scheduled_puzzles;
create policy "owner deletes schedule"
  on public.scheduled_puzzles for delete
  to authenticated
  using ((select public.has_schedule_admin_access()));

-- The FOR ALL policy already covers SELECT; retaining the separate read policy
-- would make Postgres evaluate two equivalent permissive policies.
drop policy if exists "owner reads priority queue" on public.priority_queue;
drop policy if exists "owner manages priority queue" on public.priority_queue;
create policy "owner manages priority queue"
  on public.priority_queue for all
  to authenticated
  using ((select public.has_schedule_admin_access()))
  with check ((select public.has_schedule_admin_access()));

drop policy if exists "owner reads schedule versions" on public.schedule_versions;
create policy "owner reads schedule versions"
  on public.schedule_versions for select
  to authenticated
  using ((select public.has_schedule_admin_access()));

drop policy if exists "owner updates schedule versions" on public.schedule_versions;
create policy "owner updates schedule versions"
  on public.schedule_versions for update
  to authenticated
  using ((select public.has_schedule_admin_access()))
  with check ((select public.has_schedule_admin_access()));

drop policy if exists "owner reads schedule audit" on public.admin_schedule_audit;
create policy "owner reads schedule audit"
  on public.admin_schedule_audit for select
  to authenticated
  using ((select public.has_schedule_admin_access()));

drop policy if exists "owner writes schedule audit" on public.admin_schedule_audit;
create policy "owner writes schedule audit"
  on public.admin_schedule_audit for insert
  to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and (select public.has_schedule_admin_access())
  );

create index if not exists admin_schedule_audit_actor_idx
  on public.admin_schedule_audit (actor_user_id);

-- This trigger function predates the admin system. It references only NEW/OLD,
-- so an empty search path is both correct and removes the mutable-path warning.
alter function public.reject_frozen_puzzle_change() set search_path = '';

create or replace function public.admin_reorder_schedules(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sport text;
  v_expected_version bigint;
  v_actual_version bigint;
  v_ids bigint[];
  v_current_ids bigint[];
  v_before jsonb;
  v_after jsonb;
begin
  if not (select public.has_schedule_admin_access()) then
    raise exception 'admin MFA session required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_payload) <> 'object'
     or p_payload = '{}'::jsonb then
    raise exception 'at least one sport schedule is required' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_payload) as k(sport)
    where sport not in ('nba', 'nfl', 'mlb')
  ) then
    raise exception 'payload contains an invalid sport' using errcode = '22023';
  end if;

  perform 1
  from public.schedule_versions
  where sport in (select jsonb_object_keys(p_payload))
  order by sport
  for update;

  for v_sport in
    select jsonb_object_keys(p_payload)
    order by 1
  loop
    if jsonb_typeof(p_payload -> v_sport -> 'scheduleIds') is distinct from 'array' then
      raise exception 'scheduleIds must be an array for %', v_sport using errcode = '22023';
    end if;

    v_expected_version := (p_payload -> v_sport ->> 'expectedVersion')::bigint;

    select version into strict v_actual_version
    from public.schedule_versions
    where sport = v_sport;

    if v_expected_version is distinct from v_actual_version then
      raise exception 'schedule changed since it was loaded for %', v_sport
        using errcode = '40001';
    end if;

    select coalesce(array_agg(value::bigint order by ordinality), '{}'::bigint[])
    into v_ids
    from jsonb_array_elements_text(p_payload -> v_sport -> 'scheduleIds')
      with ordinality as wanted(value, ordinality);

    select coalesce(array_agg(schedule_id order by day), '{}'::bigint[]),
           coalesce(
             jsonb_agg(
               jsonb_build_object('scheduleId', schedule_id, 'day', day, 'answer', answer)
               order by day
             ),
             '[]'::jsonb
           )
    into v_current_ids, v_before
    from public.scheduled_puzzles
    where sport = v_sport
      and not frozen
      and day > public.current_day(v_sport);

    if cardinality(v_ids) <> cardinality(v_current_ids)
       or (select array_agg(x order by x) from unnest(v_ids) as x)
          is distinct from
          (select array_agg(x order by x) from unnest(v_current_ids) as x) then
      raise exception 'schedule rows changed since they were loaded for %', v_sport
        using errcode = '40001';
    end if;

    if v_ids = v_current_ids then
      continue;
    end if;

    with desired as (
      select value::bigint as schedule_id, ordinality
      from jsonb_array_elements_text(p_payload -> v_sport -> 'scheduleIds')
        with ordinality as wanted(value, ordinality)
    ),
    slots as (
      select day, row_number() over (order by day) as ordinality
      from public.scheduled_puzzles
      where sport = v_sport
        and not frozen
        and day > public.current_day(v_sport)
    ),
    moved as (
      delete from public.scheduled_puzzles
      where sport = v_sport
        and not frozen
        and day > public.current_day(v_sport)
      returning schedule_id, sport, answer, puzzle, source, status, frozen, generated_at
    )
    insert into public.scheduled_puzzles
      (schedule_id, sport, day, answer, puzzle, source, status, frozen, generated_at)
    select moved.schedule_id, moved.sport, slots.day, moved.answer, moved.puzzle,
           moved.source, moved.status, moved.frozen, moved.generated_at
    from moved
    join desired using (schedule_id)
    join slots using (ordinality);

    update public.schedule_versions
    set version = version + 1,
        updated_at = now()
    where sport = v_sport;

    select coalesce(
      jsonb_agg(
        jsonb_build_object('scheduleId', schedule_id, 'day', day, 'answer', answer)
        order by day
      ),
      '[]'::jsonb
    )
    into v_after
    from public.scheduled_puzzles
    where sport = v_sport
      and not frozen
      and day > public.current_day(v_sport);

    insert into public.admin_schedule_audit
      (actor_user_id, sport, old_order, new_order)
    values ((select auth.uid()), v_sport, v_before, v_after);
  end loop;

  return (
    select coalesce(jsonb_object_agg(sport, version), '{}'::jsonb)
    from public.schedule_versions
    where sport in (select jsonb_object_keys(p_payload))
  );
end;
$$;

revoke execute on function public.admin_reorder_schedules(jsonb) from public, anon;
grant execute on function public.admin_reorder_schedules(jsonb) to authenticated;

