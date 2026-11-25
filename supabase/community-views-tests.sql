-- Synthetic accounts only; always execute with BEGIN/ROLLBACK.
begin;
do $$
declare author uuid:=gen_random_uuid(); reader uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); pending uuid:=gen_random_uuid(); person uuid;
 post_id uuid:=gen_random_uuid(); notice_id uuid; private_id uuid:=gen_random_uuid(); expired_id uuid:=gen_random_uuid(); pass_id uuid:=gen_random_uuid(); reply jsonb; denied boolean;
begin
 notice_id:=post_id;
 foreach person in array array[author,reader,other,pending] loop
  insert into auth.users(id,email,raw_user_meta_data) values(person,'views-'||person||'@example.invalid',jsonb_build_object('full_name','조회수 검증','gender','male','age_over_14',true,'privacy_consent',true,'privacy_version','privacy-2026-11-05','disclosure_consent',true));
 end loop;
 update public.gym_members set status='approved' where id in(author,reader,other);
 insert into public.gym_posts(id,author_id,category,title,body) values(post_id,author,'자유글','View fixture','Not published'),(private_id,other,'공동구매','Private fixture','Not published');
 insert into public.gym_posts(id,author_id,category,title,body,starts_at) values(expired_id,author,'운동 번개','Expired fixture','Not published',now()-interval '25 hours');
 insert into public.gym_notices(id,author_id,title,body) values(notice_id,author,'Notice fixture','Not published');
 insert into public.gym_preferences(user_id,body) values
  (author,jsonb_build_object('communityReads',jsonb_build_object('post:'||post_id,'legacy','notice:'||notice_id,'legacy'))),
  (reader,jsonb_build_object('communityReads',jsonb_build_object('post:'||post_id,'legacy'))),
  (other,jsonb_build_object('communityReads',jsonb_build_object('post:'||post_id,'legacy','notice:'||notice_id,'legacy')))
 on conflict(user_id) do update set body=public.gym_preferences.body||excluded.body;
 set local role service_role;
 reply:=public.onoff_community_view_counts(reader,array[post_id],array[notice_id]);
 if (reply->>('post:'||post_id))::int<>2 or (reply->>('notice:'||notice_id))::int<>1 then raise exception 'legacy history, author exclusion or namespaces failed';end if;
 if reply::text like '%'||reader||'%' or reply::text like '%'||other||'%' then raise exception 'reader identity leaked';end if;
 perform public.onoff_commit(reader,'community-read',jsonb_build_object('id',post_id,'kind','post'));
 perform public.onoff_commit(reader,'community-read',jsonb_build_object('id',post_id,'kind','post'));
 reply:=public.onoff_community_view_counts(reader,array[post_id],array[notice_id]);
 if (reply->>('post:'||post_id))::int<>2 then raise exception 'repeat view added another count';end if;
 perform public.onoff_commit(reader,'community-read',jsonb_build_object('id',notice_id,'kind','notice'));
 reply:=public.onoff_community_view_counts(reader,array[post_id],array[notice_id]);
 if (reply->>('notice:'||notice_id))::int<>2 then raise exception 'new notice view not counted';end if;
 denied:=false;begin perform public.onoff_community_view_counts(pending,array[post_id]);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'pending reader received counts';end if;
 denied:=false;begin perform public.onoff_community_view_counts(reader,array_fill(post_id,array[501]));exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'oversized count request accepted';end if;
 reset role;
 update public.gym_members set disclosure_consent=false where id=other;
 set local role service_role;
 reply:=public.onoff_community_view_counts(reader,array[private_id,expired_id]);
 if reply<>'{}'::jsonb then raise exception 'hidden or expired post existence exposed';end if;
 reset role;
 insert into public.gym_memberships(user_id,id,kind,start_date,end_date,total_visits,remaining_visits) values(reader,pass_id,'visits',current_date-10,current_date+10,10,0);
 set local role service_role;
 denied:=false;begin perform public.onoff_community_view_counts(reader,array[post_id]);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'unavailable pass received counts';end if;
 reset role;
 insert into public.gym_attendance(user_id,date,membership_id) values(reader,(now() at time zone 'Asia/Seoul')::date,pass_id);
 set local role service_role;
 reply:=public.onoff_community_view_counts(reader,array[post_id]);
 if (reply->>('post:'||post_id))::int<>2 then raise exception 'last visit attendance access lost';end if;
 reset role;
end $$;
select true as community_view_tests_passed,
 not has_function_privilege('anon','public.onoff_community_view_counts(uuid,uuid[],uuid[])','execute') as anon_blocked,
 not has_function_privilege('authenticated','public.onoff_community_view_counts(uuid,uuid[],uuid[])','execute') as client_blocked;
rollback;
