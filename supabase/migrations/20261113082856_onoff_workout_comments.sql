create table public.gym_workout_comments (
 id uuid primary key,
 workout_key text not null references public.gym_workouts(key) on delete cascade,
 author_id uuid not null references public.gym_members(id) on delete cascade,
 text text not null check(char_length(text) between 1 and 500 and text ~ '[^[:space:]]'),
 revision integer not null default 0 check(revision>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index gym_workout_comments_thread_idx on public.gym_workout_comments(workout_key,created_at desc,id desc);
create index gym_workout_comments_author_idx on public.gym_workout_comments(author_id);
alter table public.gym_workout_comments enable row level security;
revoke all on public.gym_workout_comments from public,anon,authenticated;
grant all on public.gym_workout_comments to service_role;
create policy server_only on public.gym_workout_comments for all to service_role using(true) with check(true);

create function public.onoff_workout_comments(actor uuid,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 m public.gym_members%rowtype; pass public.gym_memberships%rowtype; w public.gym_workouts%rowtype;
 prior public.gym_workout_comments%rowtype;
 action text:=coalesce(p->>'action','summary'); d date; program_name text:=p->>'program'; k text;
 day date:=(now() at time zone 'Asia/Seoul')::date;
 body_text text; comment_id uuid; expected_revision integer; total bigint;
 before_time timestamptz; before_id uuid; result_rows jsonb; more boolean;
begin
 select * into m from public.gym_members where id=actor for share;
 if not found or m.status<>'approved' or m.delete_requested_at is not null then
  raise exception '승인된 회원만 댓글을 이용할 수 있어요.' using errcode='42501';
 end if;
 if action not in('summary','list','create','update','delete') or program_name is null or program_name not in('B/T','WOD') then
  raise exception '댓글 요청을 확인해주세요.' using errcode='22023';
 end if;
 d:=(p->>'date')::date;
 if d is null or to_char(d,'YYYY-MM-DD') is distinct from p->>'date' then
  raise exception '수업 날짜를 확인해주세요.' using errcode='22023';
 end if;
 select * into pass from public.gym_memberships where user_id=actor for share;
 if found and m.role not in('admin','coach') and
  (pass.paused_at is not null or pass.start_date>day or pass.end_date<day or
   (pass.kind='visits' and pass.remaining_visits<=0 and not(pass.remaining_visits=0 and exists(
    select 1 from public.gym_attendance where user_id=actor and date=day and membership_id=pass.id)))) then
  raise exception '회원권 기간·잔여횟수 또는 휴회 상태를 확인해주세요.' using errcode='42501';
 end if;
 k:=d::text||'_'||program_name;
 select * into w from public.gym_workouts where key=k for share;
 if not found or coalesce(jsonb_array_length(w.body->'sections'),0)=0 or
  (w.release_at>now() and not public.onoff_can(actor,'workouts.read')) then
  raise exception '공개된 수업에서 댓글을 이용해주세요.' using errcode='P0002';
 end if;
 if action in('create','update') then
  if m.disclosure_consent is distinct from true then
   raise exception '개인설정에서 회원 간 공개에 동의한 뒤 작성해주세요.' using errcode='42501';
  end if;
  body_text:=btrim(coalesce(p->>'text',''));
  if char_length(body_text) not between 1 and 500 or body_text !~ '[^[:space:]]' then
   raise exception '댓글은 1~500자로 입력해주세요.' using errcode='22023';
  end if;
 end if;
 if action in('create','update','delete') then
  comment_id:=(p->>'id')::uuid;
  if comment_id is null then raise exception '댓글을 확인해주세요.' using errcode='22023';end if;
  select * into prior from public.gym_workout_comments where id=comment_id for update;
  if action='create' then
   if found then
    if prior.author_id<>actor or prior.workout_key<>k then raise exception '댓글 작성 권한이 없어요.' using errcode='42501';end if;
    if prior.text<>body_text then raise exception '댓글이 이미 등록됐어요. 새로고침 후 확인해주세요.' using errcode='40001';end if;
    return jsonb_build_object('ok',true,'id',prior.id);
   end if;
   -- Serialize retries per author; the unique comment ID makes retries idempotent.
   perform pg_advisory_xact_lock(hashtextextended('workout-comment:'||actor::text,0));
   insert into public.gym_workout_comments(id,workout_key,author_id,text) values(comment_id,k,actor,body_text)
    on conflict(id) do nothing;
   if not found then
    select * into prior from public.gym_workout_comments where id=comment_id;
    if prior.author_id<>actor or prior.workout_key<>k then raise exception '댓글 작성 권한이 없어요.' using errcode='42501';end if;
    if prior.text<>body_text then raise exception '댓글이 이미 등록됐어요. 새로고침 후 확인해주세요.' using errcode='40001';end if;
    return jsonb_build_object('ok',true,'id',prior.id);
   end if;
  else
   if not found or prior.workout_key<>k then raise exception '댓글을 찾을 수 없어요.' using errcode='P0002';end if;
   if prior.author_id<>actor and (action='update' or m.role<>'admin') then
    raise exception '본인 댓글만 수정·삭제할 수 있어요.' using errcode='42501';
   end if;
   expected_revision:=(p->>'revision')::integer;
   if expected_revision is null or expected_revision<>prior.revision then
    raise exception '다른 곳에서 댓글이 변경됐어요. 새로고침 후 확인해주세요.' using errcode='40001';
   end if;
   if action='update' then
    update public.gym_workout_comments set text=body_text,revision=revision+1,updated_at=now() where id=comment_id;
   else delete from public.gym_workout_comments where id=comment_id;
   end if;
  end if;
  insert into public.gym_settings(key,value) values('revision','1'::jsonb)
   on conflict(key) do update set value=to_jsonb(coalesce((public.gym_settings.value#>>'{}')::bigint,0)+1);
  return jsonb_build_object('ok',true,'id',comment_id);
 end if;
 select count(*) into total from public.gym_workout_comments c join public.gym_members a on a.id=c.author_id
 where c.workout_key=k and (m.role='admin' or c.author_id=actor or
  (a.status='approved' and a.disclosure_consent=true and a.delete_requested_at is null));
 if action='summary' then return jsonb_build_object('total',total);end if;
 if p ? 'before' then
  before_time:=(p->>'before')::timestamptz;before_id:=(p->>'beforeId')::uuid;
  if before_time is null or before_id is null then raise exception '댓글 페이지를 확인해주세요.' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(row_data order by created_at desc,id desc),'[]'::jsonb) into result_rows from (
  select c.created_at,c.id,jsonb_build_object('id',c.id,'authorId',c.author_id,'author',a.name,
   'avatarEmoji',prefs.body->>'avatarEmoji','text',c.text,'revision',c.revision,
   'createdAt',c.created_at,'updatedAt',c.updated_at,
   'canEdit',c.author_id=actor and m.disclosure_consent=true,'canDelete',c.author_id=actor or m.role='admin') as row_data
  from public.gym_workout_comments c join public.gym_members a on a.id=c.author_id
  left join public.gym_preferences prefs on prefs.user_id=c.author_id
  where c.workout_key=k and (m.role='admin' or c.author_id=actor or
   (a.status='approved' and a.disclosure_consent=true and a.delete_requested_at is null))
   and (before_time is null or (c.created_at,c.id)<(before_time,before_id))
  order by c.created_at desc,c.id desc limit 21
 ) page;
 more:=jsonb_array_length(result_rows)>20;
 if more then result_rows:=result_rows-20;end if;
 return jsonb_build_object('total',total,'items',result_rows,'next',case when more then
  jsonb_build_object('before',result_rows->19->>'createdAt','beforeId',result_rows->19->>'id') else null end);
end $$;
revoke all on function public.onoff_workout_comments(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.onoff_workout_comments(uuid,jsonb) to service_role;
