"""Replay application SQL against a disposable local PostgreSQL 17 container.
Run: python3 scripts/test-gender-postgres.py [container-name]
Container must already run PostgreSQL with local trust authentication. No hosted
connection, external job execution or notification delivery is used.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import os, subprocess, sys
root=Path(__file__).resolve().parent.parent
container=sys.argv[1] if len(sys.argv)>1 else 'onoff-gender-pg'
database='onoff_gender_test_'+str(os.getpid())
env={k:v for k,v in os.environ.items() if k not in ('DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH')}
base=['docker','--host=unix:///var/run/docker.sock','exec','-i',container]
def command(args,source=None):
 r=subprocess.run(base+args,input=source,text=True,capture_output=True,env=env)
 if r.returncode:raise RuntimeError(r.stderr+'\n'+r.stdout[-1200:])
 return r.stdout
def sql(source):return command(['psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],source)
command(['createdb','-U','postgres',database])
try:
 sql('''do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;end$$;
create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
create schema auth;create table auth.users(id uuid primary key,email text,is_anonymous boolean not null default false,raw_user_meta_data jsonb not null default '{}');
create schema extensions;create extension pgcrypto with schema extensions;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(metadata jsonb);
-- Inert local substitutes: these only record schedules, never run their SQL.
create schema cron;create table cron.job(jobid bigint,jobname text);
create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job values((select count(*)+1 from cron.job),$1) returning jobid$$;
create function cron.alter_job(job_id bigint,active boolean) returns void language sql as $$select$$;
''')
 count=0
 for p in sorted((root/'supabase/migrations').glob('*.sql')):
  if p.name.endswith('_onoff_gender_comparisons_approval_history.sql'):
   sql('''insert into auth.users(id,email,raw_user_meta_data) values('10000000-0000-4000-8000-000000000099','old-approved@example.invalid','{"full_name":"기존승인회원","privacy_version":"privacy-2026-11-04","privacy_consent":true,"age_over_14":true,"disclosure_consent":true}');update public.gym_members set status='approved' where id='10000000-0000-4000-8000-000000000099';''')
  source=p.read_text().replace('create extension if not exists pg_cron;','').replace('create extension if not exists pg_net with schema extensions;','')
  try:sql(source)
  except Exception as e:raise RuntimeError(p.name+': '+str(e)) from e
  count+=1
 sql((root/'tests/sql/gender-comparison-approval.sql').read_text())
 # Use SQL assertions in a separate session; pg_temp helpers above are session-local.
 sql("do $$begin if not exists(select 1 from public.gym_members where id='10000000-0000-4000-8000-000000000099' and gender is null and status='approved') or exists(select 1 from public.gym_membership_events where user_id='10000000-0000-4000-8000-000000000099') then raise exception 'migration inferred gender or fabricated old approval';end if;end$$;")
 def approve(actor):
  return sql("begin;select public.onoff_commit('10000000-0000-4000-8000-"+actor+"','members','{\"id\":\"10000000-0000-4000-8000-000000000011\",\"status\":\"approved\",\"role\":\"member\"}');select pg_sleep(0.2);commit;")
 with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(approve,['000000000001','000000000002']))
 sql("do $$begin if (select count(*) from public.gym_membership_events where user_id='10000000-0000-4000-8000-000000000011' and action='signup-approve')<>1 then raise exception 'concurrent approvals duplicated history';end if;end$$;")
 print(f'PASS: {count} migrations replayed; gender cohorts, legacy rollout, score math, consent, signup, approval attribution, rollback, grants and concurrent approval verified on isolated PostgreSQL.')
finally:command(['dropdb','-U','postgres',database])
