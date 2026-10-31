-- Isolated queue test; no provider HTTP requests or persistent users are made.
begin;
do $$ declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();begin
 perform set_config('onoff.push_a',a::text,true);perform set_config('onoff.push_b',b::text,true);
 insert into auth.users(id,email,role,aud,is_anonymous) values(a,a||'@example.invalid','authenticated','authenticated',false),(b,b||'@example.invalid','authenticated','authenticated',false);
end $$;
set local role service_role;
do $$
declare a uuid:=current_setting('onoff.push_a')::uuid;b uuid:=current_setting('onoff.push_b')::uuid;h text:=gen_random_uuid()::text;sid text:=gen_random_uuid()::text;
 sub jsonb:=jsonb_build_object('endpoint','https://web.push.apple.com/test-fixture','keys',jsonb_build_object('auth','fixture','p256dh','fixture'));
 job text;claims jsonb;begin
 perform public.onoff_commit(a,'ensure-member');perform public.onoff_commit(b,'ensure-member');update public.gym_members set status='approved' where id in(a,b);
 insert into public.gym_push_tests(hash,expires,max_devices) values(h,now()+interval '1 hour',1);
 perform public.onoff_push_subscribe(null,h,sid,sub,'{}');
 begin perform public.onoff_push_subscribe(null,h,'second-device',sub,'{}');raise exception 'FAILED device cap';exception when raise_exception then if sqlerrm='FAILED device cap' then raise;end if;end;
 begin perform public.onoff_push_test_job(null,h,'not-owned',false);raise exception 'FAILED device ownership';exception when insufficient_privilege then null;end;
 job:=public.onoff_push_test_job(null,h,sid,true);
 if (select due_at from public.gym_push_jobs where gym_push_jobs.id=job)<=now() then raise exception 'FAILED server delay';end if;
 claims:=public.onoff_push_claim();if jsonb_array_length(claims)<>0 then raise exception 'FAILED early delivery';end if;
 update public.gym_push_jobs set due_at=now()-interval '1 second' where gym_push_jobs.id=job;
 claims:=public.onoff_push_claim();if jsonb_array_length(claims)<>1 then raise exception 'FAILED queue claim';end if;
 claims:=public.onoff_push_claim();if jsonb_array_length(claims)<>0 then raise exception 'FAILED concurrent claim exclusion';end if;
 update public.gym_push_deliveries set status='failed',updated_at=now()-interval '2 minutes' where job_id=job;
 claims:=public.onoff_push_claim();if jsonb_array_length(claims)<>1 then raise exception 'FAILED bounded retry';end if;
 update public.gym_push_deliveries set status='failed',attempts=3,updated_at=now()-interval '2 minutes' where job_id=job;
 claims:=public.onoff_push_claim();if jsonb_array_length(claims)<>0 then raise exception 'FAILED retry cap';end if;
 perform public.onoff_push_subscribe(a,null,sid,sub,'{"notices":true,"workouts":true}');
 begin perform public.onoff_push_subscribe(b,null,sid,sub,'{}');raise exception 'FAILED member subscription isolation';exception when insufficient_privilege then null;end;
 begin perform public.onoff_push_subscribe(null,h,sid,sub,'{}');raise exception 'FAILED test reclaim of member device';exception when insufficient_privilege then null;end;
 if has_table_privilege('anon','public.gym_push_tests','SELECT') or has_function_privilege('authenticated','public.onoff_push_claim(integer)','EXECUTE') or has_function_privilege('anon','public.onoff_push_keys(jsonb)','EXECUTE') then raise exception 'FAILED push privilege boundary';end if;
end $$;
rollback;
select 'PASS: test expiry/device scope, server delay, claims, bounded retries, member isolation and private-key privileges; fixtures rolled back' as result;
