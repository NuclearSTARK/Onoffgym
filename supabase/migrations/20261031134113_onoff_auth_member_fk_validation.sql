create or replace function public.onoff_commit(actor uuid,op text,p jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare m public.gym_members%rowtype; old public.gym_memberships%rowtype; a public.gym_attendance%rowtype;
 target uuid; v jsonb; r jsonb; item jsonb; day date:=(now() at time zone 'Asia/Seoul')::date;
 is_admin boolean; cnt integer; stamp timestamptz; rt text; inserted integer; old_record public.gym_records%rowtype;
begin
 if op='ensure-member' then
  -- Auth is verified by the Edge handler. The FK guarantees the user exists
  -- without granting the server SELECT on Supabase's private auth.users table.
  insert into public.gym_members(id) values(actor) on conflict do nothing;
  return (select to_jsonb(x) from public.gym_members x where id=actor);
 end if;
 -- TV auth uses random tokens and an atomic attempt window; it never gets a member identity.
 if op='tv-attempt' then
  insert into public.gym_tv_attempts as t(id,count,window_start) values(p->>'id',1,now())
  on conflict(id) do update set count=case when t.window_start>now()-interval '15 minutes' then t.count+1 else 1 end,
  window_start=case when t.window_start>now()-interval '15 minutes' then t.window_start else now() end returning count into cnt;
  return jsonb_build_object('allowed',cnt<=5);
 end if;
 if op='tv-login' then
  -- A PIN change racing a slow hash must not leave a session with the old PIN.
  perform 1 from public.gym_settings where key='tvPassword' and value->>'hash'=p->>'pinHash' for update;
  if not found then raise exception 'TV 암호가 변경됐어요. 다시 접속해주세요.' using errcode='40001'; end if;
  insert into public.gym_tv_sessions(hash,expires) values(p->>'hash',now()+interval '30 days');
  delete from public.gym_tv_attempts where id=p->>'attemptId';
  delete from public.gym_tv_sessions where expires<now();
  return jsonb_build_object('ok',true);
 end if;
 select * into m from public.gym_members where id=actor for update;
 if not found then raise exception '로그인이 필요해요.' using errcode='42501'; end if;
 if op='profile' then
  if m.status<>'pending' then raise exception '승인 후 이름 정정은 운영자에게 요청해주세요.' using errcode='42501'; end if;
  update public.gym_members set name=p->>'name' where id=actor;
  return jsonb_build_object('ok',true);
 end if;
 if m.status<>'approved' then raise exception '관리자 승인 후 이용할 수 있어요.' using errcode='42501'; end if;
 is_admin:=m.role='admin';
 if op in ('member-name','members','member-note','membership','attendance-cancel','workouts','settings','setting','notices','movements','tv-admin') and not is_admin then
  raise exception '운영자 권한이 필요해요.' using errcode='42501';
 end if;
 if op='attendance' then
  if exists(select 1 from public.gym_attendance where user_id=actor and date=day) then return jsonb_build_object('ok',true,'date',day,'already',true); end if;
  select * into old from public.gym_memberships where user_id=actor for update;
  if found then
   if old.paused_at is not null or old.start_date>day or old.end_date<day or old.kind='visits' and old.remaining_visits<=0 then
    if not is_admin then raise exception '회원권 기간·잔여횟수 또는 휴회 상태를 확인해주세요.' using errcode='42501'; end if;
    old.id:=null;
   end if;
  end if;
  insert into public.gym_attendance(user_id,date,membership_id,pass_debited) values(actor,day,old.id,case when old.id is not null and old.kind='visits' then 1 else -1 end);
  if old.id is not null and old.kind='visits' then update public.gym_memberships set remaining_visits=remaining_visits-1,revision=revision+1,updated_at=now() where user_id=actor; end if;
 elsif op='membership' then
  target:=(p->>'id')::uuid; perform 1 from public.gym_members where id=target for update;
  if not found then raise exception '회원을 찾을 수 없어요.'; end if;
  select * into old from public.gym_memberships where user_id=target for update;
  if coalesce(old.revision,-1)<> (p->>'revision')::integer then raise exception '회원권이 변경됐어요. 다시 불러와 주세요.' using errcode='40001'; end if;
  v:=p->'pass';
  insert into public.gym_memberships(user_id,id,kind,months,start_date,end_date,total_visits,remaining_visits,paused_at,revision)
  values(target,(v->>'id')::uuid,v->>'kind',(v->>'months')::integer,(v->>'start_date')::date,(v->>'end_date')::date,(v->>'total_visits')::integer,(v->>'remaining_visits')::integer,(v->>'paused_at')::date,coalesce(old.revision,-1)+1)
  on conflict(user_id) do update set id=excluded.id,kind=excluded.kind,months=excluded.months,start_date=excluded.start_date,end_date=excluded.end_date,total_visits=excluded.total_visits,remaining_visits=excluded.remaining_visits,paused_at=excluded.paused_at,revision=excluded.revision,updated_at=now();
  insert into public.gym_membership_events(user_id,action,body) values(target,p->>'action',jsonb_build_object('before',to_jsonb(old),'after',v,'actor',actor,'reason',p->>'reason'));
 elsif op='attendance-cancel' then
  target:=(p->>'id')::uuid; perform 1 from public.gym_members where id=target for update;
  select * into a from public.gym_attendance where user_id=target and date=(p->>'date')::date for update;
  if found then
   if a.pass_debited=1 then update public.gym_memberships set remaining_visits=remaining_visits+1,revision=revision+1,updated_at=now() where user_id=target and id=a.membership_id and kind='visits'; end if;
   delete from public.gym_attendance where user_id=target and date=a.date;
   insert into public.gym_membership_events(user_id,action,body) values(target,op,p||jsonb_build_object('actor',actor));
  end if;
 elsif op='member-name' then update public.gym_members set name=p->>'name' where id=(p->>'id')::uuid;
 elsif op='members' then
  if (p->>'id')::uuid=actor then raise exception '자신의 권한은 변경할 수 없어요.'; end if;
  update public.gym_members set role=p->>'role',status=p->>'status' where id=(p->>'id')::uuid;
 elsif op='member-note' then insert into public.gym_member_notes(user_id,note) values((p->>'id')::uuid,p->>'note') on conflict(user_id) do update set note=excluded.note,updated_at=now();
 elsif op='preferences' then
  insert into public.gym_preferences(user_id,body) values(actor,p) on conflict(user_id) do update set body=public.gym_preferences.body||excluded.body;
 elsif op='workouts' then
  select value#>>'{}' into rt from public.gym_settings where key='releaseTime' for update;
  for item in select * from jsonb_array_elements(p->'workouts') loop
   if not coalesce((p->>'overwrite')::boolean,false) and exists(select 1 from public.gym_workouts where key=item->>'date'||'_'||(item->>'program')) then raise exception '이미 등록된 수업이 있어요. 덮어쓰기를 확인해주세요.' using errcode='23505'; end if;
   stamp:=((item->>'date')::date-1+(coalesce(rt,'22:00'))::time) at time zone 'Asia/Seoul';
   insert into public.gym_workouts as w(key,date,program,body,release_at) values(item->>'date'||'_'||(item->>'program'),(item->>'date')::date,item->>'program',item,stamp)
   on conflict(key) do update set body=excluded.body,updated_at=now(),release_at=case when w.release_at<=now() then w.release_at else excluded.release_at end;
  end loop;
 elsif op='settings' then
  perform 1 from public.gym_settings where key='releaseTime' for update;
  update public.gym_settings set value=p->'releaseTime' where key='releaseTime';
  update public.gym_workouts set release_at=((date-1)+(p->>'releaseTime')::time) at time zone 'Asia/Seoul' where release_at>now();
 elsif op='setting' then
  insert into public.gym_settings(key,value) values(p->>'key',p->'value') on conflict(key) do update set value=excluded.value;
 elsif op='movements' then insert into public.gym_movements(name,body) values(p->>'name',p) on conflict(name) do update set body=excluded.body;
 elsif op='notices' then
  if p->>'action'='delete' then delete from public.gym_notices where id=(p->>'id')::uuid;
  else insert into public.gym_notices(id,title,body,pinned,author_id) values(coalesce((p->>'id')::uuid,gen_random_uuid()),p->>'title',p->>'body',(p->>'pinned')::boolean,actor)
   on conflict(id) do update set title=excluded.title,body=excluded.body,pinned=excluded.pinned,updated_at=now(); end if;
 elsif op='tv-admin' then
  insert into public.gym_settings(key,value) values('tvDisplay',p->'preferences') on conflict(key) do update set value=excluded.value;
  if p ? 'password' then insert into public.gym_settings(key,value) values('tvPassword',p->'password') on conflict(key) do update set value=excluded.value; end if;
  if p ? 'password' or p->>'revoke'='true' then delete from public.gym_tv_sessions; end if;
 elsif op='records' then
  for item in select * from jsonb_array_elements(p->'records') loop
   target:=(item->>'memberId')::uuid;
   if target<>actor and not is_admin then raise exception '본인 기록만 입력할 수 있어요.' using errcode='42501'; end if;
   if not exists(select 1 from public.gym_members where id=target and status='approved') then raise exception '승인된 회원만 기록할 수 있어요.'; end if;
   select * into old_record from public.gym_records where id=(item->>'id')::uuid for update;
   if found and old_record.user_id<>actor and not is_admin then raise exception '본인 기록만 수정할 수 있어요.' using errcode='42501'; end if;
   if found and old_record.user_id<>target then raise exception '기존 기록의 회원은 변경할 수 없어요.'; end if;
   insert into public.gym_records(id,user_id,date,program,session,section,body,writer_id)
   values((item->>'id')::uuid,target,(item->>'date')::date,item->>'program',coalesce(item->>'session',''),item->>'section',item,actor)
   on conflict(id) do update set date=excluded.date,program=excluded.program,session=excluded.session,section=excluded.section,body=excluded.body,writer_id=actor,updated_at=now();
   delete from public.gym_rms where source=(item->>'id')::uuid;
   if item->>'kind'='1RM' then
    r:=item||jsonb_build_object('id',gen_random_uuid(),'source',item->>'id');
    insert into public.gym_rms(id,user_id,source,body) values((r->>'id')::uuid,target,(item->>'id')::uuid,r);
   end if;
  end loop;
 elsif op='rm' then
  if (p->>'memberId')::uuid<>actor then raise exception '본인 1RM만 입력할 수 있어요.' using errcode='42501'; end if;
  insert into public.gym_rms(id,user_id,body) values((p->>'id')::uuid,actor,p);
 elsif op='post' then insert into public.gym_posts(author_id,category,title,body) values(actor,p->>'category',p->>'title',p->>'body');
 elsif op='post-delete' then delete from public.gym_posts where id=(p->>'id')::uuid and (author_id=actor or is_admin);
 elsif op='comment' then insert into public.gym_comments(post_id,author_id,text) values((p->>'id')::uuid,actor,p->>'text');
 elsif op='join' then
  perform 1 from public.gym_posts where id=(p->>'id')::uuid for update;
  if not found then raise exception '게시글을 찾을 수 없어요.'; end if;
  delete from public.gym_post_joins where post_id=(p->>'id')::uuid and user_id=actor;
  get diagnostics cnt=row_count;
  if cnt=0 then insert into public.gym_post_joins(post_id,user_id) values((p->>'id')::uuid,actor); end if;
 else raise exception '지원하지 않는 요청입니다.';
 end if;
 return jsonb_build_object('ok',true);
end $$;
