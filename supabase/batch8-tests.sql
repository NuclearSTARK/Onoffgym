-- Run only inside BEGIN / ROLLBACK; synthetic accounts/posts/records are never kept.
do $test$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();post uuid:=gen_random_uuid();ev uuid:=gen_random_uuid();w text:='qa-'||left(a::text,8);wr text:=w||'-rounds';v jsonb;denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) select x,x::text||'@example.invalid','{"full_name":"통합 검증","privacy_consent":true,"privacy_version":"privacy-2026-11-04","age_over_14":true,"disclosure_consent":true}'::jsonb from unnest(array[a,b,c,d]) x;
 update public.gym_members set status='approved' where id in(a,b,c,d);update public.gym_members set role='admin' where id=a;
 insert into public.gym_posts(id,author_id,category,title,body) values(post,a,'운동 번개','검증','검증');
 v:=public.onoff_post_participation(b,post,true);if not(v->'post'->'joinedIds' @> to_jsonb(array[b])) then raise exception 'join response missing';end if;
 v:=public.onoff_post_participation(b,post,true);if (select count(*) from public.gym_post_joins where post_id=post and user_id=b)<>1 then raise exception 'duplicate join';end if;
 update public.gym_members set disclosure_consent=false where id in(a,b);
 v:=public.onoff_post_participation(b,post,false);if v ? 'post' or exists(select 1 from public.gym_post_joins where post_id=post and user_id=b) then raise exception 'cancel failed';end if;
 perform public.onoff_post_participation(b,post,false);
 denied:=false;begin perform public.onoff_post_participation(b,post,true);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'unshared join allowed';end if;
 update public.gym_members set disclosure_consent=true where id in(a,b);
 perform public.onoff_post_participation(b,post,true);perform public.onoff_post_participation(c,post,true);perform public.onoff_post_participation(b,post,false);
 if not exists(select 1 from public.gym_post_joins where post_id=post and user_id=c) then raise exception 'cancel removed another participant';end if;
 insert into public.gym_memberships(user_id,id,kind,months,start_date,end_date,paused_at) values(b,gen_random_uuid(),'period',1,current_date-1,current_date+30,current_date);
 perform public.onoff_post_participation(b,post,false);
 denied:=false;begin perform public.onoff_post_participation(b,post,true);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'paused member joined';end if;
 insert into public.gym_membership_events(id,user_id,action,body) values(ev,b,'register','{}');
 denied:=false;begin perform public.onoff_membership_history_delete(b,b,ev);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'member deleted history';end if;
 denied:=false;begin perform public.onoff_membership_history_delete(a,c,ev);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'wrong target deleted history';end if;
 perform public.onoff_membership_history_delete(a,b,ev);if not exists(select 1 from public.gym_memberships where user_id=b and paused_at=current_date) then raise exception 'history delete changed pass';end if;if exists(select 1 from public.gym_membership_events where id=ev) then raise exception 'history not deleted';end if;perform public.onoff_membership_history_delete(a,b,ev);
 insert into public.gym_named_wods(id,name,category_id,record_type) values(w,w,'mixed','time'),(wr,wr,'mixed','rounds');
 insert into public.gym_named_records(id,user_id,wod_id,date,seconds) values(gen_random_uuid(),b,w,current_date,120),(gen_random_uuid(),b,w,current_date,90),(gen_random_uuid(),c,w,current_date,90),(gen_random_uuid(),d,w,current_date,150);
 v:=public.onoff_named_comparison(b,w);if (v->>'total')::int<>3 or (v->>'equal')::int<>2 or (v->>'rank')::int<>1 or (v->>'lower')::int<>1 or v ? 'names' or v ? 'records' then raise exception 'time ranking wrong %',v;end if;
 v:=public.onoff_named_comparison(d,w);if (v->>'rank')::int<>3 then raise exception 'time reverse order';end if;
 insert into public.gym_named_records(id,user_id,wod_id,date,rounds,reps) values(gen_random_uuid(),b,wr,current_date,10,20),(gen_random_uuid(),b,wr,current_date,11,0),(gen_random_uuid(),c,wr,current_date,10,99),(gen_random_uuid(),d,wr,current_date,11,5);
 v:=public.onoff_named_comparison(b,wr);if (v->>'rank')::int<>2 or (v->>'lower')::int<>1 then raise exception 'round/reps rank wrong %',v;end if;
 update public.gym_members set disclosure_consent=false where id=d;v:=public.onoff_named_comparison(b,wr);if (v->>'total')::int<>2 or (v->>'rank')::int<>1 then raise exception 'privacy not excluded';end if;
 insert into public.gym_preferences(user_id,body) values(c,'{"rank":false}') on conflict(user_id) do update set body=excluded.body;v:=public.onoff_named_comparison(b,wr);if (v->>'total')::int<>1 then raise exception 'rank optout included';end if;
 v:=public.onoff_named_comparison(c,wr);if (v->>'participating')::boolean then raise exception 'rank optout viewer participating';end if;
 update public.gym_members set status='pending' where id=b;denied:=false;begin perform public.onoff_named_comparison(b,w);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'pending read comparison';end if;
 if has_function_privilege('anon','public.onoff_named_comparison(uuid,text)','execute') or has_function_privilege('authenticated','public.onoff_membership_history_delete(uuid,uuid,uuid)','execute') then raise exception 'RPC publicly callable';end if;
end $test$;
