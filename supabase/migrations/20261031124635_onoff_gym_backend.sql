-- All application data is served by the authenticated Edge API. Direct browser
-- table/RPC access is deliberately denied, including to signed-in users.
create table public.gym_members (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null default '온오프 회원' check (char_length(name) between 2 and 40),
 role text not null default 'member' check(role in ('member','admin')),
 status text not null default 'pending' check(status in ('pending','approved','suspended')),
 created_at timestamptz not null default now()
);
create table public.gym_settings(key text primary key, value jsonb not null);
insert into public.gym_settings values ('releaseTime','"22:00"');
create table public.gym_workouts (
 key text primary key, date date not null, program text not null check(program in ('B/T','WOD')),
 body jsonb not null, release_at timestamptz not null, updated_at timestamptz not null default now(),
 unique(date,program), check(key=date::text||'_'||program)
);
create index gym_workouts_release_idx on public.gym_workouts(release_at,date);
create table public.gym_movements(name text primary key,body jsonb not null);
create table public.gym_notices(
 id uuid primary key default gen_random_uuid(),title text not null,body text not null,pinned boolean not null default false,
 author_id uuid references public.gym_members(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index gym_notices_author_idx on public.gym_notices(author_id);
create table public.gym_holiday_cache(key text primary key,body jsonb not null,updated_at timestamptz not null default now());
create table public.gym_memberships(
 user_id uuid primary key references public.gym_members(id) on delete cascade,id uuid not null unique,
 kind text not null check(kind in ('period','visits')),months integer check(months in (1,3,6,12)),
 start_date date not null,end_date date, total_visits integer,remaining_visits integer,paused_at date,
 revision integer not null default 0,updated_at timestamptz not null default now(),
 check(end_date is null or end_date>=start_date),
 check((kind='period' and months is not null and end_date is not null and total_visits is null and remaining_visits is null)
 or (kind='visits' and months is null and total_visits>=0 and remaining_visits between 0 and total_visits))
);
create table public.gym_attendance(
 user_id uuid not null references public.gym_members(id) on delete cascade,date date not null,
 created_at timestamptz not null default now(),pass_debited integer not null default -1 check(pass_debited in (-1,1)),
 membership_id uuid,primary key(user_id,date)
);
create index gym_attendance_date_idx on public.gym_attendance(date desc);
create table public.gym_membership_events(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.gym_members(id) on delete cascade,
 action text not null,body jsonb not null,created_at timestamptz not null default now()
);
create index gym_membership_events_user_idx on public.gym_membership_events(user_id,created_at desc);
create table public.gym_member_notes(user_id uuid primary key references public.gym_members(id) on delete cascade,note text not null,updated_at timestamptz not null default now());
create table public.gym_preferences(user_id uuid primary key references public.gym_members(id) on delete cascade,body jsonb not null default '{}');
create table public.gym_records(
 id uuid primary key,user_id uuid not null references public.gym_members(id) on delete cascade,
 date date not null,program text not null check(program in ('B/T','WOD')),session text not null default '',section text not null,
 body jsonb not null,writer_id uuid references public.gym_members(id) on delete set null,updated_at timestamptz not null default now(),
 unique(user_id,date,program,session,section)
);
create index gym_records_date_idx on public.gym_records(date desc);
create index gym_records_writer_idx on public.gym_records(writer_id);
create table public.gym_rms(
 id uuid primary key,user_id uuid not null references public.gym_members(id) on delete cascade,
 source uuid unique references public.gym_records(id) on delete cascade,body jsonb not null,
 check((body->>'lbs')::numeric>0 and (body->>'lbs')::numeric<7000)
);
create index gym_rms_user_idx on public.gym_rms(user_id);
create table public.gym_posts(
 id uuid primary key default gen_random_uuid(),author_id uuid not null references public.gym_members(id) on delete cascade,
 category text not null check(category in ('운동 번개','공동구매','자유글')),title text not null,body text not null,created_at timestamptz not null default now()
);
create index gym_posts_author_idx on public.gym_posts(author_id);
create table public.gym_comments(
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.gym_posts(id) on delete cascade,
 author_id uuid not null references public.gym_members(id) on delete cascade,text text not null,created_at timestamptz not null default now()
);
create index gym_comments_post_idx on public.gym_comments(post_id,created_at);
create index gym_comments_author_idx on public.gym_comments(author_id);
create table public.gym_post_joins(
 post_id uuid not null references public.gym_posts(id) on delete cascade,user_id uuid not null references public.gym_members(id) on delete cascade,
 primary key(post_id,user_id)
);
create index gym_post_joins_user_idx on public.gym_post_joins(user_id);
create table public.gym_tv_sessions(
 hash text primary key,expires timestamptz not null,device_id uuid not null default gen_random_uuid(),last_seen timestamptz,
 display_date date,display_preferences jsonb
);
create table public.gym_tv_attempts(id text primary key,count integer not null,window_start timestamptz not null);

-- This single transaction owns concurrency-sensitive writes. Only the server
-- role can invoke it; actor IDs always come from a validated Auth session.
create function public.onoff_commit(actor uuid,op text,p jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare m public.gym_members%rowtype; old public.gym_memberships%rowtype; a public.gym_attendance%rowtype;
 target uuid; v jsonb; r jsonb; item jsonb; day date:=(now() at time zone 'Asia/Seoul')::date;
 is_admin boolean; cnt integer; stamp timestamptz; rt text; inserted integer; old_record public.gym_records%rowtype;
begin
 if op='ensure-member' then
  if not exists(select 1 from auth.users where id=actor) then raise exception '로그인이 필요해요.' using errcode='42501'; end if;
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
revoke all on function public.onoff_commit(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.onoff_commit(uuid,text,jsonb) to service_role;
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'gym_%' loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy server_only on public.%I for all to service_role using (true) with check (true)',t);
 end loop;
end $$;
-- Existing platform-created event trigger function needs no client RPC grant.
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
