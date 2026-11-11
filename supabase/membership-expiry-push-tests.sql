-- Run in an isolated Postgres fixture with the push schema/migration loaded.
-- This transaction rolls back every fixture and never invokes pg_net or a provider.
begin;
do $$
declare d date:=(now() at time zone 'Asia/Seoul')::date; morning timestamptz;
 n integer; claims jsonb; expected integer;
 u1 uuid:='10000000-0000-4000-8000-000000000001';
 u2 uuid:='10000000-0000-4000-8000-000000000002';
 u3 uuid:='10000000-0000-4000-8000-000000000003';
 u4 uuid:='10000000-0000-4000-8000-000000000004';
 u5 uuid:='10000000-0000-4000-8000-000000000005';
 u6 uuid:='10000000-0000-4000-8000-000000000006';
 u7 uuid:='10000000-0000-4000-8000-000000000007';
 u8 uuid:='10000000-0000-4000-8000-000000000008';
begin
 morning:=(d+time '09:00') at time zone 'Asia/Seoul';
 insert into public.gym_settings(key,value) values('membershipExpiryPushStartAt',to_jsonb(morning)) on conflict(key) do update set value=excluded.value;
 insert into auth.users(id) select x from unnest(array[u1,u2,u3,u4,u5,u6,u7,u8]) x;
 insert into public.gym_members(id,name,status,role) select x,'검증 회원',case when x=u3 then 'suspended' else 'approved' end,'member' from unnest(array[u1,u2,u3,u4,u5,u6,u7,u8]) x;
 insert into public.gym_memberships(user_id,id,kind,start_date,end_date,months,total_visits,remaining_visits,paused_at) values
 (u1,'20000000-0000-4000-8000-000000000001','period',d-20,d+3,1,null,null,null),
 (u2,'20000000-0000-4000-8000-000000000002','visits',d-20,d+3,null,10,5,null),
 (u3,'20000000-0000-4000-8000-000000000003','period',d-20,d+3,1,null,null,null),
 (u4,'20000000-0000-4000-8000-000000000004','period',d-20,d+3,1,null,null,d-1),
 (u5,'20000000-0000-4000-8000-000000000005','visits',d-20,null,null,10,5,null),
 (u6,'20000000-0000-4000-8000-000000000006','period',d+1,d+3,1,null,null,null),
 (u7,'20000000-0000-4000-8000-000000000007','visits',d-20,d+3,null,10,0,null),
 (u8,'20000000-0000-4000-8000-000000000008','period',d-20,d+3,1,null,null,null);
 insert into public.gym_push_subscriptions(id,user_id,body,preferences,created_at) values
 ('qa-u1-a',u1,'{}','{}',morning-interval '1 day'),('qa-u1-b',u1,'{}','{"memberships":true}',morning-interval '1 day'),
 ('qa-u1-off',u1,'{}','{"memberships":false}',morning-interval '1 day'),
 ('qa-u2',u2,'{}','{"notices":false,"workouts":false}',morning-interval '1 day'),
 ('qa-u3',u3,'{}','{}',morning-interval '1 day'),('qa-u4',u4,'{}','{}',morning-interval '1 day'),
 ('qa-u5',u5,'{}','{}',morning-interval '1 day'),('qa-u6',u6,'{}','{}',morning-interval '1 day'),
 ('qa-u7',u7,'{}','{}',morning-interval '1 day'),('qa-u8',u8,'{}','{"memberships":false}',morning-interval '1 day');
 select public.onoff_queue_membership_expiry(morning-interval '1 second') into n;
 if n<>0 then raise exception 'queued before 9am';end if;
 select public.onoff_queue_membership_expiry(morning) into n;
 if n<>2 then raise exception 'expected two targeted jobs, got %',n;end if;
 select public.onoff_queue_membership_expiry(morning+interval '1 minute') into n;
 if n<>0 then raise exception 'duplicate jobs';end if;
 -- No member can receive another member's job, including opted-out devices.
 claims:=public.onoff_push_claim(100);
 expected:=case when now()>=morning then 3 else 0 end;
 if jsonb_array_length(claims)<>expected then raise exception 'wrong delivery count: % expected %',claims,expected;end if;
 if exists(select 1 from jsonb_array_elements(claims) j where j->>'userId'<>j->>'subjectId' or j->>'subscriptionId'='qa-u1-off') then raise exception 'wrong recipient';end if;
 if jsonb_array_length(public.onoff_push_claim(100))<>0 then raise exception 'duplicate claims';end if;
 -- A renewal after queueing prevents insertion of delivery rows for this job.
 delete from public.gym_push_deliveries;
 update public.gym_memberships set end_date=d+30 where user_id=u1;
 claims:=public.onoff_push_claim(100);
 if exists(select 1 from jsonb_array_elements(claims) j where j->>'userId'=u1::text) then raise exception 'sent stale expiry after renewal';end if;
 -- Renewal gets one new event for the new end date, never a duplicate old event.
 select public.onoff_queue_membership_expiry(((d+27)+time '09:00') at time zone 'Asia/Seoul') into n;
 if n<>1 then raise exception 'new end-date reminder not queued';end if;
 if has_function_privilege('anon','public.onoff_queue_membership_expiry(timestamptz)','execute') or has_function_privilege('authenticated','public.onoff_queue_membership_expiry(timestamptz)','execute') then raise exception 'public queue access';end if;
end $$;
rollback;
