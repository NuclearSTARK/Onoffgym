export const RM_CATEGORIES=[['squat','스쿼트'],['press','프레스·저크'],['deadlift','데드리프트'],['clean','클린'],['snatch','스내치'],['complex','복합 동작']];
const rmSeeds=[
 ['back-squat','Back Squat','squat',true],['front-squat','Front Squat','squat',true],['overhead-squat','Overhead Squat','squat'],
 ['shoulder-press','Shoulder Press','press',true,['Strict Press']],['bench-press','Bench Press','press'],['push-press','Push Press','press'],['push-jerk','Push Jerk','press'],['split-jerk','Split Jerk','press'],
 ['deadlift','Deadlift','deadlift',true],['sumo-deadlift','Sumo Deadlift','deadlift'],
 ['power-clean','Power Clean','clean',true],['squat-clean','Squat Clean','clean'],['muscle-clean','Muscle Clean','clean'],['hang-power-clean','Hang Power Clean','clean'],['hang-squat-clean','Hang Squat Clean','clean',false,['Hang Sqaut Clean']],
 ['power-snatch','Power Snatch','snatch'],['squat-snatch','Squat Snatch','snatch',true,['Sqaut Snatch']],['muscle-snatch','Muscle Snatch','snatch'],['hang-power-snatch','Hang Power Snatch','snatch'],['hang-squat-snatch','Hang Squat Snatch','snatch',false,['Hang Sqaut Snatch']],['snatch-balance','Snatch Balance','snatch',false,['Snatch Blance']],
 ['clean-jerk','Clean & Jerk','complex'],['clean-split-jerk','Clean & Split Jerk','complex'],['power-clean-jerk','Power Clean & Jerk','complex'],['power-clean-split-jerk','Power Clean & Split Jerk','complex'],['thruster','Thruster','complex'],['cluster','Cluster','complex']
];
export const DEFAULT_RM_CATALOGUE=rmSeeds.map(([id,name,category,isDefault=false,aliases=[]])=>({id,name,category,isDefault,active:true,aliases}));
const rmKey=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
export function findRmMovement(catalogue,value){return catalogue.find(m=>m.id===value)||catalogue.find(m=>[m.name,...(m.aliases||[])].some(n=>rmKey(n)===rmKey(value)));}
export function updateRmCatalogue(catalogue,body,idFactory=()=>crypto.randomUUID()){
 if(!body||typeof body.name!=='string'||body.name.trim().length<2||body.name.trim().length>80)throw Error('종목 이름을 2~80자로 입력해주세요.');
 if(!RM_CATEGORIES.some(c=>c[0]===body.category)||typeof body.active!=='boolean'||typeof body.isDefault!=='boolean')throw Error('분류·기본 표시·사용 여부를 확인해주세요.');
 const old=body.id?catalogue.find(m=>m.id===body.id):null;if(body.id&&!old)throw Error('수정할 종목을 찾을 수 없어요.');
 const name=body.name.trim().replace(/\s+/g,' ');
 if(catalogue.some(m=>m.id!==old?.id&&[m.name,...(m.aliases||[])].some(n=>rmKey(n)===rmKey(name))))throw Error('이미 등록된 종목 이름이에요.');
 if(!old&&catalogue.length>=250)throw Error('종목은 최대 250개까지 등록할 수 있어요.');
 const aliases=[...new Set([...(old?.aliases||[]),...(old&&old.name!==name?[old.name]:[])])].filter(n=>rmKey(n)!==rmKey(name));
 const movement={id:old?.id||'custom-'+idFactory(),name,category:body.category,active:body.active,isDefault:body.active&&body.isDefault,aliases};
 return {movement,catalogue:old?catalogue.map(m=>m.id===old.id?movement:m):[...catalogue,movement]};
}
export function synchronizeRmMovements(state,catalogue){let changed=false;for(const r of [...state.records,...state.rms]){const m=findRmMovement(catalogue,r.movementId||r.movement);if(m&&(r.movementId!==m.id||r.movement!==m.name)){r.movementId=m.id;r.movement=m.name;changed=true;}}return changed;}
export function rmPercentages(lbs){return Number.isFinite(lbs)&&lbs>0?[50,60,70,80,90].map(percent=>({percent,lbs:lbs*percent/100})):[];}
export function attendanceEmoji(date){const symbols=['🏋️','💪','🔥','⚡','🏆'];let sum=0;for(const c of String(date))sum=(sum*31+c.charCodeAt(0))>>>0;return symbols[sum%symbols.length];}
