begin;
do $$
declare a uuid:=gen_random_uuid();c uuid:=gen_random_uuid();p uuid:=gen_random_uuid();rec uuid:=gen_random_uuid();cat jsonb;eligible integer;denied boolean;history jsonb;
begin
 insert into auth.users(id,email) values(a,'signup-admin-'||a||'@example.invalid'),(c,'signup-coach-'||c||'@example.invalid'),(p,'signup-person-'||p||'@example.invalid');
 if not exists(select 1 from public.gym_push_jobs where subject_id=p and payload->>'signupEvent'='true') then raise exception 'signup event flag missing';end if;
 execute 'set local role service_role';
 update public.gym_members set status='approved',role=case when id=a then 'admin' when id=c then 'coach' else 'member' end where id in(a,c,p);
 insert into public.gym_push_subscriptions(id,user_id,body,preferences) values('isolated-admin-'||a::text,a,'{}','{"approvals":true}'),('isolated-coach-'||c::text,c,'{}','{"approvals":true}');
 select count(*) into eligible from public.gym_push_jobs j join public.gym_push_subscriptions s on s.user_id in(a,c) and s.created_at<=j.created_at join public.gym_members m on m.id=s.user_id where j.subject_id=p and m.role='admin' and m.status='approved' and coalesce((s.preferences->>'approvals')::boolean,true) and exists(select 1 from public.gym_members pending where pending.id=j.subject_id and (pending.status='pending' or pending.status='approved' and j.payload->>'signupEvent'='true'));
 if eligible<>1 then raise exception 'fast approval did not preserve operator eligibility';end if;
 update public.gym_push_jobs set payload=payload-'signupEvent',target_note='가입 승인 완료로 발송 제외 · 이전 방식' where subject_id=p;
 select count(*) into eligible from public.gym_push_jobs j join public.gym_push_subscriptions s on s.user_id in(a,c) and s.created_at<=j.created_at join public.gym_members m on m.id=s.user_id where j.subject_id=p and m.role='admin' and m.status='approved' and exists(select 1 from public.gym_members pending where pending.id=j.subject_id and (pending.status='pending' or pending.status='approved' and j.payload->>'signupEvent'='true'));
 if eligible<>0 then raise exception 'legacy approval job backfilled';end if;
 -- Exercise the history aggregation only on these synthetic jobs.
 select jsonb_agg(to_jsonb(x)) into history from (select j.id,j.kind,j.payload->>'title' as title,j.payload->>'body' as body,j.target_note as "targetNote",j.created_at,j.due_at,count(d.subscription_id)::integer as total from (select * from public.gym_push_jobs where subject_id=p)j left join public.gym_push_deliveries d on d.job_id=j.id group by j.id,j.kind,j.payload,j.created_at,j.due_at,j.target_note)x;
 if history->0->>'targetNote' is null then raise exception 'target reason missing';end if;
 select value into cat from public.gym_settings where key='rmCatalogue';
 update public.gym_settings set value=cat||'[{"id":"isolated-rm","name":"Isolated RM","category":"squat","active":true,"isDefault":false,"aliases":[]}]'::jsonb where key='rmCatalogue';
 insert into public.gym_rms(id,user_id,body) values(rec,p,'{"movementId":"isolated-rm","movement":"Isolated RM","lbs":100}');
 denied:=false;begin perform public.onoff_rm_archive(c,'isolated-rm');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'ungranted coach archived RM';end if;
 update public.gym_members set coach_permissions='["rm"]' where id=c;
 perform public.onoff_rm_archive(c,'isolated-rm');
 if not exists(select 1 from public.gym_settings,jsonb_array_elements(value)x where key='rmCatalogue' and x->>'id'='isolated-rm' and x->>'deleted'='true' and x->>'active'='false') then raise exception 'RM not archived';end if;
 if not exists(select 1 from public.gym_rms where id=rec and body->>'movementId'='isolated-rm') then raise exception 'RM history lost';end if;
end $$;
select not has_function_privilege('authenticated','public.onoff_rm_archive(uuid,text)','execute') as archive_private;
rollback;
