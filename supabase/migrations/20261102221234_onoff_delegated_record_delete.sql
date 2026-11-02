create function public.onoff_delete_record(actor uuid,record_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.gym_records%rowtype;
begin
 if not exists(select 1 from public.gym_members where id=actor and status='approved') then raise exception '승인이 필요해요.' using errcode='42501';end if;
 select * into target from public.gym_records where id=record_id for update;
 if not found then raise exception '기록을 찾을 수 없어요.' using errcode='P0002';end if;
 if target.user_id<>actor and not public.onoff_can(actor,'records.delete') then raise exception '기록 삭제 권한이 필요해요.' using errcode='42501';end if;
 delete from public.gym_records where id=record_id;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.onoff_delete_record(uuid,uuid) from public,anon,authenticated;
grant execute on function public.onoff_delete_record(uuid,uuid) to service_role;
