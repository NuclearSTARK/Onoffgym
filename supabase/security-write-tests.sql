-- Run only in a rollback transaction, after the atomic permissions migration.
-- Random synthetic users are uncommitted; no real records/mail/push are used.
begin;
-- Simulate the earlier batch check succeeding just before a concurrent write
-- changes row existence. This is a stale-check regression, not a load test.
create or replace function public.onoff_coach_operation(actor uuid,op text,p jsonb)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.gym_members where id=actor and role='coach' and status='approved');
$$;
do $$
declare creator uuid:=gen_random_uuid(); editor uuid:=gen_random_uuid(); member uuid:=gen_random_uuid(); person uuid;
 rid uuid:=gen_random_uuid(); absent uuid:=gen_random_uuid(); payload jsonb; course jsonb; denied boolean;
begin
 foreach person in array array[creator,editor,member] loop
  insert into auth.users(id,aud,role,email,raw_user_meta_data) values(person,'authenticated','authenticated','security-'||person||'@example.invalid',jsonb_build_object('full_name','보안 검증','gender','male','age_over_14',true,'privacy_consent',true,'privacy_version','privacy-2026-11-05','disclosure_consent',true));
 end loop;
 update public.gym_members set status='approved' where id in(creator,editor,member);
 update public.gym_members set role='coach',coach_permissions='["workouts.create","records.create"]' where id=creator;
 update public.gym_members set role='coach',coach_permissions='["workouts.update","records.update"]' where id=editor;
 course:='{"date":"2095-01-03","program":"WOD","sections":[{"text":"synthetic","kind":"없음","record":false}]}'::jsonb;
 insert into public.gym_workouts(key,date,program,body,release_at) values('2095-01-03_WOD','2095-01-03','WOD',course,now());
 payload:=jsonb_build_object('workouts',jsonb_build_array(course),'overwrite',true);
 set local role service_role;
 denied:=false;begin perform public.onoff_commit(creator,'workouts',payload);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'stale create check allowed existing class overwrite';end if;
 perform public.onoff_commit(editor,'workouts',payload);
 payload:=jsonb_build_object('workouts',jsonb_build_array(course||'{"date":"2095-01-04"}'::jsonb),'overwrite',true);
 denied:=false;begin perform public.onoff_commit(editor,'workouts',payload);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'stale update check allowed new class creation';end if;
 perform public.onoff_commit(creator,'workouts',payload);
 reset role;
 insert into public.gym_records(id,user_id,date,program,session,section,body,writer_id) values(rid,member,'2095-01-03','WOD','','S1','{"kind":"횟수","reps":1}',member);
 payload:=jsonb_build_object('records',jsonb_build_array(jsonb_build_object('id',rid,'memberId',member,'date','2095-01-03','program','WOD','section','S1','kind','횟수','reps',2)));
 set local role service_role;
 denied:=false;begin perform public.onoff_commit(creator,'records',payload);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'stale create check allowed existing member record overwrite';end if;
 perform public.onoff_commit(editor,'records',payload);
 payload:=jsonb_set(payload,'{records,0,id}',to_jsonb(absent));payload:=jsonb_set(payload,'{records,0,section}','"S2"');
 denied:=false;begin perform public.onoff_commit(editor,'records',payload);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'stale update check allowed new member record creation';end if;
 perform public.onoff_commit(creator,'records',payload);
 -- Own records remain editable without delegated staff rights.
 perform public.onoff_commit(member,'records',payload);
 payload:=jsonb_set(payload,'{records,0,memberId}',to_jsonb(creator));
 denied:=false;begin perform public.onoff_commit(member,'records',payload);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'ordinary member changed another member record';end if;
 reset role;
 if exists(select 1 from public.gym_records where id in(rid,absent) and user_id<>member) then raise exception 'record ownership changed';end if;
end $$;
select true as stale_write_guards_passed,
 not has_function_privilege('anon','public.onoff_commit(uuid,text,jsonb)','execute') as anon_blocked,
 not has_function_privilege('authenticated','public.onoff_commit(uuid,text,jsonb)','execute') as client_blocked;
rollback;
