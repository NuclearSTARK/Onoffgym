-- Production-safe verification: every fixture and revision/outbox change rolls back.
begin;
set local statement_timeout='15s';
do $$
declare actor uuid;future uuid:=gen_random_uuid();closed uuid:=gen_random_uuid();expired uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();legacy uuid:=gen_random_uuid();photo uuid:=gen_random_uuid();photo_path text;
begin
 select id into actor from public.gym_members where status='approved' limit 1;
 if actor is null then raise exception 'Approved fixture owner required';end if;
 insert into public.gym_posts(id,author_id,category,title,body,starts_at) values
 (future,actor,'운동 번개','rollback fixture','fixture',clock_timestamp()+interval '1 hour'),
 (closed,actor,'운동 번개','rollback fixture','fixture',clock_timestamp()+interval '1 hour'),
 (expired,actor,'운동 번개','rollback fixture','fixture',clock_timestamp()+interval '1 hour'),
 (ordinary,actor,'공동구매','rollback fixture','fixture',clock_timestamp()-interval '25 hours'),
 (legacy,actor,'운동 번개','rollback fixture','fixture',null);
 insert into public.gym_post_joins(post_id,user_id) values(future,actor),(closed,actor),(expired,actor);
 insert into public.gym_comments(post_id,author_id,text) values(expired,actor,'rollback fixture');
 photo_path:=actor::text||'/'||photo::text||'.jpg';
 insert into public.gym_photos(id,owner_id,kind,post_id,path,preview_path,active,uploaded)
 values(photo,actor,'community',expired,photo_path,replace(photo_path,'.jpg','.preview.jpg'),true,true);
 update public.gym_posts set starts_at=clock_timestamp()-interval '31 minutes' where id=closed;
 delete from public.gym_post_joins where post_id=closed and user_id=actor;
 begin
  insert into public.gym_post_joins(post_id,user_id) values(closed,actor);
  raise exception 'Closed meetup join unexpectedly allowed';
 exception when insufficient_privilege then null;end;
 insert into public.gym_comments(post_id,author_id,text) values(closed,actor,'comment before retention expires');
 update public.gym_posts set starts_at=clock_timestamp()-interval '25 hours' where id=expired;
 begin
  insert into public.gym_comments(post_id,author_id,text) values(expired,actor,'must fail');
  raise exception 'Expired meetup comment unexpectedly allowed';
 exception when insufficient_privilege then null;end;
 perform public.onoff_expire_meetups();
 if exists(select 1 from public.gym_posts where id=expired) then raise exception 'Expired meetup not deleted';end if;
 if (select count(*) from public.gym_posts where id in(future,closed,ordinary,legacy))<>4 then raise exception 'Retention deleted unrelated/open/legacy posts';end if;
 if exists(select 1 from public.gym_comments where post_id=expired) or exists(select 1 from public.gym_post_joins where post_id=expired) or exists(select 1 from public.gym_photos where id=photo) then raise exception 'Dependent rows did not cascade';end if;
 if not exists(select 1 from public.gym_photo_cleanup where path=photo_path) or not exists(select 1 from public.gym_photo_cleanup where path=replace(photo_path,'.jpg','.preview.jpg')) then raise exception 'Photo cleanup outbox incomplete';end if;
 if has_function_privilege('anon','public.onoff_expire_meetups()','execute') or has_function_privilege('authenticated','public.onoff_expire_meetups()','execute') then raise exception 'Public maintenance execution exposed';end if;
end $$;
rollback;
select 'meetup lifecycle assertions passed; all fixtures rolled back' as result;
