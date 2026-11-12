-- Run with the management connection. Temporary fixtures and queue entries roll back.
begin;
create temp table avatar_delete_parent(id uuid primary key);
create temp table avatar_delete_child(user_id uuid references avatar_delete_parent(id) on delete cascade,body jsonb);
grant all on avatar_delete_parent,avatar_delete_child to service_role,authenticated;
create trigger avatar_delete_fixture after update or delete on avatar_delete_child
 for each row execute function public.onoff_avatar_photo_removed();
insert into avatar_delete_parent values ('90000000-0000-4000-8000-000000000001');
insert into avatar_delete_child values ('90000000-0000-4000-8000-000000000001','{"avatarPhoto":{"path":"avatars/90000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000002.jpg"}}');
set local role service_role;
update avatar_delete_child set body='{"avatarPhoto":{"path":"avatars/90000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000003.jpg"}}';
-- Like the Auth deletion role, authenticated cannot INSERT into the cleanup queue.
-- The Auth role itself cannot be impersonated through the managed connection.
set local role authenticated;
delete from avatar_delete_parent;
reset role;
do $$ begin
 if (select count(*) from public.gym_photo_cleanup where path like 'avatars/90000000-0000-4000-8000-000000000001/%')<>2 then
  raise exception 'replacement/cascade cleanup failed';
 end if;
 if has_function_privilege('anon','public.onoff_avatar_photo_removed()','EXECUTE')
 or has_function_privilege('authenticated','public.onoff_avatar_photo_removed()','EXECUTE')
 or has_function_privilege('service_role','public.onoff_avatar_photo_removed()','EXECUTE') then
  raise exception 'internal trigger must not be a callable RPC';
 end if;
end $$;
rollback;
select true as avatar_replacement_and_unprivileged_cascade_passed;
