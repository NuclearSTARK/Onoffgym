-- Private derivatives use the same server-only metadata and bucket as originals.
alter table public.gym_photos add column preview_path text;
alter table public.gym_photos add constraint gym_photos_preview_path_check check (
  preview_path is null or preview_path = regexp_replace(path, '\.jpg$', '.preview.jpg') and preview_path <> path
);
create or replace function public.onoff_photo_removed() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 insert into public.gym_photo_cleanup(path) values(old.path) on conflict do nothing;
 if old.preview_path is not null then
  insert into public.gym_photo_cleanup(path) values(old.preview_path) on conflict do nothing;
 end if;
 return old;
end $$;
revoke all on function public.onoff_photo_removed() from public,anon,authenticated;
