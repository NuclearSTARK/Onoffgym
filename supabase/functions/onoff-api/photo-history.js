export function personalBoardRecords(imports,m,visible){return imports.flatMap(i=>i.rows.filter(r=>!r.excluded&&r.participants.some(p=>p.memberId===m.id)).map(r=>({...r,id:i.photo_id+':'+r.id,photoId:i.photo_id,date:i.gym_photos.date,session:i.gym_photos.session,participants:r.participants.map(p=>{const member=visible.find(v=>v.id===p.memberId);return {name:p.memberId===m.id?m.name:member?.disclosure_consent===true?member.name:'팀원',memberId:p.memberId===m.id?m.id:null};})})));}
export async function readPhotoHistory(db,member,members){
 const {data,error}=await db.from('gym_board_imports').select('*,gym_photos!inner(date,program,session,active)').eq('status','published').eq('gym_photos.active',true).contains('rows',JSON.stringify([{participants:[{memberId:member.id}]}])).order('updated_at',{ascending:false}).limit(1000);
 if(error)throw Object.assign(Error('기존 사진 기록을 불러오지 못했어요.'),{status:503});
 return personalBoardRecords(data||[],member,members);
}
