create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create table public.gym_push_tests(
 hash text primary key,expires timestamptz not null,max_devices integer not null default 3 check(max_devices between 1 and 5),created_at timestamptz not null default now()
);
create table public.gym_push_subscriptions(
 id text primary key,user_id uuid references public.gym_members(id) on delete cascade,test_hash text references public.gym_push_tests(hash) on delete cascade,
 body jsonb not null,preferences jsonb not null default '{"notices":true,"workouts":true}',created_at timestamptz not null default now(),
 check((user_id is null)<>(test_hash is null))
);
create index gym_push_subscriptions_user_idx on public.gym_push_subscriptions(user_id);
create index gym_push_subscriptions_test_idx on public.gym_push_subscriptions(test_hash);
create table public.gym_push_jobs(
 id text primary key,kind text not null check(kind in ('test','notices','workouts')),payload jsonb not null,due_at timestamptz not null default now(),
 target_id text references public.gym_push_subscriptions(id) on delete cascade,test_hash text references public.gym_push_tests(hash) on delete cascade,
 created_at timestamptz not null default now(),expires timestamptz not null default now()+interval '1 day'
);
create index gym_push_jobs_due_idx on public.gym_push_jobs(due_at);
create index gym_push_jobs_target_idx on public.gym_push_jobs(target_id);
create index gym_push_jobs_test_idx on public.gym_push_jobs(test_hash);
create table public.gym_push_deliveries(
 job_id text not null references public.gym_push_jobs(id) on delete cascade,subscription_id text not null references public.gym_push_subscriptions(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','expired','skipped')),attempts integer not null default 0,
 updated_at timestamptz not null default now(),primary key(job_id,subscription_id)
);
create index gym_push_deliveries_sub_idx on public.gym_push_deliveries(subscription_id);
do $$ declare t text;begin
 foreach t in array array['gym_push_tests','gym_push_subscriptions','gym_push_jobs','gym_push_deliveries'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy server_only on public.%I for all to service_role using(true) with check(true)',t);
 end loop;
end $$;
insert into public.gym_settings(key,value) values('pushCronSecret',to_jsonb(gen_random_uuid()::text||gen_random_uuid()::text)) on conflict do nothing;

-- Only the trusted Edge service can initialise or read VAPID material.
create function public.onoff_push_keys(candidate jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v jsonb;begin
 insert into public.gym_settings(key,value) values('pushVapid',candidate) on conflict do nothing;
 select value into v from public.gym_settings where key='pushVapid';return v;
end $$;

create function public.onoff_push_subscribe(actor uuid,test_code text,sub_id text,sub_body jsonb,prefs jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare old public.gym_push_subscriptions%rowtype;t public.gym_push_tests%rowtype;begin
 if actor is not null then
  if not exists(select 1 from public.gym_members where id=actor and status='approved') then raise exception '관리자 승인 후 이용할 수 있어요.' using errcode='42501';end if;
 else
  select * into t from public.gym_push_tests where hash=test_code and expires>now() for update;
  if not found then raise exception '테스트 링크가 만료됐어요.' using errcode='42501';end if;
  if not exists(select 1 from public.gym_push_subscriptions where id=sub_id and test_hash=test_code) and (select count(*) from public.gym_push_subscriptions where test_hash=test_code)>=t.max_devices then raise exception '테스트 기기 수를 초과했어요.';end if;
 end if;
 select * into old from public.gym_push_subscriptions where id=sub_id for update;
 if found and (actor is not null and old.user_id is not null and old.user_id<>actor or actor is null and old.test_hash is distinct from test_code) then raise exception '이 기기의 기존 알림을 먼저 해제해주세요.' using errcode='42501';end if;
 if found and old.body<>sub_body then raise exception '알림 구독 정보가 변경됐어요.' using errcode='42501';end if;
 insert into public.gym_push_subscriptions(id,user_id,test_hash,body,preferences) values(sub_id,actor,case when actor is null then test_code else null end,sub_body,prefs)
 on conflict(id) do update set user_id=excluded.user_id,test_hash=excluded.test_hash,preferences=excluded.preferences;
 return jsonb_build_object('ok',true);
end $$;

create function public.onoff_push_test_job(actor uuid,test_code text,sub_id text,delayed boolean default false) returns text
language plpgsql security invoker set search_path='' as $$
declare job text:='test:'||gen_random_uuid()::text;begin
 if actor is null then
  perform 1 from public.gym_push_tests where hash=test_code and expires>now() for update;
  if not found then raise exception '테스트 링크가 만료됐어요.' using errcode='42501';end if;
 else perform 1 from public.gym_members where id=actor and status='approved' for update;
  if not found then raise exception '관리자 승인 후 이용할 수 있어요.' using errcode='42501';end if;
 end if;
 if not exists(select 1 from public.gym_push_subscriptions where id=sub_id and (actor is not null and user_id=actor or actor is null and test_hash=test_code)) then raise exception '이 기기에서 알림을 먼저 허용해주세요.' using errcode='42501';end if;
 if (select count(*) from public.gym_push_jobs where target_id=sub_id and created_at>now()-interval '1 hour')>=6 then raise exception '시험 알림은 기기당 한 시간에 6번까지 보낼 수 있어요.';end if;
 insert into public.gym_push_jobs(id,kind,payload,due_at,target_id,test_hash) values(job,'test',jsonb_build_object('title','ONOFF 푸시 테스트','body',case when delayed then '앱을 닫은 상태에서도 알림이 도착했어요.' else '휴대폰 알림 수신을 확인해주세요.' end,'url','/Onoffgym/#login','tag',job),now()+case when delayed then interval '30 seconds' else interval '0 seconds' end,sub_id,case when actor is null then test_code else null end);
 return job;
end $$;

create function public.onoff_push_claim(max_count integer default 100) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare out jsonb;begin
 -- Queue the exact released workout date only once, including both programs.
 insert into public.gym_push_jobs(id,kind,payload)
 select distinct 'workout:'||date::text,'workouts',jsonb_build_object('title','새 운동이 공개됐어요','body',date::text||' B/T·WOD를 확인해보세요.','url','/Onoffgym/#home','tag','workout:'||date::text)
 from public.gym_workouts where release_at<=now() and release_at>now()-interval '10 minutes' on conflict do nothing;
 insert into public.gym_push_deliveries(job_id,subscription_id)
 select j.id,s.id from public.gym_push_jobs j join public.gym_push_subscriptions s on (j.target_id is null or j.target_id=s.id)
 left join public.gym_members m on m.id=s.user_id left join public.gym_push_tests t on t.hash=s.test_hash
 where j.due_at<=now() and j.expires>now() and s.created_at<=j.created_at
 and ((j.kind='test' and j.target_id=s.id and (s.user_id is not null and m.status='approved' or s.test_hash=j.test_hash and t.expires>now()))
 or (j.kind in ('notices','workouts') and s.user_id is not null and m.status='approved' and coalesce((s.preferences->>j.kind)::boolean,true)))
 on conflict do nothing;
 with candidates as (
  select d.job_id,d.subscription_id from public.gym_push_deliveries d join public.gym_push_jobs j on j.id=d.job_id
  where j.expires>now() and d.attempts<3 and (d.status='pending' or d.status='failed' and d.updated_at<now()-interval '1 minute' or d.status='sending' and d.updated_at<now()-interval '5 minutes')
  order by j.due_at,d.job_id for update of d skip locked limit least(greatest(max_count,1),100)
 ), claimed as (
  update public.gym_push_deliveries d set status='sending',attempts=d.attempts+1,updated_at=now() from candidates c where d.job_id=c.job_id and d.subscription_id=c.subscription_id returning d.job_id,d.subscription_id
 ) select coalesce(jsonb_agg(jsonb_build_object('jobId',j.id,'subscriptionId',s.id,'body',s.body,'payload',j.payload,'userId',s.user_id,'testHash',s.test_hash,'kind',j.kind)),'[]') into out
 from claimed c join public.gym_push_jobs j on j.id=c.job_id join public.gym_push_subscriptions s on s.id=c.subscription_id;
 delete from public.gym_push_jobs where expires<now()-interval '1 day';
 delete from public.gym_push_tests where expires<now();
 return out;
end $$;
revoke all on function public.onoff_push_keys(jsonb),public.onoff_push_subscribe(uuid,text,text,jsonb,jsonb),public.onoff_push_test_job(uuid,text,text,boolean),public.onoff_push_claim(integer) from public,anon,authenticated;
grant execute on function public.onoff_push_keys(jsonb),public.onoff_push_subscribe(uuid,text,text,jsonb,jsonb),public.onoff_push_test_job(uuid,text,text,boolean),public.onoff_push_claim(integer) to service_role;

select cron.schedule('onoff-web-push','* * * * *',$cron$
 select net.http_post(url:='https://gieomcjarupbnwwehqjc.supabase.co/functions/v1/onoff-api/api/push/dispatch',headers:=jsonb_build_object('Content-Type','application/json','X-OnOff-Worker',(select value#>>'{}' from public.gym_settings where key='pushCronSecret')),body:='{}'::jsonb,timeout_milliseconds:=120000);
$cron$);
select cron.alter_job(job_id := (select jobid from cron.job where jobname='onoff-web-push'),active := false);
insert into public.gym_settings(key,value) values('pushCronEnabled','false') on conflict(key) do update set value=excluded.value;
