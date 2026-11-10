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
members=[dict(base,id=ADMIN,name='검증 운영자',role='admin',status='approved',approved_at='2026-11-01T00:00:00Z'),dict(base,id=PENDING,name='승인대기회원',status='pending',approved_at=None),dict(base,id=REJECTED,name='거절된회원',status='suspended',approved_at=None,rejected_at='2026-11-10T10:00:00Z'),dict(base,id=STOPPED,name='이용중지회원',status='suspended',approved_at='2026-11-01T00:00:00Z')]
posts=[];errors=[];saved=None
photo='20000000-0000-4000-8000-000000000001'
record_tools={'photoEnabled':True,'aiReady':False,'attendance':{'enabled':True,'latitude':35.2851377,'longitude':129.2170302,'radius':200}}
sections=[{'key':'WOD:1','program':'WOD','number':1,'kind':'시간','teamSize':2,'title':'S1','text':'Team of 2'}]

def token(uid):
 enc=lambda v:base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
 return enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'exp':4102444800,'iat':1793404800,'aud':'authenticated','role':'authenticated'})+'.signature'
async def setup(browser,uid,width=390):
 context=await browser.new_context(viewport={'width':width,'height':844})
 user={'id':uid,'email':'qa@example.invalid','aud':'authenticated','role':'authenticated','user_metadata':{},'app_metadata':{}}
 session={'access_token':token(uid),'refresh_token':'isolated-fixture','expires_at':4102444800,'expires_in':2300000000,'token_type':'bearer','user':user}
 await context.add_init_script("localStorage.setItem('onoff-auth-approval-qa',"+json.dumps(json.dumps(session))+");")
 async def route(r):
  global saved,record_tools
  u=urlparse(r.request.url)
  if 'backend-config.js' in u.path:
   await r.fulfill(content_type='text/javascript',body='window.ONOFF_BACKEND='+json.dumps({'url':'https://approval-test.invalid','projectId':'approval-qa','publishableKey':'sb_publishable_isolated_qa'})+';');return
  if u.hostname=='approval-test.invalid':
   data={};body=r.request.post_data_json if r.request.method=='POST' else None
   if body is not None:posts.append({'uid':uid,'path':u.path,'body':body})
   if u.path.endswith('/api/bootstrap'):
    viewer=dict(next(m for m in members if m['id']==uid),email='qa@example.invalid')
    data={'viewer':viewer,'members':members if uid==ADMIN else [],'workouts':{'2026-11-10_WOD':{'date':'2026-11-10','program':'WOD','sections':[{'number':1,'title':'S1','text':'Team of 2','record':True,'kind':'시간'}]}},'records':[],'rms':[],'posts':[],'library':[],'notices':[],'preferences':{},'membership':None,'memberships':[],'membershipEvents':[],'memberAttendance':[],'attendance':[],'push':{},'releaseTime':'22:00','revision':len(posts),'serverNow':'2026-11-10T11:00:00Z','calendar':{'dates':{}},'privacyReviewRequired':False,'recordTools':record_tools,'photos':[{'id':photo,'kind':'daily','date':'2026-11-10','program':'WOD','session':'','ownerId':ADMIN}], 'photoRecords':[]}
   elif u.path.endswith('/api/board/open'):
    data={'photo':photo,'date':'2026-11-10','sections':sections,'members':[members[0]],'aliases':[],'saved':saved,'aiReady':False}
   elif u.path.endswith('/api/board/save'):
    saved={'photo_id':photo,'rows':body['rows'],'revision':(saved or {}).get('revision',0)+1,'status':body['status']};data={'saved':saved}
   elif u.path.endswith('/api/record-tools'):
    record_tools=dict(body,aiReady=False);data={'ok':True}
   elif u.path.endswith('/api/attendance/override'):data={'ok':True}
   elif u.path.endswith('/api/members'):
    member=next(m for m in members if m['id']==body['id']);member.update(status='suspended',rejected_at='2026-11-10T11:00:00Z',rejection_reason=body.get('reason'));data={'ok':True}
   elif u.path.endswith('/api/signup/reapply'):
    member=next(m for m in members if m['id']==uid);member.update(status='pending',name=body['name'],rejection_reason=None);data={'ok':True}
   elif '/auth/v1/' in u.path:data=user
   elif u.path.endswith('/api/revision'):data={'revision':len(posts),'serverNow':'2026-11-10T11:00:00Z'}
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
  await context.add_init_script("const QARealDate=Date;globalThis.Date=class extends QARealDate{constructor(...a){super(...(a.length?a:['2026-11-10T11:00:00Z']))}static now(){return new QARealDate('2026-11-10T11:00:00Z').getTime()}};")
  await context.grant_permissions(['geolocation'])
  await context.set_geolocation({'latitude':35.2851377,'longitude':129.2170302,'accuracy':15})
  await page.goto(origin+'/#admin/record-tools',wait_until='networkidle')
  await page.locator('#record-tools-form').wait_for(timeout=15000)
  await page.locator('[data-gym-locate]').click()
  assert float(await page.locator('[name=latitude]').input_value())==35.2851377
  await page.locator('#record-tools-form [type=submit]').click()
  await page.wait_for_timeout(300)
  assert any(x['path'].endswith('/api/record-tools') and x['body']['attendance']['radius']==200 for x in posts)
  await page.locator('#attendance-override-form [name=memberId]').select_option(ADMIN)
  await page.locator('#attendance-override-form [name=reason]').fill('실내 위치 오류 확인')
  await page.locator('#attendance-override-form [type=submit]').click()
  await page.wait_for_timeout(300)
  assert any(x['path'].endswith('/api/attendance/override') for x in posts)
  await page.goto(origin+'/#members',wait_until='networkidle')
  await page.locator('[data-records-filter=\"WOD\"]').click()
  await page.locator('[data-board-open]').first.wait_for(timeout=10000)
  await page.locator('[data-board-open]').first.click()
  await page.locator('[data-board-add]').click()
  await page.locator('[name=sectionKey]').select_option('WOD:1')
  await page.locator('[name=name]').fill('형대')
  await page.locator('[name=memberId]').select_option(ADMIN)
  await page.locator('[name=remember]').check()
  await page.locator('[data-board-person-add]').click()
  await page.locator('[name=name]').nth(1).fill('미가입팀원')
  await page.locator('[name=value]').fill('08:41')
  await page.locator('[name=note]').fill('팀원 확인 완료')
  await page.locator('[name=reviewed]').check()
  await page.locator('[data-board-save=draft]').click()
  await page.wait_for_timeout(300)
  assert saved['status']=='draft' and len(saved['rows'][0]['participants'])==2
  await page.locator('[data-board-save=published]').click()
  await page.wait_for_timeout(300)
  assert saved['status']=='published'
  assert saved['rows'][0]['value']=='08:41'
  await page.screenshot(path=str(pathlib.Path('/tmp/onoff-record-tools-board.png')))
  page.once('dialog',lambda d:d.accept())
  await page.locator('[data-board-save=void]').click()
  await page.wait_for_timeout(300)
  assert saved['status']=='void'
  assert not errors,errors
  print('Browser: mobile settings, GPS calibration, exception attendance, unlinked team member, alias, draft/publish/void passed; no page errors')
  await browser.close()
 server.shutdown()
asyncio.run(main())
