const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
// Count actual streamed UTF-8 bytes: Content-Length is only an early hint.
export async function readJsonObject(req,limit=2_000_000){
 const declared=req.headers.get('Content-Length');
 if(declared!==null&&/^\d+$/.test(declared)&&Number(declared)>limit)fail('요청이 너무 커요.',413);
 const reader=req.body?.getReader(),chunks=[];let length=0;
 if(reader)try{
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel().catch(()=>{});fail('요청이 너무 커요.',413);}chunks.push(value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('요청 형식을 확인해주세요.');}
 if(!body||typeof body!=='object'||Array.isArray(body))fail('요청 형식을 확인해주세요.');
 return body;
}
