import asyncio,base64,json,pathlib,threading,time
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlparse
from playwright.async_api import async_playwright
root=str(pathlib.Path(__file__).resolve().parents[2]/'pages-dist')
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=root));threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port)
ADMIN='10000000-0000-4000-8000-000000000001';PENDING='10000000-0000-4000-8000-000000000002';REJECTED='10000000-0000-4000-8000-000000000003';STOPPED='10000000-0000-4000-8000-000000000004'
base={'role':'member','privacy_version':'privacy-2026-11-05','gender':'male','age_over_14':True,'created_at':'2026-11-01T00:00:00Z','coach_permissions':[]}
members=[dict(base,id=ADMIN,name='검증 운영자',role='admin',status='approved',approved_at='2026-11-01T00:00:00Z'),dict(base,id=PENDING,name='기간권회원',status='approved'),dict(base,id=REJECTED,name='횟수권회원',status='approved'),dict(base,id=STOPPED,name='휴회회원',status='approved'),dict(base,id='10000000-0000-4000-8000-000000000005',name='시작전회원',status='approved')]
passes=[{'id':'pass-period','user_id':PENDING,'kind':'period','months':1,'start_date':'2026-11-01','end_date':'2026-12-01'}, {'id':'pass-visits','user_id':REJECTED,'kind':'visits','remaining_visits':7,'total_visits':10,'start_date':'2026-11-01','end_date':'2026-12-01'}, {'id':'pass-paused','user_id':STOPPED,'kind':'visits','remaining_visits':8,'total_visits':10,'start_date':'2026-11-01','end_date':'2026-12-01','paused_at':'2026-11-10'}, {'id':'pass-future','user_id':members[4]['id'],'kind':'period','months':3,'start_date':'2026-11-16','end_date':'2027-02-15'}]
queries=[]

posts=[];errors=[]
def token(uid):
 enc=lambda v:base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
 return enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'exp':4102444800,'iat':1793404800,'aud':'authenticated','role':'authenticated'})+'.signature'
