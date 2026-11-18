"""Isolated browser regressions; no production backend/mail/push is contacted."""
import pathlib
fixture=pathlib.Path(__file__).with_name('member-events.py')
# Reuse its fake Auth/API without running its separate seasonal scenario.
exec(compile(fixture.read_text().split('async def main():')[0],str(fixture),'exec'))
async def main():
 global server_now
 server_now='2026-11-13T01:00:00Z'
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  context,page=await setup(browser,ADMIN)
  await page.goto(origin+'/#home');await page.wait_for_selector('.home-course-carousel')
  violations=[]
  page.on('console',lambda msg:violations.append(msg.text) if 'Content Security Policy' in msg.text else None)
  await page.evaluate('''()=>{window.auditInjected=0;const s=document.createElement('script');s.textContent='window.auditInjected=1';document.body.append(s);const img=document.createElement('img');img.setAttribute('onerror','window.auditInjected=2');img.src='/missing-audit.png';document.body.append(img);}''')
  await page.wait_for_timeout(200)
  assert await page.evaluate('window.auditInjected')==0
  # The existing local Excel importer must work with eval disabled.
  assert await page.evaluate("""async()=>{await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/assets/xlsx.full.min.js';s.onload=resolve;s.onerror=reject;document.head.append(s)});const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['이름','기록'],['회원',42]]),'Records');const data=XLSX.write(book,{bookType:'xlsx',type:'array'});const loaded=XLSX.read(data,{type:'array'});return XLSX.utils.sheet_to_json(loaded.Sheets.Records)[0]['기록']===42;}""")
  assert len(violations)>=2,violations
  await page.evaluate("()=>{const f=document.createElement('iframe');f.id='audit-frame';f.src='/';document.body.append(f);}")
  await page.frame_locator('#audit-frame').locator('html[data-frame-blocked]').wait_for(state='attached')
  assert await page.frame_locator('#audit-frame').locator('html').evaluate("el=>getComputedStyle(el).display")=='none'
  await page.locator('#audit-frame').evaluate('el=>el.remove()')
  await page.goto(origin+'/#members');await page.wait_for_selector('.member-record-toolbar')
  # A previously selected B/T must reset when the date only supports WOD.
  await page.locator('[data-records-filter="B/T"]').click()
  await page.locator('[data-action="calendar"]').click()
  await page.locator('[data-calendar-date="2026-11-11"]').click()
  assert await page.locator('[data-records-filter]').count()==1
  assert await page.locator('[data-records-filter="WOD"]').get_attribute('class')=='active'
  assert 'WOD' in await page.locator('#member-record-results .panel-head').inner_text()
  await context.close()
  server_now='2026-11-11T01:00:00Z'
  context,page=await setup(browser,ADMIN)
  await page.goto(origin+'/#members');await page.wait_for_selector('.member-record-toolbar')
  assert await page.locator('[data-records-filter]').count()==1
  assert await page.locator('[data-records-filter="WOD"]').get_attribute('class')=='active'
  assert 'WOD' in await page.locator('#member-record-results .panel-head').inner_text()
  await context.close()
  members[0].update(role='coach',coach_permissions=['workouts.create','workouts.update'])
  context,page=await setup(browser,ADMIN)
  await page.goto(origin+'/#admin/workouts');await page.wait_for_selector('[data-action="copy-workout"]')
  await page.locator('[data-action="copy-workout"]').click()
  await page.wait_for_selector('#workout-copy-form')
  assert await page.locator('#modal').evaluate('(m)=>m.open')
  assert not errors,errors
  await context.close();await browser.close()
 server.shutdown()
 print('Security browser: inline scripts/handlers and framed pages blocked; normal app and Wednesday WOD loaded; delegated coach can open class copy. No real backend called.')
asyncio.run(main())
