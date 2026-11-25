export function communityViewCount(value){return Number.isSafeInteger(value)&&value>=0?value:0;}
export function communityViewLabel(value){return '조회 '+communityViewCount(value).toLocaleString('ko-KR');}
// Legacy read maps are unique by account; duplicate opens never add another view.
export function storedCommunityViewCount(key,authorId,readsByMember={}){return Object.entries(readsByMember).filter(([id,reads])=>id!==authorId&&reads&&typeof reads==='object'&&Object.hasOwn(reads,key)).length;}
