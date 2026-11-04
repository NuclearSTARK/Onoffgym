-- Complete every pending retry when Auth's FK actually removes the member,
-- including deletion from self-withdrawal or a later administrator request.
create or replace function public.onoff_remove_member_photos() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 delete from public.gym_photos where owner_id=old.id;
 update public.gym_account_deletions set completed_at=coalesce(completed_at,now()) where target_id=old.id;
 return old;
end $$;
revoke all on function public.onoff_remove_member_photos() from public,anon,authenticated;
create index gym_account_deletions_target on public.gym_account_deletions(target_id);
