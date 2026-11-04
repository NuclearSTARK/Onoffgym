-- Named WOD catalogue/records are private to the verified Edge API.
create table public.gym_named_categories(id text primary key,label text not null check(char_length(label) between 1 and 40));
create unique index gym_named_category_label on public.gym_named_categories(lower(label));
create table public.gym_named_wods(id text primary key,name text not null check(char_length(name) between 1 and 80),description text not null default '' check(char_length(description)<=10000),category_id text not null references public.gym_named_categories(id),record_type text not null default 'time' check(record_type in ('time','rounds')),is_default boolean not null default false,active boolean not null default true,deleted boolean not null default false);
create unique index gym_named_wod_name on public.gym_named_wods(lower(name));
create index gym_named_category_idx on public.gym_named_wods(category_id);
create table public.gym_named_records(id uuid primary key,user_id uuid not null references public.gym_members(id) on delete cascade,wod_id text not null references public.gym_named_wods(id),date date not null,seconds integer,rounds integer,reps integer,note text not null default '' check(char_length(note)<=150),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(((seconds between 1 and 59999 and rounds is null and reps is null) or (seconds is null and rounds between 0 and 9999 and reps between 0 and 99999 and rounds+reps>0)) is true));
create index gym_named_records_owner on public.gym_named_records(user_id,wod_id,date desc);
create index gym_named_records_wod on public.gym_named_records(wod_id);
do $$declare t text;begin foreach t in array array['gym_named_categories','gym_named_wods','gym_named_records'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);execute format('create policy server_only on public.%I for all to service_role using(true) with check(true)',t);execute format('create trigger bump_revision after insert or update or delete on public.%I for each statement execute function public.onoff_bump_revision()',t);end loop;end $$;

create function public.onoff_named_snapshot(actor uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.gym_members where id=actor and status='approved') then raise exception '승인된 회원만 이용할 수 있어요.' using errcode='42501';end if;
 return jsonb_build_object('categories',coalesce((select jsonb_agg(jsonb_build_array(id,label) order by label) from public.gym_named_categories),'[]'),'catalogue',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'categoryId',category_id,'recordType',record_type,'isDefault',is_default,'active',active,'deleted',deleted) order by name) from public.gym_named_wods),'[]'),'records',coalesce((select jsonb_agg(to_jsonb(r) order by r.date desc,r.created_at desc) from public.gym_named_records r where user_id=actor),'[]'),'selection',(select body->'namedSelection' from public.gym_preferences where user_id=actor));
