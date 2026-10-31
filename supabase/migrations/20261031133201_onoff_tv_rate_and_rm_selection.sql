-- Per-gateway-address and global ceilings bound brute-force attempts even if a
-- client rotates addresses. Both windows are incremented in the same transaction.
create function public.onoff_tv_attempt(ip_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare n integer; g integer;
begin
 insert into public.gym_tv_attempts as t(id,count,window_start) values('global-pins',1,now()),('ip:'||ip_hash,1,now())
 on conflict(id) do update set count=case when t.window_start>now()-interval '15 minutes' then t.count+1 else 1 end,
 window_start=case when t.window_start>now()-interval '15 minutes' then t.window_start else now() end;
 select count into n from public.gym_tv_attempts where id='ip:'||ip_hash;
 select count into g from public.gym_tv_attempts where id='global-pins';
 return jsonb_build_object('allowed',n<=5 and g<=50);
end $$;
revoke all on function public.onoff_tv_attempt(text) from public,anon,authenticated;
grant execute on function public.onoff_tv_attempt(text) to service_role;

create function public.onoff_select_recorded_rm() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.body->>'movementId' is not null then
  update public.gym_preferences set body=jsonb_set(body,'{rmSelection}',(body->'rmSelection')||jsonb_build_array(new.body->>'movementId'))
  where user_id=new.user_id and body ? 'rmSelection' and not ((body->'rmSelection') ? (new.body->>'movementId'));
 end if;
 return new;
end $$;
revoke all on function public.onoff_select_recorded_rm() from public,anon,authenticated;
grant execute on function public.onoff_select_recorded_rm() to service_role;
create trigger select_recorded_rm after insert on public.gym_rms for each row execute function public.onoff_select_recorded_rm();
