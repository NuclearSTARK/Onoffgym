-- Only execute inside BEGIN / ROLLBACK. No real account or notification mutations.
do $test$
declare author uuid:=gen_random_uuid();actor uuid;post uuid:=gen_random_uuid();v jsonb;role_name text;denied boolean;actors uuid[]:='{}';
begin
 insert into auth.users(id,email,raw_user_meta_data) values(author,author::text||'@example.invalid','{"full_name":"검증 작성자","privacy_consent":true,"privacy_version":"privacy-2026-11-04","age_over_14":true,"disclosure_consent":true}');
 update public.gym_members set status='approved' where id=author;
 insert into public.gym_posts(id,author_id,category,title,body) values(post,author,'운동 번개','재참여 검증','검증');
 foreach role_name in array array['admin','coach','member'] loop
  actor:=gen_random_uuid();actors:=array_append(actors,actor);
  insert into auth.users(id,email,raw_user_meta_data) values(actor,actor::text||'@example.invalid','{"full_name":"검증 참여자","privacy_consent":true,"privacy_version":"privacy-2026-11-04","age_over_14":true,"disclosure_consent":true}');
  update public.gym_members set status='approved',role=role_name where id=actor;
  perform public.onoff_post_participation(actor,post,true);
  v:=public.onoff_post_participation(actor,post,false);
  if (v->>'joined')::boolean is distinct from false then raise exception 'cancel acknowledgement wrong';end if;
  v:=public.onoff_post_participation(actor,post,true);
  if not(v->'post'->'joinedIds' @> to_jsonb(array[actor])) then raise exception 'rejoin failed for %',role_name;end if;
  if (select count(*) from public.gym_post_joins where post_id=post and user_id=actor)<>1 then raise exception 'duplicate participation';end if;
 end loop;
 -- Reproduce the reported legacy-author condition, never auto-enable consent.
 update public.gym_members set disclosure_consent=false,privacy_version='email-signup-v1' where id=author;
 foreach actor in array actors loop
  perform public.onoff_post_participation(actor,post,false);
  denied:=false;begin perform public.onoff_post_participation(actor,post,true);exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'legacy author bypass';end if;
 end loop;
 if (select disclosure_consent from public.gym_members where id=author) then raise exception 'consent changed implicitly';end if;
 perform public.onoff_privacy_accept(author,'{"version":"privacy-2026-11-04","ageOver14":true,"disclosure":true}');
 foreach actor in array actors loop
  v:=public.onoff_post_participation(actor,post,true);
  if not(v->'post'->'joinedIds' @> to_jsonb(array[actor])) then raise exception 'participation not restored after author consent';end if;
 end loop;
end $test$;
