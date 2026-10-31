// Shared navigation rules: restoring a session never bypasses member approval.
export function resumePage({shared,page,mode,viewer,approvalTarget}){if(!shared||page!=='login'||mode!=='login'||!viewer)return page;return approvalTarget&&viewer.role==='admin'&&viewer.status==='approved'?'admin/members':'home';}
export function createAdminScrollMemory(){let top=0;return {leave(page,y){if(page==='admin'&&Number.isFinite(y))top=Math.max(0,y);},enter(from,to){return to==='admin'&&from.startsWith('admin/')?top:0;}};}
