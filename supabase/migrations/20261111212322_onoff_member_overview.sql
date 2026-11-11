-- Read-only operational views. No records are rewritten or backfilled.
create index gym_rms_overview_history_idx on public.gym_rms(user_id,(body->>'date') desc,id);
create index gym_named_overview_history_idx on public.gym_named_records(user_id,date desc,id);

create view public.onoff_admin_rm_records with (security_invoker=true) as
with catalogue as (
 select c.item,c.position from public.gym_settings s cross join lateral jsonb_array_elements(s.value) with ordinality c(item,position) where s.key='rmCatalogue'
), normalized as (
 select r.id,r.user_id,coalesce(c.item->>'id',nullif(r.body->>'movementId',''),nullif(r.body->>'movement',''),'unknown') as movement_id,
 coalesce(c.item->>'name',nullif(r.body->>'movement',''),'종목 미분류') as label,
 coalesce(r.body->>'date','') as date,
 case when length(r.body->>'lbs')<=20 and r.body->>'lbs' ~ '^[0-9]+([.][0-9]+)?$' then (r.body->>'lbs')::numeric end as lbs,
 coalesce(r.body->>'note',r.body->>'memo','') as note
 from public.gym_rms r left join lateral (
  select c.item from catalogue c where c.item->>'id'=r.body->>'movementId'
   or lower(c.item->>'name')=lower(r.body->>'movement')
   or exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(c.item->'aliases')='array' then c.item->'aliases' else '[]'::jsonb end) a where lower(a)=lower(r.body->>'movement'))
  order by (c.item->>'id'=r.body->>'movementId') desc nulls last,c.position limit 1
 ) c on true
)
select *,jsonb_build_object('id',id,'date',date,'lbs',lbs,'note',note,'movementId',movement_id,'label',label) as record from normalized;
revoke all on public.onoff_admin_rm_records from public,anon,authenticated;
grant select on public.onoff_admin_rm_records to service_role;

