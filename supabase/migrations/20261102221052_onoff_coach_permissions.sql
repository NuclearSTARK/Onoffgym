alter table public.gym_members drop constraint gym_members_role_check;
alter table public.gym_members add constraint gym_members_role_check check(role in ('admin','coach','member'));
alter table public.gym_members add column coach_permissions jsonb not null default '[]' check(jsonb_typeof(coach_permissions)='array' and coach_permissions <@ '["workouts.read","workouts.create","workouts.update","workouts.delete","records.create","records.update","records.delete","photos","videos","rm","notices","banner","push","release","tv"]'::jsonb);
create function public.onoff_can(actor uuid,permission text) returns boolean language sql stable security invoker set search_path='' as $$ select coalesce((select status='approved' and (role='admin' or role='coach' and coach_permissions ? permission) from public.gym_members where id=actor),false) $$;
revoke all on function public.onoff_can(uuid,text) from public,anon,authenticated;
grant execute on function public.onoff_can(uuid,text) to service_role;
create function public.onoff_coach_operation(actor uuid,op text,p jsonb) returns boolean language plpgsql stable security invoker set search_path='' as $$
declare item jsonb; permission text;
begin
 if not exists(select 1 from public.gym_members where id=actor and role='coach' and status='approved') then return false; end if;
 if op='workouts' then
  for item in select * from jsonb_array_elements(p->'workouts') loop
   permission:=case when exists(select 1 from public.gym_workouts where key=item->>'date'||'_'||(item->>'program')) then 'workouts.update' else 'workouts.create' end;
   if not public.onoff_can(actor,permission) then return false; end if;
  end loop;
  return true;
 elsif op='records' then
  for item in select * from jsonb_array_elements(p->'records') loop
   permission:=case when exists(select 1 from public.gym_records where id=(item->>'id')::uuid or (user_id=(item->>'memberId')::uuid and date=(item->>'date')::date and program=item->>'program' and session=coalesce(item->>'session','') and section=item->>'section')) then 'records.update' else 'records.create' end;
   if not public.onoff_can(actor,permission) then return false; end if;
  end loop;
  return true;
 elsif op='setting' then permission:=case p->>'key' when 'banner' then 'banner' when 'rmCatalogue' then 'rm' end;
 elsif op='settings' then permission:='release';
 elsif op='movements' then permission:='videos';
 elsif op='notices' then permission:='notices';
 elsif op='tv-admin' then
  if p ? 'password' or p->>'revoke'='true' then return false; end if;permission:='tv';
 else return false;
 end if;
 return permission is not null and public.onoff_can(actor,permission);
end $$;
revoke all on function public.onoff_coach_operation(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.onoff_coach_operation(uuid,text,jsonb) to service_role;
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('public.onoff_commit(uuid,text,jsonb)'::regprocedure);
 if position('is_admin:=m.role=''admin'';' in definition)=0 then raise exception 'Missing authorization anchor';end if;
 definition:=replace(definition,'is_admin:=m.role=''admin'';','is_admin:=m.role=''admin'' or public.onoff_coach_operation(actor,op,p);');
 definition:=replace(definition,'set role=p->>''role'',status=p->>''status''','set role=p->>''role'',status=p->>''status'',coach_permissions=case when p->>''role''=''coach'' then coalesce(p->''coach_permissions'',''[]''::jsonb) else ''[]''::jsonb end');
 execute definition;
 definition:=pg_get_functiondef('public.onoff_delete_workout(uuid,date,text)'::regprocedure);
 definition:=replace(definition,'member.role<>''admin''','not public.onoff_can(actor,''workouts.delete'')');execute definition;
 definition:=pg_get_functiondef('public.onoff_push_compose(uuid,text,jsonb)'::regprocedure);
 definition:=replace(definition,'and role=''admin''','and public.onoff_can(actor,''push'')');execute definition;
 definition:=pg_get_functiondef('public.onoff_push_history(uuid)'::regprocedure);
 definition:=replace(definition,'and role=''admin''','and public.onoff_can(actor,''push'')');execute definition;
end $patch$;
