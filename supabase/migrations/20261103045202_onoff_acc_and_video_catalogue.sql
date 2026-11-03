-- New ACC permissions are opt-in; existing coach grants are unchanged.
alter table public.gym_members drop constraint gym_members_coach_permissions_check;
alter table public.gym_members add constraint gym_members_coach_permissions_check check(jsonb_typeof(coach_permissions)='array' and coach_permissions <@ '["workouts.read","workouts.create","workouts.update","workouts.delete","records.create","records.update","records.delete","photos","videos","rm","notices","banner","push","release","tv","acc.read","acc.create","acc.update","acc.delete"]'::jsonb);
create table public.gym_acc_workouts(date date primary key,body jsonb not null,release_at timestamptz not null,author_id uuid references public.gym_members(id) on delete set null,updated_at timestamptz not null default now());
create index gym_acc_workouts_author_idx on public.gym_acc_workouts(author_id);
create index gym_acc_workouts_release_idx on public.gym_acc_workouts(release_at,date);
alter table public.gym_acc_workouts enable row level security;
revoke all on public.gym_acc_workouts from public,anon,authenticated;grant all on public.gym_acc_workouts to service_role;
create policy server_only on public.gym_acc_workouts for all to service_role using(true) with check(true);
create trigger bump_revision after insert or update or delete on public.gym_acc_workouts for each statement execute function public.onoff_bump_revision();
create function public.onoff_acc(actor uuid,target_date date,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.gym_acc_workouts%rowtype; permission text; stamp timestamptz; rt text;
begin
 perform 1 from public.gym_members where id=actor and status='approved' for update;if not found then raise exception '승인이 필요해요.' using errcode='42501';end if;
 if target_date is null then raise exception '날짜를 확인해주세요.';end if;
 perform pg_advisory_xact_lock(hashtextextended('acc:'||target_date::text,0));
 select * into old from public.gym_acc_workouts where date=target_date for update;
 permission:=case when p->>'action'='delete' then 'acc.delete' when old.date is null then 'acc.create' else 'acc.update' end;
 if not public.onoff_can(actor,permission) then raise exception 'ACC 관리 권한이 필요해요.' using errcode='42501';end if;
 if p->>'action'='delete' then delete from public.gym_acc_workouts where date=target_date;return jsonb_build_object('ok',true);end if;
 if coalesce(char_length(btrim(p->>'text')),0) not between 1 and 5000 or jsonb_typeof(coalesce(p->'movements','[]')) is distinct from 'array' then raise exception '운동 내용을 확인해주세요.';end if;
 if jsonb_array_length(coalesce(p->'movements','[]'))>30 or exists(select 1 from jsonb_array_elements_text(coalesce(p->'movements','[]')) as x where char_length(x) not between 1 and 80) then raise exception '관련 동작을 확인해주세요.';end if;
 if coalesce(p->>'overviewId','')<>'' and p->>'overviewId' !~ '^[A-Za-z0-9_-]{11}$' then raise exception '영상을 확인해주세요.';end if;
 select value#>>'{}' into rt from public.gym_settings where key='releaseTime';
 stamp:=((target_date-1)+coalesce(rt,'22:00')::time) at time zone 'Asia/Seoul';
 insert into public.gym_acc_workouts(date,body,release_at,author_id) values(target_date,jsonb_build_object('date',target_date,'text',p->>'text','movements',coalesce(p->'movements','[]'),'overviewId',coalesce(p->>'overviewId','')),stamp,actor)
 on conflict(date) do update set body=excluded.body,updated_at=now(),release_at=case when public.gym_acc_workouts.release_at<=now() then public.gym_acc_workouts.release_at else excluded.release_at end;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.onoff_acc(uuid,date,jsonb) from public,anon,authenticated;grant execute on function public.onoff_acc(uuid,date,jsonb) to service_role;
create function public.onoff_acc_release() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.key='releaseTime' then update public.gym_acc_workouts set release_at=((date-1)+(new.value#>>'{}')::time) at time zone 'Asia/Seoul' where release_at>now();end if;return new;
end $$;
revoke all on function public.onoff_acc_release() from public,anon,authenticated;
create trigger acc_release_setting after update of value on public.gym_settings for each row when(new.key='releaseTime') execute function public.onoff_acc_release();

-- Video categories are independent of the 1RM catalogue.
create table public.gym_video_categories(id text primary key,label text not null unique check(char_length(label) between 1 and 40),position integer not null default 0);
insert into public.gym_video_categories(id,label,position) values('squat','스쿼트',0),('press','프레스·저크',1),('deadlift','데드리프트',2),('clean','클린',3),('snatch','스내치',4),('complex','복합 동작',5),('cardio','유산소',6),('gymnastics','맨몸·체조',7),('other','기타 동작',8);
alter table public.gym_video_categories enable row level security;
revoke all on public.gym_video_categories from public,anon,authenticated;grant all on public.gym_video_categories to service_role;
create policy server_only on public.gym_video_categories for all to service_role using(true) with check(true);
create trigger bump_revision after insert or update or delete on public.gym_video_categories for each statement execute function public.onoff_bump_revision();
alter table public.gym_movements add column category_id text references public.gym_video_categories(id);
alter table public.gym_movements add column deleted boolean not null default false;
create index gym_movements_category_idx on public.gym_movements(category_id);
insert into public.gym_settings(key,value) values('videoCategoryRedirects','{}') on conflict do nothing;
create function public.onoff_video_manage(actor uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
<<video_manage>>
declare action text:=p->>'action'; id text; target text; label text:=btrim(p->>'label'); old_label text;
begin
 perform 1 from public.gym_members where id=actor and status='approved' for update;
 if not public.onoff_can(actor,'videos') then raise exception '영상 관리 권한이 필요해요.' using errcode='42501';end if;
 if action in ('category-add','category-edit') then
  if coalesce(char_length(label),0) not between 1 and 40 then raise exception '분류 이름을 확인해주세요.';end if;
  if action='category-add' then
   if (select count(*) from public.gym_video_categories)>=40 then raise exception '분류는 최대 40개입니다.';end if;
   id:=gen_random_uuid()::text;insert into public.gym_video_categories(id,label,position) values(id,label,coalesce((select max(position)+1 from public.gym_video_categories),0));
  else id:=p->>'id';update public.gym_video_categories set label=video_manage.label where gym_video_categories.id=video_manage.id;if not found then raise exception '분류를 찾을 수 없어요.';end if;end if;
 elsif action='category-delete' then
  id:=p->>'id';target:=p->>'targetId';
  perform 1 from public.gym_settings where key='videoCategoryRedirects' for update;
  if id is null or target is null or id=target or not exists(select 1 from public.gym_video_categories c where c.id=video_manage.id) or not exists(select 1 from public.gym_video_categories c where c.id=target) then raise exception '옮길 분류를 선택해주세요.';end if;
  update public.gym_movements set category_id=target where category_id=video_manage.id;
  update public.gym_settings set value=value||jsonb_build_object(id,target) where key='videoCategoryRedirects';
  delete from public.gym_video_categories c where c.id=video_manage.id;
 elsif action in ('movement-save','movement-delete') then
  if coalesce(char_length(btrim(p->>'name')),0) not between 2 and 80 then raise exception '동작 이름을 확인해주세요.';end if;
  if action='movement-delete' then
   insert into public.gym_movements(name,body,deleted) values(p->>'name',jsonb_build_object('name',p->>'name'),true) on conflict(name) do update set deleted=true;
  else
   target:=p->>'categoryId';if not exists(select 1 from public.gym_video_categories c where c.id=target) then raise exception '분류를 선택해주세요.';end if;
   if coalesce(char_length(p->>'notes'),0)>1000 or coalesce(p->>'videoId','')<>'' and p->>'videoId' !~ '^[A-Za-z0-9_-]{11}$' then raise exception '영상과 설명을 확인해주세요.';end if;
   insert into public.gym_movements(name,body,category_id,deleted) values(p->>'name',jsonb_build_object('name',p->>'name','notes',coalesce(p->>'notes',''),'videoId',coalesce(p->>'videoId','')),target,false)
   on conflict(name) do update set body=excluded.body,category_id=excluded.category_id,deleted=false;
  end if;
 else raise exception '관리 요청을 확인해주세요.';end if;
 return jsonb_build_object('ok',true,'id',id);
end $$;
revoke all on function public.onoff_video_manage(uuid,jsonb) from public,anon,authenticated;grant execute on function public.onoff_video_manage(uuid,jsonb) to service_role;
