-- Isolated PostgreSQL only. The runner supplies inert cron functions and no
-- delivery worker, credentials, external connections, or real member rows.
create function pg_temp.check_that(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;end$$;
insert into auth.users(id,email,raw_user_meta_data)
 select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'fixture-'||n||'@example.invalid',jsonb_build_object('full_name','검증회원'||n,'gender',case when n in(4,5,10,11) then 'female' else 'male' end,'privacy_version','privacy-2026-11-05','privacy_consent',true,'age_over_14',true,'disclosure_consent',true,'role','admin') from generate_series(1,12) n;
select pg_temp.check_that((select bool_and(role='member' and status='pending') from public.gym_members where id<>'10000000-0000-4000-8000-000000000099'),'signup metadata cannot grant a role or approval');
select pg_temp.check_that((select gender='female' from public.gym_members where id='10000000-0000-4000-8000-000000000004'),'signup stores female');
update public.gym_members set status='approved' where id<'10000000-0000-4000-8000-000000000010';
update public.gym_members set role='admin' where id in('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
update public.gym_members set gender=null where id='10000000-0000-4000-8000-000000000006';
update public.gym_members set disclosure_consent=false where id='10000000-0000-4000-8000-000000000007';
insert into public.gym_preferences(user_id,body) values('10000000-0000-4000-8000-000000000008','{"rank":false}') on conflict(user_id) do update set body=excluded.body;
update public.gym_members set status='suspended' where id='10000000-0000-4000-8000-000000000009';
insert into public.gym_rms(id,user_id,body)
 select gen_random_uuid(),('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,jsonb_build_object('movementId','back-squat','movement','Back Squat','lbs',(array[300,200,250,500,100,600,700,800,900])[n]) from generate_series(1,9) n;
insert into public.gym_rms(id,user_id,body) values(gen_random_uuid(),'10000000-0000-4000-8000-000000000002','{"movement":"Back Squat","lbs":250}'),(gen_random_uuid(),'10000000-0000-4000-8000-000000000002','{"movementId":"deadlift","movement":"Deadlift","lbs":900}');
insert into public.gym_named_records(id,user_id,wod_id,date,seconds)
 select gen_random_uuid(),('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'nw-fran','2026-11-04',(array[600,500,500,100,200,5,1,1,1])[n] from generate_series(1,9) n;
insert into public.gym_named_records(id,user_id,wod_id,date,seconds) values(gen_random_uuid(),'10000000-0000-4000-8000-000000000002','nw-fran','2026-11-03',700);
insert into public.gym_named_records(id,user_id,wod_id,date,rounds,reps) values
 (gen_random_uuid(),'10000000-0000-4000-8000-000000000001','nw-cindy','2026-11-04',4,10),
 (gen_random_uuid(),'10000000-0000-4000-8000-000000000002','nw-cindy','2026-11-04',3,30),
 (gen_random_uuid(),'10000000-0000-4000-8000-000000000002','nw-cindy','2026-11-03',5,0),
 (gen_random_uuid(),'10000000-0000-4000-8000-000000000003','nw-cindy','2026-11-04',5,0),
 (gen_random_uuid(),'10000000-0000-4000-8000-000000000004','nw-cindy','2026-11-04',100,0);
set role service_role;
select pg_temp.check_that(public.onoff_rm_comparison('10000000-0000-4000-8000-000000000002','back-squat')='{"participating":true,"total":3,"lower":0,"equal":2,"ownBest":250}'::jsonb,'male RM: same gender, legacy alias, best per member, ties, consent, rank and status');
select pg_temp.check_that(public.onoff_rm_comparison('10000000-0000-4000-8000-000000000004','back-squat')='{"participating":true,"total":2,"lower":1,"equal":1,"ownBest":500}'::jsonb,'female RM excludes male records');
select pg_temp.check_that(public.onoff_named_comparison('10000000-0000-4000-8000-000000000002','nw-fran')='{"participating":true,"total":3,"lower":1,"equal":2,"rank":1}'::jsonb,'male NAMED: faster time, ties, best, eligibility');
select pg_temp.check_that(public.onoff_named_comparison('10000000-0000-4000-8000-000000000004','nw-fran')='{"participating":true,"total":2,"lower":1,"equal":1,"rank":1}'::jsonb,'female NAMED excludes male records');
select pg_temp.check_that(public.onoff_named_comparison('10000000-0000-4000-8000-000000000002','nw-cindy')='{"participating":true,"total":3,"lower":1,"equal":2,"rank":1}'::jsonb,'rounds NAMED retains higher-is-better and tied best');
do $$begin
 begin perform public.onoff_rm_comparison('10000000-0000-4000-8000-000000000006','back-squat');raise exception 'missing gender allowed';exception when check_violation then null;end;
 begin perform public.onoff_named_comparison('10000000-0000-4000-8000-000000000006','nw-fran');raise exception 'missing gender allowed';exception when check_violation then null;end;
 begin perform public.onoff_privacy_accept('10000000-0000-4000-8000-000000000006','{"gender":"other","version":"privacy-2026-11-05","ageOver14":true,"disclosure":false}');raise exception 'invalid gender allowed';exception when check_violation then null;end;
 begin perform public.onoff_privacy_accept('10000000-0000-4000-8000-000000000006','{"version":"privacy-2026-11-05","ageOver14":true,"disclosure":false}');raise exception 'missing gender allowed';exception when check_violation then null;end;
end$$;
select public.onoff_privacy_accept('10000000-0000-4000-8000-000000000002','{"gender":"female","version":"privacy-2026-11-05","ageOver14":true,"disclosure":true}');
select pg_temp.check_that(public.onoff_rm_comparison('10000000-0000-4000-8000-000000000002','back-squat')->>'total'='3','existing RM automatically moves to selected cohort');
select pg_temp.check_that(public.onoff_named_comparison('10000000-0000-4000-8000-000000000002','nw-fran')->>'total'='3','existing NAMED automatically moves to selected cohort');
select pg_temp.check_that((select count(*)=11 from public.gym_rms) and (select count(*)=15 from public.gym_named_records),'gender selection preserves all records');
-- The caller-provided actor/actorName cannot override the trusted function actor.
select public.onoff_commit('10000000-0000-4000-8000-000000000001','members','{"id":"10000000-0000-4000-8000-000000000010","status":"approved","role":"member","actor":"10000000-0000-4000-8000-000000000003","actorName":"가짜"}');
select public.onoff_commit('10000000-0000-4000-8000-000000000002','members','{"id":"10000000-0000-4000-8000-000000000010","status":"approved","role":"member"}');
select public.onoff_commit('10000000-0000-4000-8000-000000000001','members','{"id":"10000000-0000-4000-8000-000000000010","status":"suspended","role":"member"}');
select public.onoff_commit('10000000-0000-4000-8000-000000000002','members','{"id":"10000000-0000-4000-8000-000000000010","status":"approved","role":"member"}');
select pg_temp.check_that((select count(*)=1 and bool_and(body->>'actor'='10000000-0000-4000-8000-000000000001' and body->>'actorName'='검증회원1' and created_at is not null) from public.gym_membership_events where user_id='10000000-0000-4000-8000-000000000010' and action='signup-approve'),'first approval logs once with verified actor, snapshot and timestamp');
select public.onoff_commit('10000000-0000-4000-8000-000000000002','member-name','{"id":"10000000-0000-4000-8000-000000000001","name":"변경한운영자"}');
select pg_temp.check_that((select body->>'actorName'='검증회원1' from public.gym_membership_events where action='signup-approve'),'approver name snapshot survives later renaming');
do $$begin
 begin perform public.onoff_commit('10000000-0000-4000-8000-000000000003','members','{"id":"10000000-0000-4000-8000-000000000011","status":"approved","role":"member"}');raise exception 'member granted approval';exception when insufficient_privilege then null;end;
end$$;
reset role;
update public.gym_members set gender=null where id='10000000-0000-4000-8000-000000000012';
do $$begin
 begin perform public.onoff_commit('10000000-0000-4000-8000-000000000001','members','{"id":"10000000-0000-4000-8000-000000000012","status":"approved","role":"member"}');raise exception 'unconfirmed member approved';exception when check_violation then null;end;
end$$;
select pg_temp.check_that(not exists(select 1 from public.gym_membership_events where user_id in('10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000012')),'failed/unauthorized approvals leave no history');
select pg_temp.check_that(not has_function_privilege('anon','public.onoff_rm_comparison(uuid,text)','execute') and not has_function_privilege('authenticated','public.onoff_named_comparison(uuid,text)','execute') and not has_table_privilege('authenticated','public.gym_members','select'),'no new direct browser table or comparison access');
-- Current-client signup must report one valid choice; legacy clients remain
-- pending and must complete onboarding before an operator can approve them.
do $$begin
 begin insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'invalid@example.invalid','{"full_name":"잘못된가입","privacy_version":"privacy-2026-11-05","privacy_consent":true,"age_over_14":true,"disclosure_consent":false}');raise exception 'signup missing gender allowed';exception when raise_exception then if sqlerrm not like '%성별%' then raise;end if;end;
end$$;
insert into auth.users(id,email,raw_user_meta_data) values('10000000-0000-4000-8000-000000000013','legacy@example.invalid','{"full_name":"기존클라이언트","privacy_version":"privacy-2026-11-04","privacy_consent":true,"age_over_14":true,"disclosure_consent":true}');
select pg_temp.check_that((select gender is null and status='pending' and privacy_version<>'privacy-2026-11-05' from public.gym_members where id='10000000-0000-4000-8000-000000000013'),'older clients cannot bypass gender onboarding');