end $$;
create function public.onoff_named_mutate(actor uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
<<named>>
declare m public.gym_members%rowtype;act text:=p->>'action';item public.gym_named_wods%rowtype;old_record public.gym_named_records%rowtype;target text:=p->>'id';record_id uuid;ids jsonb;id_count integer;
begin
 select * into m from public.gym_members where id=actor and status='approved' for update;
 if not found then raise exception '승인된 회원만 이용할 수 있어요.' using errcode='42501';end if;
 if act in ('catalogue','catalogue-delete','category','category-delete') then
  if m.role<>'admin' then raise exception '운영자 권한이 필요해요.' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('onoff-named-catalogue',0));
 end if;
 if act='catalogue' then
  if coalesce(char_length(btrim(p->>'name')),0) not between 1 and 80 or coalesce(char_length(p->>'description'),0)>10000 or p->>'recordType' not in ('time','rounds') or jsonb_typeof(p->'isDefault') is distinct from 'boolean' or jsonb_typeof(p->'active') is distinct from 'boolean' then raise exception '종목 설정을 확인해주세요.';end if;
  if not exists(select 1 from public.gym_named_categories where id=p->>'categoryId') then raise exception '분류를 확인해주세요.';end if;
  if target is not null then
   select * into item from public.gym_named_wods where id=target and not deleted for update;
   if not found then raise exception '종목을 찾을 수 없어요.';end if;
   if item.record_type<>p->>'recordType' and exists(select 1 from public.gym_named_records where wod_id=target) then raise exception '기록이 있는 종목의 기록 방식은 변경할 수 없어요.';end if;
  else target:='custom-'||gen_random_uuid()::text;end if;
  insert into public.gym_named_wods(id,name,description,category_id,record_type,is_default,active) values(target,btrim(p->>'name'),coalesce(p->>'description',''),p->>'categoryId',p->>'recordType',(p->>'isDefault')::boolean and (p->>'active')::boolean,(p->>'active')::boolean) on conflict(id) do update set name=excluded.name,description=excluded.description,category_id=excluded.category_id,record_type=excluded.record_type,is_default=excluded.is_default,active=excluded.active;
 elsif act='catalogue-delete' then
  update public.gym_named_wods set deleted=true,active=false,is_default=false where id=target and not deleted;
  if not found then raise exception '종목을 찾을 수 없어요.';end if;
 elsif act='category' then
  if coalesce(char_length(btrim(p->>'label')),0) not between 1 and 40 then raise exception '분류 이름을 확인해주세요.';end if;
  if target is null then target:='category-'||gen_random_uuid()::text;insert into public.gym_named_categories values(target,btrim(p->>'label'));
  else update public.gym_named_categories set label=btrim(p->>'label') where id=target;if not found then raise exception '분류를 찾을 수 없어요.';end if;end if;
 elsif act='category-delete' then
  if target=p->>'targetId' or not exists(select 1 from public.gym_named_categories where id=p->>'targetId') then raise exception '옮길 분류를 선택해주세요.';end if;
  update public.gym_named_wods set category_id=p->>'targetId' where category_id=target;delete from public.gym_named_categories where id=target;
  if not found then raise exception '분류를 찾을 수 없어요.';end if;
 elsif act='selection' then
  ids:=p->'ids';if jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids)>250 then raise exception '종목 선택을 확인해주세요.';end if;
  if exists(select 1 from jsonb_array_elements_text(ids) x where not exists(select 1 from public.gym_named_wods w where w.id=x and w.active and not w.deleted)) then raise exception '선택할 수 없는 종목이에요.';end if;
  insert into public.gym_preferences(user_id,body) values(actor,jsonb_build_object('namedSelection',ids)) on conflict(user_id) do update set body=public.gym_preferences.body||excluded.body;
 elsif act in ('record','record-delete') then
  record_id:=(p->>'id')::uuid;perform pg_advisory_xact_lock(hashtextextended('named-record:'||record_id::text,0));select * into old_record from public.gym_named_records where id=record_id for update;
  if found and old_record.user_id<>actor then raise exception '본인 기록만 수정할 수 있어요.' using errcode='42501';end if;
  if act='record-delete' then
   delete from public.gym_named_records where id=record_id and user_id=actor;if not found then raise exception '본인 기록만 삭제할 수 있어요.' using errcode='42501';end if;
  else
   if record_id is null or p->>'date' is null or (p->>'date')::date>(now() at time zone 'Asia/Seoul')::date or coalesce(char_length(p->>'note'),0)>150 then raise exception '기록 날짜와 메모를 확인해주세요.';end if;
   select * into item from public.gym_named_wods where id=p->>'wodId' for update;
   if not found or (old_record.id is null and (not item.active or item.deleted)) then raise exception '기록할 수 없는 종목이에요.';end if;
   if old_record.id is not null and old_record.wod_id<>item.id then raise exception '기록 종목을 변경할 수 없어요.';end if;
   if item.record_type='time' then
    if (p->>'seconds')::integer not between 1 and 59999 or p->>'seconds' is null then raise exception '시간을 확인해주세요.';end if;
    insert into public.gym_named_records(id,user_id,wod_id,date,seconds,note) values(record_id,actor,item.id,(p->>'date')::date,(p->>'seconds')::integer,coalesce(p->>'note','')) on conflict(id) do update set date=excluded.date,seconds=excluded.seconds,note=excluded.note,updated_at=now();
   else
    if p->>'rounds' is null or p->>'reps' is null or (p->>'rounds')::integer not between 0 and 9999 or (p->>'reps')::integer not between 0 and 99999 or (p->>'rounds')::integer+(p->>'reps')::integer=0 then raise exception '라운드와 횟수를 확인해주세요.';end if;
    insert into public.gym_named_records(id,user_id,wod_id,date,rounds,reps,note) values(record_id,actor,item.id,(p->>'date')::date,(p->>'rounds')::integer,(p->>'reps')::integer,coalesce(p->>'note','')) on conflict(id) do update set date=excluded.date,rounds=excluded.rounds,reps=excluded.reps,note=excluded.note,updated_at=now();
   end if;
   if old_record.id is null then
    select body->'namedSelection' into ids from public.gym_preferences where user_id=actor;
    if jsonb_typeof(ids) is distinct from 'array' then select coalesce(jsonb_agg(id),'[]') into ids from public.gym_named_wods where active and not deleted and is_default;end if;
    if not ids ? item.id then ids:=ids||jsonb_build_array(item.id);end if;
    insert into public.gym_preferences(user_id,body) values(actor,jsonb_build_object('namedSelection',ids)) on conflict(user_id) do update set body=public.gym_preferences.body||excluded.body;
   end if;
  end if;
 else raise exception '요청을 확인해주세요.';end if;
 return jsonb_build_object('ok',true,'id',target);
