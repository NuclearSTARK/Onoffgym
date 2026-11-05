-- Local pending migration: no production rows are inferred or backfilled.
-- Existing accounts stay null until their owner explicitly selects a gender.
alter table public.gym_members add column gender text check(gender in ('male','female'));


create or replace function public.onoff_member_policy_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.delete_requested_at is not null and new.status<>'suspended' then raise exception '삭제 처리 중인 계정입니다.' using errcode='42501';end if;
 if new.status='approved' and old.status is distinct from 'approved' then
  if new.gender is null or not new.age_over_14 or new.privacy_version is distinct from 'privacy-2026-11-05' then raise exception '회원의 성별·만 14세 이상 확인과 개인정보 안내 동의가 필요합니다.' using errcode='23514';end if;
  new.approved_at:=coalesce(old.approved_at,now());new.rejected_at:=null;
 elsif old.status='pending' and new.status='suspended' and old.approved_at is null and new.delete_requested_at is null then new.rejected_at:=coalesce(old.rejected_at,now());end if;
 return new;
end $$;

create or replace function public.onoff_privacy_accept(actor uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p->>'gender' is null or p->>'gender' not in ('male','female') or p->>'version' is distinct from 'privacy-2026-11-05' or p->>'ageOver14' is distinct from 'true' or jsonb_typeof(p->'disclosure') is distinct from 'boolean' then raise exception '성별·만 14세 이상 확인과 개인정보 안내 동의가 필요합니다.' using errcode='23514';end if;
 perform 1 from public.gym_members where id=actor and delete_requested_at is null for update;if not found then raise exception '계정을 확인해주세요.' using errcode='42501';end if;
 update public.gym_members set gender=p->>'gender',age_over_14=true,disclosure_consent=(p->>'disclosure')::boolean,privacy_consent_at=now(),privacy_version='privacy-2026-11-05' where id=actor;
 insert into public.gym_privacy_acceptances(user_id,version,age_over_14,disclosure) values(actor,'privacy-2026-11-05',true,(p->>'disclosure')::boolean) on conflict(user_id,version) do update set accepted_at=now(),disclosure=excluded.disclosure;
 return jsonb_build_object('ok',true);
end $$;

create or replace function onoff_private.handle_member_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare member_name text:=btrim(new.raw_user_meta_data->>'full_name');current_policy boolean:=new.raw_user_meta_data->>'privacy_version'='privacy-2026-11-05';
begin
 if coalesce(new.is_anonymous,false) or new.email is null then return new;end if;
 if current_policy and (new.raw_user_meta_data->>'gender' is null or new.raw_user_meta_data->>'gender' not in ('male','female') or new.raw_user_meta_data->>'age_over_14' is distinct from 'true' or new.raw_user_meta_data->>'privacy_consent' is distinct from 'true' or jsonb_typeof(new.raw_user_meta_data->'disclosure_consent') is distinct from 'boolean') then raise exception '성별·만 14세 이상 확인과 개인정보 안내 동의가 필요합니다.';end if;
 if member_name is null or char_length(member_name) not between 2 and 30 then member_name:='온오프 회원';end if;
 insert into public.gym_members(id,name,gender,privacy_consent_at,privacy_version,age_over_14,disclosure_consent) values(new.id,member_name,case when current_policy then new.raw_user_meta_data->>'gender' end,case when new.raw_user_meta_data->>'privacy_consent'='true' then now() end,case when current_policy then 'privacy-2026-11-05' when new.raw_user_meta_data->>'privacy_consent'='true' then 'email-signup-v1' end,coalesce(current_policy,false),coalesce(current_policy,false) and coalesce((new.raw_user_meta_data->>'disclosure_consent')::boolean,false)) on conflict(id) do nothing;
 if current_policy then insert into public.gym_privacy_acceptances(user_id,version,age_over_14,disclosure) values(new.id,'privacy-2026-11-05',true,coalesce((new.raw_user_meta_data->>'disclosure_consent')::boolean,false)) on conflict do nothing;end if;
 insert into public.gym_push_jobs(id,kind,subject_id,payload) values('approval:'||new.id::text,'approvals',new.id,jsonb_build_object('signupEvent',true,'title','새 회원 가입 신청','body',member_name||'님이 가입을 신청했어요.','url','/Onoffgym/#admin/members','tag','approval:'||new.id::text)) on conflict do nothing;
 return new;
end $$;

create or replace function public.onoff_rm_comparison(actor uuid,movement_id text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare movement jsonb;own_best numeric;total integer;smaller integer;tied integer;opted boolean;
begin
 if not exists(select 1 from public.gym_members where id=actor and status='approved') then raise exception '승인된 회원만 이용할 수 있어요.' using errcode='42501';end if;
 if (select gender from public.gym_members where id=actor) is null then raise exception '성별을 먼저 선택해주세요.' using errcode='23514';end if;
 select x into movement from public.gym_settings s cross join lateral jsonb_array_elements(s.value) x where s.key='rmCatalogue' and x->>'id'=movement_id;
 if movement is null then raise exception '종목을 찾을 수 없어요.';end if;
 select coalesce((body->>'rank')::boolean,true) into opted from public.gym_preferences where user_id=actor;opted:=coalesce(opted,true) and coalesce((select disclosure_consent from public.gym_members where id=actor),false);
 with bests as (
  select r.user_id,max((r.body->>'lbs')::numeric) as lbs from public.gym_rms r join public.gym_members m on m.id=r.user_id and m.status='approved' and m.disclosure_consent and m.gender=(select gender from public.gym_members where id=actor) left join public.gym_preferences p on p.user_id=m.id
  where coalesce((p.body->>'rank')::boolean,true) and jsonb_typeof(r.body->'lbs')='number' and (r.body->>'lbs')::numeric>0 and (r.body->>'movementId'=movement_id or ((r.body->>'movementId') is null and (lower(r.body->>'movement')=lower(movement->>'name') or exists(select 1 from jsonb_array_elements_text(coalesce(movement->'aliases','[]')) a where lower(a)=lower(r.body->>'movement'))))) group by r.user_id
 ) select max(lbs) filter(where user_id=actor),count(*) into own_best,total from bests;
 if own_best is null or not opted then return jsonb_build_object('participating',opted,'total',total,'ownBest',null);end if;
 with bests as (
  select r.user_id,max((r.body->>'lbs')::numeric) as lbs from public.gym_rms r join public.gym_members m on m.id=r.user_id and m.status='approved' and m.disclosure_consent and m.gender=(select gender from public.gym_members where id=actor) left join public.gym_preferences p on p.user_id=m.id
  where coalesce((p.body->>'rank')::boolean,true) and jsonb_typeof(r.body->'lbs')='number' and (r.body->>'lbs')::numeric>0 and (r.body->>'movementId'=movement_id or ((r.body->>'movementId') is null and (lower(r.body->>'movement')=lower(movement->>'name') or exists(select 1 from jsonb_array_elements_text(coalesce(movement->'aliases','[]')) a where lower(a)=lower(r.body->>'movement'))))) group by r.user_id
 ) select count(*) filter(where lbs<own_best),count(*) filter(where lbs=own_best) into smaller,tied from bests;
 return jsonb_build_object('participating',true,'total',total,'lower',smaller,'equal',tied,'ownBest',own_best);
end $$;

create or replace function public.onoff_named_comparison(actor uuid,wod_id text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare kind text;opted boolean;total integer;smaller integer;tied integer;own_score bigint;
begin
 if not exists(select 1 from public.gym_members where id=actor and status='approved') then raise exception '승인된 회원만 이용할 수 있어요.' using errcode='42501';end if;
 if (select gender from public.gym_members where id=actor) is null then raise exception '성별을 먼저 선택해주세요.' using errcode='23514';end if;
 select w.record_type into kind from public.gym_named_wods w where w.id=wod_id;
 if kind is null then raise exception '종목을 찾을 수 없어요.';end if;
 select m.disclosure_consent and coalesce((p.body->>'rank')::boolean,true) into opted from public.gym_members m left join public.gym_preferences p on p.user_id=m.id where m.id=actor;
 with bests as (
  select r.user_id,max(case when kind='time' then -r.seconds::bigint else r.rounds::bigint*100000+r.reps end) as score
  from public.gym_named_records r join public.gym_members m on m.id=r.user_id and m.status='approved' and m.disclosure_consent and m.gender=(select gender from public.gym_members where id=actor)
  left join public.gym_preferences p on p.user_id=m.id
  where r.wod_id=onoff_named_comparison.wod_id and coalesce((p.body->>'rank')::boolean,true)
  group by r.user_id
 ), own as (select score from bests where user_id=actor)
 select count(*),max(score) filter(where user_id=actor),count(*) filter(where score<(select score from own)),count(*) filter(where score=(select score from own)) into total,own_score,smaller,tied from bests;
 if not opted or own_score is null then return jsonb_build_object('participating',opted,'total',total);end if;
 return jsonb_build_object('participating',true,'total',total,'lower',smaller,'equal',tied,'rank',total-smaller-tied+1);
end $$;

-- The existing verified-admin path owns actor identity. Lock the target before
-- checking the first approval so concurrent requests cannot create duplicates.
-- A later suspension/reapproval is not a new signup approval. Existing history
-- remains untouched, with no invented retrospective approver or approval time.
do $patch$
declare definition text;anchor text:='  update public.gym_members set role=p->>''role'',status=p->>''status''';
begin
 definition:=pg_get_functiondef('public.onoff_commit(uuid,text,jsonb)'::regprocedure);
 if position(anchor in definition)=0 then raise exception 'Missing member approval anchor';end if;
 definition:=replace(definition,anchor,$replacement$
  perform 1 from public.gym_members where id=(p->>'id')::uuid for update;
  insert into public.gym_membership_events(user_id,action,body)
   select id,'signup-approve',jsonb_build_object('actor',actor,'actorName',(select name from public.gym_members where id=actor),'beforeStatus',status,'afterStatus','approved')
   from public.gym_members where id=(p->>'id')::uuid and status<>'approved' and approved_at is null and p->>'status'='approved';
  update public.gym_members set role=p->>'role',status=p->>'status'$replacement$);
 execute definition;
end $patch$;
-- Replacements retain the existing service-only grants; no new public RPCs.
