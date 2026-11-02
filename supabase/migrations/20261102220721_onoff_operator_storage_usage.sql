-- CLI could not create a local migration (read-only home); this version matches
-- the successful native Supabase migration history entry, not a guessed version.
create or replace function public.onoff_storage_usage(actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.gym_members where id=actor and role='admin' and status='approved') then
  raise exception '운영자 권한이 필요해요.' using errcode='42501';
 end if;
 return jsonb_build_object('databaseBytes',pg_database_size(current_database()),
 'storageBytes',(select coalesce(sum((metadata->>'size')::bigint),0) from storage.objects),
 'measuredAt',now(),'storageMethod','object-metadata','plan','free','verifiedAt','2026-11-02',
 'databaseLimit',500000000,'storageLimit',1000000000,'egressBytes',null,
 'egressUncachedLimit',5000000000,'egressCachedLimit',5000000000);
end $$;
revoke all on function public.onoff_storage_usage(uuid) from public,anon,authenticated;
grant execute on function public.onoff_storage_usage(uuid) to service_role;
