// A browser may restore an older document from its back/forward cache even when
// every asset is versioned. Refresh that document only when its forms are clean.
export async function checkAppRelease({current,fetchLatest,reload,canReload=()=>true}){
 if(!/^[a-f0-9]{12}$/.test(current||'')||!canReload())return false;
 try{const latest=await fetchLatest();if(!/^[a-f0-9]{12}$/.test(latest?.version||'')||latest.version===current||!canReload())return false;reload();return true;}catch{return false;}
}
export function installAppRelease({canReload=()=>true}={}){
 let checking=false;
 window.addEventListener('pageshow',async event=>{if(!event.persisted||checking)return;checking=true;try{await checkAppRelease({current:document.querySelector('meta[name="onoff-release"]')?.content,canReload,fetchLatest:async()=>{const response=await fetch(new URL('./release.json',import.meta.url),{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('Release unavailable');return response.json();},reload:()=>location.reload()});}finally{checking=false;}});
}
