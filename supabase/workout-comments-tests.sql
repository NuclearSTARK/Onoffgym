-- Isolated synthetic accounts/classes; ALL rows, signup jobs and revisions roll back.
-- Nothing is committed or sent to real members.
begin;
do $$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); administrator uuid:=gen_random_uuid();
 private_member uuid:=gen_random_uuid(); pending_member uuid:=gen_random_uuid(); coach uuid:=gen_random_uuid();
 person uuid; pass_id uuid:=gen_random_uuid(); id_ab uuid:=gen_random_uuid(); id_aw uuid:=gen_random_uuid();
 id_bb uuid:=gen_random_uuid(); id_private uuid:=gen_random_uuid(); n integer; payload jsonb;
 first_page jsonb; second_page jsonb; item jsonb; initial_revision bigint;
 d text:='1901-01-04'; other_day text:='1901-01-07'; future_day text:='1901-01-08';
begin
 foreach person in array array[a,b,administrator,private_member,pending_member,coach] loop
  insert into auth.users(id,aud,role,email,raw_user_meta_data)
  values(person,'authenticated','authenticated','workout-comment-test-'||person::text||'@example.invalid',jsonb_build_object(
   'full_name','댓글 검증 회원','gender','male','age_over_14',true,'privacy_consent',true,
   'privacy_version','privacy-2026-11-05','disclosure_consent',true));
 end loop;
 update public.gym_members set status='approved',role=case when id=administrator then 'admin' when id=coach then 'coach' else 'member' end
 where id in(a,b,administrator,private_member,coach);
 insert into public.gym_memberships(user_id,id,kind,months,start_date,end_date)
 values(a,pass_id,'period',1,current_date-1,current_date+30);
 insert into public.gym_workouts(key,date,program,body,release_at)
 select day||'_'||program,day::date,program,jsonb_build_object('date',day,'program',program,'sections',jsonb_build_array(jsonb_build_object('text','댓글 검증 운동'))),now()-interval '1 hour'
 from unnest(array[d,other_day]) day cross join unnest(array['B/T','WOD']) program;
 insert into public.gym_workouts(key,date,program,body,release_at)
 values(future_day||'_WOD',future_day::date,'WOD','{"sections":[{"text":"아직 공개 전"}]}',now()+interval '1 day');
 set local role service_role;
 select (value#>>'{}')::bigint into initial_revision from public.gym_settings where key='revision';
 perform public.onoff_workout_comments(a,jsonb_build_object('action','create','date',d,'program','B/T','id',id_ab,'text','B/T 첫 댓글','section','S1'));
 perform public.onoff_workout_comments(a,jsonb_build_object('action','create','date',d,'program','WOD','id',id_aw,'text','WOD 첫 댓글'));
 perform public.onoff_workout_comments(b,jsonb_build_object('action','create','date',d,'program','B/T','id',id_bb,'text','다른 회원 댓글'));
 perform public.onoff_workout_comments(private_member,jsonb_build_object('action','create','date',d,'program','B/T','id',id_private,'text','공개 철회 댓글'));
 update public.gym_members set disclosure_consent=false where id=private_member;
 if (public.onoff_workout_comments(a,jsonb_build_object('date',d,'program','B/T'))->>'total')::int<>2 then raise exception 'public count/privacy failed';end if;
 if (public.onoff_workout_comments(administrator,jsonb_build_object('date',d,'program','B/T'))->>'total')::int<>3 then raise exception 'operator visibility failed';end if;
 if (public.onoff_workout_comments(a,jsonb_build_object('date',other_day,'program','B/T'))->>'total')::int<>0 then raise exception 'date separation failed';end if;
 if (public.onoff_workout_comments(a,jsonb_build_object('date',d,'program','WOD'))->>'total')::int<>1 then raise exception 'program separation failed';end if;
 payload:=jsonb_build_object('action','update','date',d,'program','B/T','id',id_ab,'text','수정한 댓글','revision',0);
 begin perform public.onoff_workout_comments(b,payload);raise exception 'other author edit unexpectedly allowed';exception when insufficient_privilege then null;end;
 begin perform public.onoff_workout_comments(administrator,payload);raise exception 'operator edit unexpectedly allowed';exception when insufficient_privilege then null;end;
 perform public.onoff_workout_comments(a,payload);
 begin perform public.onoff_workout_comments(a,payload);raise exception 'stale revision unexpectedly allowed';exception when serialization_failure then null;end;
 begin perform public.onoff_workout_comments(coach,payload||'{"action":"delete","revision":1}');raise exception 'coach moderation unexpectedly allowed';exception when insufficient_privilege then null;end;
 begin perform public.onoff_workout_comments(a,payload||'{"action":"delete","program":"WOD","revision":1}');raise exception 'cross-thread deletion unexpectedly allowed';exception when no_data_found then null;end;
 begin perform public.onoff_workout_comments(pending_member,jsonb_build_object('date',d,'program','B/T'));raise exception 'pending read unexpectedly allowed';exception when insufficient_privilege then null;end;
 begin perform public.onoff_workout_comments(a,jsonb_build_object('date',future_day,'program','WOD'));raise exception 'unreleased read unexpectedly allowed';exception when no_data_found then null;end;
 perform public.onoff_workout_comments(administrator,jsonb_build_object('date',future_day,'program','WOD'));
 begin perform public.onoff_workout_comments(private_member,jsonb_build_object('action','create','date',d,'program','WOD','id',gen_random_uuid(),'text','공개 거부'));raise exception 'private publication unexpectedly allowed';exception when insufficient_privilege then null;end;
 begin perform public.onoff_workout_comments(a,jsonb_build_object('action','create','date',d,'program','WOD','id',gen_random_uuid(),'text',repeat('x',501)));raise exception 'long text unexpectedly allowed';exception when invalid_parameter_value then null;end;
 begin perform public.onoff_workout_comments(a,jsonb_build_object('action','create','date',d,'program','S1','id',gen_random_uuid(),'text','잘못된 구간'));raise exception 'section thread unexpectedly allowed';exception when invalid_parameter_value then null;end;
 perform public.onoff_workout_comments(administrator,jsonb_build_object('action','delete','date',d,'program','B/T','id',id_bb,'revision',0));
 if exists(select 1 from public.gym_workout_comments where id=id_bb) then raise exception 'operator deletion failed';end if;
 -- Same UUID/text is an idempotent retry, not a second comment.
 perform public.onoff_workout_comments(a,jsonb_build_object('action','create','date',d,'program','WOD','id',id_aw,'text','WOD 첫 댓글'));
 for n in 1..24 loop perform public.onoff_workout_comments(a,jsonb_build_object('action','create','date',d,'program','WOD','id',gen_random_uuid(),'text','페이지 검증 '||n::text));end loop;
 first_page:=public.onoff_workout_comments(a,jsonb_build_object('action','list','date',d,'program','WOD'));
 second_page:=public.onoff_workout_comments(a,jsonb_build_object('action','list','date',d,'program','WOD')||(first_page->'next'));
 if (first_page->>'total')::int<>25 or jsonb_array_length(first_page->'items')<>20 or jsonb_array_length(second_page->'items')<>5 or second_page->'next'<>'null'::jsonb then raise exception 'keyset pagination/count failed';end if;
 if exists(select 1 from jsonb_array_elements(first_page->'items') x join jsonb_array_elements(second_page->'items') y on x->>'id'=y->>'id') then raise exception 'duplicate pagination items';end if;
 update public.gym_memberships set paused_at=current_date where user_id=a;
 begin perform public.onoff_workout_comments(a,jsonb_build_object('date',d,'program','WOD'));raise exception 'paused read unexpectedly allowed';exception when insufficient_privilege then null;end;
 update public.gym_memberships set paused_at=null,kind='visits',months=null,total_visits=1,remaining_visits=0 where user_id=a;
 begin perform public.onoff_workout_comments(a,jsonb_build_object('date',d,'program','WOD'));raise exception 'empty pass read unexpectedly allowed';exception when insufficient_privilege then null;end;
 insert into public.gym_attendance(user_id,date,membership_id,pass_debited) values(a,(now() at time zone 'Asia/Seoul')::date,pass_id,1);
 perform public.onoff_workout_comments(a,jsonb_build_object('date',d,'program','WOD'));
 if (select (value#>>'{}')::bigint from public.gym_settings where key='revision')<=initial_revision then raise exception 'refresh revision was not advanced';end if;
 -- The table is never exposed to client roles and the RPC is service-only.
 if has_table_privilege('anon','public.gym_workout_comments','SELECT') or has_table_privilege('authenticated','public.gym_workout_comments','INSERT')
  or has_function_privilege('authenticated','public.onoff_workout_comments(uuid,jsonb)','EXECUTE') then raise exception 'comment ACL exposure';end if;
end $$;
rollback;
select true as workout_comments_isolation_crud_privacy_release_membership_paging_passed;
