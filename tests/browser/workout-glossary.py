"""Exercise glossary UI using existing isolated fake Auth/API. No live writes."""
import pathlib
fixture=pathlib.Path(__file__).with_name('member-events.py')
exec(compile(fixture.read_text().split('async def main():')[0],str(fixture),'exec'))
server_now='2026-11-19T01:00:00Z'
workouts={
 '2026-11-19_WOD':{'date':'2026-11-19','program':'WOD','sections':[
  {'text':'20min AMRAP\namrap · Syn Sync\nTeam of 2 / Team of 3 / Team of 4\nRounds + Reps\n10 Syn Burpees\n15 Wall Ball Shots\n<img src=x onerror=alert(1)>','record':False},
  {'text':"3 RFT\nTC 15min\n1RM · Rx’d · Scaled · TABATA\n185 / 135 lbs\nAMRAP",'record':False}]},
 '2026-11-19_B/T':{'date':'2026-11-19','program':'B/T','sections':[
  {'text':'EMOM\nE2MOM E3MOM E4MOM\nFT For Time · YGIG\nUnbroken · DU SU\nTTB T2B · C2B CTB\nHSPU BMU RMU','record':False}]},
 '2026-11-21_WOD':{'date':'2026-11-21','program':'WOD','sessions':['10:00'],'sections':[{'text':'10min AMRAP\nTeam of 2\n10 Syn Burpees','record':False}]}
}
async def popup(page,key,english=True,title=None):
 button=page.locator('.course-card[data-course="WOD"] .course-section-full [data-workout-term="'+key+'"]:visible').first
 await button.click();await page.wait_for_selector('.workout-term-popup')
 if title:assert await page.locator('#modal .modal-head h2').inner_text()==title
 assert await page.locator('.workout-term-english').count()==(1 if english else 0),key
 assert await page.locator('.workout-term-description').inner_text()
 assert await page.locator('.workout-term-example p').inner_text()
 if key=='syn':assert await page.locator('.workout-term-example p').inner_text()=='10 Syn Burpees는 함께 버피 10회를 해요.'
 await page.locator('.workout-term-confirm').click()
 await page.wait_for_function('()=>!document.querySelector("#modal").open')
 assert await button.evaluate('el=>document.activeElement===el'),key
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  context,page=await setup(browser,ADMIN)
  await page.goto(origin+'/#home');await page.wait_for_selector('.home-course-carousel')
  await page.locator('[data-program="WOD"]').click()
  full=page.locator('.course-card[data-course="WOD"] .course-section-full')
  assert await full.nth(0).locator('[data-workout-term="amrap"]').count()==1
  assert await full.nth(0).locator('[data-workout-term="syn"]').count()==1
  assert await full.nth(1).locator('[data-workout-term="amrap"]').count()==1
  assert 'Team of 2 / Team of 3 / Team of 4' in await full.nth(0).inner_text()
  assert 'Rounds + Reps' in await full.nth(0).inner_text()
  assert await full.nth(0).locator('.exercise img').count()==0
  assert '<img src=x onerror=alert(1)>' in await full.nth(0).inner_text()
  for key in ['amrap','syn','rft','tc']:await popup(page,key,title='Syn' if key=='syn' else None)
  for key in ['1rm','rx','scaled','tabata']:await popup(page,key,english=False)
  for theme in ['navy','mint','orange']:
   await page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
   for width in [320,390,768]:
    await page.set_viewport_size({'width':width,'height':844})
    button=full.nth(0).locator('[data-workout-term="amrap"]')
    assert await button.locator('span').evaluate('el=>el.getBoundingClientRect().width')==12
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(theme,width)
    await button.click()
    assert await page.locator('.workout-term-popup').evaluate('el=>el.scrollWidth<=el.clientWidth+1'),(theme,width)
    assert await page.locator('.workout-term-english').evaluate('el=>el.scrollWidth<=el.clientWidth+1')
    fonts=await page.evaluate("""()=>Object.fromEntries(['#modal .modal-head h2','.workout-term-english','.workout-term-description','.workout-term-example>span','.workout-term-example>p','.workout-term-confirm'].map(s=>{const cs=getComputedStyle(document.querySelector(s));return [s,{size:parseFloat(cs.fontSize),weight:cs.fontWeight}]}))""")
    assert abs(fonts['#modal .modal-head h2']['size']-18*1.2)<.01,(theme,width,fonts)
    assert fonts['#modal .modal-head h2']['weight']=='700'
    for selector,value in fonts.items():
     if selector!='#modal .modal-head h2':assert abs(value['size']-12*1.2)<.01,(theme,width,selector,value)
    await page.keyboard.press('Escape');await page.wait_for_function('()=>!document.querySelector("#modal").open')
  await page.locator('.course-card[data-course="WOD"] .course-section-toggle').first.click()
  await page.locator('.course-card[data-course="WOD"] .course-section-preview [data-workout-term="amrap"]:visible').click()
  assert await page.locator('.workout-term-popup').is_visible()
  await page.locator('.workout-term-confirm').click()
  await page.locator('[data-program="B/T"]').click()
  bt=page.locator('.course-card[data-course="B/T"] .course-section-full')
  for key in ['emom','e2mom','e3mom','e4mom','ft','ygig','unbroken','du','su','ttb','c2b','hspu','bmu','rmu']:
   await bt.locator('[data-workout-term="'+key+'"]').click()
   assert await page.locator('.workout-term-popup').is_visible()
   if key=='e4mom':assert await page.locator('.workout-term-english').inner_text()=='Every 4 Minutes On the Minute'
   await page.locator('.workout-term-confirm').click()
  await page.locator('[data-action="calendar"]').click()
  assert await page.locator('#modal .modal-head h2').evaluate('el=>getComputedStyle(el).fontSize')=='18px'
  await page.locator('[data-calendar-date="2026-11-21"]').click()
  assert await page.locator('.home-program-tabs button').count()==1
  assert await page.locator('.home-program-tabs button').inner_text()=='Special Workout'
  await popup(page,'amrap')
  assert not posts,posts
  assert not errors,errors
  await page.screenshot(path='/workspace/scratch/workout-glossary-mobile.png')
  await context.close();await browser.close()
 server.shutdown()
 print('PASS: glossary auto detection on existing B/T/WOD/Saturday classes, deduplication, excluded basics, English omissions, dynamic intervals, folding, 12px circles, 3 themes at 320/390/768px, focus restoration, escaping; zero API writes.')
asyncio.run(main())
