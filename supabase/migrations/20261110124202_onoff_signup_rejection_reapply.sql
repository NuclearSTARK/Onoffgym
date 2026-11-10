-- Apply before the corresponding Edge API and frontend release.
-- Keep the existing three DB statuses; approval history separates rejection from
-- suspension. No existing accounts or reasons are inferred/backfilled.
alter table public.gym_members add column rejection_reason text
 check(rejection_reason is null or char_length(rejection_reason)<=500);

create or replace function public.onoff_member_policy_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.delete_requested_at is not null and new.status<>'suspended' then raise exception '삭제 처리 중인 계정입니다.' using errcode='42501';end if;
 if new.status='approved' and old.status is distinct from 'approved' then
  if new.gender is null or not new.age_over_14 or new.privacy_version is distinct from 'privacy-2026-11-05' then raise exception '회원의 성별·만 14세 이상 확인과 개인정보 안내 동의가 필요합니다.' using errcode='23514';end if;
  new.approved_at:=coalesce(old.approved_at,now());new.rejected_at:=null;new.rejection_reason:=null;
 elsif old.status='pending' and new.status='suspended' and old.approved_at is null and new.delete_requested_at is null then
  new.rejected_at:=coalesce(old.rejected_at,now());
 elsif new.status='pending' and old.status='suspended' and old.approved_at is null then
  new.rejection_reason:=null;
 end if;
 return new;
end $$;

create function public.onoff_signup_reject(actor uuid,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare target uuid:=(p->>'id')::uuid; previous public.gym_members%rowtype; operator_name text;
 reason text:=coalesce(nullif(btrim(p->>'reason'),''),'회원 확인이 어려워 가입이 승인되지 않았습니다. 체육관 카운터에 문의해주세요.');
begin
 perform 1 from public.gym_members where id in(actor,target) order by id for update;
 select name into operator_name from public.gym_members where id=actor and role='admin' and status='approved' and delete_requested_at is null;
 if not found or actor=target then raise exception '운영자 권한이 필요해요.' using errcode='42501';end if;
 select * into previous from public.gym_members where id=target;
 if not found or previous.approved_at is not null or previous.status not in('pending','suspended') or previous.delete_requested_at is not null then
  raise exception '가입 승인 전 계정만 거절할 수 있어요.' using errcode='42501';end if;
 if coalesce(p->>'role','') not in('admin','coach','member') or char_length(reason)>500 or (p ? 'reason' and jsonb_typeof(p->'reason')<>'string') then
  raise exception '권한과 거절 사유를 확인해주세요.' using errcode='23514';end if;
 if previous.status='suspended' and previous.rejection_reason=reason and previous.role=p->>'role' and previous.coach_permissions=(case when p->>'role'='coach' then coalesce(p->'coach_permissions','[]'::jsonb) else '[]'::jsonb end) then return jsonb_build_object('ok',true,'already',true);end if;
 -- Reuse the existing role checks, last-admin protection, permission validation
 -- and member revision handling in the same database transaction.
 perform public.onoff_commit(actor,'members',p||jsonb_build_object('status','suspended'));
 update public.gym_members set rejection_reason=reason,rejected_at=coalesce(rejected_at,now()) where id=target;
 insert into public.gym_membership_events(user_id,action,body)
 values(target,'signup-reject',jsonb_build_object('actor',actor,'actorName',operator_name,'reason',reason,'beforeStatus',previous.status,'afterStatus','suspended'));
 return jsonb_build_object('ok',true);
end $$;

create function public.onoff_signup_reapply(actor uuid,member_name text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare previous public.gym_members%rowtype; event_id uuid:=gen_random_uuid();
begin
 select * into previous from public.gym_members where id=actor for update;
 if not found or previous.approved_at is not null or previous.delete_requested_at is not null or previous.status not in('pending','suspended') then
  raise exception '재승인 요청이 가능한 계정이 아니에요.' using errcode='42501';end if;
 if previous.status='pending' then return jsonb_build_object('ok',true,'already',true);end if;
 if member_name is null or char_length(btrim(member_name)) not between 2 and 30 then raise exception '실명을 확인해주세요.' using errcode='23514';end if;
 update public.gym_members set name=btrim(member_name),status='pending',rejection_reason=null where id=actor;
 -- Retain rejected_at for the original 30-day retention deadline. Retrying
 -- cannot indefinitely postpone deletion; approval clears it in the guard.
 insert into public.gym_membership_events(user_id,action,body)
 values(actor,'signup-reapply',jsonb_build_object('actor',actor,'actorName',btrim(member_name),'previousReason',previous.rejection_reason,'beforeStatus','suspended','afterStatus','pending'));
 insert into public.gym_push_jobs(id,kind,subject_id,payload)
 values('reapproval:'||event_id::text,'approvals',actor,jsonb_build_object('signupEvent',true,'title','회원 재승인 요청','body',btrim(member_name)||'님이 다시 가입 승인을 요청했어요.','url','/Onoffgym/?approval='||actor::text||'#admin/members','tag','approval:'||actor::text));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.onoff_signup_reject(uuid,jsonb),public.onoff_signup_reapply(uuid,text) from public,anon,authenticated;
grant execute on function public.onoff_signup_reject(uuid,jsonb),public.onoff_signup_reapply(uuid,text) to service_role;
