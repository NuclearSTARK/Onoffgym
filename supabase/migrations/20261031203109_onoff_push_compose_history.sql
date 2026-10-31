-- Authenticated operator composition and device-scoped pre-login tests.
create function public.onoff_push_compose(actor uuid,test_code text,p jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare job text; title text:=btrim(p->>'title'); message text:=btrim(p->>'body'); mode text:=p->>'mode';begin
 if title is null or char_length(title) not between 1 and 80 or message is null or char_length(message) not between 1 and 300 then raise exception '제목 1~80자, 내용 1~300자를 입력해주세요.';end if;
 if mode='test' then
  job:=public.onoff_push_test_job(actor,test_code,p->>'subscriptionId',coalesce((p->>'delayed')::boolean,false));
  update public.gym_push_jobs set payload=jsonb_build_object('title',title,'body',message,'url','/Onoffgym/#login','tag',job) where id=job;
 elsif mode='all' then
  perform 1 from public.gym_members where id=actor and status='approved' and role='admin' for update;
  if not found or test_code is not null then raise exception '운영자만 회원 알림을 보낼 수 있어요.' using errcode='42501';end if;
  if (select count(*) from public.gym_push_jobs where kind='notices' and created_at>now()-interval '1 hour')>=30 then raise exception '한 시간에 30번까지 보낼 수 있어요.';end if;
  job:='notice:'||gen_random_uuid()::text;
  insert into public.gym_push_jobs(id,kind,payload) values(job,'notices',jsonb_build_object('title',title,'body',message,'url','/Onoffgym/#community','tag',job));
 else raise exception '발송 대상을 확인해주세요.';end if;
 return job;
end $$;
create function public.onoff_push_history(actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare value jsonb;begin
 if not exists(select 1 from public.gym_members where id=actor and status='approved' and role='admin') then raise exception '운영자 권한이 필요해요.' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into value from (
  select j.id,j.kind,j.payload->>'title' as title,j.payload->>'body' as body,j.created_at,j.due_at,
   count(d.subscription_id)::integer as total,count(*) filter(where d.status='sent')::integer as sent,
   count(*) filter(where d.status in ('failed','expired'))::integer as failed,
   count(*) filter(where d.status in ('pending','sending'))::integer as pending
  from (select * from public.gym_push_jobs order by created_at desc limit 30) j left join public.gym_push_deliveries d on d.job_id=j.id
  group by j.id,j.kind,j.payload,j.created_at,j.due_at
 ) x;
 return value;
end $$;
revoke all on function public.onoff_push_compose(uuid,text,jsonb),public.onoff_push_history(uuid) from public,anon,authenticated;
grant execute on function public.onoff_push_compose(uuid,text,jsonb),public.onoff_push_history(uuid) to service_role;
