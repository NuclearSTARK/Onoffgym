-- Extend the existing service-only, SECURITY INVOKER mutation entry point.
do $repair$
declare definition text;
begin
 definition:=pg_get_functiondef('public.onoff_commit(uuid,text,jsonb)'::regprocedure);
 if position('onoff-rm-read-support' in definition)=0 then
  definition:=replace(definition,'old_record public.gym_records%rowtype;','old_record public.gym_records%rowtype; rm_row public.gym_rms%rowtype; read_key text;');
  if position($old$elsif op='rm' then$old$ in definition)=0 then raise exception 'Expected RM branch was not found'; end if;
  definition:=replace(definition,$old$elsif op='rm' then$old$,$new$elsif op='rm-update' then
  -- onoff-rm-read-support: always lock linked class records before RM rows.
  perform 1 from public.gym_records where id=(select source from public.gym_rms where id=(p->>'id')::uuid and user_id=actor) for update;
  select * into rm_row from public.gym_rms where id=(p->>'id')::uuid and user_id=actor for update;
  if not found then raise exception '본인의 1RM 기록만 수정할 수 있어요.' using errcode='42501'; end if;
  if (p->>'memberId')::uuid<>actor or (p->>'lbs')::numeric<=0 or (p->>'lbs')::numeric>6614 or (p->>'date')::date>day then raise exception '1RM 기록을 확인해주세요.'; end if;
  if rm_row.source is not null then
   if p->>'date'<>rm_row.body->>'date' or p->>'movementId'<>coalesce(rm_row.body->>'movementId',p->>'movementId') then raise exception '수업에서 연결된 동작과 날짜는 유지해주세요.'; end if;
   update public.gym_records set body=jsonb_set(body,'{lbs}',p->'lbs'),writer_id=actor,updated_at=now() where id=rm_row.source and user_id=actor;
   if not found then raise exception '연결된 수업 기록을 찾을 수 없어요.'; end if;
   update public.gym_rms set body=rm_row.body||p||jsonb_build_object('source',rm_row.source) where id=rm_row.id and user_id=actor;
  else
   update public.gym_rms set body=(rm_row.body||p)-'source' where id=rm_row.id and user_id=actor;
  end if;
  update public.gym_preferences set body=jsonb_set(body,'{rmSelection}',(body->'rmSelection')||jsonb_build_array(p->>'movementId'))
   where user_id=actor and jsonb_typeof(body->'rmSelection')='array' and not ((body->'rmSelection') ? (p->>'movementId'));
 elsif op='community-read' then
  if p->>'kind' not in ('post','notice') then raise exception '게시글을 확인해주세요.'; end if;
  if p->>'kind'='post' then
   perform 1 from public.gym_posts where id=(p->>'id')::uuid;
  else
   perform 1 from public.gym_notices where id=(p->>'id')::uuid;
  end if;
  if not found then raise exception '게시글을 찾을 수 없어요.'; end if;
  read_key:=(p->>'kind')||':'||(p->>'id');
  if exists(select 1 from public.gym_preferences where user_id=actor and (body->'communityReads') ? read_key) then return jsonb_build_object('ok',true); end if;
  insert into public.gym_preferences(user_id,body) values(actor,jsonb_build_object('communityReads',jsonb_build_object(read_key,now())))
   on conflict(user_id) do update set body=jsonb_set(public.gym_preferences.body,'{communityReads}',coalesce(public.gym_preferences.body->'communityReads','{}'::jsonb)||jsonb_build_object(read_key,now()));
 elsif op='rm' then$new$);
  execute definition;
 end if;
end $repair$;
update public.gym_settings set value=jsonb_set(value,'{text}',to_jsonb(replace(value->>'text','온오프','ONOFF'))) where key='banner' and jsonb_typeof(value->'text')='string' and value->>'text' like '%온오프%';
