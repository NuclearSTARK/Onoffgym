-- All point and coupon state is private to the verified Edge API.
create table public.gym_point_config(singleton boolean primary key default true check(singleton),enabled boolean not null default false,attendance_points integer not null default 0 check(attendance_points between 0 and 1000000),record_points integer not null default 0 check(record_points between 0 and 1000000),pin_hash text,updated_at timestamptz not null default now());
insert into public.gym_point_config(singleton) values(true);
create table public.gym_point_accounts(user_id uuid primary key references public.gym_members(id) on delete cascade,balance bigint not null default 0 check(balance between 0 and 9000000000000));
create table public.gym_point_ledger(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.gym_members(id) on delete cascade,event_key text not null,amount bigint not null,reason text not null,created_at timestamptz not null default now(),unique(user_id,event_key));
create index gym_point_ledger_user_date_idx on public.gym_point_ledger(user_id,created_at desc);
create table public.gym_point_products(id uuid primary key default gen_random_uuid(),name text not null check(char_length(name) between 1 and 60),description text not null default '' check(char_length(description)<=300),price integer not null check(price between 1 and 1000000000),uses integer not null default 1 check(uses between 1 and 1000),deleted boolean not null default false,updated_at timestamptz not null default now());
create table public.gym_point_coupons(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.gym_members(id) on delete cascade,product_id uuid references public.gym_point_products(id),request_id uuid not null,name text not null,price integer not null,total integer not null,remaining integer not null check(remaining>=0 and remaining<=total),created_at timestamptz not null default now(),last_used_at timestamptz,unique(user_id,request_id));
create index gym_point_coupons_user_date_idx on public.gym_point_coupons(user_id,created_at desc);
create index gym_point_coupons_product_idx on public.gym_point_coupons(product_id);
create table public.gym_coupon_uses(id uuid primary key,user_id uuid not null references public.gym_members(id) on delete cascade,coupon_id uuid not null references public.gym_point_coupons(id) on delete cascade,remaining integer not null,created_at timestamptz not null default now());
create index gym_coupon_uses_user_idx on public.gym_coupon_uses(user_id);
create index gym_coupon_uses_coupon_idx on public.gym_coupon_uses(coupon_id);
create table public.gym_coupon_attempts(user_id uuid primary key references public.gym_members(id) on delete cascade,window_start timestamptz not null default now(),attempts integer not null default 0);
do $$declare tab text;begin
 foreach tab in array array['gym_point_config','gym_point_accounts','gym_point_ledger','gym_point_products','gym_point_coupons','gym_coupon_uses','gym_coupon_attempts'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('revoke all on public.%I from public,anon,authenticated',tab);
 execute format('grant all on public.%I to service_role',tab);
 execute format('create policy server_only on public.%I for all to service_role using(true) with check(true)',tab);
 end loop;
end $$;
create trigger bump_revision after insert or update or delete on public.gym_point_config for each statement execute function public.onoff_bump_revision();
create trigger bump_revision after insert or update or delete on public.gym_point_products for each statement execute function public.onoff_bump_revision();
create trigger bump_revision after insert or update or delete on public.gym_point_accounts for each statement execute function public.onoff_bump_revision();
create trigger bump_revision after insert or update or delete on public.gym_point_coupons for each statement execute function public.onoff_bump_revision();

-- A unique daily event and a locked account prevent duplicate grants and overspending.
create function public.onoff_point_award() returns trigger language plpgsql security invoker set search_path='' as $$
declare cfg public.gym_point_config%rowtype; who uuid; kind text; amount integer; changed integer;day text:=(now() at time zone 'Asia/Seoul')::date::text;
begin
 if tg_table_name='gym_records' then
  if new.writer_id is distinct from new.user_id then return new;end if;
  who:=new.user_id;kind:='record';
 else
  if new.date::text<>day then return new;end if;
  who:=new.user_id;kind:='attendance';
 end if;
 if not exists(select 1 from public.gym_members m where m.id=who and m.status='approved') then return new;end if;
 select * into cfg from public.gym_point_config where singleton for share;
 if not cfg.enabled then return new;end if;
 amount:=case when kind='record' then cfg.record_points else cfg.attendance_points end;
 if amount=0 then return new;end if;
 insert into public.gym_point_accounts(user_id) values(who) on conflict do nothing;
 perform 1 from public.gym_point_accounts where user_id=who for update;
 insert into public.gym_point_ledger(user_id,event_key,amount,reason) values(who,kind||':'||day,amount,case when kind='record' then '개인 운동기록' else '출석' end) on conflict(user_id,event_key) do nothing;
 get diagnostics changed=row_count;
 if changed=1 then update public.gym_point_accounts a set balance=a.balance+amount where a.user_id=who;end if;
 return new;
end $$;
revoke all on function public.onoff_point_award() from public,anon,authenticated;
create trigger point_attendance after insert on public.gym_attendance for each row execute function public.onoff_point_award();
create trigger point_record after insert on public.gym_records for each row execute function public.onoff_point_award();

create function public.onoff_points(actor uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.gym_members%rowtype;cfg public.gym_point_config%rowtype;product public.gym_point_products%rowtype;coupon public.gym_point_coupons%rowtype;attempt public.gym_coupon_attempts%rowtype;prior public.gym_coupon_uses%rowtype;act text:=p->>'action';item_id uuid;req uuid;cash bigint;pin text:=coalesce(p->>'pin','');
begin
 select * into m from public.gym_members where id=actor for update;
 if m.id is null or m.status<>'approved' then raise exception '관리자 승인 후 이용할 수 있어요.' using errcode='42501';end if;
 if act in ('settings','product-save','product-delete') and m.role<>'admin' then raise exception '운영자 권한이 필요해요.' using errcode='42501';end if;
 if act='settings' then
  select * into cfg from public.gym_point_config where singleton for update;
  if jsonb_typeof(p->'enabled') is distinct from 'boolean' or (p->>'attendancePoints') !~ '^\d{1,7}$' or (p->>'recordPoints') !~ '^\d{1,7}$' or (p->>'attendancePoints')::integer not between 0 and 1000000 or (p->>'recordPoints')::integer not between 0 and 1000000 then raise exception '적립 설정을 확인해주세요.';end if;
  if pin<>'' then
   if pin !~ '^\d{4}$' then raise exception '쿠폰 비밀번호는 숫자 4자리로 입력해주세요.';end if;
   cfg.pin_hash:=extensions.crypt(pin,extensions.gen_salt('bf',10));
  end if;
  if (p->>'enabled')::boolean and cfg.pin_hash is null then raise exception '쿠폰 사용 비밀번호를 먼저 설정해주세요.';end if;
  update public.gym_point_config set enabled=(p->>'enabled')::boolean,attendance_points=(p->>'attendancePoints')::integer,record_points=(p->>'recordPoints')::integer,pin_hash=cfg.pin_hash,updated_at=now() where singleton;
 elsif act='product-save' then
  if coalesce(char_length(btrim(p->>'name')),0) not between 1 and 60 or coalesce(char_length(p->>'description'),0)>300 or coalesce(p->>'price','') !~ '^\d{1,10}$' or coalesce(p->>'uses','') !~ '^\d{1,4}$' or (p->>'price')::bigint not between 1 and 1000000000 or (p->>'uses')::integer not between 1 and 1000 then raise exception '상품 이름·포인트·횟수를 확인해주세요.';end if;
  if coalesce(p->>'id','')='' then
   insert into public.gym_point_products(name,description,price,uses) values(btrim(p->>'name'),coalesce(p->>'description',''),(p->>'price')::integer,(p->>'uses')::integer);
  else
   update public.gym_point_products set name=btrim(p->>'name'),description=coalesce(p->>'description',''),price=(p->>'price')::integer,uses=(p->>'uses')::integer,deleted=false,updated_at=now() where id=(p->>'id')::uuid;
   if not found then raise exception '상품을 찾을 수 없어요.';end if;
  end if;
 elsif act='product-delete' then
  update public.gym_point_products set deleted=true,updated_at=now() where id=(p->>'id')::uuid;
  if not found then raise exception '상품을 찾을 수 없어요.';end if;
 elsif act='exchange' then
  req:=(p->>'requestId')::uuid;item_id:=(p->>'productId')::uuid;
  if req is null or item_id is null then raise exception '교환 요청을 확인해주세요.';end if;
  select * into coupon from public.gym_point_coupons c where c.user_id=actor and c.request_id=req;
  if found then
   if coupon.product_id<>item_id then raise exception '교환 요청을 다시 확인해주세요.';end if;
   return jsonb_build_object('ok',true,'couponId',coupon.id,'already',true);
  end if;
  select * into cfg from public.gym_point_config where singleton for share;
  if not cfg.enabled then raise exception '포인트 상점은 현재 쉬고 있어요.';end if;
  insert into public.gym_point_accounts(user_id) values(actor) on conflict do nothing;
  select balance into cash from public.gym_point_accounts where user_id=actor for update;
  select * into product from public.gym_point_products where id=item_id and not deleted for share;
  if product.id is null then raise exception '현재 교환할 수 없는 상품이에요.';end if;
  if cash<product.price then raise exception '보유 포인트가 부족해요.';end if;
  insert into public.gym_point_coupons(user_id,product_id,request_id,name,price,total,remaining) values(actor,product.id,req,product.name,product.price,product.uses,product.uses) returning * into coupon;
  update public.gym_point_accounts set balance=balance-product.price where user_id=actor;
  insert into public.gym_point_ledger(user_id,event_key,amount,reason) values(actor,'exchange:'||req::text,-product.price,product.name||' 쿠폰 교환');
  return jsonb_build_object('ok',true,'couponId',coupon.id);
 elsif act='use' then
  req:=(p->>'requestId')::uuid;item_id:=(p->>'couponId')::uuid;
  if req is null or item_id is null or pin !~ '^\d{4}$' then raise exception '쿠폰과 4자리 비밀번호를 확인해주세요.';end if;
  select * into prior from public.gym_coupon_uses where id=req;
  if found then
   if prior.user_id<>actor or prior.coupon_id<>item_id then raise exception '쿠폰 요청을 확인해주세요.' using errcode='42501';end if;
   return jsonb_build_object('ok',true,'remaining',prior.remaining,'already',true);
  end if;
  select * into coupon from public.gym_point_coupons where id=item_id and user_id=actor for update;
  if coupon.id is null then raise exception '본인의 쿠폰만 사용할 수 있어요.' using errcode='42501';end if;
  if coupon.remaining<=0 then raise exception '이미 모두 사용한 쿠폰이에요.';end if;
  select * into cfg from public.gym_point_config where singleton for share;
  if cfg.pin_hash is null then raise exception '쿠폰 사용 비밀번호 설정이 필요해요.';end if;
  insert into public.gym_coupon_attempts(user_id) values(actor) on conflict do nothing;
  select * into attempt from public.gym_coupon_attempts where user_id=actor for update;
  if attempt.window_start<=now()-interval '10 minutes' then attempt.attempts:=0;attempt.window_start:=now();end if;
  if attempt.attempts>=5 then return jsonb_build_object('ok',false,'error','비밀번호 입력 횟수를 초과했어요. 잠시 후 다시 시도해주세요.','status',429);end if;
  if extensions.crypt(pin,cfg.pin_hash) is distinct from cfg.pin_hash then
   update public.gym_coupon_attempts set attempts=attempt.attempts+1,window_start=attempt.window_start where user_id=actor;
   return jsonb_build_object('ok',false,'error','비밀번호를 확인해주세요.','status',400);
  end if;
  update public.gym_coupon_attempts set attempts=0,window_start=now() where user_id=actor;
  update public.gym_point_coupons set remaining=remaining-1,last_used_at=now() where id=item_id returning * into coupon;
  insert into public.gym_coupon_uses(id,user_id,coupon_id,remaining) values(req,actor,coupon.id,coupon.remaining);
  return jsonb_build_object('ok',true,'remaining',coupon.remaining);
 else raise exception '포인트 요청을 확인해주세요.';end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.onoff_points(uuid,jsonb) from public,anon,authenticated;grant execute on function public.onoff_points(uuid,jsonb) to service_role;
