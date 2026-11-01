import {RM_CATEGORIES,findRmMovement} from './rm-catalogue.js';
export const VIDEO_CATEGORIES=[...RM_CATEGORIES,['cardio','유산소'],['gymnastics','맨몸·체조'],['other','기타 동작']];
export function videoCategory(name,catalogue){
 const known=findRmMovement(catalogue,name);if(known&&VIDEO_CATEGORIES.some(([id])=>id===known.category))return known.category;
 const n=String(name).toLowerCase();
 if(/clean.*jerk|thruster|cluster/.test(n))return 'complex';
 if(/snatch/.test(n))return 'snatch';
 if(/clean/.test(n))return 'clean';
 if(/squat/.test(n))return 'squat';
 if(/deadlift/.test(n))return 'deadlift';
 if(/press|jerk/.test(n))return 'press';
 if(/\b(row|rowing|bike|ski|run|running|jump rope|double under|single under)\b/.test(n))return 'cardio';
 if(/pull.up|push.up|muscle.up|handstand|toes.to.bar|sit.up|burpee|plank|box (jump|step)|air squat/.test(n))return 'gymnastics';
 return 'other';
}
export function videoGroups(movements,catalogue,{search='',category='all'}={}){
 const needle=search.trim().toLowerCase();
 return VIDEO_CATEGORIES.filter(([id])=>category==='all'||category===id).map(([id,label])=>({id,label,items:movements.filter(m=>m.name.toLowerCase().includes(needle)&&videoCategory(m.name,catalogue)===id)})).filter(g=>g.items.length);
}
