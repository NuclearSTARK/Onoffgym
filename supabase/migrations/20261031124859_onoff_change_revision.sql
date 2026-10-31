insert into public.gym_settings(key,value) values('revision','0') on conflict do nothing;
create function public.onoff_bump_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 update public.gym_settings set value=to_jsonb((value#>>'{}')::bigint+1) where key='revision';
 return null;
end $$;
revoke all on function public.onoff_bump_revision() from public,anon,authenticated;
grant execute on function public.onoff_bump_revision() to service_role;
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'gym_%'
 and tablename not in ('gym_settings','gym_tv_sessions','gym_tv_attempts','gym_holiday_cache') loop
  execute format('create trigger bump_revision after insert or update or delete on public.%I for each statement execute function public.onoff_bump_revision()',t);
 end loop;
end $$;
-- Settings have a separate trigger so changing the revision cannot recurse.
create function public.onoff_setting_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.key<>'revision' then update public.gym_settings set value=to_jsonb((value#>>'{}')::bigint+1) where key='revision'; end if;
 return new;
end $$;
revoke all on function public.onoff_setting_revision() from public,anon,authenticated;
grant execute on function public.onoff_setting_revision() to service_role;
create trigger bump_setting_revision after insert or update on public.gym_settings for each row execute function public.onoff_setting_revision();
