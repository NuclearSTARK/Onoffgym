-- Auth deletes cascade under supabase_auth_admin, which cannot write the photo queue.
-- This trigger only queues the OLD row's owner-bound avatar path, performs no
-- dynamic SQL, and is not exposed as a callable client or service-role RPC.
alter function public.onoff_avatar_photo_removed() security definer;
revoke all on function public.onoff_avatar_photo_removed()
 from public,anon,authenticated,service_role,supabase_auth_admin;
comment on function public.onoff_avatar_photo_removed() is
 'Internal trigger: enqueue a replaced/deleted owner-bound avatar during server preference writes or Auth account deletion.';
