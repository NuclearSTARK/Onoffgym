-- Keep the database guard enabled: explicitly scope intentional TV session revocation.
do $repair$
declare definition text;
begin
 definition := pg_get_functiondef('public.onoff_commit(uuid,text,jsonb)'::regprocedure);
 if position('delete from public.gym_tv_sessions;' in definition)>0 then
  definition := replace(definition,'delete from public.gym_tv_sessions;','delete from public.gym_tv_sessions where hash is not null;');
 end if;
 if position('closed-day-attendance-guard' in definition)=0 then
  definition := replace(definition,$old$if op='attendance' then$old$,$new$if op='attendance' then
  -- closed-day-attendance-guard: run in the same transaction as visit debit.
  perform 1 from public.gym_workouts where date=day for share;
  if (extract(dow from day)=0 or coalesce((select body->'dates' from public.gym_holiday_cache where key='KR'),'{}'::jsonb) ? day::text)
   and not exists(select 1 from public.gym_workouts where date=day
    and jsonb_array_length(coalesce(body->'sessions','[]'::jsonb))>0
    and jsonb_array_length(coalesce(body->'sections','[]'::jsonb))>0) then
   raise exception '휴강일에는 출석할 수 없어요. 특별 수업이 등록되면 출석할 수 있습니다.' using errcode='42501';
  end if;$new$);
 end if;
 execute definition;
end $repair$;

-- Only the verified Edge handler can call this; existing member results are retained.
create or replace function public.onoff_delete_workout(actor uuid,target_date date,target_program text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare member public.gym_members%rowtype; deleted integer;
begin
 select * into member from public.gym_members where id=actor for update;
 if not found or member.role<>'admin' or member.status<>'approved' then
  raise exception '운영자만 수업을 삭제할 수 있어요.' using errcode='42501';
 end if;
 if target_date is null or target_program is null or target_program not in ('B/T','WOD') then
  raise exception '삭제할 수업을 확인해주세요.' using errcode='22023';
 end if;
 delete from public.gym_workouts where key=target_date::text||'_'||target_program;
 get diagnostics deleted=row_count;
 if deleted=0 then raise exception '삭제할 수업을 찾을 수 없어요.' using errcode='P0002'; end if;
 return jsonb_build_object('ok',true,'recordsPreserved',true);
end $$;
revoke all on function public.onoff_delete_workout(uuid,date,text) from public,anon,authenticated;
grant execute on function public.onoff_delete_workout(uuid,date,text) to service_role;
