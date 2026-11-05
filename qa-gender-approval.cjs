const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const id='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',errors=[];
const session=()=>({access_token:'eyJhbGciOiJIUzI1NiJ9.'+btoa(JSON.stringify({sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600}))+'.signature',refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id,email:'fixture@example.invalid'}});
async function context(role,{signup=false}={}){
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 if(!signup)await ctx.addInitScript(({value})=>localStorage.setItem('onoff-auth-fixture',JSON.stringify(value)),{value:session()});
 const p=await ctx.newPage(),writes=[];p.on('pageerror',e=>errors.push(e.message));
 const viewer={id,name:'검증운영자',role,status:'approved',gender:null,age_over_14:true,disclosure_consent:false,privacy_version:'privacy-2026-11-04'};
 const member={id:other,name:'검증회원',role:'member',status:'approved',gender:'female',approved_at:'2026-11-05T09:30:00Z'};
 const fixture={viewer,members:[viewer,member],membershipEvents:[{id:'approval-event',user_id:other,action:'signup-approve',created_at:'2026-11-05T09:30:00Z',body:JSON.stringify({actor:id,actorName:'승인자 <검증>'})}],preferences:{rank:true,pushOnboardingSeen:true},membershipState:{active:true},points:{enabled:false,balance:0,ledger:[],products:[],coupons:[]},named:{catalogue:[],categories:[],records:[]},revision:'fixture',calendar:{dates:{}},workouts:{},records:[],rms:[],photos:[],posts:[]};
 await p.route('**/backend-config.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.ONOFF_BACKEND={url:"http://127.0.0.1:5173",publishableKey:"fixture",projectId:"fixture"};'}));
 await p.route('**/auth/v1/**',async r=>{
  const path=new URL(r.request().url()).pathname;
  if(path.endsWith('/settings'))return r.fulfill({json:{external:{email:true},disable_signup:false,mailer_autoconfirm:true}});
  if(path.endsWith('/signup')){const b=r.request().postDataJSON();writes.push({path:'signup',b});Object.assign(viewer,{gender:b.data.gender,privacy_version:b.data.privacy_version,status:'pending'});return r.fulfill({json:session()});}
  return r.fulfill({json:{}});
 });
 await p.route('**/functions/v1/onoff-api/**',async r=>{
  const path=new URL(r.request().url()).pathname.split('/api/')[1],b=r.request().postDataJSON();let value={ok:true};if(b)writes.push({path,b});
  if(path==='privacy/accept')Object.assign(viewer,{gender:b.gender,privacy_version:b.version,age_over_14:b.ageOver14,disclosure_consent:b.disclosure});
  if(path==='bootstrap')value={...fixture,privacyReviewRequired:!viewer.gender||viewer.privacy_version!=='privacy-2026-11-05',serverNow:new Date().toISOString()};
  if(path==='revision')value={revision:'fixture',serverNow:new Date().toISOString()};
  return r.fulfill({json:value});
 });return {ctx,p,writes,viewer,fixture};
}
for(const role of ['member','coach','admin']){
 const f=await context(role),{p,writes}=f;await p.goto('http://127.0.0.1:5173/#records/rm');const form=p.locator('#privacy-accept-form');await form.waitFor();assert.equal(await form.locator('[name=gender]').count(),2);assert.equal(await form.locator('[name=gender]:checked').count(),0);assert.equal(await form.evaluate(x=>x.checkValidity()),false);
 for(const width of [320,390,844]){await p.setViewportSize({width,height:width===844?390:844});assert.equal(await p.locator('.gender-field').evaluate(x=>x.scrollWidth>x.clientWidth),false);}
 await p.setViewportSize({width:390,height:844});await form.locator('.gender-choices label:has(input[value=female]) > span').click();await form.locator('[name=privacy]').check();await form.locator('button[type=submit],button.btn.primary').click();await form.waitFor({state:'detached'});const b=writes.find(x=>x.path==='privacy/accept').b;assert.equal(b.gender,'female');assert.equal(b.disclosure,false);assert.equal(b.version,'privacy-2026-11-05');
 await p.reload();await p.locator('.home-heading').waitFor();assert.equal(await p.locator('#privacy-accept-form').count(),0);
 if(role==='admin'){
  await p.evaluate(()=>location.hash='admin/members');await p.locator('[data-member-detail="'+other+'"]').waitFor();await p.locator('[data-member-detail="'+other+'"]').click();await p.locator('[data-member-tab=history]').click();await p.getByText('가입 승인',{exact:true}).waitFor();assert.ok((await p.locator('.membership-event-row').innerText()).includes('승인자 <검증>'));assert.ok((await p.locator('.membership-event-row').innerText()).includes('2026-11-05 09:30'));assert.equal(await p.locator('[data-membership-event-delete="approval-event"]').count(),1);assert.equal(await p.locator('.membership-event-row 검증').count(),0);await p.screenshot({path:'/tmp/onoff-gender-approval-history.png'});
 }
 await f.ctx.close();
}
const signup=await context('member',{signup:true}),{p}=signup;await p.goto('http://127.0.0.1:5173/#login');await p.locator('[data-auth-mode=signup]').click();await p.locator('[name=name]').fill('신규회원');await p.locator('[name=email]').fill('signup@example.invalid');await p.locator('[name=password]').fill('fixture-password');await p.locator('[name=confirmPassword]').fill('fixture-password');await p.locator('[name=ageOver14]').check();await p.locator('[name=privacy]').check();assert.equal(await p.locator('#email-auth-form').evaluate(f=>f.checkValidity()),false);assert.equal(signup.writes.length,0);await p.locator('.gender-choices label:has(input[value=male]) > span').click();assert.equal(await p.locator('#email-auth-form').evaluate(f=>f.checkValidity()),true);await p.screenshot({path:'/tmp/onoff-gender-signup.png'});await p.locator('.login-email-submit').click();await p.waitForFunction(()=>!document.querySelector('#email-auth-form'));const call=signup.writes.find(x=>x.path==='signup');assert.equal(call.b.data.gender,'male');assert.equal(call.b.data.role,undefined);assert.equal(call.b.data.disclosure_consent,false);assert.equal(await p.locator('#privacy-accept-form').count(),0);
assert.deepEqual(errors,[]);await browser.close();console.log('PASS: required signup gender, one-time existing-account completion for all roles, narrow/landscape layout and approval history with escaped approver, time and existing delete action. All Auth/API writes mocked.');
})().catch(e=>{console.error(e);process.exit(1)});
