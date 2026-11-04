-- Aggregate only: each approved, sharing, rank-participating member contributes
-- one best score. No other member's identity or individual record is returned.
create function public.onoff_named_comparison(actor uuid,wod_id text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare kind text;opted boolean;total integer;smaller integer;tied integer;own_score bigint;
begin
 if not exists(select 1 from public.gym_members where id=actor and status='approved') then raise exception '승인된 회원만 이용할 수 있어요.' using errcode='42501';end if;
 select w.record_type into kind from public.gym_named_wods w where w.id=wod_id;
 if kind is null then raise exception '종목을 찾을 수 없어요.';end if;
 select m.disclosure_consent and coalesce((p.body->>'rank')::boolean,true) into opted from public.gym_members m left join public.gym_preferences p on p.user_id=m.id where m.id=actor;
 with bests as (
  select r.user_id,max(case when kind='time' then -r.seconds::bigint else r.rounds::bigint*100000+r.reps end) as score
  from public.gym_named_records r join public.gym_members m on m.id=r.user_id and m.status='approved' and m.disclosure_consent
  left join public.gym_preferences p on p.user_id=m.id
  where r.wod_id=onoff_named_comparison.wod_id and coalesce((p.body->>'rank')::boolean,true)
  group by r.user_id
 ), own as (select score from bests where user_id=actor)
 select count(*),max(score) filter(where user_id=actor),count(*) filter(where score<(select score from own)),count(*) filter(where score=(select score from own)) into total,own_score,smaller,tied from bests;
 if not opted or own_score is null then return jsonb_build_object('participating',opted,'total',total);end if;
 return jsonb_build_object('participating',true,'total',total,'lower',smaller,'equal',tied,'rank',total-smaller-tied+1);
end $$;
revoke all on function public.onoff_named_comparison(uuid,text) from public,anon,authenticated;
grant execute on function public.onoff_named_comparison(uuid,text) to service_role;

-- Cancelling one's own participation remains available after withdrawing
-- optional sharing consent, an author's consent change, or a pass pause/expiry.
create function public.onoff_post_participation(actor uuid,target_post uuid,joined boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare m public.gym_members;post public.gym_posts;pass public.gym_memberships;day date:=(now() at time zone 'Asia/Seoul')::date;
begin
 select * into m from public.gym_members where id=actor and status='approved';
 if not found then raise exception '승인된 회원만 이용할 수 있어요.' using errcode='42501';end if;
 if joined is null then raise exception '참여 상태를 확인해주세요.';end if;
 select * into post from public.gym_posts where id=target_post for update;
 if not found then raise exception '게시글을 찾을 수 없어요.';end if;
 if joined then
  if not m.disclosure_consent or not exists(select 1 from public.gym_members where id=post.author_id and status='approved' and disclosure_consent) then raise exception '개인설정에서 회원 간 공개에 동의한 뒤 이용해주세요.' using errcode='42501';end if;
  if post.category='자유글' then raise exception '참여할 수 없는 게시글입니다.';end if;
  if m.role<>'admin' then
   select * into pass from public.gym_memberships where user_id=actor;
   if found and (pass.paused_at is not null or pass.start_date>day or pass.end_date<day or (pass.kind='visits' and pass.remaining_visits<=0 and not(pass.remaining_visits=0 and exists(select 1 from public.gym_attendance where user_id=actor and date=day and membership_id=pass.id)))) then raise exception '회원권 이용 상태를 확인해주세요.' using errcode='42501';end if;
  end if;
  insert into public.gym_post_joins(post_id,user_id) values(target_post,actor) on conflict do nothing;
 else
  delete from public.gym_post_joins j where j.post_id=target_post and j.user_id=actor;
  -- A cancellation must not become a read bypass for a hidden post or paused pass.
  return jsonb_build_object('ok',true,'joined',false);
 end if;
 return jsonb_build_object('ok',true,'joined',joined,'post',public.onoff_post_snapshot(target_post));
end $$;
revoke all on function public.onoff_post_participation(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.onoff_post_participation(uuid,uuid,boolean) to service_role;

-- Remove only the selected visible history row; never undo membership/attendance.
create function public.onoff_membership_history_delete(actor uuid,target_member uuid,event_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.gym_members where id=actor and status='approved' and role='admin') then raise exception '운영자 권한이 필요해요.' using errcode='42501';end if;
 if exists(select 1 from public.gym_membership_events where id=event_id and user_id<>target_member) then raise exception '회원과 관리 이력을 확인해주세요.' using errcode='42501';end if;
 delete from public.gym_membership_events where id=event_id and user_id=target_member;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.onoff_membership_history_delete(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.onoff_membership_history_delete(uuid,uuid,uuid) to service_role;
