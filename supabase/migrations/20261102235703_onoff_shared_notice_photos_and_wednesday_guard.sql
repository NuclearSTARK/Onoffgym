-- Preserve all existing photos and workouts. New common photos have one stored file.
alter table public.gym_photos drop constraint gym_photos_kind_check;
alter table public.gym_photos add constraint gym_photos_kind_check check(kind in ('community','daily','notice'));
alter table public.gym_photos drop constraint gym_photos_program_check;
alter table public.gym_photos add constraint gym_photos_program_check check(program in ('ALL','B/T','WOD'));
alter table public.gym_photos add column notice_id uuid references public.gym_notices(id) on delete cascade;
create index gym_photos_notice_idx on public.gym_photos(notice_id);
create or replace function public.onoff_attach_photos(actor uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare ids uuid[]; postid uuid; k text:=p->>'kind'; target_program text:=coalesce(p->>'program','ALL');
begin
 perform 1 from public.gym_members where id=actor and status='approved' for update;if not found then raise exception '승인된 회원만 이용할 수 있어요.' using errcode='42501';end if;
 if k='community' and exists(select 1 from public.gym_posts where id=(p->>'id')::uuid and author_id=actor) then return jsonb_build_object('ok',true,'id',p->>'id');end if;
 if k='daily' and not public.onoff_can(actor,'photos') then raise exception '사진 관리 권한이 필요해요.' using errcode='42501';end if;
 select array_agg(value::uuid) into ids from jsonb_array_elements_text(p->'photoIds');
 if coalesce(array_length(ids,1),0) not between 1 and 3 then raise exception '사진은 최대 3장입니다.';end if;
 if k='daily' then
  if p->>'date' is null or (p->>'date')::date>(now() at time zone 'Asia/Seoul')::date or target_program not in ('ALL','B/T','WOD') or coalesce(p->>'session','') !~ '^$|^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception '날짜와 수업 시각을 확인해주세요.';end if;
  if (select count(*) from public.gym_photos where id=any(ids) and owner_id=actor and active and kind=k and date=(p->>'date')::date and program=target_program and session=coalesce(p->>'session',''))=array_length(ids,1) then return jsonb_build_object('ok',true);end if;
 end if;
 if (select count(*) from public.gym_photos where id=any(ids) and owner_id=actor and kind=k and uploaded and not active)<>array_length(ids,1) then raise exception '첨부 사진을 확인해주세요.' using errcode='42501';end if;
 if k='community' then
  postid:=(p->>'id')::uuid;
  if p->>'category' not in ('운동 번개','공동구매','자유글') or char_length(btrim(p->>'title')) not between 1 and 80 or char_length(btrim(p->>'body')) not between 1 and 3000 then raise exception '게시글 내용을 확인해주세요.';end if;
  insert into public.gym_posts(id,author_id,category,title,body) values(postid,actor,p->>'category',p->>'title',p->>'body');
  update public.gym_photos set active=true,post_id=postid where id=any(ids);
 elsif k='daily' then
  perform pg_advisory_xact_lock(hashtextextended('daily:'||(p->>'date')||':'||target_program||':'||coalesce(p->>'session',''),0));
  if (select count(*) from public.gym_photos where active and kind='daily' and date=(p->>'date')::date and program=target_program and session=coalesce(p->>'session',''))+array_length(ids,1)>3 then raise exception '날짜·수업별 사진은 최대 3장입니다.';end if;
  update public.gym_photos set active=true,date=(p->>'date')::date,program=target_program,session=coalesce(p->>'session','') where id=any(ids);
 else raise exception '사진 종류를 확인해주세요.';end if;
 return jsonb_build_object('ok',true,'id',postid);
end $$;
create function public.onoff_save_notice_photos(actor uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare ids uuid[]; target uuid:=(p->>'id')::uuid; current_count integer;
begin
 perform 1 from public.gym_members where id=actor and status='approved' for update;
 if not public.onoff_can(actor,'notices') then raise exception '공지 관리 권한이 필요해요.' using errcode='42501';end if;
 if coalesce(char_length(btrim(p->>'title')),0) not between 1 and 100 or coalesce(char_length(btrim(p->>'body')),0) not between 1 and 5000 or jsonb_typeof(p->'pinned') is distinct from 'boolean' then raise exception '공지 내용을 확인해주세요.';end if;
 if jsonb_typeof(coalesce(p->'photoIds','[]')) is distinct from 'array' then raise exception '첨부 사진을 확인해주세요.';end if;
 select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(coalesce(p->'photoIds','[]'));
 if cardinality(ids)>3 or (select count(*) from public.gym_photos where id=any(ids) and kind='notice' and uploaded and ((not active and owner_id=actor) or (active and notice_id=target)))<>cardinality(ids) then raise exception '첨부 사진을 확인해주세요.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('notice:'||target::text,0));
 select count(*) into current_count from public.gym_photos where active and notice_id=target and not(id=any(ids));
 if current_count+cardinality(ids)>3 then raise exception '공지 사진은 최대 3장입니다.';end if;
 insert into public.gym_notices(id,title,body,pinned,author_id) values(target,p->>'title',p->>'body',(p->>'pinned')::boolean,actor) on conflict(id) do update set title=excluded.title,body=excluded.body,pinned=excluded.pinned,updated_at=now();
 update public.gym_photos set active=true,notice_id=target where id=any(ids);
 return jsonb_build_object('ok',true,'id',target);
end $$;
revoke all on function public.onoff_save_notice_photos(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.onoff_save_notice_photos(uuid,jsonb) to service_role;
create function public.onoff_photo_program(actor uuid,photo_id uuid,target_program text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare photo public.gym_photos%rowtype;
begin
 perform 1 from public.gym_members where id=actor and status='approved' for update;
 if not public.onoff_can(actor,'photos') then raise exception '사진 관리 권한이 필요해요.' using errcode='42501';end if;
 if target_program is null or target_program not in ('ALL','B/T','WOD') then raise exception '수업 구분을 확인해주세요.';end if;
 select * into photo from public.gym_photos where id=photo_id and active and kind='daily' for update;
 if not found then raise exception '사진을 찾을 수 없어요.';end if;
 perform pg_advisory_xact_lock(hashtextextended('daily:'||photo.date::text||':'||target_program||':'||photo.session,0));
 if (select count(*) from public.gym_photos where active and kind='daily' and date=photo.date and program=target_program and session=photo.session and id<>photo_id)>=3 then raise exception '날짜·수업별 사진은 최대 3장입니다.';end if;
 update public.gym_photos set program=target_program where id=photo_id;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.onoff_photo_program(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.onoff_photo_program(uuid,uuid,text) to service_role;
create function public.onoff_wednesday_wod_only() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if extract(dow from new.date)=3 and new.program='B/T' then raise exception '수요일에는 WOD만 등록할 수 있어요.' using errcode='23514';end if;return new;
end $$;
revoke all on function public.onoff_wednesday_wod_only() from public,anon,authenticated;
create trigger wednesday_wod_only before insert or update of date,program,body on public.gym_workouts for each row execute function public.onoff_wednesday_wod_only();
