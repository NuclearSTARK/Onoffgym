-- Auth creates pending members immediately; no browser claims can grant a role.
alter table public.gym_push_jobs drop constraint gym_push_jobs_kind_check;
alter table public.gym_push_jobs add constraint gym_push_jobs_kind_check check(kind in ('test','notices','workouts','approvals'));
alter table public.gym_push_jobs add column subject_id uuid references public.gym_members(id) on delete cascade;
create index gym_push_jobs_subject_idx on public.gym_push_jobs(subject_id) where subject_id is not null;
alter table public.gym_members add column privacy_consent_at timestamptz;
alter table public.gym_members add column privacy_version text;
create schema if not exists onoff_private;
revoke all on schema onoff_private from public,anon,authenticated;
-- Auth's database role cannot write app tables. This narrowly scoped trigger
-- must run as its owner; it has no callable parameters or dynamic SQL.
create function onoff_private.handle_member_signup() returns trigger
language plpgsql security definer set search_path='' as $$
declare member_name text:=btrim(new.raw_user_meta_data->>'full_name');begin
 if coalesce(new.is_anonymous,false) or new.email is null then return new;end if;
 if member_name is null or char_length(member_name) not between 2 and 30 then member_name:='온오프 회원';end if;
 insert into public.gym_members(id,name,privacy_consent_at,privacy_version)
 values(new.id,member_name,case when new.raw_user_meta_data->>'privacy_consent'='true' then now() end,case when new.raw_user_meta_data->>'privacy_consent'='true' then 'email-signup-v1' end) on conflict(id) do nothing;
 insert into public.gym_push_jobs(id,kind,subject_id,payload)
 values('approval:'||new.id::text,'approvals',new.id,jsonb_build_object('title','새 회원 승인 요청','body',member_name||'님이 가입을 신청했어요.','url','/Onoffgym/#admin/members','tag','approval:'||new.id::text)) on conflict do nothing;
 return new;
end $$;
revoke all on function onoff_private.handle_member_signup() from public,anon,authenticated;
create trigger onoff_auth_member_created after insert on auth.users for each row execute function onoff_private.handle_member_signup();
-- Serialize operator removal, including account cascade deletion, so the last
-- approved operator cannot be removed by two simultaneous requests.
create function onoff_private.keep_operator() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.role='admin' and old.status='approved' and (tg_op='DELETE' or new.role<>'admin' or new.status<>'approved') then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('onoff:operators',0));
  if not exists(select 1 from public.gym_members where id<>old.id and role='admin' and status='approved') then raise exception '마지막 운영자는 다른 운영자에게 권한을 넘긴 뒤 탈퇴하거나 권한을 변경할 수 있어요.' using errcode='23514';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function onoff_private.keep_operator() from public,anon,authenticated;
create trigger onoff_keep_operator before delete or update of role,status on public.gym_members for each row execute function onoff_private.keep_operator();
create function public.onoff_withdraw_prepare(actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare m public.gym_members;begin
 select * into m from public.gym_members where id=actor for update;
 if not found then raise exception '계정을 확인해주세요.' using errcode='42501';end if;
 update public.gym_members set status='suspended' where id=actor;
 delete from public.gym_push_subscriptions where user_id=actor;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.onoff_withdraw_prepare(uuid) from public,anon,authenticated;
grant execute on function public.onoff_withdraw_prepare(uuid) to service_role;

create or replace function public.onoff_push_claim(max_count integer default 100) returns jsonb
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
 or (j.kind in ('notices','workouts','approvals') and s.user_id is not null and m.status='approved' and coalesce((s.preferences->>j.kind)::boolean,true) and (j.kind<>'approvals' or m.role='admin' and exists(select 1 from public.gym_members pending where pending.id=j.subject_id and pending.status='pending'))))
 on conflict do nothing;
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
end $$;
