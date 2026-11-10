-- Run on an isolated local database after the pending migration. Never deploy
-- the migration or send notifications as part of this test. Fixtures roll back.
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); member_id uuid:=gen_random_uuid(); coach_id uuid:=gen_random_uuid(); stopped_id uuid:=gen_random_uuid(); deleting_id uuid:=gen_random_uuid(); reason text; original_deadline timestamptz;
begin
 insert into auth.users(id) values(owner_id),(member_id),(coach_id),(stopped_id),(deleting_id);
 insert into public.gym_members(id,name,role,status,approved_at,gender,age_over_14,privacy_version) values
 (owner_id,'검증 운영자','admin','approved',now(),'male',true,'privacy-2026-11-05'),
 (member_id,'검증 신청자','member','pending',null,'female',true,'privacy-2026-11-05'),
 (coach_id,'검증 코치','coach','approved',now(),'male',true,'privacy-2026-11-05'),
 (stopped_id,'검증 중지회원','member','suspended',now(),'female',true,'privacy-2026-11-05'),
 (deleting_id,'검증 삭제회원','member','suspended',null,'female',true,'privacy-2026-11-05');
 update public.gym_members set delete_requested_at=now() where id=deleting_id;
 begin
  perform public.onoff_signup_reject(coach_id,jsonb_build_object('id',member_id,'role','member'));
  raise exception 'Coach rejection unexpectedly allowed';
 exception when insufficient_privilege then null;end;
 begin
  perform public.onoff_signup_reject(owner_id,jsonb_build_object('id',stopped_id,'role','member'));
  raise exception 'Previously approved account rejection unexpectedly allowed';
 exception when insufficient_privilege then null;end;
 begin
  perform public.onoff_signup_reject(owner_id,jsonb_build_object('id',member_id,'role','member','reason',repeat('x',501)));
  raise exception 'Oversize reason unexpectedly allowed';
 exception when check_violation then null;end;
 perform public.onoff_signup_reject(owner_id,jsonb_build_object('id',member_id,'role','member','reason','실명을 확인해주세요.'));
 if not exists(select 1 from public.gym_members where id=member_id and status='suspended' and approved_at is null and rejected_at is not null and rejection_reason='실명을 확인해주세요.') then raise exception 'Rejection state missing';end if;
 if not exists(select 1 from public.gym_membership_events where user_id=member_id and action='signup-reject' and body->>'actorName'='검증 운영자' and body->>'reason'='실명을 확인해주세요.') then raise exception 'Reject audit missing';end if;
 perform public.onoff_signup_reject(owner_id,jsonb_build_object('id',member_id,'role','member','reason','실명을 확인해주세요.'));
 if (select count(*) from public.gym_membership_events where user_id=member_id and action='signup-reject')<>1 then raise exception 'Duplicate rejection audit';end if;
 select rejected_at into original_deadline from public.gym_members where id=member_id;
 perform public.onoff_signup_reapply(member_id,'정정한 실명');
 perform public.onoff_signup_reapply(member_id,'정정한 실명');
 if not exists(select 1 from public.gym_members where id=member_id and name='정정한 실명' and status='pending' and role='member' and rejection_reason is null and rejected_at=original_deadline) then raise exception 'Reapply identity/state/deadline changed incorrectly';end if;
 if (select count(*) from public.gym_membership_events where user_id=member_id and action='signup-reapply')<>1 then raise exception 'Duplicate reapply audit';end if;
 if (select count(*) from public.gym_push_jobs where subject_id=member_id and id like 'reapproval:%')<>1 then raise exception 'Reapply operator notification missing/duplicated';end if;
 begin
  perform public.onoff_signup_reapply(stopped_id,'이용 중지 회원');raise exception 'Suspension bypassed';
 exception when insufficient_privilege then null;end;
 begin
  perform public.onoff_signup_reapply(deleting_id,'삭제 중 회원');raise exception 'Deletion bypassed';
 exception when insufficient_privilege then null;end;
 perform public.onoff_signup_reject(owner_id,jsonb_build_object('id',member_id,'role','member','reason','  '));
 select rejection_reason into reason from public.gym_members where id=member_id;
 if reason is null or position('카운터' in reason)=0 then raise exception 'Default reason missing';end if;
 perform public.onoff_commit(owner_id,'members',jsonb_build_object('id',member_id,'role','member','status','approved'));
 if not exists(select 1 from public.gym_members where id=member_id and status='approved' and approved_at is not null and rejection_reason is null and rejected_at is null) then raise exception 'Approval did not clear rejection';end if;
 if has_function_privilege('anon','public.onoff_signup_reject(uuid,jsonb)','execute') or has_function_privilege('authenticated','public.onoff_signup_reapply(uuid,text)','execute') then raise exception 'Public approval RPC exposed';end if;
 if exists(select 1 from pg_proc where oid in('public.onoff_signup_reject(uuid,jsonb)'::regprocedure,'public.onoff_signup_reapply(uuid,text)'::regprocedure) and prosecdef) then raise exception 'Approval RPC must use security invoker';end if;
end $$;
rollback;
select 'signup approval assertions passed; fixtures rolled back' as result;
