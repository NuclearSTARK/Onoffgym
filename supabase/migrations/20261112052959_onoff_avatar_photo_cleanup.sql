-- Profile images stay in the existing private bucket. Preferences remain server-only.
-- Replacements, switching back to emoji, and account deletion share the durable cleanup queue.
create function public.onoff_avatar_photo_removed() returns trigger
language plpgsql security invoker set search_path='' as $$
declare old_path text := old.body->'avatarPhoto'->>'path';
begin
 if tg_op='UPDATE' then
  if old.body->'avatarPhoto' is not distinct from new.body->'avatarPhoto' then return new; end if;
 end if;
 if old_path ~ ('^avatars/' || old.user_id::text || '/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$') then
  insert into public.gym_photo_cleanup(path) values(old_path) on conflict do nothing;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.onoff_avatar_photo_removed() from public,anon,authenticated;
create trigger gym_avatar_photo_removed after update or delete on public.gym_preferences
 for each row execute function public.onoff_avatar_photo_removed();
