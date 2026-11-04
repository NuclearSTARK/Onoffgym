-- Run in a transaction with the candidate migration, then roll back.
do $$
declare test_photo_id uuid:=gen_random_uuid(); p text:='qa-rollback/'||test_photo_id::text||'.jpg';
begin
 if has_column_privilege('anon','public.gym_photos','preview_path','SELECT') or has_column_privilege('authenticated','public.gym_photos','preview_path','SELECT') then raise exception 'preview metadata exposed';end if;
 if not (select relrowsecurity from pg_class where oid='public.gym_photos'::regclass) then raise exception 'RLS disabled';end if;
 insert into public.gym_photos(id,kind,path,preview_path) values(test_photo_id,'community',p,regexp_replace(p,'\.jpg$','.preview.jpg'));
 delete from public.gym_photos where gym_photos.id=test_photo_id;
 if not exists(select 1 from public.gym_photo_cleanup where path=p) or not exists(select 1 from public.gym_photo_cleanup where path=regexp_replace(p,'\.jpg$','.preview.jpg')) then raise exception 'derivative cleanup missing';end if;
 begin
  insert into public.gym_photos(id,kind,path,preview_path) values(gen_random_uuid(),'community',p,'another-owner/unrelated.jpg');
  raise exception 'invalid preview path accepted';
 exception when check_violation then null;end;
end $$;
