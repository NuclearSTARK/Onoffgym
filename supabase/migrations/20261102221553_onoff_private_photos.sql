insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('onoff-private-photos','onoff-private-photos',false,614400,array['image/jpeg']) on conflict(id) do nothing;
create table public.gym_photos(id uuid primary key,owner_id uuid references public.gym_members(id) on delete set null,kind text not null check(kind in ('community','daily')),post_id uuid references public.gym_posts(id) on delete cascade,date date,program text check(program in ('B/T','WOD')),session text not null default '',path text not null unique,uploaded boolean not null default false,active boolean not null default false,created_at timestamptz not null default now());
create index gym_photos_post_idx on public.gym_photos(post_id);
create index gym_photos_daily_idx on public.gym_photos(date,program,session) where active and kind='daily';
create table public.gym_photo_cleanup(path text primary key,created_at timestamptz not null default now());
alter table public.gym_photos enable row level security;alter table public.gym_photo_cleanup enable row level security;
revoke all on public.gym_photos,public.gym_photo_cleanup from anon,authenticated;grant all on public.gym_photos,public.gym_photo_cleanup to service_role;
create policy server_only on public.gym_photos for all to service_role using(true) with check(true);
create policy server_only on public.gym_photo_cleanup for all to service_role using(true) with check(true);
create function public.onoff_photo_removed() returns trigger language plpgsql security invoker set search_path='' as $$begin insert into public.gym_photo_cleanup(path) values(old.path) on conflict do nothing;return old;end $$;
revoke all on function public.onoff_photo_removed() from public,anon,authenticated;
create trigger gym_photo_removed after delete on public.gym_photos for each row execute function public.onoff_photo_removed();
create function public.onoff_attach_photos(actor uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item uuid; ids uuid[]; postid uuid; k text:=p->>'kind';
begin
 perform 1 from public.gym_members where id=actor and status='approved' for update;if not found then raise exception '승인된 회원만 이용할 수 있어요.' using errcode='42501';end if;
 if k='community' and exists(select 1 from public.gym_posts where id=(p->>'id')::uuid and author_id=actor) then return jsonb_build_object('ok',true,'id',p->>'id');end if;
 if k='daily' and not public.onoff_can(actor,'photos') then raise exception '사진 관리 권한이 필요해요.' using errcode='42501';end if;
 select array_agg(value::uuid) into ids from jsonb_array_elements_text(p->'photoIds');
 if coalesce(array_length(ids,1),0) not between 1 and 3 then raise exception '사진은 최대 3장입니다.';end if;
 if (select count(*) from public.gym_photos where id=any(ids) and owner_id=actor and kind=k and uploaded and not active)<>array_length(ids,1) then raise exception '첨부 사진을 확인해주세요.' using errcode='42501';end if;
 if k='community' then
  postid:=(p->>'id')::uuid;
  if p->>'category' not in ('운동 번개','공동구매','자유글') or char_length(btrim(p->>'title')) not between 1 and 80 or char_length(btrim(p->>'body')) not between 1 and 3000 then raise exception '게시글 내용을 확인해주세요.';end if;
  insert into public.gym_posts(id,author_id,category,title,body) values(postid,actor,p->>'category',p->>'title',p->>'body');
  update public.gym_photos set active=true,post_id=postid where id=any(ids);
 elsif k='daily' then
  if not public.onoff_can(actor,'photos') then raise exception '사진 관리 권한이 필요해요.' using errcode='42501';end if;
  if p->>'date' is null or p->>'program' not in ('B/T','WOD') then raise exception '날짜와 수업을 확인해주세요.';end if;
  -- Actor row lock and target advisory lock serialize uploads from different staff.
  perform pg_advisory_xact_lock(hashtextextended('daily:'||(p->>'date')||':'||(p->>'program')||':'||coalesce(p->>'session',''),0));
  if (select count(*) from public.gym_photos where active and kind='daily' and date=(p->>'date')::date and program=p->>'program' and session=coalesce(p->>'session',''))+array_length(ids,1)>3 then raise exception '날짜·수업별 사진은 최대 3장입니다.';end if;
  update public.gym_photos set active=true,date=(p->>'date')::date,program=p->>'program',session=coalesce(p->>'session','') where id=any(ids);
 else raise exception '사진 종류를 확인해주세요.';end if;
 return jsonb_build_object('ok',true,'id',postid);
end $$;
revoke all on function public.onoff_attach_photos(uuid,jsonb) from public,anon,authenticated;grant execute on function public.onoff_attach_photos(uuid,jsonb) to service_role;
create trigger bump_revision after insert or update or delete on public.gym_photos for each statement execute function public.onoff_bump_revision();
