-- All synthetic accounts/history, including signup jobs, remain in this rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); person uuid; result jsonb; w text:='event-time-'||gen_random_uuid(); wr text:='event-rounds-'||gen_random_uuid();
begin
 foreach person in array array[a,b,p] loop
  insert into auth.users(id,aud,role,email,raw_user_meta_data) values(person,'authenticated','authenticated','milestones-'||person||'@example.invalid',jsonb_build_object('full_name','행사 검증','gender','male','age_over_14',true,'privacy_consent',true,'privacy_version','privacy-2026-11-05','disclosure_consent',true));
 end loop;
 update public.gym_members set status='approved',disclosure_consent=false where id in(a,b);
 insert into public.gym_attendance(user_id,date) values(a,'2025-12-31'),(a,'2026-01-01'),(a,'2026-12-31'),(a,'2027-01-03'),(a,'2027-01-01'),(b,'2026-04-01');
 insert into public.gym_rms(id,user_id,body) values(gen_random_uuid(),a,'{"movementId":"back-squat","movement":"Back Squat","date":"2026-12-31","lbs":200}'),(gen_random_uuid(),a,'{"movementId":"back-squat","movement":"Back Squat","date":"2027-01-01","lbs":210}'),(gen_random_uuid(),b,'{"movementId":"back-squat","date":"2026-12-31","lbs":900}');
 insert into public.gym_named_wods(id,name,category_id,record_type) values(w,'결산 시간 검증','mixed','time'),(wr,'결산 라운드 검증','mixed','rounds');
 insert into public.gym_named_records(id,user_id,wod_id,date,seconds) values(gen_random_uuid(),a,w,'2026-12-31',300),(gen_random_uuid(),a,w,'2027-01-01',290),(gen_random_uuid(),b,w,'2026-06-01',90);
 insert into public.gym_named_records(id,user_id,wod_id,date,rounds,reps) values(gen_random_uuid(),a,wr,'2026-12-31',10,5),(gen_random_uuid(),a,wr,'2026-12-31',10,6),(gen_random_uuid(),a,wr,'2026-12-31',9,99);
 set local role service_role;
 result:=public.onoff_member_milestones(a);
 if result->>'owner'<>a::text or (result#>>'{recap,attendance}')::int<>2 or result->>'firstWorkout2027'<>'2027-01-01' then raise exception 'own attendance/date boundary failed';end if;
 if (result#>>'{rm,0,lbs}')::numeric<>210 or (result#>>'{recap,rm,0,lbs}')::numeric<>200 or (result#>>'{recap,rmCount}')::int<>1 then raise exception 'own canonical RM or year boundary failed';end if;
 if not exists(select 1 from jsonb_array_elements(result->'named') n where n->>'id'=w and (n->>'seconds')::int=290) then raise exception 'own minimum time failed';end if;
 if not exists(select 1 from jsonb_array_elements(result#>'{recap,named}') n where n->>'id'=w and (n->>'seconds')::int=300) then raise exception 'year time failed';end if;
 if not exists(select 1 from jsonb_array_elements(result->'named') n where n->>'id'=wr and (n->>'rounds')::int=10 and (n->>'reps')::int=6) then raise exception 'round tie break failed';end if;
 begin perform public.onoff_member_milestones(p);raise exception 'pending account allowed';exception when insufficient_privilege then null;end;
 delete from public.gym_attendance where user_id=a and date='2027-01-01';
 if public.onoff_member_milestones(a)->>'firstWorkout2027'<>'2027-01-03' then raise exception 'cancelled attendance remained';end if;
 delete from public.gym_attendance where user_id=a and date='2027-01-03';
 if public.onoff_member_milestones(a)->>'firstWorkout2027' is not null then raise exception 'empty stamp fabricated';end if;
 reset role;
end $$;
select true as milestone_tests_passed,
 not has_function_privilege('anon','public.onoff_member_milestones(uuid)','execute') as anon_blocked,
 not has_function_privilege('authenticated','public.onoff_member_milestones(uuid)','execute') as client_blocked;
rollback;
