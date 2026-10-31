import {readFile,writeFile,mkdir,rm,cp,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='pages-dist';await rm(out,{recursive:true,force:true});await cp('web',out,{recursive:true});
const demo=process.argv.includes('--demo'),config=JSON.parse(await readFile('supabase/public-project.json','utf8'));
await writeFile(out+'/backend-config.js',demo?'window.ONOFF_DEMO=true;window.ONOFF_BACKEND=null;':'window.ONOFF_BACKEND='+JSON.stringify(config)+';');
let html=await readFile(out+'/index.html','utf8');html=html.replace('<div class="app-header">','<div class="app-header"><aside class="public-test-notice" id="backend-notice"><strong>회원 전용</strong><span>카카오 로그인 준비 중</span></aside>');
await writeFile(out+'/index.html',html);
await writeFile(out+'/.nojekyll','');
// Real push worker is not exposed by the isolated Pages demonstration.
await rm(out+'/sw.js',{force:true});
// Pages caches assets for several minutes. Version the complete module graph,
// including imported login/TV modules, so a fresh page cannot mix deployments.
const entries=(await readdir(out)).filter(f=>/\.(js|css)$/.test(f)).sort();
const fingerprint=createHash('sha256');for(const file of entries)fingerprint.update(await readFile(out+'/'+file));
const version=fingerprint.digest('hex').slice(0,12);
for(const file of entries.filter(f=>f.endsWith('.js'))){let code=await readFile(out+'/'+file,'utf8');code=code.replace(/(from\s*|import\s*\(\s*)(['"])(\.{1,2}\/[^'"?]+\.js)\2/g,(_,prefix,quote,path)=>prefix+quote+path+'?v='+version+quote);await writeFile(out+'/'+file,code);}
for(const file of ['index.html','tv.html']){let markup=await readFile(out+'/'+file,'utf8');markup=markup.replace(/((?:src|href)=["'])(\.\/?[^"'?]+\.(?:js|css))(?:\?[^"']*)?(["'])/g,(_,prefix,path,quote)=>prefix+path+'?v='+version+quote);await writeFile(out+'/'+file,markup);}
console.log('Built GitHub Pages site in '+out+(demo?' (isolated demo)':' (authenticated Supabase backend; explicit preview stays isolated)'));
