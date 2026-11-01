-- A small, service-only result replaces full bootstrap reloads after comments/joins.
create or replace function public.onoff_post_snapshot(post_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $snap$
 select to_jsonb(p)||jsonb_build_object(
  'authorId',p.author_id,'author',coalesce(m.name,'회원'),'date',to_char(p.created_at at time zone 'Asia/Seoul','YYYY-MM-DD'),
  'joinedIds',coalesce((select jsonb_agg(j.user_id order by j.user_id) from public.gym_post_joins j where j.post_id=p.id),'[]'::jsonb),
  'joinedNames',coalesce((select jsonb_object_agg(j.user_id::text,coalesce(u.name,'회원')) from public.gym_post_joins j left join public.gym_members u on u.id=j.user_id where j.post_id=p.id),'{}'::jsonb),
  'comments',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('authorId',c.author_id,'author',coalesce(u.name,'회원')) order by c.created_at,c.id) from public.gym_comments c left join public.gym_members u on u.id=c.author_id where c.post_id=p.id),'[]'::jsonb)
 ) from public.gym_posts p left join public.gym_members m on m.id=p.author_id where p.id=post_id;
$snap$;
revoke all on function public.onoff_post_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.onoff_post_snapshot(uuid) to service_role;
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('public.onoff_commit(uuid,text,jsonb)'::regprocedure);
 if position('onoff-fast-community-delete' in definition)=0 then
  definition:=replace(definition,'''member-note'',''membership'',''attendance-cancel''','''member-note'',''membership'',''membership-delete'',''attendance-cancel''');
  if position('elsif op=''membership'' then' in definition)=0 then raise exception 'Missing membership branch'; end if;
  definition:=replace(definition,$old$elsif op='membership' then$old$,$new$elsif op='membership-delete' then
  -- onoff-fast-community-delete: retain attendance and an audit of the removed pass.
  target:=(p->>'id')::uuid;perform 1 from public.gym_members where id=target for update;
  select * into old from public.gym_memberships where user_id=target for update;
  if not found or old.id<>(p->>'passId')::uuid or old.revision<>(p->>'revision')::integer then raise exception '회원권이 변경됐어요. 다시 확인해주세요.' using errcode='40001'; end if;
  insert into public.gym_membership_events(user_id,action,body) values(target,'delete',jsonb_build_object('before',to_jsonb(old),'after',null,'actor',actor));
  delete from public.gym_memberships where user_id=target and id=old.id;
 elsif op='membership' then$new$);
  definition:=replace(definition,$old$elsif op='rm-update' then$old$,$new$elsif op='rm-delete' then
  delete from public.gym_rms where id=(p->>'id')::uuid and user_id=actor;
  if not found then raise exception '본인의 1RM 기록만 삭제할 수 있어요.' using errcode='42501'; end if;
 elsif op='rm-update' then$new$);
  definition:=replace(definition,$old$elsif op='post-delete' then delete from public.gym_posts where id=(p->>'id')::uuid and (author_id=actor or is_admin);$old$,$new$elsif op='post-delete' then
  delete from public.gym_posts where id=(p->>'id')::uuid and (author_id=actor or is_admin);
  if not found then raise exception '게시글을 삭제할 권한이 없어요.' using errcode='42501'; end if;$new$);
  definition:=replace(definition,$old$elsif op='comment' then insert into public.gym_comments(post_id,author_id,text) values((p->>'id')::uuid,actor,p->>'text');$old$,$new$elsif op='comment' then
  if exists(select 1 from public.gym_comments where id=(p->>'commentId')::uuid and (post_id<>(p->>'id')::uuid or author_id<>actor)) then raise exception '댓글 요청을 확인해주세요.' using errcode='42501'; end if;
  insert into public.gym_comments(id,post_id,author_id,text) values(coalesce((p->>'commentId')::uuid,gen_random_uuid()),(p->>'id')::uuid,actor,p->>'text') on conflict(id) do nothing;
  return jsonb_build_object('ok',true,'post',public.onoff_post_snapshot((p->>'id')::uuid));$new$);
  definition:=replace(definition,$old$delete from public.gym_post_joins where post_id=(p->>'id')::uuid and user_id=actor;
  get diagnostics cnt=row_count;
  if cnt=0 then insert into public.gym_post_joins(post_id,user_id) values((p->>'id')::uuid,actor); end if;$old$,$new$if p ? 'joined' then
   if (p->>'joined')::boolean then insert into public.gym_post_joins(post_id,user_id) values((p->>'id')::uuid,actor) on conflict do nothing;
   else delete from public.gym_post_joins where post_id=(p->>'id')::uuid and user_id=actor; end if;
  else
   delete from public.gym_post_joins where post_id=(p->>'id')::uuid and user_id=actor;get diagnostics cnt=row_count;
   if cnt=0 then insert into public.gym_post_joins(post_id,user_id) values((p->>'id')::uuid,actor); end if;
  end if;
  return jsonb_build_object('ok',true,'post',public.onoff_post_snapshot((p->>'id')::uuid));$new$);
  execute definition;
 end if;
end $patch$;
