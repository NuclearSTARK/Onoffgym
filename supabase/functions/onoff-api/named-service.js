const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const id=x=>typeof x==='string'&&/^[a-z0-9-]{1,80}$/.test(x);
const validText=(x,min,max)=>typeof x==='string'&&x.trim().length>=min&&x.length<=max;
export function createNamedService(db){
 async function rpc(name,p){const {data,error}=await db.rpc(name,p);if(error)fail(error.code==='42501'?'이 기능의 권한이 없어요.':error.code==='23505'?'이미 등록된 종목 또는 분류예요.':'요청을 확인한 뒤 다시 시도해주세요.',error.code==='42501'?403:error.code==='23505'?409:400);return data;}
 return {snapshot:m=>rpc('onoff_named_snapshot',{actor:m.id}),async route(m,path,b){
  if(m.status!=='approved')fail('관리자 승인 후 이용할 수 있어요.',403);
  if(path==='/api/named-wods/comparison'){if(!id(b.wodId))fail('종목을 확인해주세요.');return rpc('onoff_named_comparison',{actor:m.id,wod_id:b.wodId});}
  let p;
  if(path==='/api/named-wods/selection'){
   if(!Array.isArray(b.ids)||b.ids.length>250||b.ids.some(x=>!id(x)))fail('종목 선택을 확인해주세요.');p={action:'selection',ids:[...new Set(b.ids)]};
  }else if(path==='/api/named-wods/record'){
   if(!uuid(b.id)||!id(b.wodId)||!/^\d{4}-\d{2}-\d{2}$/.test(b.date||'')||!validText(b.note??'',0,150))fail('종목·날짜·메모를 확인해주세요.');
   const time=Number.isInteger(b.seconds)&&b.seconds>=1&&b.seconds<=59999,rounds=Number.isInteger(b.rounds)&&b.rounds>=0&&b.rounds<=9999&&Number.isInteger(b.reps)&&b.reps>=0&&b.reps<=99999&&b.rounds+b.reps>0;
   if(!time&&!rounds)fail('시간 또는 라운드·횟수를 확인해주세요.');p={action:'record',id:b.id,wodId:b.wodId,date:b.date,note:(b.note||'').trim(),...(time?{seconds:b.seconds}:{rounds:b.rounds,reps:b.reps})};
  }else if(path==='/api/named-wods/record/delete'){
   if(!uuid(b.id))fail('기록을 확인해주세요.');p={action:'record-delete',id:b.id};
  }else{
   if(m.role!=='admin')fail('운영자 권한이 필요해요.',403);
   if(path==='/api/named-wods/catalogue'){
    if(b.id&&!id(b.id)||!validText(b.name,1,80)||!validText(b.description??'',0,10000)||!id(b.categoryId)||!['time','rounds'].includes(b.recordType)||typeof b.isDefault!=='boolean'||typeof b.active!=='boolean')fail('종목 설정을 확인해주세요.');p={action:'catalogue',...(b.id?{id:b.id}:{}),name:b.name.trim(),description:b.description||'',categoryId:b.categoryId,recordType:b.recordType,isDefault:b.isDefault,active:b.active};
   }else if(path==='/api/named-wods/catalogue/delete'){
    if(!id(b.id))fail('종목을 확인해주세요.');p={action:'catalogue-delete',id:b.id};
   }else if(path==='/api/named-wods/category'){
    if(b.id&&!id(b.id)||!validText(b.label,1,40))fail('분류를 확인해주세요.');p={action:'category',...(b.id?{id:b.id}:{}),label:b.label.trim()};
   }else if(path==='/api/named-wods/category/delete'){
    if(!id(b.id)||!id(b.targetId)||b.id===b.targetId)fail('옮길 분류를 선택해주세요.');p={action:'category-delete',id:b.id,targetId:b.targetId};
   }else fail('NAMED WOD 요청을 찾을 수 없어요.',404);
  }
  return rpc('onoff_named_mutate',{actor:m.id,p});
 }};
}
