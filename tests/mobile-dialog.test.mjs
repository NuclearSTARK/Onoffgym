import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dialogFrame} from '../web/app-viewport.js';
import {videoCategory,videoGroups} from '../web/video-library.js';
import {DEFAULT_RM_CATALOGUE} from '../web/rm-catalogue.js';
test('keyboard-sized dialog frames stay inside the panned visual viewport and safe areas',()=>{
 const f=dialogFrame({width:390,height:310,top:220,safeTop:47,safeBottom:34,contentHeight:900,editing:true});
 assert.equal(f.top,279);assert.equal(f.height,205);assert.equal(f.top+f.height,220+310-34-12);assert.equal(f.width,366);assert.equal(f.left,12);
 const landscape=dialogFrame({width:844,height:250,safeLeft:47,safeRight:47,editing:true});assert.ok(landscape.left>=59);assert.ok(landscape.left+landscape.width<=844-59);
 const short=dialogFrame({width:390,height:844,contentHeight:200});assert.equal(short.top,(844-200)/2);
});
test('video groups reuse exact RM categories and aliases, include non-lifting movements, and filter without losing videos',()=>{
 assert.equal(videoCategory('Hang Sqaut Snatch',DEFAULT_RM_CATALOGUE),'snatch');assert.equal(videoCategory('Clean & Jerk',DEFAULT_RM_CATALOGUE),'complex');assert.equal(videoCategory('Clean',DEFAULT_RM_CATALOGUE),'clean');assert.equal(videoCategory('Row',DEFAULT_RM_CATALOGUE),'cardio');assert.equal(videoCategory('Burpee',DEFAULT_RM_CATALOGUE),'gymnastics');assert.equal(videoCategory('Unlisted movement',DEFAULT_RM_CATALOGUE),'other');
 const rows=[{name:'Front Squat',videoId:'keep-me'},{name:'Power Clean'},{name:'Row'},{name:'Unlisted movement'}];
 assert.equal(videoGroups(rows,DEFAULT_RM_CATALOGUE).flatMap(g=>g.items).length,rows.length);
 const filtered=videoGroups(rows,DEFAULT_RM_CATALOGUE,{search:'squat',category:'squat'});assert.equal(filtered.length,1);assert.equal(filtered[0].items[0].videoId,'keep-me');assert.equal(videoGroups(rows,DEFAULT_RM_CATALOGUE,{search:'row',category:'squat'}).length,0);
 const custom=[...DEFAULT_RM_CATALOGUE,{id:'custom',name:'Unlisted movement',category:'press'}];assert.equal(videoCategory('Unlisted movement',custom),'press');
});
