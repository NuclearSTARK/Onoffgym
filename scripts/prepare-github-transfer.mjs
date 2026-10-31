import {readFile,access} from 'node:fs/promises';
const args=process.argv.slice(2),value=key=>{const i=args.indexOf(key);return i<0?null:args[i+1];},owner=value('--owner'),repo=value('--repo')||'Onoffgym';
if(owner&&!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(owner))throw Error('GitHub 아이디를 확인해주세요.');
if(!/^[a-z0-9_.-]+$/i.test(repo))throw Error('저장소 이름을 확인해주세요.');
const required=['web/index.html','web/auth-callback.html','web/sw.js','supabase/public-project.json','supabase/functions/onoff-api/entry.js','supabase/functions/onoff-api/server.js','.github/workflows/pages.yml','.github/workflows/verify.yml','package-lock.json','docs/github-이전준비.md'];
await Promise.all(required.map(file=>access(new URL('../'+file,import.meta.url))));
const config=JSON.parse(await readFile(new URL('../supabase/public-project.json',import.meta.url),'utf8'));
if(!config.url||!config.publishableKey||/sb_secret_|service_role/.test(config.publishableKey))throw Error('프런트에는 Supabase 공개 키만 넣어야 합니다.');
async function sourceCommit(){try{const head=(await readFile(new URL('../.git/HEAD',import.meta.url),'utf8')).trim();if(/^[a-f0-9]{40}$/.test(head))return head;const ref=head.replace(/^ref: /,'');try{return (await readFile(new URL('../.git/'+ref,import.meta.url),'utf8')).trim();}catch{const packed=await readFile(new URL('../.git/packed-refs',import.meta.url),'utf8');return packed.split('\n').find(line=>line.endsWith(' '+ref))?.split(' ')[0]||null;}}catch{return null;}}
const sha=await sourceCommit(),targetOwner=owner||'<대표님-GitHub-아이디>',site=`https://${targetOwner.toLowerCase()}.github.io/${repo}/`,origin=`https://${targetOwner.toLowerCase()}.github.io`;
const plan={mode:'review-only',sourceCommit:sha,targetSpecified:!!owner,repository:`${targetOwner}/${repo}`,siteUrl:site,authCallback:site+'auth-callback.html',corsOrigin:origin,notificationPath:`/${repo}/`,supabaseProject:config.projectId,supabaseUrl:config.url,keepSupabaseData:true,requiredFilesVerified:required.length,steps:['대표 계정 생성 및 저장소 Transfer ownership 수락','기존 저장소 이름 Onoffgym 유지 권장; GitHub Pages Source를 GitHub Actions로 확인','Supabase URL Configuration에 새 Site URL 및 auth-callback.html 등록','Edge API CORS 허용 출처와 로그인/탈퇴 안내의 고정 링크를 새 주소로 변경 후 재배포','저장소 이름 변경 시 서버·큐의 알림 링크 경로와 서비스 워커 범위를 함께 점검','새 주소에서 푸시 권한과 구독을 다시 연결, TV PIN으로 재접속','이메일 로그인 유지·가입 승인·기록 저장·재설정 메일·푸시·TV 실제 기기 검증']};
console.log(JSON.stringify(plan,null,2));
console.log('\n검사와 이전 계획만 생성했습니다. 저장소 소유권·배포 주소·DB는 변경하지 않았습니다.');
