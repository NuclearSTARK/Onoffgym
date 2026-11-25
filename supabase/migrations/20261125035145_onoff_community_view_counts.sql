-- Reuse stored first-read keys, including reads recorded before this feature.
-- The GIN index supports key-existence lookup without copying readers to clients.
create index if not exists gym_preferences_community_reads_gin
 on public.gym_preferences using gin ((body->'communityReads'));

create or replace function public.onoff_community_view_counts(
 actor uuid,post_ids uuid[] default '{}',notice_ids uuid[] default '{}'
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare member public.gym_members%rowtype; pass public.gym_memberships%rowtype;
 day date:=(now() at time zone 'Asia/Seoul')::date; counts jsonb;
begin
 select * into member from public.gym_members where id=actor;
 if not found or member.status<>'approved' or member.delete_requested_at is not null then
  raise exception '승인된 회원만 이용할 수 있어요.' using errcode='42501';
 end if;
 if coalesce(cardinality(post_ids),0)>500 or coalesce(cardinality(notice_ids),0)>500 then
  raise exception '게시글 목록이 너무 많아요.' using errcode='22023';
 end if;
 if member.role not in ('admin','coach') then
  select * into pass from public.gym_memberships where user_id=actor;
  if found and (pass.paused_at is not null or pass.start_date>day or pass.end_date<day or
   (pass.kind='visits' and pass.remaining_visits<=0 and not (pass.remaining_visits=0 and exists(
    select 1 from public.gym_attendance where user_id=actor and date=day and membership_id=pass.id
   )))) then
   raise exception '회원권 이용 상태를 확인해주세요.' using errcode='42501';
  end if;
 end if;
 select coalesce(jsonb_object_agg(t.read_key,(select count(*) from public.gym_preferences pref
  where pref.user_id is distinct from t.author_id and (pref.body->'communityReads') ? t.read_key)), '{}'::jsonb)
 into counts
 from (
  select 'post:'||p.id::text as read_key,p.author_id from public.gym_posts p
   left join public.gym_members author on author.id=p.author_id
   where p.id=any(coalesce(post_ids,'{}'::uuid[]))
    and (member.role='admin' or p.author_id=actor or author.disclosure_consent is distinct from false)
    and not (p.category='운동 번개' and p.starts_at is not null and p.starts_at<=now()-interval '24 hours')
  union all
  select 'notice:'||n.id::text,n.author_id from public.gym_notices n
   where n.id=any(coalesce(notice_ids,'{}'::uuid[]))
 ) t;
 return counts;
end $$;
revoke all on function public.onoff_community_view_counts(uuid,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.onoff_community_view_counts(uuid,uuid[],uuid[]) to service_role;
