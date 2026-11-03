create or replace function public.onoff_video_manage(actor uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
<<video_manage>>
declare action text:=p->>'action'; id text; target text; label text:=btrim(p->>'label'); old_label text;
begin
 perform 1 from public.gym_members m where m.id=actor and m.status='approved' for update;
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
