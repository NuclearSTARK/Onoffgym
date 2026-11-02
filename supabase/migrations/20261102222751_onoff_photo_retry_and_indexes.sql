create index gym_photos_owner_idx on public.gym_photos(owner_id,active);
create index gym_photos_pending_age_idx on public.gym_photos(created_at) where not active;
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.onoff_attach_photos(uuid,jsonb)'::regprocedure);
 definition:=replace(definition,'if (select count(*) from public.gym_photos where id=any(ids)',
 $patch$if k='daily' and (select count(*) from public.gym_photos where id=any(ids) and owner_id=actor and active and kind='daily' and date=(p->>'date')::date and program=p->>'program' and session=coalesce(p->>'session',''))=array_length(ids,1) then return jsonb_build_object('ok',true);end if;
 if k='daily' and ((p->>'date')::date>(now() at time zone 'Asia/Seoul')::date or coalesce(p->>'session','') !~ '^$|^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception '날짜와 수업 시각을 확인해주세요.';end if;
 if (select count(*) from public.gym_photos where id=any(ids)$patch$);
 execute definition;
end $$;
