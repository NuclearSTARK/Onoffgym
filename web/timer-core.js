const seconds=(value,label,min=1,max=21600)=>{const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)throw Error(label+'을 확인해주세요.');return Math.round(n*1000);};
export const TIMER_MODES=['AMRAP','FOR TIME','EMOM','TABATA','MIX'];
export function timerPlan(config){const phases=[];const prep=seconds(config.prep??10,'준비 시간',0,120);if(prep)phases.push({mode:'PREP',label:'준비',duration:prep,round:0,rounds:0});const add=(c,group=1,groups=1)=>{if(!TIMER_MODES.includes(c.mode)||c.mode==='MIX')throw Error('타이머 방식을 확인해주세요.');if(['AMRAP','FOR TIME'].includes(c.mode)){phases.push({mode:c.mode,label:c.mode,duration:seconds(timerDuration(c),'운동 시간'),round:1,rounds:1,group,groups});return;}const rounds=Number(c.rounds);if(!Number.isInteger(rounds)||rounds<1||rounds>100)throw Error('라운드는 1~100으로 설정해주세요.');for(let i=1;i<=rounds;i++){if(c.mode==='EMOM')phases.push({mode:c.mode,label:'운동',duration:seconds(c.interval,'라운드 간격'),round:i,rounds,group,groups});else{phases.push({mode:c.mode,label:'운동',duration:seconds(c.work,'운동 시간'),round:i,rounds,group,groups});const rest=seconds(c.rest??10,'휴식 시간',0,3600);if(rest)phases.push({mode:c.mode,label:'휴식',duration:rest,round:i,rounds,group,groups});}}};if(config.mode==='MIX'){if(!Array.isArray(config.mix)||config.mix.length<1||config.mix.length>10)throw Error('MIX는 1~10개 구간으로 설정해주세요.');config.mix.forEach((c,i)=>add(c,i+1,config.mix.length));}else add(config);if(phases.reduce((n,p)=>n+p.duration,0)>21600000)throw Error('전체 시간은 6시간 이내로 설정해주세요.');return phases;}
export function timerPosition(phases,elapsed){let start=0;for(let i=0;i<phases.length;i++){const p=phases[i];if(elapsed<start+p.duration)return {...p,index:i,elapsed:Math.max(0,elapsed-start),remaining:Math.max(0,start+p.duration-elapsed),done:false};start+=p.duration;}return {index:phases.length,done:true,elapsed:start,remaining:0,label:'완료'};}
export function timerElapsed(state,now=Date.now()){return Math.max(0,(Number(state.elapsed)||0)+(state.running?Math.max(0,now-state.anchor):0));}
export function timerClock(ms,up=false){const total=up?Math.floor(ms/1000):Math.ceil(ms/1000),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;return (h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}

export function timerDisplay(position){const up=['AMRAP','EMOM','FOR TIME'].includes(position.mode);return timerClock(up?position.elapsed:position.remaining,up);}

export function timerDuration(config){
 const minutes=Number(config.minutes??0),extra=Number(config.seconds??0);
 if(!Number.isFinite(minutes)||minutes<0||config.seconds!==undefined&&(!Number.isInteger(minutes)||!Number.isInteger(extra)||extra<0||extra>59))throw Error('분·초를 확인해주세요.');
 return minutes*60+extra;
}
export function addTimerTime(config,seconds){
 const total=Math.min(21600,Math.max(0,Math.round(timerDuration(config)+seconds)));
 return {...config,minutes:Math.floor(total/60),seconds:total%60};
}
