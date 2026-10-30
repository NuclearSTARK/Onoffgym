import {readFile,writeFile,mkdir,rm,cp} from 'node:fs/promises';
const out='pages-dist';await rm(out,{recursive:true,force:true});await cp('web',out,{recursive:true});
let html=await readFile(out+'/index.html','utf8');html=html.replace('<head>','<head><script>window.ONOFF_DEMO=true;</script>');html=html.replace('<body>','<body><aside class="public-test-notice"><strong>공개 테스트</strong><span>예시 데이터 · 입력은 이 브라우저에만 저장됩니다.</span></aside>');
await writeFile(out+'/index.html',html);await writeFile(out+'/.nojekyll','');
// Real push worker is not exposed by the isolated Pages demonstration.
await rm(out+'/sw.js',{force:true});
console.log('Built public GitHub Pages test site in '+out+' (isolated browser data; no real API calls).');
