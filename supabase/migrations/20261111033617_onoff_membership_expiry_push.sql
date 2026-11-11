-- Adds one targeted reminder per membership/end date; no mass push is run here.
alter table public.gym_push_jobs drop constraint gym_push_jobs_kind_check;
alter table public.gym_push_jobs add constraint gym_push_jobs_kind_check
 check(kind in ('test','notices','workouts','approvals','memberships'));

create index gym_memberships_expiry_push_idx on public.gym_memberships(end_date,user_id)
 where end_date is not null and paused_at is null;

-- Start at the next 09:00 KST; never backfill a morning before deployment.
insert into public.gym_settings(key,value)
values('membershipExpiryPushStartAt',to_jsonb(
 ((now() at time zone 'Asia/Seoul')::date
  + case when (now() at time zone 'Asia/Seoul')::time>='09:00'::time then 1 else 0 end
  + time '09:00') at time zone 'Asia/Seoul'
)) on conflict(key) do nothing;

create function public.onoff_queue_membership_expiry(at_time timestamptz default now()) returns integer
language plpgsql security invoker set search_path='' as $$
declare day date:=(at_time at time zone 'Asia/Seoul')::date;
 first_at timestamptz; inserted integer;
begin
 select (value#>>'{}')::timestamptz into first_at from public.gym_settings where key='membershipExpiryPushStartAt';
 if first_at is null or at_time<first_at or (at_time at time zone 'Asia/Seoul')::time<time '09:00' then return 0;end if;
 insert into public.gym_push_jobs(id,kind,subject_id,payload,due_at,created_at,expires)
 select 'membership-expiry:'||p.id::text||':'||p.end_date::text,'memberships',p.user_id,
  jsonb_build_object('membershipId',p.id,'endDate',p.end_date,'title','회원권 만료 3일 전',
   'body','회원권이 '||p.end_date::text||'에 만료돼요. 이용 기간을 확인해주세요.',
   'url','/Onoffgym/?membership=expiry#settings','tag','membership-expiry:'||p.id::text||':'||p.end_date::text),
  (day+time '09:00') at time zone 'Asia/Seoul',at_time,
  ((day+1)+time '00:00') at time zone 'Asia/Seoul'
 from public.gym_memberships p join public.gym_members m on m.id=p.user_id
 where p.end_date=day+3 and p.start_date<=day and p.paused_at is null
 and (p.kind='period' or p.kind='visits' and p.remaining_visits>0)
 and m.status='approved' and m.delete_requested_at is null
 and exists(select 1 from public.gym_push_subscriptions s where s.user_id=p.user_id
  and coalesce((s.preferences->>'memberships')::boolean,true))
 on conflict(id) do nothing;
 get diagnostics inserted=row_count;
 return inserted;
end $$;
revoke all on function public.onoff_queue_membership_expiry(timestamptz) from public,anon,authenticated;
grant execute on function public.onoff_queue_membership_expiry(timestamptz) to service_role;

CREATE OR REPLACE FUNCTION public.onoff_push_claim(max_count integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare out jsonb;begin
 perform public.onoff_queue_membership_expiry();
 -- Queue the exact released workout date only once, including both programs.
 insert into public.gym_push_jobs(id,kind,payload)
 select distinct 'workout:'||date::text,'workouts',jsonb_build_object('title','새 운동이 공개됐어요','body',date::text||' B/T·WOD를 확인해보세요.','url','/Onoffgym/#home','tag','workout:'||date::text)
 from public.gym_workouts where release_at<=now() and release_at>now()-interval '10 minutes' on conflict do nothing;
 insert into public.gym_push_deliveries(job_id,subscription_id)
 select j.id,s.id from public.gym_push_jobs j join public.gym_push_subscriptions s on (j.target_id is null or j.target_id=s.id)
 left join public.gym_members m on m.id=s.user_id left join public.gym_push_tests t on t.hash=s.test_hash
 where j.due_at<=now() and j.expires>now() and s.created_at<=j.created_at
 and ((j.kind='test' and j.target_id=s.id and (s.user_id is not null and m.status='approved' or s.test_hash=j.test_hash and t.expires>now()))
 or (j.kind in ('notices','workouts','approvals','memberships') and s.user_id is not null and m.status='approved' and coalesce((s.preferences->>j.kind)::boolean,true) and (j.kind<>'memberships' or j.subject_id=s.user_id and m.delete_requested_at is null
 and exists(select 1 from public.gym_memberships p where p.user_id=s.user_id
  and p.id::text=j.payload->>'membershipId'
  and p.end_date::text=j.payload->>'endDate'
  and p.end_date=(now() at time zone 'Asia/Seoul')::date+3
  and p.start_date<=(now() at time zone 'Asia/Seoul')::date and p.paused_at is null
  and (p.kind='period' or p.kind='visits' and p.remaining_visits>0))
 and (now() at time zone 'Asia/Seoul')::time>=time '09:00')
 and (j.kind<>'approvals' or m.role='admin' and exists(select 1 from public.gym_members pending where pending.id=j.subject_id and (pending.status='pending' or pending.status='approved' and j.payload->>'signupEvent'='true')))))
 on conflict do nothing;

 update public.gym_push_jobs j set target_note=case
  when exists(select 1 from public.gym_push_deliveries d where d.job_id=j.id) then null
  when j.kind='approvals' and coalesce(j.payload->>'signupEvent','false')<>'true' and exists(select 1 from public.gym_members m where m.id=j.subject_id and m.status='approved') then '가입 승인 완료로 발송 제외 · 이전 방식'
  when j.kind='approvals' then '발송 조건에 맞는 운영자 기기가 없어요.'
  else '발송 조건에 맞는 기기가 없어요.' end
 where j.due_at<=now() and j.expires>now();
 with candidates as (
  select d.job_id,d.subscription_id from public.gym_push_deliveries d join public.gym_push_jobs j on j.id=d.job_id
  where j.expires>now() and d.attempts<3 and (d.status='pending' or d.status='failed' and d.updated_at<now()-interval '1 minute' or d.status='sending' and d.updated_at<now()-interval '5 minutes')
  order by j.due_at,d.job_id for update of d skip locked limit least(greatest(max_count,1),100)
 ), claimed as (
  update public.gym_push_deliveries d set status='sending',attempts=d.attempts+1,updated_at=now() from candidates c where d.job_id=c.job_id and d.subscription_id=c.subscription_id returning d.job_id,d.subscription_id
 ) select coalesce(jsonb_agg(jsonb_build_object('jobId',j.id,'subscriptionId',s.id,'body',s.body,'payload',j.payload,'userId',s.user_id,'testHash',s.test_hash,'kind',j.kind,'subjectId',j.subject_id)),'[]') into out
 from claimed c join public.gym_push_jobs j on j.id=c.job_id join public.gym_push_subscriptions s on s.id=c.subscription_id;
 delete from public.gym_push_jobs where expires<now()-interval '1 day';
 delete from public.gym_push_tests where expires<now();
 return out;
end $function$;

-- Preserve the existing private scheduler and claims ACL.
revoke all on function public.onoff_push_claim(integer) from public,anon,authenticated;
grant execute on function public.onoff_push_claim(integer) to service_role;
