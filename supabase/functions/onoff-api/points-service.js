const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
export function createPointsService(db,{now=()=>new Date()}={}){
 const read=async q=>{const {data,error}=await q;if(error)fail('포인트 정보를 불러오지 못했어요.',503);return data;};
 async function snapshot(m){
  if(m?.status!=='approved')fail('관리자 승인 후 이용할 수 있어요.',403);
  const [cfg,account,coupons,products,ledger,rules]=await Promise.all([
   read(db.from('gym_point_config').select('enabled,attendance_points,record_points,max_balance').eq('singleton',true).maybeSingle()),read(db.from('gym_point_accounts').select('balance').eq('user_id',m.id).maybeSingle()),
   read(db.from('gym_point_coupons').select('id,name,price,total,remaining,created_at,last_used_at,expires_at').eq('user_id',m.id).order('created_at',{ascending:false}).limit(200)),
   read(db.from('gym_point_products').select('id,name,description,price,uses').eq('deleted',false).order('name').limit(100)),
   read(db.from('gym_point_ledger').select('id,amount,reason,created_at').eq('user_id',m.id).order('created_at',{ascending:false}).limit(30)),read(db.from('gym_point_rules').select('id,auto_key,name,amount').eq('deleted',false).order('created_at'))]);
  return {enabled:!!cfg?.enabled,attendancePoints:cfg?.attendance_points||0,recordPoints:cfg?.record_points||0,balance:Number(account?.balance||0),maxBalance:cfg?.max_balance==null?null:Number(cfg.max_balance),rules:rules||[],coupons:(coupons||[]).map(c=>({...c,expired:!!c.expires_at&&Date.parse(c.expires_at)<=+now()})),products:products||[],ledger:ledger||[]};
 }
 async function route(m,path,b){
  if(m?.status!=='approved')fail('관리자 승인 후 이용할 수 있어요.',403);
  if(path==='/api/points')return snapshot(m);
  const isAdmin=m.role==='admin';
  if(['/api/points/admin','/api/points/settings','/api/points/product','/api/points/product/delete','/api/points/rule','/api/points/rule/delete','/api/points/grant'].includes(path)&&!isAdmin)fail('운영자 권한이 필요해요.',403);
  if(path==='/api/points/admin'){
   const cfg=await read(db.from('gym_point_config').select('pin_hash').eq('singleton',true).maybeSingle());
   const [base,coupons,members,accounts]=await Promise.all([snapshot(m),read(db.from('gym_point_coupons').select('id,user_id,name,price,total,remaining,created_at,last_used_at,expires_at').order('created_at',{ascending:false}).limit(100)),read(db.from('gym_members').select('id,name,status')),read(db.from('gym_point_accounts').select('user_id,balance'))]);
   return {...base,pinConfigured:!!cfg?.pin_hash,members:members.filter(m=>m.status==='approved').map(m=>({id:m.id,name:m.name,balance:Number(accounts.find(a=>a.user_id===m.id)?.balance||0)})),issued:(coupons||[]).map(c=>({...c,expired:!!c.expires_at&&Date.parse(c.expires_at)<=+now(),memberName:members.find(m=>m.id===c.user_id)?.name||'회원'}))};
  }
  let p;
  if(path==='/api/points/settings'){
   if(typeof b.enabled!=='boolean'||b.pin&&(typeof b.pin!=='string'||!/^\d{4}$/.test(b.pin)))fail('적립 설정과 4자리 비밀번호를 확인해주세요.');
   p={action:'settings',enabled:b.enabled,pin:b.pin||''};
   for(const key of ['attendancePoints','recordPoints'])if(key in b){if(!integer(b[key],0,1000000))fail('적립액을 확인해주세요.');p[key]=b[key];}
   if('maxBalance' in b){if(b.maxBalance!==null&&!integer(b.maxBalance,1,9000000000000))fail('총 보유 포인트 상한을 확인해주세요.');p.maxBalance=b.maxBalance;}
  }else if(path==='/api/points/rule'){
   if(b.id&&(typeof b.id!=='string'||b.id.length>80)||!['attendance','record','manual'].includes(b.kind)||typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>60||!integer(b.amount,0,1000000))fail('적립 항목을 확인해주세요.');
   p={action:'rule-save',id:b.id||'',kind:b.kind,name:b.name.trim(),amount:b.amount};
  }else if(path==='/api/points/rule/delete'){
   if(typeof b.id!=='string'||!b.id||b.id.length>80)fail('적립 항목을 확인해주세요.');p={action:'rule-delete',id:b.id};
  }else if(path==='/api/points/grant'){
   if(!uuid(b.memberId)||!uuid(b.requestId)||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>200||b.ruleId&&(typeof b.ruleId!=='string'||b.ruleId.length>80)||!b.ruleId&&!integer(b.amount,1,1000000))fail('지급 대상·포인트·사유를 확인해주세요.');
   p={action:'grant',memberId:b.memberId,requestId:b.requestId,ruleId:b.ruleId||null,reason:b.reason.trim(),...(!b.ruleId?{amount:b.amount}:{})};
  }else if(path==='/api/points/product'){
   if(b.id&&!uuid(b.id)||typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>60||typeof b.description!=='string'||b.description.length>300||!integer(b.price,1,1000000000)||!integer(b.uses,1,1000))fail('상품 정보를 확인해주세요.');
   p={action:'product-save',id:b.id||'',name:b.name.trim(),description:b.description,price:b.price,uses:b.uses};
  }else if(path==='/api/points/product/delete'){
   if(!uuid(b.id))fail('상품을 확인해주세요.');p={action:'product-delete',id:b.id};
  }else if(path==='/api/points/exchange'){
   if(!uuid(b.productId)||!uuid(b.requestId)||!integer(b.expectedPrice,1,1000000000)||!integer(b.expectedUses,1,1000))fail('교환 요청을 확인해주세요.');p={action:'exchange',productId:b.productId,requestId:b.requestId,expectedPrice:b.expectedPrice,expectedUses:b.expectedUses};
  }else if(path==='/api/points/use'){
   if(!uuid(b.couponId)||!uuid(b.requestId)||typeof b.pin!=='string'||!/^\d{4}$/.test(b.pin))fail('쿠폰과 4자리 비밀번호를 확인해주세요.');p={action:'use',couponId:b.couponId,requestId:b.requestId,pin:b.pin};
  }else fail('요청을 찾을 수 없어요.',404);
  const {data,error}=await db.rpc('onoff_points',{actor:m.id,p});
  if(error)fail(error.code==='42501'?'이 요청을 처리할 권한이 없어요.':error.code==='P0001'?error.message:'포인트 요청을 처리하지 못했어요.',error.code==='42501'?403:error.code==='P0001'?400:503);
  if(data?.ok===false)fail(data.error,data.status||400);return data;
 }
 return {snapshot,route};
}
