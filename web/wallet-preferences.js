// Visibility changes presentation only; membership and coupon access rules stay server-owned.
const DEFAULT_VISIBLE_STAFF_ID='9b366733-5fcb-49f3-a83f-6a3f9ab146cc';
export function canToggleMembershipWallet(member){return ['admin','coach'].includes(member?.role);}
export function showMembershipWallet(member,preferences={}){
 if(!canToggleMembershipWallet(member))return true;
 return typeof preferences.showMembershipWallet==='boolean'?preferences.showMembershipWallet:member.id===DEFAULT_VISIBLE_STAFF_ID;
}
