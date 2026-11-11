-- Isolated SQL fixture only; no production member records are changed.
begin;
do $$
declare a uuid:='10000000-0000-4000-8000-000000000001';u uuid:='10000000-0000-4000-8000-000000000002';z uuid:='10000000-0000-4000-8000-000000000003';c uuid:='10000000-0000-4000-8000-000000000004';d date:=(now() at time zone 'Asia/Seoul')::date;v jsonb;m jsonb;g jsonb;
begin
 insert into auth.users values(a),(u),(z),(c);
 insert into gym_members(id,name,role,status) values(a,'검증 운영자','admin','approved'),(u,'과거기록회원','member','approved'),(z,'기록없는회원','member','approved'),(c,'검증 코치','coach','approved');
 insert into gym_settings(key,value) values('rmCatalogue','[{"id":"deadlift","name":"Deadlift","aliases":["DL"]},{"id":"front-squat","name":"Front Squat","aliases":[]}]');
 insert into gym_memberships(user_id,id,kind,start_date,end_date,total_visits,remaining_visits) values(u,'20000000-0000-4000-8000-000000000001','visits',d-20,d+30,20,19);
 insert into gym_attendance(user_id,date,pass_debited) values(u,'2020-01-01',-1),(u,date_trunc('month',d)::date,1);
 if d<>date_trunc('month',d)::date then insert into gym_attendance(user_id,date,pass_debited) values(u,d,-1);end if;
 insert into gym_membership_events(user_id,action,body) values(u,'attendance-cancel',jsonb_build_object('date',d-2,'reason','검증 취소'));
 begin perform public.onoff_member_overview(u,'{"kind":"attendance"}');raise exception 'member access leaked';exception when insufficient_privilege then null;end;
 begin perform public.onoff_member_overview(c,'{"kind":"rm"}');raise exception 'coach access leaked';exception when insufficient_privilege then null;end;
 v:=public.onoff_member_overview(a,jsonb_build_object('kind','attendance','date',d,'month',d));
 select value into m from jsonb_array_elements(v->'members') where value->>'id'=u::text;
 if (m->>'count')::int<>(case when d=date_trunc('month',d)::date then 1 else 2 end) or (m->>'debits')::int<>1 or m->>'attendedAt' is null then raise exception 'attendance totals incorrect: %',m;end if;
 select value into m from jsonb_array_elements(v->'members') where value->>'id'=z::text;if m->>'count'<>'0' then raise exception 'empty member omitted';end if;
 v:=public.onoff_member_overview(a,jsonb_build_object('kind','attendance','action','history','memberId',u));if (v->>'total')::int<3 then raise exception 'old attendance/cancel missing';end if;
 insert into gym_rms(id,user_id,body) values
 (gen_random_uuid(),u,'{"movement":"DL","date":"2020-01-01","lbs":300}'),
 (gen_random_uuid(),u,'{"movementId":"deadlift","movement":"Deadlift","date":"2026-11-11","lbs":280}'),
 (gen_random_uuid(),u,'{"movementId":"front-squat","movement":"Front Squat","date":"2026-11-10","lbs":200}');
 insert into gym_rms(id,user_id,body) select gen_random_uuid(),u,jsonb_build_object('movementId','deadlift','movement','Deadlift','date','2024-01-01','lbs',100) from generate_series(1,1050);
 v:=public.onoff_member_overview(a,'{"kind":"rm"}');select value into m from jsonb_array_elements(v->'members') where value->>'id'=u::text;
 if (m->>'count')::int<>1053 then raise exception 'history truncated: %',m->>'count';end if;
 select value into g from jsonb_array_elements(m->'items') where value->>'id'='deadlift';
 if g->'best'->>'lbs'<>'300' or g->'latest'->>'lbs'<>'280' or (g->>'count')::int<>1052 then raise exception 'RM alias/best/latest wrong: %',g;end if;
 v:=public.onoff_member_overview(a,jsonb_build_object('kind','rm','action','history','memberId',u,'filter','deadlift','page',21));if v->>'total'<>'1052' or jsonb_array_length(v->'items')<>2 or (v->>'hasMore')::boolean then raise exception 'old paged history missing: %',v;end if;
 insert into gym_named_categories values('qa','검증');
 insert into gym_named_wods(id,name,category_id,record_type) values('qa-time','Time','qa','time'),('qa-rounds','Rounds','qa','rounds');
 insert into gym_named_records(id,user_id,wod_id,date,seconds,rounds,reps) values
 (gen_random_uuid(),u,'qa-time','2020-01-01',500,null,null),(gen_random_uuid(),u,'qa-time','2026-11-11',600,null,null),
 (gen_random_uuid(),u,'qa-rounds','2020-01-01',null,12,5),(gen_random_uuid(),u,'qa-rounds','2026-11-10',null,12,3),(gen_random_uuid(),u,'qa-rounds','2026-11-11',null,11,90);
 v:=public.onoff_member_overview(a,'{"kind":"named"}');select value into m from jsonb_array_elements(v->'members') where value->>'id'=u::text;
 select value into g from jsonb_array_elements(m->'items') where value->>'id'='qa-time';if g->'best'->>'seconds'<>'500' or g->'latest'->>'seconds'<>'600' then raise exception 'time order wrong';end if;
 select value into g from jsonb_array_elements(m->'items') where value->>'id'='qa-rounds';if g->'best'->>'rounds'<>'12' or g->'best'->>'reps'<>'5' or g->'latest'->>'rounds'<>'11' then raise exception 'round order wrong';end if;
 if has_function_privilege('anon','public.onoff_member_overview(uuid,jsonb)','execute') or has_function_privilege('authenticated','public.onoff_member_overview(uuid,jsonb)','execute') or has_table_privilege('anon','public.onoff_admin_rm_records','select') then raise exception 'private API grant leaked';end if;
end $$;
rollback;
