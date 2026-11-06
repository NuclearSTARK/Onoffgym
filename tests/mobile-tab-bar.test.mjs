import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tabSpring,tabSelectionBounds} from '../web/mobile-tab-bar.js';
test('interrupting a tab spring preserves position and velocity, then settles on the new tab',()=>{
 const moving=tabSpring({position:10,target:320,time:.12});
 const retargeted={...moving,target:80,frequency:11,damping:.72};
 assert.ok(Math.abs(tabSpring({...retargeted,time:0}).position-moving.position)<1e-9);
 assert.ok(Math.abs(tabSpring({...retargeted,time:0}).velocity-moving.velocity)<1e-9);
 const settled=tabSpring({...retargeted,time:1.6});assert.ok(Math.abs(settled.position-80)<.04);assert.ok(Math.abs(settled.velocity)<.4);
});
test('long jumps and reversed edges retain a visible rounded selection inside the bar',()=>{
 for(const [left,right] of [[-100,520],[430,-50],[-100,-50],[600,700],[70,140]]){
  const box=tabSelectionBounds({left,right,min:10,max:360,radius:30});
  assert.ok(box.left>=10);assert.ok(box.left+box.width<=360);assert.ok(box.width>=60);
 }
 const narrow=tabSelectionBounds({left:-100,right:100,min:10,max:60,radius:30});assert.equal(narrow.left,10);assert.equal(narrow.width,50);
});
