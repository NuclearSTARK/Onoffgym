import asyncio,base64,json,pathlib,threading,time
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlparse,parse_qs
from playwright.async_api import async_playwright
root=str(pathlib.Path(__file__).resolve().parents[2]/'pages-dist')
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=root));threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port)
ADMIN='10000000-0000-4000-8000-000000000001';PENDING='10000000-0000-4000-8000-000000000002';REJECTED='10000000-0000-4000-8000-000000000003';STOPPED='10000000-0000-4000-8000-000000000004'
base={'role':'member','privacy_version':'privacy-2026-11-05','gender':'male','age_over_14':True,'disclosure_consent':True,'created_at':'2026-11-01T00:00:00Z','coach_permissions':[]}
members=[dict(base,id=ADMIN,name='검증 운영자',role='admin',status='approved',approved_at='2026-11-01T00:00:00Z'),dict(base,id=PENDING,name='기간권회원',status='approved'),dict(base,id=REJECTED,name='횟수권회원',status='approved'),dict(base,id=STOPPED,name='휴회회원',status='approved'),dict(base,id='10000000-0000-4000-8000-000000000005',name='시작전회원',status='approved')]
passes=[{'id':'pass-period','user_id':PENDING,'kind':'period','months':1,'start_date':'2026-11-01','end_date':'2026-12-01'}, {'id':'pass-visits','user_id':REJECTED,'kind':'visits','remaining_visits':7,'total_visits':10,'start_date':'2026-11-01','end_date':'2026-12-01'}, {'id':'pass-paused','user_id':STOPPED,'kind':'visits','remaining_visits':8,'total_visits':10,'start_date':'2026-11-01','end_date':'2026-12-01','paused_at':'2026-11-10'}, {'id':'pass-future','user_id':members[4]['id'],'kind':'period','months':3,'start_date':'2026-11-16','end_date':'2027-02-15'}]
queries=[]
comment_store={}
for program,count in [('B/T',1),('WOD',22)]:
 comment_store[('2026-11-13',program)]=[{'id':f'30000000-0000-4000-8000-{i+(0 if program=='B/T' else 100):012d}','authorId':REJECTED,'author':'횟수권회원','avatarEmoji':'🔥','text':'<img src=x onerror=alert(1)> 안전한 글' if program=='B/T' else f'WOD 댓글 {i}','revision':0,'createdAt':f'2026-11-13T00:00:{i:02d}Z','updatedAt':f'2026-11-13T00:00:{i:02d}Z'} for i in range(1,count+1)]
workouts={f'{day}_{program}':{'date':day,'program':program,'sections':[{'text':program+' 첫 번째 운동','record':False,'kind':'시간'},{'text':program+' 두 번째 운동','record':False,'kind':'라운드'}]} for day in ['2026-11-13','2026-11-12'] for program in ['B/T','WOD']}
lost_replies=set()


posts=[];errors=[]
def token(uid):
 enc=lambda v:base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
 return enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'exp':4102444800,'iat':1793404800,'aud':'authenticated','role':'authenticated'})+'.signature'
