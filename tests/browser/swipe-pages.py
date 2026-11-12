import asyncio,pathlib,threading
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
root=str(pathlib.Path(__file__).resolve().parents[2]/'pages-dist')
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=root));threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port)
html='''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="mobile-shell.css"><style>body{margin:20px}#root{width:100%}.swipe-pages{column-gap:24px}.swipe-page>div{height:220px;background:#142135;color:white}</style><div id="root" style="display:none"></div><div id="empty"></div><script type="module">import {pagerMarkup,mountSwipePages} from './swipe-pages.js';const root=document.querySelector('#root');root.innerHTML=pagerMarkup(['<div>첫 페이지</div>','<div>두 번째</div>','<div>마지막</div>'],'회원');window.indices=[];window.api=mountSwipePages(root,{page:NaN,onPage:n=>indices.push(n)});document.querySelector('#empty').innerHTML=pagerMarkup([],'빈 목록');mountSwipePages(document.querySelector('#empty'),{page:Infinity});mountSwipePages(null);window.ready=true;</script>'''
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.route('**/qa-swipes',lambda route:route.fulfill(content_type='text/html',body=html))
  await page.goto(origin+'/qa-swipes');await page.wait_for_function('window.ready')
  await page.evaluate('api.select(2);document.querySelector(".swipe-pages").dispatchEvent(new Event("scroll"))')
  await page.wait_for_timeout(250)
  assert await page.locator('.swipe-page-label').inner_text()=='3 / 3'
  await page.locator('#root').evaluate('(e)=>e.style.display="block"')
  await page.wait_for_timeout(250)
  assert await page.locator('.swipe-page:not([inert])').count()==1
  assert await page.locator('.swipe-pages').first.evaluate('(e)=>Math.abs(e.scrollLeft-(e.children[2].offsetLeft-e.children[0].offsetLeft))<2')
  assert await page.locator('.swipe-pages').first.evaluate('(e)=>Math.abs(e.children[1].getBoundingClientRect().left-e.children[0].getBoundingClientRect().right-24)<1')
  await page.set_viewport_size({'width':320,'height':844});await page.wait_for_timeout(250)
  assert await page.locator('.swipe-page-label').inner_text()=='3 / 3'
  await page.locator('[data-swipe-step="-1"]').click();await page.wait_for_timeout(600)
  assert await page.locator('.swipe-page-label').inner_text()=='2 / 3'
  await page.locator('.swipe-pages').first.evaluate('(e)=>e.scrollTo({left:0,behavior:"instant"})');await page.wait_for_timeout(250)
  assert await page.locator('.swipe-page-label').inner_text()=='1 / 3'
  await page.evaluate('api.select(Infinity,false)');assert await page.locator('.swipe-page-label').inner_text()=='1 / 3'
  assert await page.evaluate('indices.every(n=>Number.isInteger(n)&&n>=0&&n<3)')
  assert not errors,errors
  print('Browser: zero-width hidden pager, invalid initial page, empty/null pager, 24px spacing, resize, button/scroll synchronization and finite indices passed.')
  await browser.close()
 server.shutdown()
asyncio.run(main())
