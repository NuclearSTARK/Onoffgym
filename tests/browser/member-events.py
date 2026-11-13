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
workouts={f'{day}_{program}':{'date':day,'program':program,'sections':[{'text':program+' 첫 번째 운동','record':False,'kind':'시간'},{'text':program+' 두 번째 운동','record':False,'kind':'라운드'}]} for day in ['2026-11-14','2026-11-13','2027-01-01','2026-12-21'] for program in ['B/T','WOD']}
lost_replies=set()
server_now='2026-11-14T01:00:00Z'
best_lbs=200
fail_save=False
preferences={}
first_workout=None


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
  global best_lbs,first_workout
  u=urlparse(r.request.url)
  if 'backend-config.js' in u.path:
   await r.fulfill(content_type='text/javascript',body='window.ONOFF_BACKEND='+json.dumps({'url':'https://approval-test.invalid','projectId':'approval-qa','publishableKey':'sb_publishable_isolated_qa'})+';');return
  if u.hostname=='approval-test.invalid':
   data={};body=r.request.post_data_json if r.request.method=='POST' else None
   if body is not None:posts.append({'uid':uid,'path':u.path,'body':body})
   if u.path.endswith('/api/tv/bootstrap'):
    data={'date':server_now[:10],'serverNow':server_now,'releaseTime':'22:00','dayState':'open-gym','holidayName':'','workouts':[w for w in workouts.values() if w['date']==server_now[:10]],'preferences':{'unit':'lbs','orientation':'landscape','pageSeconds':20}}
   elif u.path.endswith('/api/bootstrap'):
    viewer=dict(next(m for m in members if m['id']==uid),email='qa@example.invalid')
    data={'viewer':viewer,'members':members if uid==ADMIN else [],'workouts':workouts,'records':[],'rms':[],'posts':[],'library':[],'notices':[],'preferences':dict({'pushOnboardingSeen':True},**preferences.get(uid,{})),'membership':None,'memberships':passes,'membershipEvents':[],'memberAttendance':[],'attendance':[],'push':{},'releaseTime':'22:00','revision':len(posts),'serverNow':server_now,'calendar':{'dates':{}},'privacyReviewRequired':False}
   elif u.path.endswith('/api/member-milestones'):
    data={'owner':uid,'rm':[{'id':'back-squat','label':'Back Squat','lbs':best_lbs}],'named':[],'firstWorkout2027':first_workout,'recap':{'year':2026,'attendance':42,'rmCount':15,'namedCount':9,'rm':[{'id':'back-squat','label':'Back Squat','lbs':200}],'named':[{'id':'fran','label':'Fran','type':'time','seconds':300}]}}
   elif u.path.endswith('/api/preferences'):
    preferences.setdefault(uid,{}).update(body);data={'ok':True}
   elif u.path.endswith('/api/rms'):
    if fail_save:
     await r.fulfill(status=403,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps({'error':'검증용 저장 거절'}));return
    best_lbs=max(best_lbs,body['lbs']);data={'ok':True}
   elif u.path.endswith('/api/attendance'):
    first_workout=server_now[:10];data={'ok':True}
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
   elif u.path.endswith('/api/revision'):data={'revision':len(posts),'serverNow':server_now}
   else:data={'ok':True}
   await r.fulfill(content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(data));return
  if u.hostname=='127.0.0.1':await r.continue_();return
  await r.abort()
 await context.route('**/*',route)
 await context.add_init_script("const QADate=Date;globalThis.Date=class extends QADate{constructor(...a){super(...(a.length?a:["+json.dumps(server_now)+"]))}static now(){return new QADate("+json.dumps(server_now)+").getTime()}};")
 page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 return context,page
