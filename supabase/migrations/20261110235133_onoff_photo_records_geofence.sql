-- Additive: legacy photo uploads and manual records remain intact.
create table public.gym_board_imports (
 photo_id uuid primary key references public.gym_photos(id) on delete cascade,
 rows jsonb not null default '[]'::jsonb check(jsonb_typeof(rows)='array' and jsonb_array_length(rows)<=150),
 status text not null check(status in ('draft','published','void')),
 revision integer not null default 1,
 updated_by uuid references public.gym_members(id) on delete set null,
 updated_at timestamptz not null default now()
);
create table public.gym_board_audit (
 id bigint generated always as identity primary key,
 photo_id uuid not null references public.gym_photos(id) on delete cascade,
 actor uuid references public.gym_members(id) on delete set null,
 before_state jsonb, after_state jsonb, created_at timestamptz not null default now()
);
create index gym_board_audit_photo_idx on public.gym_board_audit(photo_id,created_at desc);
create index gym_board_imports_participants_idx on public.gym_board_imports using gin(rows jsonb_path_ops) where status='published';
create index gym_board_imports_updated_idx on public.gym_board_imports(updated_at desc);
create table public.gym_board_aliases (
 alias text primary key check(char_length(alias) between 1 and 40),
 member_id uuid not null references public.gym_members(id) on delete cascade,
 confirmed_by uuid references public.gym_members(id) on delete set null
);
create index gym_board_aliases_member_idx on public.gym_board_aliases(member_id);
create table public.gym_board_ai_usage (
 actor uuid not null references public.gym_members(id) on delete cascade,
 day date not null, count integer not null, last_at timestamptz not null,
 primary key(actor,day)
);
create function public.onoff_board_commit(actor uuid,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare previous public.gym_board_imports%rowtype; saved public.gym_board_imports%rowtype;
 target uuid:=(p->>'photoId')::uuid; entry jsonb; person jsonb; a jsonb;
begin
 if not public.onoff_can(actor,'photos') then raise exception '권한 없음' using errcode='42501';end if;
 -- Lock the source even when no import exists, making first saves atomic too.
 perform 1 from public.gym_photos where id=target and kind='daily' and active and uploaded for update;
 if not found then raise exception '사진 없음' using errcode='23514';end if;
 select * into previous from public.gym_board_imports where photo_id=target for update;
 if coalesce(previous.revision,0)<>coalesce((p->>'revision')::integer,-1) then raise exception '다른 기기에서 변경됨' using errcode='40001';end if;
 if p->>'status' not in ('draft','published','void') or p->>'status' is null then raise exception '상태 오류' using errcode='23514';end if;
 if (p->>'status'='published' or previous.status='published') and not (public.onoff_can(actor,'records.create') and public.onoff_can(actor,'records.update')) then raise exception '기록 권한 없음' using errcode='42501';end if;
 if jsonb_typeof(p->'rows') is distinct from 'array' or jsonb_array_length(p->'rows')>150 then raise exception '기록 오류' using errcode='23514';end if;
 for entry in select value from jsonb_array_elements(p->'rows') loop
  if jsonb_typeof(entry->'participants') is distinct from 'array' or jsonb_array_length(entry->'participants') not between 1 and 6 then raise exception '팀 오류' using errcode='23514';end if;
  for person in select value from jsonb_array_elements(entry->'participants') loop
   if person->>'memberId' is not null and not exists(select 1 from public.gym_members where id=(person->>'memberId')::uuid and status='approved' and delete_requested_at is null) then raise exception '회원 오류' using errcode='23514';end if;
  end loop;
 end loop;
 for a in select value from jsonb_array_elements(coalesce(p->'aliases','[]'::jsonb)) loop
  if not exists(select 1 from public.gym_members where id=(a->>'memberId')::uuid and status='approved' and delete_requested_at is null) then raise exception '회원 오류' using errcode='23514';end if;
  if exists(select 1 from public.gym_board_aliases where alias=a->>'alias' and member_id<>(a->>'memberId')::uuid) then raise exception '별칭 중복' using errcode='23505';end if;
  insert into public.gym_board_aliases(alias,member_id,confirmed_by) values(a->>'alias',(a->>'memberId')::uuid,actor) on conflict(alias) do nothing;
 end loop;
 insert into public.gym_board_imports(photo_id,rows,status,updated_by) values(target,p->'rows',p->>'status',actor)
 on conflict(photo_id) do update set rows=excluded.rows,status=excluded.status,revision=gym_board_imports.revision+1,updated_by=actor,updated_at=now() returning * into saved;
 insert into public.gym_board_audit(photo_id,actor,before_state,after_state) values(target,actor,to_jsonb(previous),to_jsonb(saved));
 update public.gym_settings set value=to_jsonb(coalesce((value::text)::bigint,0)+1) where key='revision';
 return to_jsonb(saved);
end $$;
create function public.onoff_board_ai_claim(actor uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare d date:=(now() at time zone 'Asia/Seoul')::date; allowed boolean;
begin
 if not public.onoff_can(actor,'photos') then raise exception '권한 없음' using errcode='42501';end if;
 delete from public.gym_board_ai_usage where day<d-7;
 insert into public.gym_board_ai_usage values(actor,d,1,now()) on conflict on constraint gym_board_ai_usage_pkey do update set count=gym_board_ai_usage.count+1,last_at=now()
 where gym_board_ai_usage.count<30 and gym_board_ai_usage.last_at<now()-interval '20 seconds' returning true into allowed;
 return coalesce(allowed,false);
end $$;
create function public.onoff_attendance_override(actor uuid,target uuid,reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare output jsonb;operator_name text;
begin
 select name into operator_name from public.gym_members where id=actor and role='admin' and status='approved' and delete_requested_at is null for update;
 if not found or char_length(btrim(reason)) not between 2 and 200 then raise exception '권한 또는 사유 오류' using errcode='42501';end if;
 if not exists(select 1 from public.gym_members where id=target and status='approved' and delete_requested_at is null) then raise exception '회원 오류' using errcode='23514';end if;
 output:=public.onoff_commit(target,'attendance','{}'::jsonb);
 if coalesce((output->>'already')::boolean,false)=false then
 insert into public.gym_membership_events(user_id,action,body) values(target,'위치 확인 예외 출석',jsonb_build_object('reason',btrim(reason),'actorId',actor,'actorName',operator_name));
 end if;
 return output;
end $$;
alter table public.gym_board_imports enable row level security;
alter table public.gym_board_audit enable row level security;
alter table public.gym_board_aliases enable row level security;
alter table public.gym_board_ai_usage enable row level security;
revoke all on public.gym_board_imports,public.gym_board_audit,public.gym_board_aliases,public.gym_board_ai_usage from public,anon,authenticated;
grant all on public.gym_board_imports,public.gym_board_audit,public.gym_board_aliases,public.gym_board_ai_usage to service_role;
grant usage,select on sequence public.gym_board_audit_id_seq to service_role;
revoke all on function public.onoff_board_commit(uuid,jsonb),public.onoff_board_ai_claim(uuid),public.onoff_attendance_override(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.onoff_board_commit(uuid,jsonb),public.onoff_board_ai_claim(uuid),public.onoff_attendance_override(uuid,uuid,text) to service_role;

create index gym_board_imports_updated_by_idx on public.gym_board_imports(updated_by);
create index gym_board_audit_actor_idx on public.gym_board_audit(actor);
create index gym_board_aliases_confirmed_by_idx on public.gym_board_aliases(confirmed_by);
-- Withdrawn members are scrubbed from canonical records and historical copies.
create function public.onoff_board_forget_member() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.delete_requested_at is null or old.delete_requested_at is not null) then return new;end if;
 delete from public.gym_board_audit where before_state::text like '%'||old.id::text||'%' or after_state::text like '%'||old.id::text||'%';
 update public.gym_board_imports i set rows=(select jsonb_agg(jsonb_set(r.value,'{participants}',(select jsonb_agg(case when p.value->>'memberId'=old.id::text then jsonb_build_object('name','탈퇴 회원','memberId',null) else p.value end) from jsonb_array_elements(r.value->'participants') p))) from jsonb_array_elements(i.rows) r),revision=revision+1,updated_at=now()
 where rows @> jsonb_build_array(jsonb_build_object('participants',jsonb_build_array(jsonb_build_object('memberId',old.id))));
 delete from public.gym_board_aliases where member_id=old.id;
 if TG_OP='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.onoff_board_forget_member() from public,anon,authenticated;
grant execute on function public.onoff_board_forget_member() to service_role;
create trigger onoff_board_member_withdraw before delete or update of delete_requested_at on public.gym_members for each row execute function public.onoff_board_forget_member();

-- Confirmed gym address: 부산광역시 기장군 일광읍 화용길 157, 1층.
-- Address geocode: https://findby.co.kr/details/46046-267104220365-st-652b10b08c641f9e388dd41c
-- Preserve an existing operator configuration on repeat/import.
insert into public.gym_settings(key,value) values('recordTools','{"photoEnabled":true,"attendance":{"enabled":true,"latitude":35.2851377,"longitude":129.2170302,"radius":200}}'::jsonb) on conflict(key) do nothing;
create function public.onoff_board_alias_remove(actor uuid,source_photo uuid,label text,expected_member uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare previous public.gym_board_aliases%rowtype;
begin
 if not (public.onoff_can(actor,'photos') and public.onoff_can(actor,'records.update')) then raise exception '권한 없음' using errcode='42501';end if;
 perform 1 from public.gym_photos where id=source_photo and kind='daily' and active for share;
 if not found then raise exception '사진 없음' using errcode='23514';end if;
 delete from public.gym_board_aliases where alias=label and member_id=expected_member returning * into previous;
 if not found then raise exception '별칭 변경됨' using errcode='40001';end if;
 insert into public.gym_board_audit(photo_id,actor,before_state,after_state) values(source_photo,actor,to_jsonb(previous),jsonb_build_object('status','alias-removed','revision',0));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.onoff_board_alias_remove(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.onoff_board_alias_remove(uuid,uuid,text,uuid) to service_role;
