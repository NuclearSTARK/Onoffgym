export const belongsTo=(record,memberId)=>!!memberId&&record.memberId===memberId;
export function synchronizeIdentity(state,viewer,members=[]){
 const names=new Map(members.map(m=>[m.id,m.name]));if(viewer?.id)names.set(viewer.id,viewer.name);
 let changed=false;
 for(const r of state.records){if(r.memberId&&names.has(r.memberId)&&r.name!==names.get(r.memberId)){r.name=names.get(r.memberId);changed=true;}}
 for(const r of state.rms){if(!r.memberId&&r.source){const source=state.records.find(x=>x.id===r.source);if(source?.memberId){r.memberId=source.memberId;changed=true;}}}
 for(const p of state.posts||[]){if(p.authorId&&names.has(p.authorId)&&p.author!==names.get(p.authorId)){p.author=names.get(p.authorId);changed=true;}for(const c of p.comments||[])if(c.authorId&&names.has(c.authorId)&&c.author!==names.get(c.authorId)){c.author=names.get(c.authorId);changed=true;}}
 return changed;
}
export function linkLegacyRecord(state,kind,id,member){
 if(!member?.id||member.status!=='approved')throw Error('승인된 회원을 선택해주세요.');
 const list=kind==='rm'?state.rms:kind==='record'?state.records:null;
 const record=list?.find(r=>r.id===id);if(!record||record.memberId)throw Error('연결이 필요한 이전 기록을 선택해주세요.');
 record.memberId=member.id;if(kind==='record')record.name=member.name;
 synchronizeIdentity(state,null,[member]);return record;
}