async def main():
 global server_now,best_lbs,fail_save,first_workout
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  context,page=await setup(browser,ADMIN)
  await page.goto(origin+'/#home',wait_until='networkidle')
  assert await page.locator('.home-program-tabs button').count()==1
  assert await page.locator('.home-program-tabs button').inner_text()=='Special Workout'
  assert await page.locator('[data-comment-program]').count()==1
  assert await page.locator('[data-comment-program="WOD"]').count()==1
  await page.goto(origin+'/#admin/workouts',wait_until='networkidle')
  assert await page.locator('[data-edit-workout="B/T"]').count()==0
  await page.locator('[data-edit-workout="WOD"]').click()
  assert 'Special Workout' in await page.locator('#modal h2').inner_text()
  assert await page.locator('#workout-form [name="sessions"]').count()==1
  await page.locator('.modal-close').click()
  await page.goto(origin+'/tv.html',wait_until='networkidle')
  await page.locator('.tv-program strong').wait_for()
  assert await page.locator('.tv-program strong').all_inner_texts()==['Special Workout']
  assert await page.locator('#tv-WOD .tv-section').count()>0
  await page.screenshot(path='/workspace/scratch/saturday-tv-qa.png')
  await context.close()
  # Actual record form saves: only strict own bests celebrate; rejection cannot celebrate.
  server_now='2026-11-13T01:00:00Z'
  context,page=await setup(browser,ADMIN)
  await page.goto(origin+'/#records/rm',wait_until='networkidle')
  async def save_rm(weight):
   await page.locator('[data-action="rm-add"]').click()
   await page.locator('#rm-form [name="movement"]').select_option('back-squat')
   await page.locator('#rm-form [name="weight"]').fill(str(weight))
   await page.locator('#rm-form button[type="submit"],#rm-form button.primary').click()
  await save_rm(205)
  await page.locator('.pr-celebration').wait_for()
  assert '검증 운영자' in await page.locator('.pr-celebration').inner_text()
  await page.locator('.pr-celebration').wait_for(state='detached')
  await save_rm(205)
  await page.wait_for_timeout(900)
  assert await page.locator('.pr-celebration').count()==0
  fail_save=True
  await save_rm(210)
  await page.wait_for_timeout(500)
  assert await page.locator('#rm-form').count()==1
  assert await page.locator('.pr-celebration').count()==0
  fail_save=False
  await context.close()
  # Christmas starts on the 21st; reduced-motion keeps an accessible static gift.
  server_now='2026-12-21T01:00:00Z'
  context,page=await setup(browser,ADMIN)
  await page.emulate_media(reduced_motion='reduce')
  await page.goto(origin+'/#home',wait_until='networkidle')
  await page.locator('[data-christmas-gift]').click()
  assert await page.locator('#toast').inner_text()
  assert await page.locator('.christmas-sleigh img').get_attribute('src')=='./assets/christmas-sleigh-v2.webp'
  await page.screenshot(path='/workspace/scratch/christmas-events-mobile.png')
  await context.close()
  # First-entry shown once/account; first attendance is stamped; recap exports a real PNG.
  server_now='2027-01-01T01:00:00Z';first_workout=None
  context,page=await setup(browser,REJECTED)
  await page.goto(origin+'/#home',wait_until='networkidle')
  await page.locator('.newyear-welcome').wait_for()
  assert await page.locator('.newyear-number').inner_text()=='2027'
  await page.locator('.newyear-welcome').wait_for(state='detached')
  assert preferences[REJECTED]['newYear2027Seen'] is True
  await page.locator('[data-action="attendance"]').click()
  await page.goto(origin+'/#settings',wait_until='networkidle')
  await page.locator('.first-workout-stamp').wait_for()
  assert '2027 첫 운동 완료' in await page.locator('.membership-card').inner_text()
  await page.locator('[data-member-recap]').click()
  await page.locator('.recap-metrics strong').first.wait_for()
  assert await page.locator('.recap-metrics strong').all_inner_texts()==['42','15','9']
  async with page.expect_download() as dl:
   await page.locator('[data-recap-save]').click()
  download=await dl.value
  target='/workspace/scratch/ONOFF-2026-qa.png';await download.save_as(target)
  assert pathlib.Path(target).stat().st_size>10000
  await page.screenshot(path='/workspace/scratch/member-recap-mobile.png')
  await page.locator('.modal-close').click()
  await page.reload(wait_until='networkidle');await page.wait_for_timeout(900)
  assert await page.locator('.newyear-welcome').count()==0
  for theme in ['navy','mint','orange']:
   await page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
   for width in [320,390,768]:
    await page.set_viewport_size({'width':width,'height':844})
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(theme,width)
  assert not errors,errors
  print('Browser: Saturday single registration/course/comments; successful strict PR and failed/tied saves; Christmas gift with reduced motion; once-per-account New Year; first-attendance stamp; own recap and PNG export; 3 themes at 320/390/768px passed.')
  await browser.close()
 server.shutdown()
asyncio.run(main())