async def setup(browser,uid,width=390):
 context=await browser.new_context(viewport={'width':width,'height':844})
 user={'id':uid,'email':'qa@example.invalid','aud':'authenticated','role':'authenticated','user_metadata':{},'app_metadata':{}}
 session={'access_token':token(uid),'refresh_token':'isolated-fixture','expires_at':4102444800,'expires_in':2300000000,'token_type':'bearer','user':user}
 await context.add_init_script("localStorage.setItem('onoff-auth-approval-qa',"+json.dumps(json.dumps(session))+");")
 async def route(r):
  u=urlparse(r.request.url)
  if 'backend-config.js' in u.path:
   await r.fulfill(content_type='text/javascript',body='window.ONOFF_BACKEND='+json.dumps({'url':'https://approval-test.invalid','projectId':'approval-qa','publishableKey':'sb_publishable_isolated_qa'})+';');return
  if u.hostname=='approval-test.invalid':
   data={};body=r.request.post_data_json if r.request.method=='POST' else None
   if body is not None:posts.append({'uid':uid,'path':u.path,'body':body})
   if u.path.endswith('/api/bootstrap'):
    viewer=dict(next(m for m in members if m['id']==uid),email='qa@example.invalid')
    data={'viewer':viewer,'members':members if uid==ADMIN else [],'workouts':{},'records':[],'rms':[],'posts':[],'library':[],'notices':[],'preferences':{},'membership':None,'memberships':passes,'membershipEvents':[],'memberAttendance':[],'attendance':[],'push':{},'releaseTime':'22:00','revision':len(posts),'serverNow':'2026-11-12T01:00:00Z','calendar':{'dates':{}},'privacyReviewRequired':False}
   elif u.path.endswith('/api/member-overview'):
    from urllib.parse import parse_qs
    q={k:v[0] for k,v in parse_qs(u.query).items()};queries.append(q);kind=q.get('kind','attendance')
    if q.get('action')=='history':
     pn=int(q.get('page','0'));data={'kind':kind,'memberId':q['memberId'],'page':pn,'total':55,'hasMore':pn==0,'items':[{'id':str(i),'date':'2020-01-01' if pn else '2026-11-11','lbs':225,'label':'Deadlift','note':'<img src=x onerror=alert(1)>','event':'attendance','createdAt':'2026-11-12T01:05:00Z','debited':True} for i in range(50 if pn==0 else 5)]}
    else:
     rows=[]
     for index,m in enumerate(members):
      row={'id':m['id'],'name':m['name'],'status':m['status'],'pass':next((p for p in passes if p['user_id']==m['id']),None),'count':0,'lifetime':0,'debits':0,'items':[],'latestDate':None,'attendedAt':None}
      if index==1:
       row.update(count=5,lifetime=9,latestDate='2026-11-12',attendedAt='2026-11-12T01:05:00Z')
       if kind=='rm':row.update(count=55,items=[{'id':'deadlift','label':'Deadlift','count':55,'best':{'lbs':225,'date':'2020-01-01'},'latest':{'lbs':200,'date':'2026-11-11'}}])
       elif kind=='named':row.update(count=2,items=[{'id':'nw-cindy','label':'Cindy','count':2,'best':{'rounds':12,'reps':5,'date':'2020-01-01'},'latest':{'rounds':11,'reps':90,'date':'2026-11-11'}}])
      rows.append(row)
     data={'kind':kind,'date':q.get('date'),'month':q.get('month'),'members':rows,'catalogue':[{'id':'deadlift' if kind=='rm' else 'nw-cindy','name':'Deadlift' if kind=='rm' else 'Cindy'}]}
   elif u.path.endswith('/api/members'):
    member=next(m for m in members if m['id']==body['id']);member.update(status='suspended',rejected_at='2026-11-12T01:00:00Z',rejection_reason=body.get('reason'));data={'ok':True}
   elif u.path.endswith('/api/signup/reapply'):
    member=next(m for m in members if m['id']==uid);member.update(status='pending',name=body['name'],rejection_reason=None);data={'ok':True}
   elif '/auth/v1/' in u.path:data=user
   elif u.path.endswith('/api/revision'):data={'revision':len(posts),'serverNow':'2026-11-12T01:00:00Z'}
   else:data={'ok':True}
   await r.fulfill(content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(data));return
  if u.hostname=='127.0.0.1':await r.continue_();return
  await r.abort()
 await context.route('**/*',route)
 page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 return context,page
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  context,page=await setup(browser,ADMIN)
  await context.add_init_script("const QARealDate=Date;globalThis.Date=class extends QARealDate{constructor(...a){super(...(a.length?a:['2026-11-12T01:00:00Z']))}static now(){return new QARealDate('2026-11-12T01:00:00Z').getTime()}};")
  await page.goto(origin+'/#admin/overview',wait_until='networkidle')
  await page.locator('.overview-member').first.wait_for(timeout=15000)
  assert await page.locator('.overview-member').count()==5
  assert '출석 10:05' in await page.locator('.overview-member').filter(has_text='기간권회원').inner_text()
  assert '미출석' in await page.locator('.overview-member').filter(has_text='횟수권회원').inner_text()
  await page.locator('[data-overview-presence]').select_option('yes')
  assert await page.locator('.overview-member').count()==1
  await page.locator('[data-overview-presence]').select_option('all')
  await page.locator('[data-overview-kind=rm]').click()
  await page.locator('.overview-records').first.wait_for()
  await page.locator('.overview-records summary').first.click()
  assert '225 lbs' in await page.locator('[data-overview-list]').inner_text()
  assert '200 lbs' in await page.locator('[data-overview-list]').inner_text()
  await page.locator('[data-overview-unit]').select_option('kg')
  assert '102.1 kg' in await page.locator('[data-overview-list]').inner_text()
  await page.locator('[data-overview-filter="deadlift"]').click()
  await page.locator('.overview-history-row').first.wait_for()
  assert await page.locator('.overview-history-row img').count()==0
  assert '<img src=x' in await page.locator('.overview-history-row').first.inner_text()
  await page.locator('[data-overview-history-page="1"]').click()
  await page.wait_for_timeout(200)
  assert await page.locator('.overview-history-row').count()==5
  assert '2020-01-01' in await page.locator('#modal').inner_text()
  await page.locator('#modal [data-action=close]').click()
  await page.locator('[data-overview-kind=named]').click()
  await page.locator('.overview-records').first.wait_for()
  await page.locator('.overview-records summary').first.click()
  assert '12R + 5' in await page.locator('[data-overview-list]').inner_text()
  await page.locator('[data-overview-search]').fill('없는회원')
  assert await page.locator('.overview-member').count()==0
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await page.goto(origin+'/#admin/members',wait_until='networkidle')
  await page.locator('.member-row').first.wait_for()
  await page.locator('#member-status-filter').select_option('all')
  for name,cls in [('기간권회원','member-active'),('횟수권회원','member-visits'),('휴회회원','member-paused')]:
   avatar=page.locator('.member-row').filter(has_text=name).locator('.avatar')
   assert cls in await avatar.get_attribute('class')
  avatar=page.locator('.member-row').filter(has_text='횟수권회원').locator('.avatar')
  assert '255, 155, 66' in await avatar.evaluate('(e)=>getComputedStyle(e).boxShadow')
  avatar=page.locator('.member-row').filter(has_text='시작전회원').locator('.avatar')
  assert 'member-active' not in await avatar.get_attribute('class')
  await page.locator('[data-member-detail="'+REJECTED+'"]').click()
  assert await page.locator('[name=visits]').get_attribute('inputmode')=='numeric'
  await page.locator('#pass-kind').select_option('period')
  await page.locator('#pass-kind').select_option('visits')
  assert await page.locator('[name=visits]').get_attribute('inputmode')=='numeric'
  assert not errors,errors
  await context.close()
  context,page=await setup(browser,PENDING)
  before=len(queries)
  await page.goto(origin+'/#admin/overview',wait_until='networkidle')
  assert await page.locator('[data-member-overview]').count()==0
  assert len(queries)==before
  print('Browser: all-member attendance, RM best/recent/unit, named rounds, paged old histories, escaping, operator-only UI, orange/paused/future rings and numeric input passed.')
  await browser.close()
 server.shutdown()
asyncio.run(main())
