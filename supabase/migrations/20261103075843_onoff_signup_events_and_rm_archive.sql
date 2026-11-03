create function public.onoff_rm_archive(actor uuid,item_id text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cat jsonb;begin
 perform 1 from public.gym_members where id=actor and status='approved' for update;
 if not public.onoff_can(actor,'rm') then raise exception '종목 관리 권한이 필요해요.' using errcode='42501';end if;
 select value into cat from public.gym_settings where key='rmCatalogue' for update;
 if cat is null or not exists(select 1 from jsonb_array_elements(cat) x where x->>'id'=item_id) then raise exception '종목을 찾을 수 없어요.';end if;
 select jsonb_agg(case when x->>'id'=item_id then x||'{"active":false,"isDefault":false,"deleted":true}'::jsonb else x end order by n) into cat from jsonb_array_elements(cat) with ordinality as e(x,n);
 update public.gym_settings set value=cat where key='rmCatalogue';return jsonb_build_object('ok',true);
end $$;
revoke all on function public.onoff_rm_archive(uuid,text) from public,anon,authenticated;grant execute on function public.onoff_rm_archive(uuid,text) to service_role;

-- New signup events remain relevant after prompt approval. Old jobs keep their
-- previous rules, preventing a backlog from being sent at this deployment.
alter table public.gym_push_jobs add column target_note text;
do $patch$
declare definition text;needle text;begin
 definition:=pg_get_functiondef('onoff_private.handle_member_signup()'::regprocedure);
 needle:='jsonb_build_object(''title'',''새 회원 승인 요청''';
 if position(needle in definition)=0 then raise exception 'Signup event target missing';end if;
 execute replace(definition,needle,'jsonb_build_object(''signupEvent'',true,''title'',''새 회원 가입 신청''');
 definition:=pg_get_functiondef('public.onoff_push_claim(integer)'::regprocedure);
 needle:='pending.status=''pending''';
 if position(needle in definition)=0 then raise exception 'Approval claim target missing';end if;
 definition:=replace(definition,needle,'(pending.status=''pending'' or pending.status=''approved'' and j.payload->>''signupEvent''=''true'')');
 needle:=' with candidates as (';
 if position(needle in definition)=0 then raise exception 'Approval note target missing';end if;
 definition:=replace(definition,needle,$note$
 update public.gym_push_jobs j set target_note=case
  when exists(select 1 from public.gym_push_deliveries d where d.job_id=j.id) then null
  when j.kind='approvals' and coalesce(j.payload->>'signupEvent','false')<>'true' and exists(select 1 from public.gym_members m where m.id=j.subject_id and m.status='approved') then '가입 승인 완료로 발송 제외 · 이전 방식'
  when j.kind='approvals' then '발송 조건에 맞는 운영자 기기가 없어요.'
  else '발송 조건에 맞는 기기가 없어요.' end
 where j.due_at<=now() and j.expires>now();
 with candidates as ($note$);
 execute definition;
 definition:=pg_get_functiondef('public.onoff_push_history(uuid)'::regprocedure);
 needle:='j.payload->>''body'' as body';
 if position(needle in definition)=0 then raise exception 'Push history note target missing';end if;
 definition:=replace(definition,needle,needle||',j.target_note as "targetNote"');
 needle:='group by j.id,j.kind,j.payload,j.created_at,j.due_at';
 if position(needle in definition)=0 then raise exception 'Push history grouping target missing';end if;
 execute replace(definition,needle,needle||',j.target_note');
end $patch$;
