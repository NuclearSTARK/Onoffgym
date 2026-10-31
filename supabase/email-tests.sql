-- Real database privileges and cascades; no persistent users, emails or HTTP.
begin;
do $$ declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();p uuid:=gen_random_uuid();begin
 perform set_config('onoff.email_a',a::text,true);perform set_config('onoff.email_b',b::text,true);perform set_config('onoff.email_p',p::text,true);
 insert into auth.users(id,email,role,aud,is_anonymous,raw_user_meta_data)
 values(a,a||'@example.invalid','authenticated','authenticated',false,'{"full_name":"첫 운영자","privacy_consent":true}'),
 (b,b||'@example.invalid','authenticated','authenticated',false,'{"full_name":"두번째 운영자","privacy_consent":true}'),
 (p,p||'@example.invalid','authenticated','authenticated',false,'{"full_name":"가입 회원","role":"admin","status":"approved","privacy_consent":true}');
end $$;
set local role service_role;
do $$
declare a uuid:=current_setting('onoff.email_a')::uuid;b uuid:=current_setting('onoff.email_b')::uuid;p uuid:=current_setting('onoff.email_p')::uuid;claims jsonb;begin
 if not exists(select 1 from public.gym_members where id=p and name='가입 회원' and role='member' and status='pending' and privacy_consent_at is not null) then raise exception 'FAILED pending role and consent';end if;
 perform public.onoff_commit(p,'ensure-member');
 if (select count(*) from public.gym_push_jobs where id='approval:'||p::text)<>1 then raise exception 'FAILED duplicate approval job';end if;
 update public.gym_members set role='admin',status='approved' where id in(a,b);
 insert into public.gym_push_subscriptions(id,user_id,body,preferences)
 values('email-test-admin-a',a,'{}','{"approvals":true}'),('email-test-admin-b',b,'{}','{"approvals":false}');
 claims:=public.onoff_push_claim();
 if jsonb_array_length(claims)<>1 or claims->0->>'userId'<>a::text or claims->0->>'subjectId'<>p::text or claims->0->>'kind'<>'approvals' then raise exception 'FAILED approval-only recipients: %',claims;end if;
 update public.gym_members set role='member' where id=b;
 begin perform public.onoff_withdraw_prepare(a);raise exception 'FAILED last operator withdrawal';exception when check_violation then null;end;
 update public.gym_members set status='approved' where id=p;
 insert into public.gym_records(id,user_id,date,program,section,body) values(gen_random_uuid(),p,current_date,'WOD','S1','{"lbs":135}');
 insert into public.gym_posts(author_id,category,title,body) values(p,'자유글','탈퇴 테스트','삭제할 글');
 insert into public.gym_push_subscriptions(id,user_id,body,preferences) values('email-test-member',p,'{}','{}');
 perform public.onoff_withdraw_prepare(p);
 if exists(select 1 from public.gym_push_subscriptions where user_id=p) or not exists(select 1 from public.gym_members where id=p and status='suspended') then raise exception 'FAILED withdrawal access cutoff';end if;
 if has_function_privilege('anon','public.onoff_withdraw_prepare(uuid)','EXECUTE') or has_schema_privilege('authenticated','onoff_private','USAGE') then raise exception 'FAILED private auth privileges';end if;
end $$;
reset role;
delete from auth.users where id=current_setting('onoff.email_p')::uuid;
do $$ declare p uuid:=current_setting('onoff.email_p')::uuid;begin
 if exists(select 1 from public.gym_members where id=p) or exists(select 1 from public.gym_records where user_id=p) or exists(select 1 from public.gym_posts where author_id=p) or exists(select 1 from public.gym_push_jobs where subject_id=p) then raise exception 'FAILED personal data cascade';end if;
end $$;
rollback;
select 'PASS: pending signup/consent, role isolation, one approval job, operator-only opt-in, last-operator guard, withdrawal cutoff and cascades; fixtures rolled back' as result;
