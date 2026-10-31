-- Run against a dedicated test project, or via a single management SQL request.
-- Everything, including Auth fixtures and settings changes, is rolled back.
begin;
do $$
declare admin_id uuid:=gen_random_uuid(); member_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); pending_id uuid:=gen_random_uuid();
 pass_id uuid:=gen_random_uuid(); replacement_id uuid:=gen_random_uuid();record_id uuid:=gen_random_uuid(); other_record uuid:=gen_random_uuid();
 day date:=(now() at time zone 'Asia/Seoul')::date;outcome jsonb;entry jsonb;v_post_id uuid;cnt integer;
begin
 insert into auth.users(id,email,role,aud,is_anonymous) values(admin_id,admin_id||'@example.invalid','authenticated','authenticated',false),(member_id,member_id||'@example.invalid','authenticated','authenticated',false),(other_id,other_id||'@example.invalid','authenticated','authenticated',false),(pending_id,pending_id||'@example.invalid','authenticated','authenticated',false);
 perform public.onoff_commit(admin_id,'ensure-member');perform public.onoff_commit(member_id,'ensure-member');perform public.onoff_commit(other_id,'ensure-member');perform public.onoff_commit(pending_id,'ensure-member');
 update public.gym_members set role=case when id=admin_id then 'admin' else 'member' end,status='approved',name='동명이인' where id in(admin_id,member_id,other_id);
 begin perform public.onoff_commit(pending_id,'attendance');raise exception 'FAILED pending approval';exception when insufficient_privilege then null;end;
 begin perform public.onoff_commit(member_id,'member-name',jsonb_build_object('id',other_id,'name','다른 회원'));raise exception 'FAILED admin role enforcement';exception when insufficient_privilege then null;end;
 perform public.onoff_commit(admin_id,'membership',jsonb_build_object('id',member_id,'action','register','revision',-1,'pass',jsonb_build_object('id',pass_id,'kind','visits','start_date',day,'total_visits',1,'remaining_visits',1)));
 perform public.onoff_commit(member_id,'attendance');outcome:=public.onoff_commit(member_id,'attendance');
 if outcome->>'already'<>'true' or (select remaining_visits from public.gym_memberships where user_id=member_id)<>0 then raise exception 'FAILED idempotent daily debit';end if;
 perform public.onoff_commit(admin_id,'attendance-cancel',jsonb_build_object('id',member_id,'date',day,'reason','transaction test'));perform public.onoff_commit(admin_id,'attendance-cancel',jsonb_build_object('id',member_id,'date',day,'reason','repeat'));
 if (select remaining_visits from public.gym_memberships where user_id=member_id)<>1 then raise exception 'FAILED idempotent refund';end if;
 begin perform public.onoff_commit(admin_id,'membership',jsonb_build_object('id',member_id,'revision',-1,'pass','{}'::jsonb));raise exception 'FAILED optimistic revision check';exception when serialization_failure then null;end;
 perform public.onoff_commit(member_id,'attendance');
 update public.gym_memberships set id=replacement_id,total_visits=10,remaining_visits=10 where user_id=member_id;
 perform public.onoff_commit(admin_id,'attendance-cancel',jsonb_build_object('id',member_id,'date',day,'reason','old pass'));
 if (select remaining_visits from public.gym_memberships where user_id=member_id)<>10 then raise exception 'FAILED old-pass refund isolation';end if;
 perform public.onoff_commit(admin_id,'workouts',jsonb_build_object('workouts',jsonb_build_array(jsonb_build_object('date',day,'program','WOD','sections',jsonb_build_array(jsonb_build_object('title','Front Squat','text','1RM','record',true,'kind','1RM','movements',jsonb_build_array('Front Squat')))))));
 begin perform public.onoff_commit(admin_id,'workouts',jsonb_build_object('workouts',jsonb_build_array(jsonb_build_object('date',day,'program','WOD'))));raise exception 'FAILED overwrite confirmation';exception when unique_violation then null;end;
 entry:=jsonb_build_object('id',record_id,'memberId',member_id,'date',day,'program','WOD','section','S1','kind','1RM','movement','Front Squat','lbs',185);
 perform public.onoff_commit(member_id,'records',jsonb_build_object('records',jsonb_build_array(entry)));
 perform public.onoff_commit(member_id,'records',jsonb_build_object('records',jsonb_build_array(entry||jsonb_build_object('lbs',205))));
 if (select count(*) from public.gym_rms where source=record_id)<>1 or (select (body->>'lbs')::numeric from public.gym_rms where source=record_id)<>205 then raise exception 'FAILED linked RM update';end if;
 perform public.onoff_commit(admin_id,'records',jsonb_build_object('records',jsonb_build_array(entry||jsonb_build_object('id',other_record,'memberId',other_id))));
 begin perform public.onoff_commit(member_id,'records',jsonb_build_object('records',jsonb_build_array(entry||jsonb_build_object('id',other_record,'memberId',other_id))));raise exception 'FAILED namesake record isolation';exception when insufficient_privilege then null;end;
 select count(*) into cnt from public.gym_records;
 begin
  perform public.onoff_commit(admin_id,'records',jsonb_build_object('records',jsonb_build_array(entry||jsonb_build_object('id',gen_random_uuid(),'section','S2'),entry||jsonb_build_object('id',gen_random_uuid(),'memberId',gen_random_uuid()))));
  raise exception 'FAILED atomic record batch';
 exception when raise_exception then if sqlerrm='FAILED atomic record batch' then raise;end if;end;
 if (select count(*) from public.gym_records)<>cnt then raise exception 'FAILED partial batch rollback';end if;
 perform public.onoff_commit(member_id,'post',jsonb_build_object('category','운동 번개','title','transaction test','body','not published'));
 select id into v_post_id from public.gym_posts where author_id=member_id;
 perform public.onoff_commit(other_id,'join',jsonb_build_object('id',v_post_id));perform public.onoff_commit(other_id,'join',jsonb_build_object('id',v_post_id));
 if exists(select 1 from public.gym_post_joins where post_id=v_post_id and user_id=other_id) then raise exception 'FAILED join toggle';end if;
 for cnt in 1..6 loop outcome:=public.onoff_tv_attempt(admin_id::text);end loop;
 if (outcome->>'allowed')::boolean then raise exception 'FAILED TV attempt limiter';end if;
 for cnt in 1..51 loop outcome:=public.onoff_tv_attempt(gen_random_uuid()::text);end loop;
 if (outcome->>'allowed')::boolean then raise exception 'FAILED global TV attempt limiter';end if;
 perform public.onoff_commit(member_id,'preferences',jsonb_build_object('rmSelection',jsonb_build_array('back-squat')));
 perform public.onoff_commit(member_id,'rm',jsonb_build_object('id',gen_random_uuid(),'memberId',member_id,'movementId','front-squat','movement','Front Squat','date',day,'lbs',215));
 if not exists(select 1 from public.gym_preferences where user_id=member_id and (body->'rmSelection') ? 'front-squat') then raise exception 'FAILED newly recorded RM selection';end if;
 if exists(select 1 from pg_tables t join pg_class c on c.relname=t.tablename join pg_namespace n on n.oid=c.relnamespace where t.schemaname='public' and n.nspname='public' and t.tablename like 'gym_%' and not c.relrowsecurity) then raise exception 'FAILED RLS coverage';end if;
 if has_function_privilege('anon','public.onoff_commit(uuid,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.onoff_commit(uuid,text,jsonb)','EXECUTE') then raise exception 'FAILED client RPC grants';end if;
end $$;
rollback;
select 'PASS: approval, roles, debit/refund, pass isolation, revision, record ownership, linked RM, atomic batches, joins, TV limiter and RLS; fixtures rolled back' as result;