end $$;
revoke all on function public.onoff_named_snapshot(uuid),public.onoff_named_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.onoff_named_snapshot(uuid),public.onoff_named_mutate(uuid,jsonb) to service_role;

-- Return only aggregate relative-position counts, never another member's rows.
create function public.onoff_rm_comparison(actor uuid,movement_id text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare movement jsonb;own_best numeric;total integer;smaller integer;tied integer;opted boolean;
begin
 if not exists(select 1 from public.gym_members where id=actor and status='approved') then raise exception '승인된 회원만 이용할 수 있어요.' using errcode='42501';end if;
 select x into movement from public.gym_settings s cross join lateral jsonb_array_elements(s.value) x where s.key='rmCatalogue' and x->>'id'=movement_id;
 if movement is null then raise exception '종목을 찾을 수 없어요.';end if;
 select coalesce((body->>'rank')::boolean,true) into opted from public.gym_preferences where user_id=actor;opted:=coalesce(opted,true) and coalesce((select disclosure_consent from public.gym_members where id=actor),false);
 with bests as (
  select r.user_id,max((r.body->>'lbs')::numeric) as lbs from public.gym_rms r join public.gym_members m on m.id=r.user_id and m.status='approved' and m.disclosure_consent left join public.gym_preferences p on p.user_id=m.id
  where coalesce((p.body->>'rank')::boolean,true) and jsonb_typeof(r.body->'lbs')='number' and (r.body->>'lbs')::numeric>0 and (r.body->>'movementId'=movement_id or ((r.body->>'movementId') is null and (lower(r.body->>'movement')=lower(movement->>'name') or exists(select 1 from jsonb_array_elements_text(coalesce(movement->'aliases','[]')) a where lower(a)=lower(r.body->>'movement'))))) group by r.user_id
 ) select max(lbs) filter(where user_id=actor),count(*) into own_best,total from bests;
 if own_best is null or not opted then return jsonb_build_object('participating',opted,'total',total,'ownBest',null);end if;
 with bests as (
  select r.user_id,max((r.body->>'lbs')::numeric) as lbs from public.gym_rms r join public.gym_members m on m.id=r.user_id and m.status='approved' and m.disclosure_consent left join public.gym_preferences p on p.user_id=m.id
  where coalesce((p.body->>'rank')::boolean,true) and jsonb_typeof(r.body->'lbs')='number' and (r.body->>'lbs')::numeric>0 and (r.body->>'movementId'=movement_id or ((r.body->>'movementId') is null and (lower(r.body->>'movement')=lower(movement->>'name') or exists(select 1 from jsonb_array_elements_text(coalesce(movement->'aliases','[]')) a where lower(a)=lower(r.body->>'movement'))))) group by r.user_id
 ) select count(*) filter(where lbs<own_best),count(*) filter(where lbs=own_best) into smaller,tied from bests;
 return jsonb_build_object('participating',true,'total',total,'lower',smaller,'equal',tied,'ownBest',own_best);
end $$;
revoke all on function public.onoff_rm_comparison(uuid,text) from public,anon,authenticated;grant execute on function public.onoff_rm_comparison(uuid,text) to service_role;

-- User-reviewed public workout names/content/categories; ten initial defaults.
insert into public.gym_named_categories(id,label) values('weights','웨이트');
insert into public.gym_named_categories(id,label) values('cardio','유산소');
insert into public.gym_named_categories(id,label) values('gymnastics','짐네스틱');
insert into public.gym_named_categories(id,label) values('mixed','혼합');
insert into public.gym_named_wods(id,name,description,category_id,record_type,is_default) select x->>'id',x->>'name',x->>'description',x->>'categoryId',x->>'recordType',(x->>'isDefault')::boolean from jsonb_array_elements($catalogue$[{"name": "DT", "description": "5 rounds for time:\n12 Deadlifts (70/47.5kg)\n9 Hang Power Cleans (70/47.5kg)\n6 Push Jerks (70/47.5kg)", "categoryId": "weights", "isDefault": true, "id": "nw-dt", "recordType": "time"}, {"name": "Grace", "description": "30 Clean & Jerks for time (60/42.5kg)", "categoryId": "weights", "isDefault": true, "id": "nw-grace", "recordType": "time"}, {"name": "Isabel", "description": "30 Snatches for time (60/42.5kg)", "categoryId": "weights", "isDefault": true, "id": "nw-isabel", "recordType": "time"}, {"name": "Jack", "description": "AMRAP 20min:\n10 Push Press (52.5/35kg)\n10 Kettlebell Swings (32/24kg)\n10 Box Jumps (24/20 inch)", "categoryId": "weights", "isDefault": false, "id": "nw-jack", "recordType": "rounds"}, {"name": "Josh", "description": "21-15-9 reps for time:\nOverhead Squats (60/42.5kg)\nLeaning Rest", "categoryId": "weights", "isDefault": false, "id": "nw-josh", "recordType": "time"}, {"name": "Karen", "description": "150 Wall Balls for time (9/6kg)", "categoryId": "weights", "isDefault": false, "id": "nw-karen", "recordType": "time"}, {"name": "Linda", "description": "10-9-8-7-6-5-4-3-2-1 reps for time:\nDeadlift (1.5 BW)\nBench Press (BW)\nClean (0.75 BW)", "categoryId": "weights", "isDefault": false, "id": "nw-linda", "recordType": "time"}, {"name": "Randy", "description": "75 Power Snatches for time (35/25kg)", "categoryId": "weights", "isDefault": false, "id": "nw-randy", "recordType": "time"}, {"name": "Wittman", "description": "7 rounds for time:\n15 Kettlebell Swings (32/24kg)\n15 Power Cleans (52.5/35kg)\n15 Box Jumps (24/20 inch)", "categoryId": "weights", "isDefault": false, "id": "nw-wittman", "recordType": "time"}, {"name": "Griff", "description": "For time:\n800m Run forward\n400m Run backward\n800m Run forward\n400m Run backward", "categoryId": "cardio", "isDefault": false, "id": "nw-griff", "recordType": "time"}, {"name": "Abbate", "description": "AMRAP 20min:\n15 GHD Sit-ups\n15 Hip Extensions\n1 Rope Climb", "categoryId": "gymnastics", "isDefault": false, "id": "nw-abbate", "recordType": "rounds"}, {"name": "Barbara", "description": "5 rounds for time (3min rest between rounds):\n20 Pull-ups\n30 Push-ups\n40 Sit-ups\n50 Air Squats", "categoryId": "gymnastics", "isDefault": false, "id": "nw-barbara", "recordType": "time"}, {"name": "Candy", "description": "For time:\n100 Pull-ups\n100 Push-ups\n100 Sit-ups\n100 Air Squats", "categoryId": "gymnastics", "isDefault": false, "id": "nw-candy", "recordType": "time"}, {"name": "Chelsea", "description": "EMOM 30min:\n5 Pull-ups\n10 Push-ups\n15 Air Squats", "categoryId": "gymnastics", "isDefault": false, "id": "nw-chelsea", "recordType": "rounds"}, {"name": "Cindy", "description": "AMRAP 20min:\n5 Pull-ups\n10 Push-ups\n15 Air Squats", "categoryId": "gymnastics", "isDefault": true, "id": "nw-cindy", "recordType": "rounds"}, {"name": "JT", "description": "21-15-9 reps for time:\nHandstand Push-ups\nRing Dips\nPush-ups", "categoryId": "gymnastics", "isDefault": false, "id": "nw-jt", "recordType": "time"}, {"name": "Mary", "description": "AMRAP 20min:\n5 Handstand Push-ups\n10 Pistols\n15 Pull-ups", "categoryId": "gymnastics", "isDefault": false, "id": "nw-mary", "recordType": "rounds"}, {"name": "Ryan", "description": "5 rounds for time:\n7 Muscle-ups\n21 Burpees", "categoryId": "gymnastics", "isDefault": false, "id": "nw-ryan", "recordType": "time"}, {"name": "Santora", "description": "For time:\n4 rounds:\n10 Muscle-ups\n15 Burpees\nThen:\n100 Pull-ups\n400m Run", "categoryId": "gymnastics", "isDefault": false, "id": "nw-santora", "recordType": "time"}, {"name": "Amanda", "description": "9-7-5 reps for time:\nMuscle-ups\nSnatches (60/42.5kg)", "categoryId": "mixed", "isDefault": false, "id": "nw-amanda", "recordType": "time"}, {"name": "Annie", "description": "50-40-30-20-10 reps for time:\nDouble-Unders\nSit-ups", "categoryId": "mixed", "isDefault": true, "id": "nw-annie", "recordType": "time"}, {"name": "Arnie", "description": "21-15-9 reps for time:\nClean (60/42.5kg)\nRing Dip", "categoryId": "mixed", "isDefault": false, "id": "nw-arnie", "recordType": "time"}, {"name": "Badger", "description": "3 rounds for time:\n30 Squat Cleans (42.5/30kg)\n30 Pull-ups\n800m Run", "categoryId": "mixed", "isDefault": false, "id": "nw-badger", "recordType": "time"}, {"name": "Blake", "description": "4 rounds for time:\n100ft Walking Lunge\n25 Pull-ups\n50 Box Jumps (24/20 inch)\n25 Ring Dips\n50 Knees-to-Elbows\n25 Deadlifts (60/42.5kg)\n50 Push-ups", "categoryId": "mixed", "isDefault": false, "id": "nw-blake", "recordType": "time"}, {"name": "Bull", "description": "AMRAP 20min:\n5 Handstand Push-ups\n10 Deadlifts (102.5/70kg)\n15 Pull-ups", "categoryId": "mixed", "isDefault": false, "id": "nw-bull", "recordType": "rounds"}, {"name": "Capoot", "description": "3 rounds for time:\n1000m Row\n50 Burpees\n50 Box Jumps (24/20 inch)", "categoryId": "mixed", "isDefault": false, "id": "nw-capoot", "recordType": "time"}, {"name": "Daniel", "description": "For time:\n50 Pull-ups\n400m Run\n21 Thrusters (42.5/30kg)\n800m Run\n21 Thrusters\n400m Run\n50 Pull-ups", "categoryId": "mixed", "isDefault": false, "id": "nw-daniel", "recordType": "time"}, {"name": "Diane", "description": "21-15-9 reps for time:\nDeadlift (102.5/70kg)\nHandstand Push-ups", "categoryId": "mixed", "isDefault": true, "id": "nw-diane", "recordType": "time"}, {"name": "Elizabeth", "description": "21-15-9 reps for time:\nCleans (60/42.5kg)\nRing Dips", "categoryId": "mixed", "isDefault": true, "id": "nw-elizabeth", "recordType": "time"}, {"name": "Eva", "description": "5 rounds for time:\n800m Run\n30 Kettlebell Swings (32/24kg)\n30 Pull-ups", "categoryId": "mixed", "isDefault": false, "id": "nw-eva", "recordType": "time"}, {"name": "Fran", "description": "21-15-9 reps for time:\nThrusters (42.5/30kg)\nPull-ups", "categoryId": "mixed", "isDefault": true, "id": "nw-fran", "recordType": "time"}, {"name": "Gator", "description": "5 rounds for time:\n20 Deadlifts (102.5/70kg)\n20 Box Jumps (24/20 inch)\n20 Pull-ups", "categoryId": "mixed", "isDefault": false, "id": "nw-gator", "recordType": "time"}, {"name": "Glen", "description": "For time:\n30 Clean & Jerks (60/42.5kg)\n1 mile Run\n10 rounds of 3 Weighted Pull-ups (16/8kg), 5 Push-ups, 7 Air Squats\n1 mile Run\n100 Burpees", "categoryId": "mixed", "isDefault": false, "id": "nw-glen", "recordType": "time"}, {"name": "Hawk", "description": "5 rounds for time:\n5 Muscle-ups\n10 Handstand Push-ups\n15 Hang Power Cleans (60/42.5kg)", "categoryId": "mixed", "isDefault": false, "id": "nw-hawk", "recordType": "time"}, {"name": "Helen", "description": "3 rounds for time:\n400m Run\n21 Kettlebell Swings (24/16kg)\n12 Pull-ups", "categoryId": "mixed", "isDefault": true, "id": "nw-helen", "recordType": "time"}, {"name": "Holleyman", "description": "30 rounds for time:\n5 Wall Balls (9/6kg)\n3 Handstand Push-ups\n1 Power Clean (102.5/70kg)", "categoryId": "mixed", "isDefault": false, "id": "nw-holleyman", "recordType": "time"}, {"name": "Jackie", "description": "For time:\n1000m Row\n50 Thrusters (20/15kg)\n30 Pull-ups", "categoryId": "mixed", "isDefault": false, "id": "nw-jackie", "recordType": "time"}, {"name": "Joshie", "description": "For time:\n21-15-9 reps:\nFront Squat (70/47.5kg)\nBurpee", "categoryId": "mixed", "isDefault": false, "id": "nw-joshie", "recordType": "time"}, {"name": "Kelly", "description": "5 rounds for time:\n400m Run\n30 Box Jumps (24/20 inch)\n30 Wall Balls (9/6kg)", "categoryId": "mixed", "isDefault": false, "id": "nw-kelly", "recordType": "time"}, {"name": "Klepto", "description": "5 rounds for time:\n10 Handstand Push-ups\n15 Deadlifts (70/47.5kg)\n20 Pull-ups\n25 Box Jumps (24/20 inch)\n30 Double-Unders", "categoryId": "mixed", "isDefault": false, "id": "nw-klepto", "recordType": "time"}, {"name": "Loredo", "description": "6 rounds for time:\n24 Air Squats\n24 Push-ups\n24 Walking Lunges\n400m Run", "categoryId": "mixed", "isDefault": false, "id": "nw-loredo", "recordType": "time"}, {"name": "Luce", "description": "AMRAP 30min:\n400m Run\n30 Box Jumps (24/20 inch)\n30 Wall Balls (9/6kg)", "categoryId": "mixed", "isDefault": false, "id": "nw-luce", "recordType": "rounds"}, {"name": "McGhee", "description": "AMRAP 30min:\n5 Deadlifts (152.5/102.5kg)\n13 Push-ups\n9 Box Jumps (24/20 inch)", "categoryId": "mixed", "isDefault": false, "id": "nw-mcghee", "recordType": "rounds"}, {"name": "Michael", "description": "3 rounds for time:\n800m Run\n50 Back Extensions\n50 Sit-ups", "categoryId": "mixed", "isDefault": false, "id": "nw-michael", "recordType": "time"}, {"name": "Murph", "description": "For time:\n1 mile Run\n100 Pull-ups\n200 Push-ups\n300 Air Squats\n1 mile Run\n(Partition as needed. With 20lb vest/body armor)", "categoryId": "mixed", "isDefault": true, "id": "nw-murph", "recordType": "time"}, {"name": "Nancy", "description": "5 rounds for time:\n400m Run\n15 Overhead Squats (42.5/30kg)", "categoryId": "mixed", "isDefault": false, "id": "nw-nancy", "recordType": "time"}, {"name": "Nate", "description": "AMRAP 20min:\n2 Muscle-ups\n4 Handstand Push-ups\n8 Kettlebell Swings (32/24kg)", "categoryId": "mixed", "isDefault": false, "id": "nw-nate", "recordType": "rounds"}, {"name": "Nick", "description": "For time:\n1000m Row\n20 One-legged Squats\n20 L-pull-ups", "categoryId": "mixed", "isDefault": false, "id": "nw-nick", "recordType": "time"}, {"name": "Nicole", "description": "AMRAP 20min:\n400m Run\nMax Pull-ups", "categoryId": "mixed", "isDefault": false, "id": "nw-nicole", "recordType": "rounds"}, {"name": "Rankel", "description": "20min AMRAP:\n6 Deadlifts (102.5/70kg)\n7 Burpee Pull-ups\n10 Kettlebell Swings (32/24kg)\n200m Run", "categoryId": "mixed", "isDefault": false, "id": "nw-rankel", "recordType": "rounds"}, {"name": "Severin", "description": "5 rounds for time:\n9 Muscle-ups\n15 Deadlifts (102.5/70kg)\n21 Box Jumps (24/20 inch)", "categoryId": "mixed", "isDefault": false, "id": "nw-severin", "recordType": "time"}, {"name": "Spehar", "description": "10 rounds for time:\n10 Deadlifts (70/47.5kg)\n10 Pull-ups\n200m Run", "categoryId": "mixed", "isDefault": false, "id": "nw-spehar", "recordType": "time"}, {"name": "Tom", "description": "4 rounds for time:\n10 Handstand Push-ups\n15 Deadlifts (102.5/70kg)\n20 Box Jumps (24/20 inch)\n25 Pull-ups\n50 Double-Unders", "categoryId": "mixed", "isDefault": false, "id": "nw-tom", "recordType": "time"}, {"name": "Whitten", "description": "5 rounds for time:\n22 Kettlebell Swings (32/24kg)\n22 Box Jumps (24/20 inch)\n400m Run\n22 Burpees\n22 Wall Balls (9/6kg)", "categoryId": "mixed", "isDefault": false, "id": "nw-whitten", "recordType": "time"}]$catalogue$::jsonb) x;

-- Retention/approval metadata does not enroll existing approved accounts in cleanup.
alter table public.gym_members add column age_over_14 boolean not null default false;
alter table public.gym_members add column disclosure_consent boolean not null default false;
alter table public.gym_members add column approved_at timestamptz;
alter table public.gym_members add column rejected_at timestamptz;
alter table public.gym_members add column delete_requested_at timestamptz;
update public.gym_members set approved_at=created_at where status<>'pending';
create function public.onoff_member_policy_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.delete_requested_at is not null and new.status<>'suspended' then raise exception '삭제 처리 중인 계정입니다.' using errcode='42501';end if;
 if new.status='approved' and old.status is distinct from 'approved' then
  if not new.age_over_14 or new.privacy_version is distinct from 'privacy-2026-11-04' then raise exception '회원의 만 14세 이상 확인과 개인정보 안내 동의가 필요합니다.' using errcode='23514';end if;
  new.approved_at:=coalesce(old.approved_at,now());new.rejected_at:=null;
 elsif old.status='pending' and new.status='suspended' and old.approved_at is null and new.delete_requested_at is null then new.rejected_at:=coalesce(old.rejected_at,now());end if;
 return new;
end $$;
revoke all on function public.onoff_member_policy_guard() from public,anon,authenticated;
create trigger member_policy_guard before update on public.gym_members for each row execute function public.onoff_member_policy_guard();
create table public.gym_privacy_acceptances(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.gym_members(id) on delete cascade,version text not null,accepted_at timestamptz not null default now(),age_over_14 boolean not null,disclosure boolean not null,unique(user_id,version));
create index gym_privacy_acceptances_user on public.gym_privacy_acceptances(user_id);
alter table public.gym_privacy_acceptances enable row level security;revoke all on public.gym_privacy_acceptances from public,anon,authenticated;grant all on public.gym_privacy_acceptances to service_role;create policy server_only on public.gym_privacy_acceptances for all to service_role using(true) with check(true);
create function public.onoff_privacy_accept(actor uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p->>'version' is distinct from 'privacy-2026-11-04' or p->>'ageOver14' is distinct from 'true' or jsonb_typeof(p->'disclosure') is distinct from 'boolean' then raise exception '만 14세 이상 확인과 개인정보 안내 동의가 필요합니다.' using errcode='23514';end if;
 perform 1 from public.gym_members where id=actor and delete_requested_at is null for update;if not found then raise exception '계정을 확인해주세요.' using errcode='42501';end if;
 update public.gym_members set age_over_14=true,disclosure_consent=(p->>'disclosure')::boolean,privacy_consent_at=now(),privacy_version='privacy-2026-11-04' where id=actor;
 insert into public.gym_privacy_acceptances(user_id,version,age_over_14,disclosure) values(actor,'privacy-2026-11-04',true,(p->>'disclosure')::boolean) on conflict(user_id,version) do update set accepted_at=now(),disclosure=excluded.disclosure;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.onoff_privacy_accept(uuid,jsonb) from public,anon,authenticated;grant execute on function public.onoff_privacy_accept(uuid,jsonb) to service_role;
-- Keep legacy clients pending; the server requires age/current consent before approval.
create or replace function onoff_private.handle_member_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare member_name text:=btrim(new.raw_user_meta_data->>'full_name');current_policy boolean:=new.raw_user_meta_data->>'privacy_version'='privacy-2026-11-04';
begin
 if coalesce(new.is_anonymous,false) or new.email is null then return new;end if;
 if current_policy and (new.raw_user_meta_data->>'age_over_14' is distinct from 'true' or new.raw_user_meta_data->>'privacy_consent' is distinct from 'true' or jsonb_typeof(new.raw_user_meta_data->'disclosure_consent') is distinct from 'boolean') then raise exception '만 14세 이상 확인과 개인정보 안내 동의가 필요합니다.';end if;
 if member_name is null or char_length(member_name) not between 2 and 30 then member_name:='온오프 회원';end if;
 insert into public.gym_members(id,name,privacy_consent_at,privacy_version,age_over_14,disclosure_consent) values(new.id,member_name,case when new.raw_user_meta_data->>'privacy_consent'='true' then now() end,case when current_policy then 'privacy-2026-11-04' when new.raw_user_meta_data->>'privacy_consent'='true' then 'email-signup-v1' end,coalesce(current_policy,false),coalesce(current_policy,false) and coalesce((new.raw_user_meta_data->>'disclosure_consent')::boolean,false)) on conflict(id) do nothing;
 if current_policy then insert into public.gym_privacy_acceptances(user_id,version,age_over_14,disclosure) values(new.id,'privacy-2026-11-04',true,coalesce((new.raw_user_meta_data->>'disclosure_consent')::boolean,false)) on conflict do nothing;end if;
 insert into public.gym_push_jobs(id,kind,subject_id,payload) values('approval:'||new.id::text,'approvals',new.id,jsonb_build_object('signupEvent',true,'title','새 회원 가입 신청','body',member_name||'님이 가입을 신청했어요.','url','/Onoffgym/#admin/members','tag','approval:'||new.id::text)) on conflict do nothing;
 return new;
end $$;
revoke all on function onoff_private.handle_member_signup() from public,anon,authenticated;

-- Administrative deletion is a deliberate, retryable two-phase operation. No
-- account is deleted by this migration, a timer, or a client-selected expiry.
create table public.gym_account_deletions(id uuid primary key,actor_id uuid references public.gym_members(id) on delete set null,target_id uuid not null,created_at timestamptz not null default now(),completed_at timestamptz);
create index gym_account_deletions_actor on public.gym_account_deletions(actor_id);
create index gym_account_deletions_created on public.gym_account_deletions(created_at);
alter table public.gym_account_deletions enable row level security;revoke all on public.gym_account_deletions from public,anon,authenticated;grant all on public.gym_account_deletions to service_role;create policy server_only on public.gym_account_deletions for all to service_role using(true) with check(true);
create function public.onoff_account_delete_prepare(actor uuid,target uuid,request_id uuid,confirmed_name text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare member public.gym_members%rowtype;prior public.gym_account_deletions%rowtype;
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('onoff-point-state',0));
 perform pg_advisory_xact_lock(hashtextextended('account-delete:'||target::text,0));
 perform 1 from public.gym_members where id in(actor,target) order by id for update;
 if actor=target or not exists(select 1 from public.gym_members where id=actor and status='approved' and role='admin') then raise exception '다른 회원의 계정은 운영자만 삭제할 수 있어요.' using errcode='42501';end if;
 select * into prior from public.gym_account_deletions where id=request_id;
 if found then
  if prior.actor_id is distinct from actor or prior.target_id<>target then raise exception '삭제 요청을 확인해주세요.' using errcode='42501';end if;
  if prior.completed_at is not null then return jsonb_build_object('ok',true,'already',true,'paths','[]'::jsonb);end if;
 end if;
 select * into member from public.gym_members where id=target;
 if not found then
  if prior.id is null then raise exception '계정을 찾을 수 없어요.';end if;
  return jsonb_build_object('ok',true,'already',true,'paths','[]'::jsonb);
 end if;
 if member.name is distinct from confirmed_name then raise exception '삭제할 회원 이름을 정확히 입력해주세요.';end if;
 update public.gym_members set status='suspended',delete_requested_at=coalesce(delete_requested_at,now()) where id=target;
 delete from public.gym_push_subscriptions where user_id=target;
 insert into public.gym_account_deletions(id,actor_id,target_id) values(request_id,actor,target) on conflict(id) do nothing;
 return jsonb_build_object('ok',true,'paths',coalesce((select jsonb_agg(path) from public.gym_photos where owner_id=target),'[]'));
end $$;
create function public.onoff_account_delete_complete(actor uuid,target uuid,request_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.gym_members where id=actor and status='approved' and role='admin') or exists(select 1 from public.gym_members where id=target) then raise exception '계정 삭제 완료를 확인하지 못했어요.' using errcode='42501';end if;
 update public.gym_account_deletions set completed_at=coalesce(completed_at,now()) where id=request_id and actor_id=actor and target_id=target;
 if not found then raise exception '삭제 요청을 확인해주세요.' using errcode='42501';end if;
 return jsonb_build_object('ok',true,'deleted',true);
end $$;
revoke all on function public.onoff_account_delete_prepare(uuid,uuid,uuid,text),public.onoff_account_delete_complete(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.onoff_account_delete_prepare(uuid,uuid,uuid,text),public.onoff_account_delete_complete(uuid,uuid,uuid) to service_role;

create function public.onoff_remove_member_photos() returns trigger language plpgsql security invoker set search_path='' as $$begin delete from public.gym_photos where owner_id=old.id;return old;end $$;
revoke all on function public.onoff_remove_member_photos() from public,anon,authenticated;
create trigger remove_member_photos before delete on public.gym_members for each row execute function public.onoff_remove_member_photos();

-- A small, service-only result replaces full bootstrap reloads after comments/joins.
create or replace function public.onoff_post_snapshot(post_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $snap$
 select to_jsonb(p)||jsonb_build_object(
  'authorId',p.author_id,'author',coalesce(m.name,'회원'),'date',to_char(p.created_at at time zone 'Asia/Seoul','YYYY-MM-DD'),
  'joinedIds',coalesce((select jsonb_agg(j.user_id order by j.user_id) from public.gym_post_joins j join public.gym_members sharing on sharing.id=j.user_id and sharing.disclosure_consent where j.post_id=p.id),'[]'::jsonb),
  'joinedNames',coalesce((select jsonb_object_agg(j.user_id::text,coalesce(u.name,'회원')) from public.gym_post_joins j join public.gym_members u on u.id=j.user_id and u.disclosure_consent where j.post_id=p.id),'{}'::jsonb),
  'comments',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('authorId',c.author_id,'author',coalesce(u.name,'회원')) order by c.created_at,c.id) from public.gym_comments c join public.gym_members u on u.id=c.author_id and u.disclosure_consent where c.post_id=p.id),'[]'::jsonb)
 ) from public.gym_posts p left join public.gym_members m on m.id=p.author_id where p.id=post_id;
$snap$;
revoke all on function public.onoff_post_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.onoff_post_snapshot(uuid) to service_role;

-- Keep completed deletion audit metadata for 30 days, then prune daily. This
-- job never deletes member accounts, point accounts, coupons, or open retries.
select cron.schedule('onoff-account-delete-audit-retention','0 15 * * *',$retention$
 delete from public.gym_account_deletions where completed_at<now()-interval '30 days';
$retention$);
