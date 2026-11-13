-- Private, complete own history; never expose this RPC to browser roles.
create function public.onoff_member_milestones(actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare output jsonb;
begin
 if not exists(select 1 from public.gym_members where id=actor and status='approved' and delete_requested_at is null) then
  raise exception '승인된 본인 계정으로 확인해주세요.' using errcode='42501';
 end if;
 with rm as materialized (
  select movement_id,label,date,lbs from public.onoff_admin_rm_records where user_id=actor and lbs>0
 ), rm_best as (
  select movement_id as id,max(label) as label,max(lbs) as lbs from rm group by movement_id
 ), rm_2026 as (
  select movement_id as id,max(label) as label,max(lbs) as lbs from rm where date>='2026-01-01' and date<'2027-01-01' group by movement_id
 ), named as materialized (
  select r.wod_id as id,w.name as label,w.record_type as type,r.date,r.seconds,r.rounds,coalesce(r.reps,0) as reps
  from public.gym_named_records r join public.gym_named_wods w on w.id=r.wod_id where r.user_id=actor
 ), named_best as (
  select distinct on(id) id,label,type,seconds,rounds,reps from named
  order by id,case when type='time' then seconds end asc nulls last,
    case when type='rounds' then rounds end desc nulls last,reps desc
 ), named_2026 as (
  select distinct on(id) id,label,type,seconds,rounds,reps from named where date>='2026-01-01' and date<'2027-01-01'
  order by id,case when type='time' then seconds end asc nulls last,
    case when type='rounds' then rounds end desc nulls last,reps desc
 )
 select jsonb_build_object(
  'owner',actor,
  'rm',coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from rm_best b),'[]'::jsonb),
  'named',coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from named_best b),'[]'::jsonb),
  'firstWorkout2027',(select min(date) from public.gym_attendance where user_id=actor and date>='2027-01-01' and date<'2028-01-01'),
  'recap',jsonb_build_object('year',2026,
   'attendance',(select count(*) from public.gym_attendance where user_id=actor and date>='2026-01-01' and date<'2027-01-01'),
   'rmCount',(select count(*) from rm where date>='2026-01-01' and date<'2027-01-01'),
   'namedCount',(select count(*) from named where date>='2026-01-01' and date<'2027-01-01'),
   'rm',coalesce((select jsonb_agg(to_jsonb(b) order by b.label) from rm_2026 b),'[]'::jsonb),
   'named',coalesce((select jsonb_agg(to_jsonb(b) order by b.label) from named_2026 b),'[]'::jsonb)
  )
 ) into output;
 return output;
end $$;
revoke all on function public.onoff_member_milestones(uuid) from public,anon,authenticated;
grant execute on function public.onoff_member_milestones(uuid) to service_role;
notify pgrst,'reload schema';
