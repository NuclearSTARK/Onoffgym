import test from 'node:test';
import assert from 'node:assert/strict';
import {readJsonObject} from '../supabase/functions/onoff-api/request-body.js';
const encode=s=>new TextEncoder().encode(s);
function request(chunks,headers={}){let cancelled=false,index=0;const body=new ReadableStream({pull(c){if(index<chunks.length)c.enqueue(chunks[index++]);else c.close();},cancel(){cancelled=true;}});return {req:new Request('https://example.invalid',{method:'POST',body,headers,duplex:'half'}),cancelled:()=>cancelled};}
test('bounded JSON reader handles UTF-8 across chunks and rejects non-object JSON',async()=>{
 const bytes=encode('{"이름":"회원"}'),f=request([bytes.slice(0,3),bytes.slice(3,9),bytes.slice(9)]);assert.deepEqual(await readJsonObject(f.req),{이름:'회원'});
 for(const text of ['', 'null','[]','1','{bad'])await assert.rejects(readJsonObject(request([encode(text)]).req),e=>e.status===400);
 await assert.rejects(readJsonObject(request([new Uint8Array([255])]).req),e=>e.status===400);
});
test('request limits use real bytes despite absent/forged length and stop a streaming body early',async()=>{
 for(const headers of [{},{'Content-Length':'1'}]){const f=request([encode('{"text":"'),encode('가'.repeat(100)),encode('"}')],headers);await assert.rejects(readJsonObject(f.req,50),e=>e.status===413);assert.equal(f.cancelled(),true);}
 await assert.rejects(readJsonObject(request([] ,{'Content-Length':'1000'}).req,50),e=>e.status===413);
});