create function public.onoff_member_overview(actor uuid,p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare kind text:=p->>'kind'; action text:=coalesce(p->>'action','summary');
 day date:=coalesce((p->>'date')::date,(now() at time zone 'Asia/Seoul')::date);
 month_start date; month_end date; target uuid:=(p->>'memberId')::uuid;
 choice text:=coalesce(p->>'filter',''); page integer:=coalesce((p->>'page')::integer,0);
 items jsonb; roster jsonb; catalogue jsonb:='[]'::jsonb; total bigint;
begin
 if not exists(select 1 from public.gym_members where id=actor and role='admin' and status='approved' and delete_requested_at is null) then raise exception '운영자 권한이 필요해요.' using errcode='42501';end if;
 if kind is null or kind not in ('attendance','rm','named') or action not in ('summary','history') or page not between 0 and 100000 or length(choice)>100 then raise exception '조회 조건을 확인해주세요.' using errcode='22023';end if;
 month_start:=date_trunc('month',coalesce((p->>'month')::date,day))::date;month_end:=(month_start+interval '1 month')::date;
 if action='history' then
  if not exists(select 1 from public.gym_members where id=target and delete_requested_at is null) then raise exception '회원을 찾을 수 없어요.' using errcode='22023';end if;
  if kind='attendance' then
   with history as (
    select 'attendance:'||a.date::text as id,a.date::text as date,a.created_at as stamp,
     jsonb_build_object('id','attendance:'||a.date::text,'date',a.date,'createdAt',a.created_at,'event','attendance','debited',a.pass_debited=1,'membershipId',a.membership_id) as record
    from public.gym_attendance a where a.user_id=target
    union all
    select e.id::text,coalesce(e.body->>'date',(e.created_at at time zone 'Asia/Seoul')::date::text),e.created_at,
     jsonb_build_object('id',e.id,'date',coalesce(e.body->>'date',(e.created_at at time zone 'Asia/Seoul')::date::text),'createdAt',e.created_at,'event','cancel','reason',e.body->>'reason')
    from public.gym_membership_events e where e.user_id=target and e.action='attendance-cancel'
   ) select (select count(*) from history),coalesce((select jsonb_agg(record order by date desc,stamp desc,id desc) from(select * from history order by date desc,stamp desc,id desc limit 50 offset page*50)x),'[]'::jsonb) into total,items;
  elsif kind='rm' then
   select count(*) into total from public.onoff_admin_rm_records where user_id=target and (choice='' or movement_id=choice);
   select coalesce(jsonb_agg(record order by date desc,id desc),'[]'::jsonb) into items from(select * from public.onoff_admin_rm_records where user_id=target and (choice='' or movement_id=choice) order by date desc,id desc limit 50 offset page*50)x;
  else
   select count(*) into total from public.gym_named_records where user_id=target and (choice='' or wod_id=choice);
   select coalesce(jsonb_agg(record order by date desc,id desc),'[]'::jsonb) into items from(
    select r.id,r.date,to_jsonb(r)-'user_id'||jsonb_build_object('label',w.name,'recordType',w.record_type) as record
    from public.gym_named_records r join public.gym_named_wods w on w.id=r.wod_id
    where r.user_id=target and (choice='' or r.wod_id=choice) order by r.date desc,r.id desc limit 50 offset page*50
   )x;
  end if;
  return jsonb_build_object('kind',kind,'memberId',target,'items',items,'total',total,'page',page,'hasMore',(page+1)*50<total);
 end if;
 if kind='attendance' then
  with counts as (
   select a.user_id,count(*) as lifetime,count(*) filter(where a.date>=month_start and a.date<month_end) as month_count,
    count(*) filter(where a.date>=month_start and a.date<month_end and a.pass_debited=1) as debit_count,max(a.date) as latest_date,
    max(a.created_at) filter(where a.date=day) as selected_at
   from public.gym_attendance a group by a.user_id
  ) select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'status',m.status,'pass',to_jsonb(ms),
    'count',coalesce(c.month_count,0),'lifetime',coalesce(c.lifetime,0),'debits',coalesce(c.debit_count,0),'latestDate',c.latest_date,'attendedAt',c.selected_at,'items','[]'::jsonb) order by m.name,m.id),'[]'::jsonb)
   into roster from public.gym_members m left join counts c on c.user_id=m.id left join public.gym_memberships ms on ms.user_id=m.id where m.delete_requested_at is null;
 elsif kind='rm' then
  with grouped as (
   select user_id,movement_id,min(label) as label,count(*) as n,
    (jsonb_agg(record order by lbs desc,date desc,id desc) filter(where lbs>0))->0 as best,
    (jsonb_agg(record order by date desc,id desc))->0 as latest
   from public.onoff_admin_rm_records where choice='' or movement_id=choice group by user_id,movement_id
  ), counts as (
   select user_id,sum(n) as n,max(latest->>'date') as latest_date,
    jsonb_agg(jsonb_build_object('id',movement_id,'label',label,'count',n,'best',best,'latest',latest) order by label,movement_id) as items
   from grouped group by user_id
  ) select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'status',m.status,'pass',to_jsonb(ms),'count',coalesce(c.n,0),'latestDate',c.latest_date,'items',coalesce(c.items,'[]'::jsonb)) order by m.name,m.id),'[]'::jsonb)
   into roster from public.gym_members m left join counts c on c.user_id=m.id left join public.gym_memberships ms on ms.user_id=m.id where m.delete_requested_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('id',movement_id,'name',label) order by label),'[]'::jsonb) into catalogue
   from(select movement_id,min(label) as label from public.onoff_admin_rm_records group by movement_id)x;
 else
  with grouped as (
   select r.user_id,r.wod_id,w.name as label,count(*) as n,
    (jsonb_agg(to_jsonb(r)-'user_id'||jsonb_build_object('label',w.name,'recordType',w.record_type) order by r.seconds asc nulls last,r.rounds desc nulls last,r.reps desc nulls last,r.date desc,r.id desc))->0 as best,
    (jsonb_agg(to_jsonb(r)-'user_id'||jsonb_build_object('label',w.name,'recordType',w.record_type) order by r.date desc,r.id desc))->0 as latest
   from public.gym_named_records r join public.gym_named_wods w on w.id=r.wod_id
   where choice='' or r.wod_id=choice group by r.user_id,r.wod_id,w.name
  ), counts as (
   select user_id,sum(n) as n,max(latest->>'date') as latest_date,
    jsonb_agg(jsonb_build_object('id',wod_id,'label',label,'count',n,'best',best,'latest',latest) order by label,wod_id) as items
   from grouped group by user_id
  ) select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'status',m.status,'pass',to_jsonb(ms),'count',coalesce(c.n,0),'latestDate',c.latest_date,'items',coalesce(c.items,'[]'::jsonb)) order by m.name,m.id),'[]'::jsonb)
   into roster from public.gym_members m left join counts c on c.user_id=m.id left join public.gym_memberships ms on ms.user_id=m.id where m.delete_requested_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb) into catalogue from public.gym_named_wods where not deleted or exists(select 1 from public.gym_named_records r where r.wod_id=gym_named_wods.id);
 end if;
 return jsonb_build_object('kind',kind,'date',day,'month',month_start,'members',roster,'catalogue',catalogue);
end $$;
revoke all on function public.onoff_member_overview(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.onoff_member_overview(uuid,jsonb) to service_role;
