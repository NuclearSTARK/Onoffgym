const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
const longText='Team of 3\n\n'+Array.from({length:45},(_,i)=>`Step ${String(i+1).padStart(2,'0')} · 45m Burpee Broad Jump\n45m Sandbag Lunge (30/20/10)\nA → 동작수행 · B/C → Plank Hold`).join('\n\n');
for(const orientation of ['landscape','portrait'])for(const day of ['2026-11-04','2026-11-05']){
 const context=await browser.newContext({viewport:orientation==='landscape'?{width:1920,height:1080}:{width:1080,height:1920}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const data={date:day,releaseTime:'22:00',serverNow:day+'T01:00:00Z',dayState:'class',preferences:{orientation,unit:'lbs',pageSeconds:20,btColor:'blue',wodColor:'orange'},workouts:[{program:'B/T',sections:[{text:'Back Squat\n5 sets × 5 reps'},{text:'Shoulder Press\n3 sets × 8 reps'}]},{program:'WOD',sections:[{text:longText}]}]};
 await p.route('**/backend-config.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.ONOFF_BACKEND={url:"http://127.0.0.1:5173",publishableKey:"fixture",projectId:"fixture"};'}));
 await p.route('**/functions/v1/onoff-api/**',r=>{const path=new URL(r.request().url()).pathname;assert.ok(/\/api\/tv\/(bootstrap|heartbeat)$/.test(path),path);return r.fulfill({contentType:'application/json',body:JSON.stringify(path.endsWith('bootstrap')?data:{ok:true})});});
 await p.clock.install();await p.goto('http://127.0.0.1:5173/tv.html');await p.locator('#tv-WOD .tv-exercise').first().waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(100);
 assert.equal(await p.locator('.tv-footer').count(),0);const count=orientation==='landscape'&&day.endsWith('04')?3:1;assert.equal(await p.locator('#tv-WOD .tv-flow-column').count(),count);if(day.endsWith('05'))assert.equal(await p.locator('#tv-BT .tv-flow-column').count(),1);
 const pages=Number((await p.locator('#page-WOD').innerText()).match(/\/ (\d+)/)[1]);assert.ok(pages>1);let all='';
 for(let index=0;index<pages;index++){
  assert.equal(await p.locator('#tv-WOD .tv-section-number').count(),1);const over=await p.locator('.tv-flow-column').evaluateAll(xs=>xs.filter(x=>x.scrollHeight>x.clientHeight+2).map(x=>({h:x.clientHeight,scroll:x.scrollHeight})));assert.deepEqual(over,[]);
  all+=await p.locator('#tv-WOD .tv-exercise').evaluateAll(xs=>xs.map(x=>x.textContent).join(''));
  if(!index){await p.screenshot({path:`/tmp/onoff-tv6-${orientation}-${day}.png`});if(count===3){const borders=await p.locator('#tv-WOD .tv-flow-column').evaluateAll(xs=>xs.map(x=>getComputedStyle(x).borderLeftWidth));assert.deepEqual(borders,['0px','1px','1px']);}}
  await p.keyboard.press('ArrowRight');
 }
 assert.equal(all.replace(/\s/g,''),longText.replace(/\s/g,''));
 const before=await p.locator('#page-WOD').innerText();await p.clock.runFor(20100);assert.notEqual(await p.locator('#page-WOD').innerText(),before);
 const gap=await p.locator('.tv-column').last().evaluate(x=>x.closest('.tv-shell').getBoundingClientRect().bottom-x.getBoundingClientRect().bottom);assert.ok(gap<=12,gap);
 assert.deepEqual(errors,[]);console.log(`PASS TV ${orientation} ${day}: ${count} columns, ${pages} pages; no clipped/lost text, one S1/page, auto rotation, compact bottom.`);await context.close();
}
const restContext=await browser.newContext({viewport:{width:1920,height:1080}}),rest=await restContext.newPage();await rest.route('**/backend-config.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.ONOFF_BACKEND={url:"http://127.0.0.1:5173",publishableKey:"fixture",projectId:"fixture"};'}));await rest.route('**/functions/v1/onoff-api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({date:'2026-11-04',serverNow:'2026-11-04T01:00:00Z',releaseTime:'22:00',dayState:'holiday',holidayName:'휴강',preferences:{orientation:'landscape',pageSeconds:20},workouts:[]})}));await rest.goto('http://127.0.0.1:5173/tv.html');await rest.locator('.tv-rest').waitFor();assert.equal(await rest.locator('.tv-rest').evaluate(x=>Math.abs(x.getBoundingClientRect().width-x.parentElement.getBoundingClientRect().width)<1),true);console.log('PASS TV empty/rest display spans all three landscape columns.');await restContext.close();
await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
