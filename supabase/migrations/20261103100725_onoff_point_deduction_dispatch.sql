create or replace function public.onoff_points(actor uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
<<onoff_points>>
declare m public.gym_members%rowtype;cfg public.gym_point_config%rowtype;product public.gym_point_products%rowtype;coupon public.gym_point_coupons%rowtype;attempt public.gym_coupon_attempts%rowtype;prior public.gym_coupon_uses%rowtype;act text:=p->>'action';item_id uuid;req uuid;cash bigint;pin text:=coalesce(p->>'pin','');rule public.gym_point_rules%rowtype;prior_grant public.gym_point_grants%rowtype;target uuid;wanted integer;given bigint;rule_id text;label text;grant_reason text;kind text;method public.gym_point_methods%rowtype;method_id text;new_method text;
begin
 if act in ('grant','deduct') then perform pg_advisory_xact_lock(hashtextextended('onoff-point-grants',0));end if;
 select * into m from public.gym_members where id=actor for update;
 if m.id is null or m.status<>'approved' then raise exception '관리자 승인 후 이용할 수 있어요.' using errcode='42501';end if;
 if act in ('settings','product-save','product-delete','rule-save','rule-delete','grant','deduct','method-save','method-delete') and m.role<>'admin' then raise exception '운영자 권한이 필요해요.' using errcode='42501';end if;
 if act='settings' then
  select * into cfg from public.gym_point_config where singleton for update;
  if jsonb_typeof(p->'enabled') is distinct from 'boolean' then raise exception '포인트 사용 설정을 확인해주세요.';end if;
  if p ? 'maxBalance' then
   if p->'maxBalance'='null'::jsonb then cfg.max_balance:=null;
   elsif coalesce(p->>'maxBalance','') !~ '^\d{1,13}$' or (p->>'maxBalance')::bigint not between 1 and 9000000000000 then raise exception '총 보유 포인트 상한을 확인해주세요.';
   else cfg.max_balance:=(p->>'maxBalance')::bigint;end if;
  end if;
  if p ? 'attendancePoints' then
   if coalesce(p->>'attendancePoints','') !~ '^\d{1,7}$' or (p->>'attendancePoints')::integer not between 0 and 1000000 then raise exception '출석 적립액을 확인해주세요.';end if;
   cfg.attendance_points:=(p->>'attendancePoints')::integer;update public.gym_point_rules set amount=cfg.attendance_points where auto_key='attendance';
  end if;
  if p ? 'recordPoints' then
   if coalesce(p->>'recordPoints','') !~ '^\d{1,7}$' or (p->>'recordPoints')::integer not between 0 and 1000000 then raise exception '기록 적립액을 확인해주세요.';end if;
   cfg.record_points:=(p->>'recordPoints')::integer;update public.gym_point_rules set amount=cfg.record_points where auto_key='record';
  end if;
  if pin<>'' then
   if pin !~ '^\d{4}$' then raise exception '쿠폰 비밀번호는 숫자 4자리로 입력해주세요.';end if;
   cfg.pin_hash:=extensions.crypt(pin,extensions.gen_salt('bf',10));
  end if;
  if (p->>'enabled')::boolean and cfg.pin_hash is null then raise exception '쿠폰 사용 비밀번호를 먼저 설정해주세요.';end if;
  update public.gym_point_config set enabled=(p->>'enabled')::boolean,attendance_points=cfg.attendance_points,record_points=cfg.record_points,max_balance=cfg.max_balance,pin_hash=cfg.pin_hash,updated_at=now() where singleton;

 elsif act in ('method-save','method-delete','rule-save') then
  select * into cfg from public.gym_point_config where singleton for update;
  if act='method-save' then
   method_id:=nullif(p->>'id','');label:=btrim(p->>'name');kind:=p->>'kind';
   if coalesce(char_length(label),0) not between 1 and 60 or coalesce(kind,'') not in ('manual','attendance','record') then raise exception '적립 방식을 확인해주세요.';end if;
   if exists(select 1 from public.gym_point_methods x where not deleted and lower(x.name)=lower(label) and x.id is distinct from method_id) then raise exception '이미 등록된 적립 방식 이름이에요.';end if;
   if exists(select 1 from public.gym_point_methods x where not deleted and x.kind=onoff_points.kind and onoff_points.kind<>'manual' and x.id is distinct from method_id) then raise exception '같은 자동 적립 방식은 하나만 등록할 수 있어요.';end if;
   if method_id is null then
    if (select count(*) from public.gym_point_methods where not deleted)>=40 then raise exception '적립 방식은 최대 40개입니다.';end if;
    method_id:=gen_random_uuid()::text;
    insert into public.gym_point_methods(id,name,kind) values(method_id,label,kind);
   else
    select * into method from public.gym_point_methods x where x.id=onoff_points.method_id and not deleted for update;
    if method.id is null then raise exception '적립 방식을 찾을 수 없어요.';end if;
    if method.kind<>kind then
     if kind<>'manual' and (select count(*) from public.gym_point_rules where gym_point_rules.method_id=method.id and not deleted)>1 then raise exception '자동 적립에는 항목 하나만 연결할 수 있어요.';end if;
     update public.gym_point_rules r set auto_key=null where r.deleted and r.auto_key=kind;
     update public.gym_point_rules r set auto_key=nullif(kind,'manual') where r.method_id=method.id and not r.deleted;
    end if;
    update public.gym_point_methods x set name=label,kind=onoff_points.kind where x.id=onoff_points.method_id;
   end if;
  elsif act='method-delete' then
   method_id:=p->>'id';update public.gym_point_methods x set deleted=true where x.id=onoff_points.method_id and not x.deleted returning * into method;
   if method.id is null then raise exception '적립 방식을 찾을 수 없어요.';end if;
   update public.gym_point_rules r set deleted=true where r.method_id=method.id;
  else
   rule_id:=nullif(p->>'id','');label:=btrim(p->>'name');method_id:=nullif(p->>'methodId','');
   if method_id is null then select * into method from public.gym_point_methods x where not deleted and x.kind=p->>'kind' order by created_at limit 1 for share;
   else select * into method from public.gym_point_methods x where x.id=onoff_points.method_id and not deleted for share;end if;
   kind:=method.kind;
   if method.id is null or coalesce(char_length(label),0) not between 1 and 60 or coalesce(p->>'amount','') !~ '^\d{1,7}$' or (p->>'amount')::integer not between 0 and 1000000 then raise exception '적립 항목과 방식을 확인해주세요.';end if;
   if rule_id is not null then
    select * into rule from public.gym_point_rules r where r.id=rule_id for update;
    if rule.id is null then raise exception '적립 항목을 찾을 수 없어요.';end if;
   else
    if (select count(*) from public.gym_point_rules where not deleted)>=40 then raise exception '적립 항목은 최대 40개입니다.';end if;
    select * into rule from public.gym_point_rules r where r.auto_key=kind and r.deleted limit 1 for update;
    rule_id:=coalesce(rule.id,gen_random_uuid()::text);
   end if;
   if exists(select 1 from public.gym_point_rules r where r.auto_key=kind and not r.deleted and r.id<>rule_id) then raise exception '이미 등록된 자동 적립 항목이에요.';end if;
   update public.gym_point_rules r set auto_key=null where r.auto_key=kind and r.deleted and r.id<>rule_id;
   insert into public.gym_point_rules(id,method_id,auto_key,name,amount,deleted) values(rule_id,method.id,nullif(kind,'manual'),label,(p->>'amount')::integer,false)
   on conflict(id) do update set method_id=excluded.method_id,auto_key=excluded.auto_key,name=excluded.name,amount=excluded.amount,deleted=false;
  end if;
  update public.gym_point_config set attendance_points=coalesce((select amount from public.gym_point_rules where auto_key='attendance' and not deleted),0),record_points=coalesce((select amount from public.gym_point_rules where auto_key='record' and not deleted),0),updated_at=now() where singleton;
 elsif act='rule-delete' then
  update public.gym_point_rules set deleted=true where id=p->>'id' returning * into rule;
  if not found then raise exception '적립 항목을 찾을 수 없어요.';end if;
  if rule.auto_key='attendance' then update public.gym_point_config set attendance_points=0 where singleton;
  elsif rule.auto_key='record' then update public.gym_point_config set record_points=0 where singleton;end if;
 elsif act='grant' then
  req:=(p->>'requestId')::uuid;target:=(p->>'memberId')::uuid;rule_id:=nullif(p->>'ruleId','');grant_reason:=btrim(p->>'reason');
  if req is null or target is null or coalesce(char_length(grant_reason),0) not between 1 and 200 then raise exception '지급 대상과 사유를 확인해주세요.';end if;
  select * into prior_grant from public.gym_point_grants where id=req;
  if found then
   if prior_grant.actor_id<>actor or prior_grant.user_id<>target or prior_grant.operation<>'grant' then raise exception '지급 요청을 확인해주세요.' using errcode='42501';end if;
   return jsonb_build_object('ok',true,'granted',prior_grant.granted,'already',true);
  end if;
  perform 1 from public.gym_members where id=target and status='approved' for update;
  if not found then raise exception '승인된 회원을 선택해주세요.';end if;
  select * into cfg from public.gym_point_config where singleton for share;
  if not cfg.enabled then raise exception '포인트 기능을 켠 뒤 지급해주세요.';end if;
  if rule_id is not null then
   select * into rule from public.gym_point_rules r where r.id=rule_id and r.auto_key is null and not r.deleted for share;
   if rule.id is null or rule.amount=0 then raise exception '지급할 추가 적립 항목을 확인해주세요.';end if;wanted:=rule.amount;label:=rule.name;
  else
   if coalesce(p->>'amount','') !~ '^\d{1,7}$' or (p->>'amount')::integer not between 1 and 1000000 then raise exception '지급 포인트를 확인해주세요.';end if;wanted:=(p->>'amount')::integer;label:='운영자 지급';
  end if;
  insert into public.gym_point_accounts(user_id) values(target) on conflict do nothing;
  select balance into cash from public.gym_point_accounts where user_id=target for update;
  given:=least(wanted,greatest(0,coalesce(cfg.max_balance,9000000000000)-cash));
  insert into public.gym_point_grants(id,actor_id,user_id,rule_id,requested,granted,reason) values(req,actor,target,rule_id,wanted,given,grant_reason);
  insert into public.gym_point_ledger(user_id,event_key,amount,reason) values(target,'admin-grant:'||req::text,given,label||' · '||grant_reason||case when given<wanted then ' · 보유 상한 적용' else '' end);
  if given>0 then update public.gym_point_accounts set balance=balance+given where user_id=target;end if;
  return jsonb_build_object('ok',true,'granted',given,'capped',given<wanted,'balance',cash+given);
 elsif act='deduct' then
  req:=(p->>'requestId')::uuid;target:=(p->>'memberId')::uuid;grant_reason:=btrim(p->>'reason');
  if req is null or target is null or coalesce(char_length(grant_reason),0) not between 1 and 200 or coalesce(p->>'amount','') !~ '^\d{1,7}$' or (p->>'amount')::integer not between 1 and 1000000 then raise exception '차감 대상·포인트·사유를 확인해주세요.';end if;
  wanted:=(p->>'amount')::integer;
  select * into prior_grant from public.gym_point_grants where id=req;
  if found then
   if prior_grant.actor_id<>actor or prior_grant.user_id<>target or prior_grant.operation<>'deduct' then raise exception '차감 요청을 확인해주세요.' using errcode='42501';end if;
   return jsonb_build_object('ok',true,'deducted',-prior_grant.granted,'already',true);
  end if;
  perform 1 from public.gym_members where id=target and status='approved' for update;
  if not found then raise exception '승인된 회원을 선택해주세요.';end if;
  insert into public.gym_point_accounts(user_id) values(target) on conflict do nothing;
  select balance into cash from public.gym_point_accounts where user_id=target for update;
  given:=least(wanted,cash);
  insert into public.gym_point_grants(id,actor_id,user_id,requested,granted,reason,operation) values(req,actor,target,wanted,-given,grant_reason,'deduct');
  insert into public.gym_point_ledger(user_id,event_key,amount,reason) values(target,'admin-deduct:'||req::text,-given,'운영자 차감 · '||grant_reason);
  update public.gym_point_accounts set balance=balance-given where user_id=target;
  return jsonb_build_object('ok',true,'deducted',given,'balance',cash-given);
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
  if coalesce((p->>'expectedPrice')::integer,-1)<>product.price or coalesce((p->>'expectedUses')::integer,-1)<>product.uses then raise exception '상품 조건이 변경됐어요. 상점을 새로 열어 확인해주세요.';end if;
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
  if coupon.expires_at is not null and coupon.expires_at<=now() then raise exception '사용기한이 지난 쿠폰이에요.';end if;
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
