-- A small, service-only result replaces full bootstrap reloads after comments/joins.
create or replace function public.onoff_post_snapshot(post_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $snap$
 select to_jsonb(p)||jsonb_build_object(
  'authorId',p.author_id,'author',coalesce(m.name,'회원'),'date',to_char(p.created_at at time zone 'Asia/Seoul','YYYY-MM-DD'),
  'joinedIds',coalesce((select jsonb_agg(j.user_id order by j.user_id) from public.gym_post_joins j where j.post_id=p.id),'[]'::jsonb),
  'joinedNames',coalesce((select jsonb_object_agg(j.user_id::text,coalesce(u.name,'회원')) from public.gym_post_joins j left join public.gym_members u on u.id=j.user_id and u.status='approved' where j.post_id=p.id),'{}'::jsonb),
  'comments',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('authorId',c.author_id,'author',coalesce(u.name,'회원')) order by c.created_at,c.id) from public.gym_comments c left join public.gym_members u on u.id=c.author_id and u.status='approved' where c.post_id=p.id),'[]'::jsonb)
 ) from public.gym_posts p left join public.gym_members m on m.id=p.author_id and m.status='approved' where p.id=post_id;
$snap$;
revoke all on function public.onoff_post_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.onoff_post_snapshot(uuid) to service_role;
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('public.onoff_commit(uuid,text,jsonb)'::regprocedure);
 if position('onoff-community-membership-guard' in definition)=0 then
  definition:=replace(definition,'is_admin:=m.role=''admin'';',$new$is_admin:=m.role='admin';
  -- onoff-community-membership-guard: match the bootstrap visibility policy.
  if op in ('join','comment') and not is_admin then
   select * into old from public.gym_memberships where user_id=actor;
   if found and (old.paused_at is not null or old.start_date>day or old.end_date<day or
    (old.kind='visits' and old.remaining_visits<=0 and not (old.remaining_visits=0 and exists(select 1 from public.gym_attendance where user_id=actor and date=day and membership_id=old.id)))) then
    raise exception '회원권 이용 상태를 확인해주세요.' using errcode='42501';
   end if;
  end if;$new$);
  execute definition;
 end if;
end $patch$;
