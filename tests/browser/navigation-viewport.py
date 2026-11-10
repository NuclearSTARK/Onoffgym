# Local browser regression. Requires Python Playwright and Chromium.
# Visual viewport values are simulated; this is not an iPhone device test.
import asyncio,json,pathlib,re,threading,os
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]/'web'
css=re.findall(r'<link[^>]+href=[\"\']([^\"\']+\.css)[\"\']',(ROOT/'index.html').read_text())
fixture='''<!doctype html><html lang="ko" data-theme="navy"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'''+''.join('<link rel="stylesheet" href="/'+c.removeprefix('./')+'">' for c in css)+'''<style>.app-header{height:60px}#main{min-height:2600px}body{margin:0}</style></head><body><div class="app"><header class="app-header">Viewport fixture</header><main id="main">Long page</main></div><nav id="mobile-nav" class="mobile-nav"></nav><dialog id="modal"><header class="modal-head">입력</header><div class="modal-content"><input id="edit" type="text"></div></dialog><script type="module">
import {installAppViewport} from '/app-viewport.js';import {createMobileTabBar} from '/mobile-tab-bar.js';
const vv=Object.assign(new EventTarget(),{height:innerHeight,width:innerWidth,offsetTop:0,offsetLeft:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:vv});
const viewport=installAppViewport();let items=['home','members','records','community','admin'].map(id=>({id,label:id,icon:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>'}));
const bar=createMobileTabBar(document.querySelector('#mobile-nav'),{navigate:id=>{window.active=id;bar.render({items,active:id});viewport.navigationChanged();}});window.active='home';bar.render({items,active:'home'});
window.setTabs=count=>{items=['home','members','records','community','admin'].slice(0,count).map(id=>({id,label:id,icon:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>'}));window.active='home';bar.render({items,active:'home'});};document.querySelector('#mobile-nav').addEventListener('click',e=>{const id=e.target.closest('button')?.dataset.page;if(id){window.active=id;bar.render({items,active:id});viewport.navigationChanged();}});
window.metrics=(values)=>{Object.assign(vv,values);vv.dispatchEvent(new Event('resize'));};window.viewport=viewport;window.bar=bar;window.ready=true;
</script></body></html>'''
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/__nav-qa__':
   b=fixture.encode();self.send_response(200);self.send_header('Content-Type','text/html;charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
  else:super().do_GET()
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
async def main():
 async with async_playwright() as p:
  target=os.environ.get('ONOFF_QA_ORIGIN','http://127.0.0.1:'+str(server.server_port)).rstrip('/')
  launch={'executable_path':'/usr/bin/chromium','headless':True,'args':['--no-sandbox']}
  if os.environ.get('ONOFF_QA_ORIGIN') and os.environ.get('HTTPS_PROXY'):launch['proxy']={'server':os.environ['HTTPS_PROXY']}
  browser=await p.chromium.launch(**launch)
  page=await browser.new_page(viewport={'width':390,'height':844})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  if os.environ.get('ONOFF_QA_ORIGIN'):await page.route(target+'/__nav-qa__',lambda r:r.fulfill(content_type='text/html',body=fixture))
  await page.goto(target+'/__nav-qa__',wait_until='networkidle');await page.wait_for_function('window.ready')
  async def read():return await page.locator('#mobile-nav').evaluate('e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,height:e.getBoundingClientRect().height,viewport:innerHeight,visibility:getComputedStyle(e).visibility,hidden:e.hasAttribute("data-scroll-hidden"),inset:parseFloat(getComputedStyle(e).bottom)})')
  async def at_bottom(label):
   value=await read()
   assert abs(value['bottom']-(page.viewport_size['height']-value['inset']))<1,value
   assert value['height']==63 and value['visibility']=='visible' and not value['hidden'],value
   print(label,json.dumps(value))
  await at_bottom('initial')
  await page.evaluate('metrics({height:530})');await page.wait_for_timeout(150)
  await at_bottom('stale keyboard-sized height without input focus')
  await page.evaluate('window.layoutHeightDescriptor=Object.getOwnPropertyDescriptor(window,"innerHeight");Object.defineProperty(window,"innerHeight",{configurable:true,value:530});metrics({height:844})')
  await page.wait_for_timeout(150)
  await at_bottom('expanded visual viewport with stale layout height')
  await page.evaluate('Object.defineProperty(window,"innerHeight",window.layoutHeightDescriptor);metrics({height:530})')
  await page.evaluate('window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}));document.dispatchEvent(new Event("visibilitychange"))');await page.wait_for_timeout(650)
  await at_bottom('history and app resume with stale height')
  await page.evaluate('metrics({height:844});document.querySelector("#modal").showModal();viewport.modalOpened();document.querySelector("#edit").focus();metrics({height:310,offsetTop:200})')
  await page.wait_for_timeout(200)
  assert (await read())['visibility']=='hidden'
  frame=await page.locator('#modal').bounding_box()
  assert frame['y']>=200 and frame['y']+frame['height']<=510,frame
  await page.evaluate('document.querySelector("#edit").blur();document.querySelector("#modal").close();viewport.modalClosed()')
  await page.wait_for_timeout(750)
  await at_bottom('keyboard/dialog close while viewport metrics remain stale')
  await page.evaluate('metrics({height:844,offsetTop:0});window.setTabs(5)')
  await page.locator('[data-page=records]').click();await page.wait_for_timeout(950)
  assert await page.evaluate('window.active')=='records'
  await at_bottom('tab navigation')
  box=await page.locator('#mobile-nav').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+130,y,steps=8);await page.mouse.up();await page.wait_for_timeout(1100)
  assert await page.evaluate('window.active')=='admin'
  await at_bottom('multi-tab swipe')
  await page.evaluate('window.scrollTo(0,200)');await page.wait_for_timeout(600)
  await page.evaluate('window.scrollTo(0,400)');await page.wait_for_timeout(300)
  assert (await read())['hidden']
  await page.evaluate('window.scrollTo(0,370)');await page.wait_for_timeout(300)
  await at_bottom('scroll hide and reveal')
  await page.evaluate('document.documentElement.style.setProperty("--safe-bottom","34px");viewport.navigationChanged()');await page.wait_for_timeout(150)
  await at_bottom('bottom safe area')
  await page.evaluate('document.documentElement.style.removeProperty("--safe-bottom");window.scrollTo(0,0)')
  for width,height in [(740,390),(390,844),(320,740),(590,1280),(760,1024)]:
   await page.set_viewport_size({'width':width,'height':height});await page.evaluate('(size)=>metrics(size)',{'width':width,'height':height,'offsetTop':0});await page.wait_for_timeout(650)
   for count in [4,5]:
    await page.evaluate('count=>setTabs(count)',count);await page.wait_for_timeout(100)
    await at_bottom(str((width,height,count)))
  assert not errors,errors
  await browser.close()
asyncio.run(main());server.shutdown()
