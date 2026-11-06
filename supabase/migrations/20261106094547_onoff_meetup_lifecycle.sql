-- The actor-facing RPCs retain their existing approval, sharing and membership checks.
-- Guard every insertion as well, including a request crossing the deadline in flight.
create function public.onoff_meetup_write_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare post public.gym_posts;
begin
 select * into post from public.gym_posts where id=new.post_id for share;
 if found and post.category='운동 번개' and post.starts_at is not null then
  if post.starts_at<=clock_timestamp()-interval '24 hours' then
   raise exception '보관 기간이 지나 삭제된 운동 번개예요.' using errcode='42501';
  end if;
  if tg_table_name='gym_post_joins' and post.starts_at<=clock_timestamp()-interval '30 minutes' then
   raise exception '마감된 운동 번개에는 새로 참여할 수 없어요.' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.onoff_meetup_write_guard() from public,anon,authenticated;
grant execute on function public.onoff_meetup_write_guard() to service_role;
create trigger gym_meetup_join_guard before insert on public.gym_post_joins
for each row execute function public.onoff_meetup_write_guard();
create trigger gym_meetup_comment_guard before insert on public.gym_comments
for each row execute function public.onoff_meetup_write_guard();

create index gym_posts_meetup_expiry_idx on public.gym_posts(starts_at)
where category='운동 번개' and starts_at is not null;
create function public.onoff_expire_meetups() returns integer
language plpgsql security invoker set search_path='' as $$
declare removed integer;cutoff timestamptz:=clock_timestamp()-interval '24 hours';
begin
 delete from public.gym_posts where id in (
  select id from public.gym_posts
  where category='운동 번개' and starts_at is not null and starts_at<=cutoff
  order by starts_at limit 200 for update skip locked
 );
 get diagnostics removed=row_count;
 -- Existing FK cascades delete comments/joins/photos; photo triggers queue both files.
 return removed;
end $$;
revoke all on function public.onoff_expire_meetups() from public,anon,authenticated;
grant execute on function public.onoff_expire_meetups() to service_role;
select cron.schedule('onoff-expire-meetups','* * * * *','select public.onoff_expire_meetups();');
