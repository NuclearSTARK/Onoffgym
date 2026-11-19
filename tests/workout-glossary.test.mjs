import test from 'node:test';
import assert from 'node:assert/strict';
import {workoutGlossaryText,workoutTerm,workoutTermPopup} from '../web/workout-glossary.js';
const keys=text=>[...workoutGlossaryText(text).matchAll(/data-workout-term="([^"]+)"/g)].map(m=>m[1]);
test('legacy course text gets one help button per canonical term, keeping its original spelling',()=>{
 const text='20min amrap\nAMRAP · Syn / Sync\nTC 15min, T/C, Time Cap\nTTB T2B · C2B CTB';
 assert.deepEqual(keys(text),['amrap','syn','tc','ttb','c2b']);
 const markup=workoutGlossaryText(text);assert.ok(markup.includes('>amrap<button'));assert.ok(markup.includes('AMRAP · '));assert.ok(markup.includes(' / Sync'));assert.deepEqual(keys('AMRAP'),['amrap']);
});
test('basic terms and fragments of other words never get explanations',()=>{
 assert.deepEqual(keys('Rounds rounds Reps reps Team of 2 Team of 3 Team of 4 LEFT SOFTWARE RXBAR SYNCHRONOUS STRUCTURE AMRAPX E0MOM E1000MOM'),[]);
 assert.deepEqual(keys('(EMOM), 3RFT 20AMRAP / DU + SU'),['emom','rft','amrap','du','su']);
});
test('aliases, casing and interval numbers resolve to the agreed titles and expansions',()=>{
 const text="eMoM E2MOM e3mom E4MOM E1MOM FT For Time RFT TC T/C TimeCap YGIG You Go, I Go Syn Sync Unbroken 1RM Rx Rx’d Rx'd Rxd Scaled TABATA DU SU TTB T2B C2B CTB HSPU BMU RMU";
 assert.deepEqual(keys(text),['emom','e2mom','e3mom','e4mom','ft','rft','tc','ygig','syn','unbroken','1rm','rx','scaled','tabata','du','su','ttb','c2b','hspu','bmu','rmu']);
 for(const n of [2,3,4,20]){const term=workoutTerm(`e${n}mom`);assert.equal(term.title,`E${n}MOM`);assert.equal(term.english,`Every ${n} Minutes On the Minute`);assert.ok(term.description.startsWith(`${n}분마다`));}
 assert.equal(workoutTerm('syn').title,'Syn');assert.equal(workoutTerm('amrap').english,'As Many Rounds / Reps As Possible');
});
test('four agreed terms omit English expansions and the popup orders English, explanation and example',()=>{
 for(const key of ['1rm','rx','scaled','tabata']){assert.equal(workoutTerm(key).english,'');const popup=workoutTermPopup(key);assert.ok(!popup.includes('workout-term-english'));assert.ok(popup.includes('workout-term-description'));assert.ok(popup.includes('workout-term-example'));}
 assert.equal(workoutTerm('unbroken').english,'');
 const popup=workoutTermPopup('amrap');assert.ok(popup.indexOf('As Many Rounds')<popup.indexOf('정해진 시간'));assert.ok(popup.indexOf('정해진 시간')<popup.indexOf('5R+10'));
});
test('glossary annotation escapes untrusted workout text and never generates caller-selected HTML',()=>{
 const text='<img src=x onerror="alert(1)"> AMRAP & \'DU\' <script>bad()</script>';
 const markup=workoutGlossaryText(text);assert.ok(!markup.includes('<img'));assert.ok(!markup.includes('<script'));assert.ok(markup.includes('&lt;img'));assert.ok(markup.includes('&amp;'));assert.ok(markup.includes('&#39;'));
 assert.deepEqual(keys(text),['amrap','du']);assert.equal(workoutGlossaryText(null),'');
 for(const key of ['__proto__','constructor','e0mom','e9999mom','amrap" onclick="alert(1)',null]){assert.equal(workoutTerm(key),null);assert.equal(workoutTermPopup(key),'');}
});
