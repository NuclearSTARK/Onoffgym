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
members.extend([dict(base,id='10000000-0000-4000-8000-000000000005',name='동명이인',note='오전 방문',status='approved'),dict(base,id='10000000-0000-4000-8000-000000000006',name='동명이인',note='저녁 방문',status='approved')])
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
   elif u.path.endswith('/api/photos/upload'):
    data={'id':'30000000-0000-4000-8000-000000000001'}
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
  await context.grant_permissions(['geolocation']);await context.set_geolocation({'latitude':35.2851377,'longitude':129.2170302,'accuracy':15})
  await page.goto(origin+'/#admin/record-tools',wait_until='networkidle')
  await page.locator('#record-tools-form').wait_for(timeout=15000)
  assert 'OPENAI_API_KEY' not in await page.locator('body').inner_text()
  assert await page.locator('[name=photoEnabled]').count()==0
  await page.locator('[data-gym-locate]').click()
  assert float(await page.locator('[name=latitude]').input_value())==35.2851377
  await page.locator('#record-tools-form [type=submit]').click();await page.wait_for_timeout(200)
  assert any(x['path'].endswith('/api/record-tools') and x['body']['attendance']['radius']==200 for x in posts)
  search=page.locator('[data-gps-member-search]')
  submit=page.locator('#attendance-override-form [type=submit]')
  assert await submit.is_disabled()
  await search.fill('승인대기')
  assert await page.locator('[data-gps-member]').count()==0
  await search.fill('동명이인')
  assert await page.locator('[data-gps-member]').count()==2
  assert '오전 방문' in await page.locator('#gps-member-results').inner_text()
  await page.locator('[data-gps-member="10000000-0000-4000-8000-000000000006"]').click()
  assert await page.locator('[name=memberId]').input_value()=='10000000-0000-4000-8000-000000000006'
  assert not await submit.is_disabled()
  await search.fill('검증')
  assert await page.locator('[name=memberId]').input_value()==''
  assert await submit.is_disabled()
  await page.locator('[data-gps-member="'+ADMIN+'"]').click()
  await page.locator('#attendance-override-form [name=reason]').fill('실내 위치 오류 확인')
  await page.locator('#attendance-override-form [type=submit]').click();await page.wait_for_timeout(200)
  assert any(x['path'].endswith('/api/attendance/override') and x['body']['id']==ADMIN and x['body']['reason']=='실내 위치 오류 확인' for x in posts)
  await page.goto(origin+'/#members',wait_until='networkidle')
  await page.locator('[data-records-filter="WOD"]').click()
  await page.locator('[data-action=daily-photo-upload]').wait_for()
  assert await page.locator('[data-board-open]').count()==0
  await page.locator('[data-action=daily-photo-upload]').click()
  assert '칠판 사진을 그대로 저장' in await page.locator('#modal').inner_text()
  assert await page.locator('[data-photo-files]').count()==1
  from PIL import Image
  from io import BytesIO
  fixture=BytesIO();Image.new('RGB',(40,40),'white').save(fixture,format='JPEG')
  await page.locator('[data-photo-files]').set_input_files({'name':'fixture.jpg','mimeType':'image/jpeg','buffer':fixture.getvalue()})
  await page.locator('[data-photo-preview] img').wait_for()
  await page.locator('#daily-photo-form [type=submit]').click()
  await page.wait_for_timeout(600)
  assert any(x['path'].endswith('/api/photos/attach') and x['body']['photoIds']==['30000000-0000-4000-8000-000000000001'] for x in posts)
  assert await page.locator('#modal[open]').count()==0
  assert not any('/api/board/' in x['path'] for x in posts)
  assert not errors,errors
  print('Browser: GPS calibration/exception attendance preserved; original photo upload remains; AI settings/actions are removed.')
  await browser.close()
 server.shutdown()
asyncio.run(main())
