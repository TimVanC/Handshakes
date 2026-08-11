-- Schedule Room delete: retire one unfrozen future puzzle and close the gap.
--
-- "Delete" moves the row into public.retired_puzzles (full puzzle JSON kept,
-- so it is reversible) and renumbers the remaining unfrozen future rows into
-- the earliest slots, exactly like the reorder RPC's delete-and-reinsert.

drop policy if exists "owner stashes retired puzzles" on public.retired_puzzles;
create policy "owner stashes retired puzzles"
  on public.retired_puzzles for insert
  to authenticated
  with check ((select public.has_schedule_admin_access()));

grant insert on public.retired_puzzles to authenticated;

create or replace function public.admin_delete_scheduled(
  p_sport text,
  p_schedule_id bigint,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actual_version bigint;
  v_before jsonb;
  v_after jsonb;
  v_answer text;
begin
  if not (select public.has_schedule_admin_access()) then
    raise exception 'admin session required' using errcode = '42501';
  end if;
  if p_sport not in ('nba', 'nfl', 'mlb') then
    raise exception 'invalid sport' using errcode = '22023';
  end if;

  perform 1 from public.schedule_versions where sport = p_sport for update;

  select version into strict v_actual_version
  from public.schedule_versions where sport = p_sport;
  if p_expected_version is distinct from v_actual_version then
    raise exception 'schedule changed since it was loaded' using errcode = '40001';
  end if;

  select answer into v_answer
  from public.scheduled_puzzles
  where sport = p_sport and schedule_id = p_schedule_id
    and not frozen and day > public.current_day(p_sport);
  if v_answer is null then
    raise exception 'puzzle is no longer an unaired future day' using errcode = '40001';
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('scheduleId', schedule_id, 'day', day, 'answer', answer) order by day),
    '[]'::jsonb
  )
  into v_before
  from public.scheduled_puzzles
  where sport = p_sport and not frozen and day > public.current_day(p_sport);

  insert into public.retired_puzzles
    (schedule_id, sport, day, answer, puzzle, source, status, frozen, generated_at, reason)
  select schedule_id, sport, day, answer, puzzle, source, status, frozen, generated_at,
         'deleted from Schedule Room'
  from public.scheduled_puzzles
  where sport = p_sport and schedule_id = p_schedule_id;

  -- Remove the target and compact every remaining unfrozen future row into
  -- the earliest slots (delete-and-reinsert avoids unique(sport, day)
  -- collisions; the highest slot is left vacant).
  with slots as (
    select day, row_number() over (order by day) as ordinality
    from public.scheduled_puzzles
    where sport = p_sport and not frozen and day > public.current_day(p_sport)
  ),
  moved as (
    delete from public.scheduled_puzzles
    where sport = p_sport and not frozen and day > public.current_day(p_sport)
    returning schedule_id, sport, day, answer, puzzle, source, status, frozen, generated_at
  ),
  keepers as (
    select *, row_number() over (order by day) as ordinality
    from moved where schedule_id <> p_schedule_id
  )
  insert into public.scheduled_puzzles
    (schedule_id, sport, day, answer, puzzle, source, status, frozen, generated_at)
  select keepers.schedule_id, keepers.sport, slots.day, keepers.answer, keepers.puzzle,
         keepers.source, keepers.status, keepers.frozen, keepers.generated_at
  from keepers
  join slots using (ordinality);

  update public.schedule_versions
  set version = version + 1, updated_at = now()
  where sport = p_sport;

  select coalesce(
    jsonb_agg(jsonb_build_object('scheduleId', schedule_id, 'day', day, 'answer', answer) order by day),
    '[]'::jsonb
  )
  into v_after
  from public.scheduled_puzzles
  where sport = p_sport and not frozen and day > public.current_day(p_sport);

  insert into public.admin_schedule_audit (actor_user_id, sport, old_order, new_order)
  values ((select auth.uid()), p_sport, v_before, v_after);

  return jsonb_build_object('sport', p_sport, 'version', v_actual_version + 1, 'answer', v_answer);
end;
$$;

revoke execute on function public.admin_delete_scheduled(text, bigint, bigint) from public, anon;
grant execute on function public.admin_delete_scheduled(text, bigint, bigint) to authenticated;

comment on function public.admin_delete_scheduled(text, bigint, bigint) is
  'Retires one unfrozen future puzzle into retired_puzzles and compacts the remaining days; owner allowlist required.';