async def setup(browser,uid,width=390):
 context=await browser.new_context(viewport={'width':width,'height':844},has_touch=True)
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
    data={'viewer':viewer,'members':members if uid==ADMIN else [],'workouts':workouts,'records':[],'rms':[],'posts':[],'library':[],'notices':[],'preferences':{'pushOnboardingSeen':True},'membership':None,'memberships':passes,'membershipEvents':[],'memberAttendance':[],'attendance':[],'push':{},'releaseTime':'22:00','revision':len(posts),'serverNow':'2026-11-13T01:00:00Z','calendar':{'dates':{}},'privacyReviewRequired':False}
   elif '/api/workout-comments' in u.path:
    q={k:v[0] for k,v in parse_qs(u.query).items()};v=q if body is None else body
    key=(v['date'],v['program']);rows=comment_store.setdefault(key,[])
    if body is not None:
     action=u.path.split('/')[-1];old=next((c for c in rows if c['id']==body['id']),None)
     if action=='create':
      if old is None:
       rows.append({'id':body['id'],'authorId':uid,'author':next(m['name'] for m in members if m['id']==uid),'avatarEmoji':'🏆','text':body['text'],'revision':0,'createdAt':'2026-11-13T01:00:00Z','updatedAt':'2026-11-13T01:00:00Z'})
      if body['text']=='재시도 댓글' and body['id'] not in lost_replies:
       lost_replies.add(body['id']);await r.abort();return
     elif action=='update':
      assert old and old['authorId']==uid
      old.update(text=body['text'],revision=old['revision']+1,updatedAt='2026-11-13T01:00:00Z')
     elif action=='delete':
      assert old and (old['authorId']==uid or uid==ADMIN)
      rows.remove(old)
     data={'ok':True,'id':body['id']}
    elif q.get('action')=='summary':
     await asyncio.sleep(2)
     data={'total':len(rows)}
    else:
     rows=sorted(rows,key=lambda c:(c['createdAt'],c['id']),reverse=True)
     if q.get('before'):rows=[c for c in rows if (c['createdAt'],c['id'])<(q['before'],q['beforeId'])]
     selected=rows[:20];data={'total':len(comment_store[key]),'items':[dict(c,canEdit=c['authorId']==uid,canDelete=c['authorId']==uid or uid==ADMIN) for c in selected],'next':{'before':selected[-1]['createdAt'],'beforeId':selected[-1]['id']} if len(rows)>20 else None}
   elif u.path.endswith('/api/member-overview'):
    q={k:v[0] for k,v in parse_qs(u.query).items()};queries.append(q);kind=q.get('kind','attendance')
    if q.get('action')=='history':
     pn=int(q.get('page','0'));data={'kind':kind,'memberId':q['memberId'],'page':pn,'total':55,'hasMore':pn==0,'items':[{'id':str(i),'date':'2020-01-01' if pn else '2026-11-11','lbs':225,'label':'Deadlift','note':'<img src=x onerror=alert(1)>','event':'attendance','createdAt':'2026-11-12T01:05:00Z','debited':True} for i in range(50 if pn==0 else 5)]}
    else:
     rows=[]
     for index,m in enumerate(members+[dict(base,id=f'20000000-0000-4000-8000-{i:012d}',name=f'테스트회원{i:02d}',status='approved') for i in range(20)]):
      row={'id':m['id'],'name':m['name'],'status':m['status'],'pass':next((p for p in passes if p['user_id']==m['id']),None),'count':0,'lifetime':0,'debits':0,'items':[],'latestDate':None,'attendedAt':None}
      if index==1:
       row.update(count=5,lifetime=9,latestDate='2026-11-12',attendedAt='2026-11-12T01:05:00Z')
       if kind=='rm':row.update(count=55,items=[{'id':'deadlift','label':'Deadlift','count':55,'best':{'lbs':225,'date':'2020-01-01'},'latest':{'lbs':200,'date':'2026-11-11'}}])
       elif kind=='named':row.update(count=2,items=[{'id':'nw-cindy','label':'Cindy','count':2,'best':{'rounds':12,'reps':5,'date':'2020-01-01'},'latest':{'rounds':11,'reps':90,'date':'2026-11-11'}}])
      rows.append(row)
     data={'kind':kind,'date':q.get('date'),'month':q.get('month'),'members':rows,'catalogue':[{'id':'deadlift' if kind=='rm' else 'nw-cindy','name':'Deadlift' if kind=='rm' else 'Cindy'}]}
   elif u.path.endswith('/api/members'):
    member=next(m for m in members if m['id']==body['id']);member.update(status='suspended',rejected_at='2026-11-13T01:00:00Z',rejection_reason=body.get('reason'));data={'ok':True}
   elif u.path.endswith('/api/signup/reapply'):
    member=next(m for m in members if m['id']==uid);member.update(status='pending',name=body['name'],rejection_reason=None);data={'ok':True}
   elif '/auth/v1/' in u.path:data=user
   elif u.path.endswith('/api/revision'):data={'revision':len(posts),'serverNow':'2026-11-13T01:00:00Z'}
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
  context,page=await setup(browser,PENDING)
  await context.add_init_script("const QARealDate=Date;globalThis.Date=class extends QARealDate{constructor(...a){super(...(a.length?a:['2026-11-13T01:00:00Z']))}static now(){return new QARealDate('2026-11-13T01:00:00Z').getTime()}};")
  page.on('dialog',lambda dialog:dialog.accept())
  await page.goto(origin+'/#home',wait_until='domcontentloaded')
  await page.locator('[data-workout-comments]').first.wait_for(timeout=15000)
  assert await page.locator('[data-workout-comments]').count()==2
  assert await page.locator('.course-section-card [data-workout-comments]').count()==0
  assert await page.locator('.workout-comments-heading strong').all_text_contents()==['댓글','댓글']
  assert await page.locator('[data-workout-comments]').evaluate_all('(es)=>es.every(e=>e.previousElementSibling.classList.contains("course-sections"))')
  bt=page.locator('[data-comment-program="B/T"]');wod=page.locator('[data-comment-program="WOD"]')
  await page.locator('.home-program-tabs [data-program="B/T"]').click()
  await bt.locator('[data-comment-toggle]').click()
  await bt.locator('[data-workout-comment]').first.wait_for()
  assert '<img src=x' in await bt.locator('.workout-comment>p').first.inner_text()
  assert await bt.locator('.workout-comment>p img').count()==0
  assert await bt.locator('[data-comment-edit],[data-comment-delete]').count()==0
  await bt.locator('[data-comment-text]').fill('B/T 작성 중 초안')
  await page.locator('.home-program-tabs [data-program="WOD"]').click()
  await wod.locator('[data-comment-compose]').click()
  await wod.locator('[data-comment-text]').fill('WOD 작성 중 초안')
  await page.locator('.home-program-tabs [data-program="B/T"]').click()
  assert await bt.locator('[data-comment-text]').input_value()=='B/T 작성 중 초안'
  await page.locator('[data-action=prev-date]').click()
  await page.locator('[data-comment-date="2026-11-12"]').first.wait_for()
  await page.locator('.home-program-tabs [data-program="B/T"]').click()
  previous=page.locator('[data-comment-date="2026-11-12"][data-comment-program="B/T"]')
  await previous.locator('[data-comment-compose]').click()
  assert await previous.locator('[data-comment-text]').input_value()==''
  await page.locator('[data-action=today]').click()
  await page.locator('[data-comment-date="2026-11-13"]').first.wait_for()
  await page.locator('.home-program-tabs [data-program="B/T"]').click()
  assert await bt.locator('[data-comment-text]').input_value()=='B/T 작성 중 초안'
  await bt.locator('[data-comment-text]').fill('B/T 등록한 댓글')
  await bt.locator('[data-workout-comment-form] [type=submit]').click()
  own=bt.locator('.workout-comment').filter(has_text='B/T 등록한 댓글')
  await own.wait_for()
  assert len([c for c in comment_store[('2026-11-13','B/T')] if c['authorId']==PENDING])==1
  await own.locator('[data-comment-edit]').click()
  await own.locator('[data-comment-edit-text]').fill('B/T 수정한 댓글')
  await own.locator('[data-workout-comment-edit] [type=submit]').click()
  await bt.locator('.workout-comment>p').filter(has_text='B/T 수정한 댓글').wait_for()
  await bt.locator('[data-comment-text]').fill('재시도 댓글')
  await bt.locator('[data-workout-comment-form] [type=submit]').click()
  await bt.locator('.workout-comments-error').wait_for()
  assert await bt.locator('[data-comment-text]').input_value()=='재시도 댓글'
  await bt.locator('[data-workout-comment-form] [type=submit]').click()
  await bt.locator('.workout-comment>p').filter(has_text='재시도 댓글').wait_for()
  assert len([c for c in comment_store[('2026-11-13','B/T')] if c['text']=='재시도 댓글'])==1
  await bt.locator('[data-comment-toggle]').scroll_into_view_if_needed()
  await page.screenshot(path='/workspace/scratch/workout-comments-mobile.png')
  for width in [320,390,768]:
   await page.set_viewport_size({'width':width,'height':844})
   assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await page.set_viewport_size({'width':390,'height':844})
  await page.locator('.home-program-tabs [data-program="WOD"]').click()
  assert await wod.locator('[data-comment-text]').input_value()=='WOD 작성 중 초안'
  await wod.locator('[data-workout-comment-form] [type=submit]').click()
  await wod.locator('.workout-comment>p').filter(has_text='WOD 작성 중 초안').wait_for()
  await wod.locator('[data-comment-older]').click()
  await page.wait_for_timeout(300)
  assert await wod.locator('[data-workout-comment]').count()==23
  assert len(set(await wod.locator('[data-workout-comment]').evaluate_all('(es)=>es.map(e=>e.dataset.workoutComment)')))==23
  assert not errors,errors
  await context.close()
  context,page=await setup(browser,ADMIN)
  await context.add_init_script("const QARealDate=Date;globalThis.Date=class extends QARealDate{constructor(...a){super(...(a.length?a:['2026-11-13T01:00:00Z']))}static now(){return new QARealDate('2026-11-13T01:00:00Z').getTime()}};")
  page.on('dialog',lambda dialog:dialog.accept())
  await page.goto(origin+'/#home',wait_until='networkidle')
  await page.locator('.home-program-tabs [data-program="B/T"]').click()
  bt=page.locator('[data-comment-program="B/T"]')
  await bt.locator('[data-comment-toggle]').click()
  target=bt.locator('.workout-comment').filter(has_text='B/T 수정한 댓글')
  await target.wait_for()
  assert await target.locator('[data-comment-edit]').count()==0
  await target.locator('[data-comment-delete]').click()
  await page.wait_for_timeout(400)
  assert await bt.locator('.workout-comment>p').filter(has_text='B/T 수정한 댓글').count()==0
  assert not any(c['text']=='B/T 수정한 댓글' for c in comment_store[('2026-11-13','B/T')])
  assert any(c['text']=='WOD 작성 중 초안' for c in comment_store[('2026-11-13','WOD')])
  assert not errors,errors
  print('Browser: one identical comment area per course; date/program draft separation; delayed summaries; own create/edit; idempotent retry; escaping; 20-item older paging; operator deletion and responsive layout passed.')
  await browser.close()
 server.shutdown()
asyncio.run(main())
