import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMemberOverviewService} from '../supabase/functions/onoff-api/member-overview-service.js';
import {createClient} from '../web/assets/supabase-js-2.118.0.js';
test('overview uses the pinned client RPC transport with a verified actor and normalized historical date',async()=>{
 const actor='10000000-0000-4000-8000-000000000001',calls=[];
 const db=createClient('https://isolated-overview.invalid','test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,opts)=>{calls.push({url:String(url),method:opts.method,body:JSON.parse(opts.body)});return new Response(JSON.stringify({kind:'attendance',members:[]}),{status:200,headers:{'Content-Type':'application/json'}});}}});
 const result=await createMemberOverviewService(db).read({id:actor,role:'admin',status:'approved'},new URL('https://app.invalid/api/member-overview?kind=attendance&date=2020.1.1&actor=untrusted'));
 assert.equal(result.kind,'attendance');assert.equal(calls.length,1);assert.equal(calls[0].method,'POST');assert(calls[0].url.endsWith('/rest/v1/rpc/onoff_member_overview'));assert.equal(calls[0].body.actor,actor);assert.equal(calls[0].body.p.date,'2020-01-01');assert.equal(calls[0].body.p.actor,undefined);
});
