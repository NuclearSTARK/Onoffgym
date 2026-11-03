-- One-time onboarding for members approved after this release. Existing approved
-- accounts are not enrolled retroactively.
create function public.onoff_approval_push_welcome() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='approved' and (tg_op='INSERT' or old.status is distinct from 'approved') then
  insert into public.gym_preferences(user_id,body) values(new.id,'{"pushOnboardingSeen":false}')
  on conflict(user_id) do update set body=public.gym_preferences.body||'{"pushOnboardingSeen":false}'::jsonb;
 end if;
 return new;
end $$;
revoke all on function public.onoff_approval_push_welcome() from public,anon,authenticated;
create trigger approval_push_welcome after insert or update of status on public.gym_members for each row execute function public.onoff_approval_push_welcome();

-- Video names can change while old lesson references continue to resolve.
create function public.onoff_video_save(actor uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare requested_name text:=btrim(p->>'name');source_name text:=coalesce(nullif(p->>'originalName',''),btrim(p->>'name'));old_entry jsonb;aliases jsonb;category text:=p->>'categoryId';
begin
 perform 1 from public.gym_members where id=actor and status='approved' for update;
 if not public.onoff_can(actor,'videos') then raise exception '영상 관리 권한이 필요해요.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('onoff-video-catalogue',0));
 if coalesce(char_length(requested_name),0) not between 2 and 80 or coalesce(char_length(source_name),0) not between 2 and 80 or coalesce(char_length(p->>'notes'),0)>1000 or coalesce(p->>'videoId','')<>'' and p->>'videoId' !~ '^[A-Za-z0-9_-]{11}$' then raise exception '동작 이름·영상·설명을 확인해주세요.';end if;
 if not exists(select 1 from public.gym_video_categories c where c.id=category) then raise exception '분류를 선택해주세요.';end if;
 if exists(select 1 from public.gym_movements m where not m.deleted and m.name<>source_name and (lower(m.name)=lower(requested_name) or exists(select 1 from jsonb_array_elements_text(coalesce(m.body->'aliases','[]')) a where lower(a)=lower(requested_name)))) then raise exception '이미 등록된 동작 이름이에요.' using errcode='23505';end if;
 select body into old_entry from public.gym_movements where name=source_name for update;
 aliases:=coalesce(old_entry->'aliases','[]'::jsonb);
 if requested_name<>source_name then
  aliases:=aliases||jsonb_build_array(source_name);
  insert into public.gym_movements(name,body,deleted) values(source_name,jsonb_build_object('name',source_name),true) on conflict(name) do update set deleted=true;
 end if;
 select coalesce(jsonb_agg(a),'[]'::jsonb) into aliases from (select distinct a from jsonb_array_elements_text(aliases) a where lower(a)<>lower(requested_name)) x;
 insert into public.gym_movements(name,body,category_id,deleted) values(requested_name,jsonb_build_object('name',requested_name,'aliases',aliases,'notes',coalesce(p->>'notes',''),'videoId',coalesce(p->>'videoId','')),category,false)
 on conflict(name) do update set body=excluded.body,category_id=excluded.category_id,deleted=false;
 return jsonb_build_object('ok',true,'name',requested_name,'aliases',aliases);
end $$;
revoke all on function public.onoff_video_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.onoff_video_save(uuid,jsonb) to service_role;

-- All approved members may publish a meetup, pin it, and request its fixed notice.
alter table public.gym_posts add column starts_at timestamptz;
alter table public.gym_posts add column banner_pinned boolean not null default false;
create index gym_posts_meetup_banner_idx on public.gym_posts(starts_at,id) where banner_pinned and category='운동 번개';
create function public.onoff_meetup_create(actor uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
<<meetup_create>>
declare post_id uuid:=(p->>'id')::uuid;stamp timestamptz:=(p->>'startsAt')::timestamptz;old_post public.gym_posts%rowtype;ids uuid[];n integer;message text;pin boolean:=coalesce((p->>'bannerPinned')::boolean,false);send_notice boolean:=coalesce((p->>'sendPush')::boolean,false);
begin
 perform 1 from public.gym_members where id=actor and status='approved' for update;
 if not found then raise exception '승인된 회원만 이용할 수 있어요.' using errcode='42501';end if;
 if post_id is null or stamp is null or coalesce(char_length(btrim(p->>'title')),0) not between 1 and 80 or coalesce(char_length(btrim(p->>'body')),0) not between 1 and 3000 or jsonb_typeof(coalesce(p->'photoIds','[]')) is distinct from 'array' then raise exception '운동 시작 날짜·시간과 글 내용을 확인해주세요.';end if;
 perform pg_advisory_xact_lock(hashtextextended('meetup:'||post_id::text,0));
 select * into old_post from public.gym_posts where id=post_id for update;
 if found then
  if old_post.author_id<>actor or old_post.category<>'운동 번개' then raise exception '본인의 운동 번개만 등록할 수 있어요.' using errcode='42501';end if;
  if old_post.title<>btrim(p->>'title') or old_post.body<>btrim(p->>'body') or old_post.starts_at is distinct from stamp then raise exception '이미 등록된 글이에요. 새로 불러와 확인해주세요.' using errcode='40001';end if;
  return jsonb_build_object('ok',true,'id',post_id,'already',true);
 end if;
 n:=jsonb_array_length(coalesce(p->'photoIds','[]'));if n>3 then raise exception '사진은 최대 3장입니다.';end if;
 select array_agg(value::uuid) into ids from jsonb_array_elements_text(coalesce(p->'photoIds','[]'));
 if n>0 and (select count(*) from public.gym_photos where id=any(ids) and owner_id=actor and kind='community' and uploaded and not active)<>n then raise exception '첨부 사진을 확인해주세요.' using errcode='42501';end if;
 insert into public.gym_posts(id,author_id,category,title,body,starts_at,banner_pinned) values(post_id,actor,'운동 번개',btrim(p->>'title'),btrim(p->>'body'),stamp,pin);
 if n>0 then update public.gym_photos set active=true,post_id=meetup_create.post_id where id=any(ids);end if;
 if send_notice then
  message:='운동 번개 '||to_char(stamp at time zone 'Asia/Seoul','MM/DD HH24:MI')||' 함께 운동해요';
  insert into public.gym_push_jobs(id,kind,payload) values('meetup:'||post_id::text,'notices',jsonb_build_object('title','운동 번개','body',message,'url','/Onoffgym/?post='||post_id::text||'#community','tag','meetup:'||post_id::text,'meetupId',post_id)) on conflict(id) do nothing;
 end if;
 return jsonb_build_object('ok',true,'id',post_id,'pushQueued',send_notice);
end $$;
revoke all on function public.onoff_meetup_create(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.onoff_meetup_create(uuid,jsonb) to service_role;
create function public.onoff_meetup_pin(actor uuid,post_id uuid,pinned boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare member public.gym_members%rowtype;
begin
 select * into member from public.gym_members where id=actor for update;
 if member.status is distinct from 'approved' then raise exception '승인된 회원만 이용할 수 있어요.' using errcode='42501';end if;
 update public.gym_posts set banner_pinned=pinned where id=post_id and category='운동 번개' and starts_at is not null and (author_id=actor or member.role='admin');
 if not found then raise exception '본인의 운동 번개만 고정할 수 있어요.' using errcode='42501';end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.onoff_meetup_pin(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.onoff_meetup_pin(uuid,uuid,boolean) to service_role;

-- Serialize administrative reset with every award/exchange/grant/deduction.
create table public.gym_point_resets(id uuid primary key,actor_id uuid references public.gym_members(id) on delete set null,changed integer not null,created_at timestamptz not null default now());
create index gym_point_resets_actor_idx on public.gym_point_resets(actor_id);
alter table public.gym_point_resets enable row level security;
revoke all on public.gym_point_resets from public,anon,authenticated;grant all on public.gym_point_resets to service_role;
create policy server_only on public.gym_point_resets for all to service_role using(true) with check(true);
do $patch$
declare definition text;fn text;begin
 foreach fn in array array['public.onoff_points(uuid,jsonb)','public.onoff_point_award()'] loop
  definition:=pg_get_functiondef(fn::regprocedure);
  if position('onoff-point-state' in definition)=0 then
   definition:=regexp_replace(definition,E'begin\n',E'begin\n perform pg_advisory_xact_lock_shared(hashtextextended(''onoff-point-state'',0));\n','i');if position('onoff-point-state' in definition)=0 then raise exception 'Point synchronization target missing';end if;execute definition;
  end if;
 end loop;
end $patch$;
create function public.onoff_point_reset(actor uuid,request_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_reset public.gym_point_resets%rowtype;changed integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('onoff-point-state',0));
 perform 1 from public.gym_members where id=actor and role='admin' and status='approved' for update;
 if not found then raise exception '운영자 권한이 필요해요.' using errcode='42501';end if;
 if request_id is null then raise exception '초기화 요청을 확인해주세요.';end if;
 select * into old_reset from public.gym_point_resets where id=request_id;
 if found then
  if old_reset.actor_id is distinct from actor then raise exception '초기화 요청을 확인해주세요.' using errcode='42501';end if;
  return jsonb_build_object('ok',true,'changed',old_reset.changed,'already',true);
 end if;
 insert into public.gym_point_ledger(user_id,event_key,amount,reason) select user_id,'admin-reset:'||request_id::text,-balance,'운영자 전체 포인트 초기화' from public.gym_point_accounts where balance<>0;
 update public.gym_point_accounts set balance=0 where balance<>0;get diagnostics changed=row_count;
 insert into public.gym_point_resets(id,actor_id,changed) values(request_id,actor,changed);
 return jsonb_build_object('ok',true,'changed',changed);
end $$;
revoke all on function public.onoff_point_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.onoff_point_reset(uuid,uuid) to service_role;
