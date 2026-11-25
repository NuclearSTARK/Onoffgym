"""All community categories, with local fake Auth/API and no production writes."""
import pathlib
fixture=pathlib.Path(__file__).with_name('member-events.py')
exec(compile(fixture.read_text().split('async def main():')[0],str(fixture),'exec'))
server_now='2026-11-25T01:00:00Z'
ids={kind:f'40000000-0000-4000-8000-{i:012d}' for i,kind in enumerate(['notice','meetup','buy','free','own'],1)}
categories={'notice':'공지사항','meetup':'운동 번개','buy':'공동구매','free':'자유글','own':'자유글'}
def key(kind):return ('notice:' if kind=='notice' else 'post:')+ids[kind]
counts={key('notice'):12,key('meetup'):7,key('buy'):3,key('free'):2,key('own'):4}
seen=set();read_calls=[];fail_free=True;delay_key=None
rows=[]
for kind in ids:
 row={'id':ids[kind],'title':categories[kind]+' 조회수 검증' if kind!='own' else '내가 작성한 글','category':categories[kind],'body':'저장된 과거 글의 본문입니다.','author':'본인' if kind=='own' else '검증 작성자','authorId':ADMIN if kind=='own' else REJECTED,'author_id':ADMIN if kind=='own' else REJECTED,'date':'2026-11-25','created_at':'2026-11-25T00:00:00Z','comments':[],'joinedIds':[],'joined':[],'pinned':kind=='notice'}
 if kind=='notice':row['serverNotice']=True
 if kind=='meetup':row['starts_at']='2026-11-25T11:00:00Z'
 rows.append(row)
async def backend(route):
 global fail_free
 u=urlparse(route.request.url);body=route.request.post_data_json if route.request.method=='POST' else None
 if u.path.endswith('/api/bootstrap'):
  values=[dict(row,viewCount=counts[('notice:' if row.get('serverNotice') else 'post:')+row['id']]) for row in rows]
  data={'viewer':dict(members[0],email='views@example.invalid'),'members':members,'workouts':{},'records':[],'rms':[],'posts':[r for r in values if not r.get('serverNotice')],'notices':[r for r in values if r.get('serverNotice')],'library':[],'preferences':{'pushOnboardingSeen':True,'communityReads':{k:'legacy' for k in seen}},'membership':None,'attendance':[],'push':{},'releaseTime':'22:00','revision':0,'serverNow':server_now,'calendar':{'dates':{}},'privacyReviewRequired':False}
 elif u.path.endswith('/api/community/read'):
  assert set(body)=={'id','kind'},body
  read_key=body['kind']+':'+body['id'];read_calls.append(read_key)
  if delay_key==read_key:await asyncio.sleep(.7)
  if body['id']==ids['free'] and fail_free:
   fail_free=False;await route.fulfill(status=503,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps({'error':'검증용 재시도'}));return
  if body['id']!=ids['own'] and read_key not in seen:seen.add(read_key);counts[read_key]+=1
  data={'ok':True,'viewCount':counts[read_key]}
 elif u.path.endswith('/api/posts/access'):data={'allowed':True,'message':'','joined':False}
 else:await route.fallback();return
 await route.fulfill(content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(data))
async def open_post(page,kind,expected):
 await page.locator('.post-card[data-post="'+ids[kind]+'"]').click()
 selector='#modal [data-community-view-count="'+key(kind)+'"]'
 await page.wait_for_function('(v)=>document.querySelector(v.selector)?.textContent===v.text',arg={'selector':selector,'text':'조회 '+str(expected)})
 return page.locator(selector)
async def close_post(page):
 await page.locator('#modal .modal-close').click();await page.wait_for_function('()=>!document.querySelector("#modal").open')
async def main():
 global delay_key
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  context,page=await setup(browser,ADMIN);await context.route('https://approval-test.invalid/**',backend)
  await page.goto(origin+'/#community');await page.wait_for_selector('.post-card')
  assert len(read_calls)==0
  assert await page.locator('.post-card .community-view-count').count()==5
  assert await page.locator('.post-card .post-view-meta').count()==5
  delay_key=key('buy')
  await page.locator('.post-card[data-post="'+ids['buy']+'"]').click()
  await page.locator('#comment-form [name=text]').fill('작성 중인 댓글')
  await page.wait_for_function('(s)=>document.querySelector(s)?.textContent==="조회 4"',arg='#modal [data-community-view-count="'+key('buy')+'"]')
  assert await page.locator('#comment-form [name=text]').input_value()=='작성 중인 댓글'
  await page.locator('#comment-form [name=text]').fill('');await close_post(page);delay_key=None
  for kind,expected in [('notice',13),('meetup',8),('buy',4),('own',4)]:
   await open_post(page,kind,expected)
   assert await page.locator('.post-card[data-post="'+ids[kind]+'"] .community-view-count').inner_text()=='조회 '+str(expected)
   await close_post(page)
   await open_post(page,kind,expected);await close_post(page)
  await open_post(page,'free',2);await page.wait_for_selector('#toast.show');await close_post(page)
  await open_post(page,'free',3);await close_post(page)
  await page.reload();await page.wait_for_selector('.post-card');await open_post(page,'notice',13);await close_post(page)
  for theme in ['navy','mint','orange']:
   await page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
   for width in [320,390,768]:
    await page.set_viewport_size({'width':width,'height':844})
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(theme,width)
    assert await page.locator('.post-footer').evaluate_all('(els)=>els.every(el=>el.scrollWidth<=el.clientWidth+1)'),(theme,width)
    await open_post(page,'notice',13)
    assert await page.locator('.community-post-meta').evaluate('el=>el.scrollWidth<=el.clientWidth+1'),(theme,width)
    await close_post(page)
  await page.set_viewport_size({'width':390,'height':844});await open_post(page,'notice',13)
  await page.screenshot(path='/workspace/scratch/community-views/detail-mobile.png');await close_post(page)
  # A late response from the old account must not modify the logged-out screen.
  delay_key=key('buy');before=len(read_calls);await page.locator('.post-card[data-post="'+ids['buy']+'"]').click()
  await page.wait_for_function('()=>document.querySelector("#modal").open')
  await page.evaluate("window.dispatchEvent(new Event('onoff-auth-signout'))")
  await asyncio.sleep(.9)
  assert await page.locator('[data-community-view-count]').count()==0
  assert not errors,errors
  await context.close();await browser.close()
 server.shutdown()
 print('PASS: four categories plus own posts, list/detail sync, unique views, legacy totals, failure/retry, reload, late logout responses, 3 themes at 320/390/768px; no live backend calls.')
asyncio.run(main())
