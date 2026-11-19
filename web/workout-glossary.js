// Local, display-only glossary. No network requests or changes to stored classes.
const entry=(title,english,description,example)=>Object.freeze({title,english,description,example});
const terms=Object.freeze({
 amrap:entry('AMRAP','As Many Rounds / Reps As Possible','정해진 시간 안에 가능한 만큼 라운드나 횟수를 반복해요.','20분 동안 5라운드와 추가 10회를 했다면 5R+10으로 기록해요.'),
 emom:entry('EMOM','Every Minute On the Minute','매분 시작할 때 정해진 운동을 하고, 남은 시간은 쉬어요.','운동을 40초에 끝냈다면 20초 쉬고 다음 분에 다시 시작해요.'),
 ft:entry('FT','For Time','정해진 운동을 모두 끝내는 데 걸린 시간을 기록해요.','10분 30초에 완료했다면 10:30으로 기록해요.'),
 rft:entry('RFT','Rounds For Time','정해진 라운드를 모두 끝내는 데 걸린 시간을 기록해요.','3 RFT는 아래 운동을 3라운드 완료하는 방식이에요.'),
 tc:entry('TC','Time Cap','운동을 진행할 수 있는 제한 시간이에요.','TC 15min이면 15분에 운동을 마쳐요. 미완료 기록은 수업에 정해진 방식을 따라요.'),
 ygig:entry('YGIG','You Go, I Go','팀원이 정해진 구간이나 횟수 단위로 번갈아 운동해요.','한 명이 정해진 구간을 끝내면 다른 사람이 이어서 진행해요.'),
 syn:entry('Syn','Synchronized','팀원이 정해진 동작 기준에 맞춰 동시에 수행해요.','10 Syn Burpees는 함께 버피 10회를 해요.'),
 unbroken:entry('Unbroken','','중간에 세트를 끊지 않고 연속으로 수행해요.','20 Unbroken DU는 줄넘기를 중간에 끊지 않고 20회 연속으로 해요.'),
 '1rm':entry('1RM','','올바른 자세로 한 번 들 수 있는 최대 중량이에요.','성공한 1회의 최대 중량을 기록해요. 측정은 코치 안내를 따라요.'),
 rx:entry('Rx','','수업에서 제시한 동작·중량 등의 기준으로 수행해요.','제시된 동작이나 중량 등의 기준을 조정했다면 Scaled에 해당해요.'),
 scaled:entry('Scaled','','현재 수준에 맞게 동작·중량·횟수 등을 조정해요.','코치와 상의해 풀업을 다른 동작으로 바꾸거나 중량을 낮춰요.'),
 tabata:entry('TABATA','','보통 20초 운동하고 10초 쉬기를 8세트 반복해요. 수업에 별도 시간이 있으면 그 기준을 따라요.','20초 운동과 10초 휴식을 8세트 진행하면 총 4분이에요.'),
 du:entry('DU','Double Under','한 번 뛸 때 줄넘기가 발밑을 두 번 지나가는 동작이에요.','20 DU는 이단 줄넘기를 20회 수행해요.'),
 su:entry('SU','Single Under','한 번 뛸 때 줄넘기가 발밑을 한 번 지나가는 동작이에요.','50 SU는 일반 줄넘기를 50회 수행해요.'),
 ttb:entry('TTB','Toes to Bar','철봉에 매달려 발끝을 철봉에 닿게 하는 동작이에요.','10 TTB는 토즈 투 바를 10회 수행해요.'),
 c2b:entry('C2B','Chest to Bar','가슴을 철봉에 닿게 하는 풀업이에요.','10 C2B는 체스트 투 바 풀업을 10회 수행해요.'),
 hspu:entry('HSPU','Handstand Push-up','물구나무 자세에서 팔을 굽혔다 펴는 동작이에요.','5 HSPU는 핸드스탠드 푸시업을 5회 수행해요.'),
 bmu:entry('BMU','Bar Muscle-up','철봉에 매달린 자세에서 몸을 철봉 위로 올려 지지하는 동작이에요.','3 BMU는 바 머슬업을 3회 수행해요.'),
 rmu:entry('RMU','Ring Muscle-up','링에 매달린 자세에서 몸을 링 위로 올려 지지하는 동작이에요.','3 RMU는 링 머슬업을 3회 수행해요.')
});
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Match candidate text first, then check boundaries against the original string.
// This keeps short aliases out of words such as LEFT, RXBAR or STRUCTURE.
const candidates=/you[ \t]+go(?:[ \t]*,[ \t]*|[ \t]+)i[ \t]+go|for[ \t]+time|time[ \t]*cap|t[ \t]*\/[ \t]*c|e[1-9]\d{0,2}mom|amrap|emom|unbroken|scaled|tabata|hspu|rft|ygig|sync?|rx(?:[’']?d)?|1rm|ttb|t2b|c2b|ctb|bmu|rmu|tc|ft|du|su/giu;
function termKey(value){
 const plain=value.toLowerCase().replace(/[ \t,/'’]/g,'');
 return ({fortime:'ft',timecap:'tc',yougoigo:'ygig',sync:'syn',rxd:'rx',t2b:'ttb',ctb:'c2b',e1mom:'emom'})[plain]||plain;
}
export function workoutTerm(key){
 if(typeof key!=='string')return null;
 if(Object.hasOwn(terms,key))return terms[key];
 const match=/^e([1-9]\d{0,2})mom$/.exec(key);
 if(!match)return null;
 const minutes=Number(match[1]);
 if(minutes===1)return terms.emom;
 return entry(`E${minutes}MOM`,`Every ${minutes} Minutes On the Minute`,`${minutes}분마다 정해진 운동을 시작하고, 남은 시간은 쉬어요.`,`${minutes}분 간격으로 시작 시각을 맞춰요. 운동을 일찍 끝냈다면 다음 시작 시각까지 쉬어요.`);
}
export function workoutGlossaryText(value){
 const text=String(value??''),seen=new Set();let html='',cursor=0;
 for(const match of text.matchAll(candidates)){
  const start=match.index,end=start+match[0].length,key=termKey(match[0]),previous=text.slice(0,start),next=text.slice(end);
  const left=previous.at(-1)||'',right=next[0]||'';
  const countPrefix=/\d/u.test(left)&&/^(?:rft|ft|amrap|emom|e\d+mom)$/.test(key)&&/(?:^|[^\p{L}\p{N}_])\d+$/u.test(previous);
  if((/[\p{L}\p{N}_]/u.test(left)&&!countPrefix)||/[\p{L}\p{N}_]/u.test(right)||seen.has(key)||!workoutTerm(key))continue;
  seen.add(key);html+=escape(text.slice(cursor,start));
  html+=`<span class="workout-term">${escape(match[0])}<button type="button" class="workout-term-help" data-workout-term="${key}" aria-label="${escape(match[0])} 뜻 보기" aria-haspopup="dialog"><span aria-hidden="true">?</span></button></span>`;
  cursor=end;
 }
 return html+escape(text.slice(cursor));
}
export function workoutTermPopup(key){
 const term=workoutTerm(key);if(!term)return '';
 return `<div class="workout-term-popup">${term.english?`<p class="workout-term-english" lang="en">${escape(term.english)}</p>`:''}<p class="workout-term-description">${escape(term.description)}</p><div class="workout-term-example"><span>예시</span><p>${escape(term.example)}</p></div><button type="button" class="btn full workout-term-confirm" data-action="close">확인</button></div>`;
}
