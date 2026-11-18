-- Recheck create/update rights at the actual write, after locking. The earlier
-- batch check remains useful but must not authorize a row whose state changed.
do $patch$
declare definition text; before_patch text; anchor text;
begin
 definition:=pg_get_functiondef('public.onoff_commit(uuid,text,jsonb)'::regprocedure);
 before_patch:=definition;
 anchor:=$old$   stamp:=((item->>'date')::date-1+$old$;
 if position(anchor in definition)=0 then raise exception 'Missing workout permission anchor';end if;
 definition:=replace(definition,anchor,$new$   perform 1 from public.gym_workouts where key=item->>'date'||'_'||(item->>'program') for update;
   if not public.onoff_can(actor,case when found then 'workouts.update' else 'workouts.create' end) then
    raise exception '수업 관리 권한이 변경됐어요.' using errcode='42501';
   end if;
   stamp:=((item->>'date')::date-1+$new$);
 anchor:=$old$release_at=case when w.release_at<=now() then w.release_at else excluded.release_at end;$old$;
 if position(anchor in definition)=0 then raise exception 'Missing workout conflict anchor';end if;
 definition:=replace(definition,anchor,$new$release_at=case when w.release_at<=now() then w.release_at else excluded.release_at end
    where public.onoff_can(actor,'workouts.update');
   get diagnostics inserted=row_count;
   if inserted=0 then raise exception '기존 수업 수정 권한이 필요해요.' using errcode='42501';end if;$new$);
 anchor:=$old$   if found and old_record.user_id<>actor and not is_admin then$old$;
 if position(anchor in definition)=0 then raise exception 'Missing record permission anchor';end if;
 definition:=replace(definition,anchor,$new$   if target<>actor and not public.onoff_can(actor,case when found then 'records.update' else 'records.create' end) then
    raise exception '회원 기록 관리 권한이 변경됐어요.' using errcode='42501';
   end if;
   if old_record.id is not null and old_record.user_id<>actor and not is_admin then$new$);
 anchor:=$old$writer_id=actor,updated_at=now();
   delete from public.gym_rms$old$;
 if position(anchor in definition)=0 then raise exception 'Missing record conflict anchor';end if;
 definition:=replace(definition,anchor,$new$writer_id=actor,updated_at=now()
    where public.gym_records.user_id=excluded.user_id
     and (public.gym_records.user_id=actor or public.onoff_can(actor,'records.update'));
   get diagnostics inserted=row_count;
   if inserted=0 then raise exception '기록 소유자 또는 수정 권한을 확인해주세요.' using errcode='42501';end if;
   delete from public.gym_rms$new$);
 if definition=before_patch then raise exception 'Permission patch was not applied';end if;
 execute definition;
end $patch$;
-- CREATE OR REPLACE retains the existing service-only EXECUTE grants.
