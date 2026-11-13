// Keep existing class and record keys stable while presenting Saturday as one course.
export const isSaturday=date=>/^\d{4}-\d{2}-\d{2}$/.test(date||'')&&new Date(date+'T12:00:00+09:00').getUTCDay()===6;
export const programsForDate=date=>[3,6].includes(new Date(date+'T12:00:00+09:00').getUTCDay())?['WOD']:['B/T','WOD'];
export const programLabel=(program,date)=>program==='WOD'&&isSaturday(date)?'Special Workout':program;
export const canonicalProgram=(program,date)=>isSaturday(date)&&String(program).trim().toUpperCase()==='SPECIAL WORKOUT'?'WOD':String(program||'').trim().toUpperCase();
