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
    data={'viewer':viewer,'members':members if uid==ADMIN else [],'workouts':{},'records':[],'rms':[],'posts':[],'library':[],'notices':[],'preferences':{},'membership':{'id':'test-pass','user_id':uid,'kind':'period','months':1,'start_date':'2026-10-15','end_date':'2026-11-14'},'memberships':[],'membershipEvents':[],'memberAttendance':[],'attendance':[],'push':{},'releaseTime':'22:00','revision':len(posts),'serverNow':'2026-11-10T11:00:00Z','calendar':{'dates':{}},'privacyReviewRequired':False}
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
  await context.add_init_script("localStorage.setItem('onoff-push-preferences',JSON.stringify({notices:true,workouts:true}));Object.defineProperty(navigator,'serviceWorker',{value:{getRegistration:async()=>({pushManager:{getSubscription:async()=>({endpoint:'https://web.push.apple.com/isolated-expiry',toJSON:()=>({endpoint:'https://web.push.apple.com/isolated-expiry',keys:{}})})}})}});")
  await page.goto(origin+'/?membership=expiry#settings',wait_until='networkidle')
  await page.locator('#modal[open] .membership-card').wait_for(timeout=15000)
  assert '나의 회원권' in await page.locator('#modal').inner_text()
  assert '검증 운영자' in await page.locator('#modal .membership-owner').inner_text()
  assert '2026-11-14' in await page.locator('#modal .membership-dates').inner_text()
  assert 'membership=expiry' not in page.url
  await page.locator('#modal [data-action=close]').click()
  # Staff normally hide their wallet. The push link still opens only their own card.
  assert await page.locator('main .membership-card').count()==0
  await page.locator('[data-action=notification-settings]').click()
  toggle=page.locator('[data-push-pref=memberships]')
  assert await toggle.get_attribute('aria-checked')=='true'
  await toggle.click()
  await page.wait_for_timeout(300)
  assert await toggle.get_attribute('aria-checked')=='false'
  writes=[x for x in posts if x['path'].endswith('/api/push/subscribe')]
  assert writes[-1]['body']['preferences']['memberships'] is False
  assert writes[-1]['body']['preferences']['notices'] is True
  await toggle.click()
  await page.wait_for_timeout(300)
  assert await toggle.get_attribute('aria-checked')=='true'
  writes=[x for x in posts if x['path'].endswith('/api/push/subscribe')]
  assert writes[-1]['body']['preferences']['memberships'] is True
  assert not errors,errors
  print('Browser: expiry notification link opens the own wallet, hides no account checks; new preference defaults on and persists off/on independently.')
  await browser.close()
 server.shutdown()
asyncio.run(main())
