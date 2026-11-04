export function namedRecordValue(record,type='time'){
 if(type==='rounds')return `${record.rounds}R + ${record.reps}회`;
 const value=Number(record.seconds);return Number.isFinite(value)?`${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`:'—';
}
export function namedBest(records,type='time'){return records.slice().sort((a,b)=>type==='rounds'?b.rounds-a.rounds||b.reps-a.reps:a.seconds-b.seconds)[0];}
export function namedInput(data,type='time'){
 const integer=(v,min,max)=>v!==''&&v!==null&&v!==undefined&&Number.isInteger(Number(v))&&Number(v)>=min&&Number(v)<=max;
 if(type==='rounds'){if(!integer(data.rounds,0,9999)||!integer(data.reps,0,99999)||Number(data.rounds)+Number(data.reps)===0)throw Error('라운드와 횟수를 확인해주세요.');return {rounds:Number(data.rounds),reps:Number(data.reps)};}
 if(!integer(data.minutes,0,999)||!integer(data.seconds,0,59)||Number(data.minutes)*60+Number(data.seconds)===0)throw Error('시간은 1초 이상, 초는 0~59로 입력해주세요.');return {seconds:Number(data.minutes)*60+Number(data.seconds)};
}
