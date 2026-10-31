import {readFile,writeFile,mkdir,rm,cp} from 'node:fs/promises';
const out='pages-dist';await rm(out,{recursive:true,force:true});await cp('web',out,{recursive:true});
const demo=process.argv.includes('--demo'),config=JSON.parse(await readFile('supabase/public-project.json','utf8'));
await writeFile(out+'/backend-config.js',demo?'window.ONOFF_DEMO=true;window.ONOFF_BACKEND=null;':'window.ONOFF_BACKEND='+JSON.stringify(config)+';');
let html=await readFile(out+'/index.html','utf8');html=html.replace('<div class="app-header">','<div class="app-header"><aside class="public-test-notice" id="backend-notice"><strong>회원 전용</strong><span>카카오 로그인 준비 중</span></aside>');
await writeFile(out+'/index.html',html);
await writeFile(out+'/.nojekyll','');
// Real push worker is not exposed by the isolated Pages demonstration.
await rm(out+'/sw.js',{force:true});
console.log('Built GitHub Pages site in '+out+(demo?' (isolated demo)':' (authenticated Supabase backend; explicit preview stays isolated)'));
