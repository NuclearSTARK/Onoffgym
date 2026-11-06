import {test} from 'node:test';
import assert from 'node:assert/strict';
import {swipeTab,createTabScrollVisibility} from '../web/tab-bar-behavior.js';
test('a deliberate bar drag moves one tab in its direction and never wraps',()=>{
 const gesture={index:1,count:5,dx:80,dy:3,slot:68};
 assert.equal(swipeTab(gesture),2);assert.equal(swipeTab({...gesture,dx:-80}),0);
 assert.equal(swipeTab({...gesture,dx:500}),2);
 assert.equal(swipeTab({...gesture,index:0,dx:-80}),0);
 assert.equal(swipeTab({...gesture,index:3,count:4}),3);
 assert.equal(swipeTab({...gesture,index:4}),4);
});
test('taps, short drags, vertical scrolling and missing selected tabs cannot navigate',()=>{
 const gesture={index:2,count:4,dx:0,dy:0,slot:60};
 for(const values of [{},{dx:20},{dx:50,dy:60},{dx:50,dy:45}])assert.equal(swipeTab({...gesture,...values}),2);
 assert.equal(swipeTab({...gesture,index:-1,dx:80}),-1);
});
test('scrolling hides only after sustained travel and reveals with a smaller upward movement',()=>{
 const state=createTabScrollVisibility(),sample=top=>state.sample({top,max:1500});state.reveal(200);
 for(const y of [205,211,208,215,225,245])assert.equal(sample(y),false);
 assert.equal(sample(255),true);assert.equal(sample(250),true);assert.equal(sample(244),true);assert.equal(sample(242),false);
});
test('both page edges and short pages show the bar, including elastic overscroll',()=>{
 const state=createTabScrollVisibility();state.reveal(200);assert(state.sample({top:300,max:1500}));
 for(const top of [-80,0,20,1480,1500,1600]){state.reveal(200);state.sample({top:300,max:1500});assert.equal(state.sample({top,max:1500}),false);}
 for(const max of [0,10,30])assert.equal(state.sample({top:15,max}),false);
});
test('navigation, keyboard and gesture pauses reset travel so stale scroll cannot hide the bar',()=>{
 const state=createTabScrollVisibility();state.reveal(200);assert(state.sample({top:300,max:1500}));
 assert.equal(state.sample({top:600,max:1500,blocked:true}),false);
 assert.equal(state.sample({top:620,max:1500}),false);
 state.reveal(800);assert.equal(state.sample({top:820,max:1500}),false);
 assert.equal(state.sample({top:841,max:1500}),true);
});
