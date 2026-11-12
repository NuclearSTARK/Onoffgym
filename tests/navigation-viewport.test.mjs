import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keyboardViewportOpen,filePickerViewport,dialogFrame} from '../web/app-viewport.js';
test('a stale short viewport without an editable focus must not hide the tab bar',()=>{
 assert.equal(keyboardViewportOpen({baseline:844,height:530}),false);
 assert.equal(keyboardViewportOpen({baseline:844,height:530,wasOpen:true,now:1000,closingUntil:500}),false);
});
test('editing hides tabs only for a keyboard-sized shrink and ends when height is restored',()=>{
 assert.equal(keyboardViewportOpen({baseline:844,height:530,editing:true}),true);
 assert.equal(keyboardViewportOpen({baseline:844,height:790,editing:true}),false);
 assert.equal(keyboardViewportOpen({baseline:844,height:844,editing:true,wasOpen:true}),false);
});
test('blur keeps tabs hidden briefly, then releases them even if visual height stays stale',()=>{
 const closed={baseline:844,height:530,wasOpen:true,closingUntil:1500};
 assert.equal(keyboardViewportOpen({...closed,now:1100}),true);
 assert.equal(keyboardViewportOpen({...closed,now:1500}),false);
 assert.equal(keyboardViewportOpen({...closed,now:1700}),false);
 assert.equal(keyboardViewportOpen({...closed,now:1700,editing:true}),true);
});

test('returning from Photos restores the prior dialog space while stale metrics remain',()=>{
 const before={width:390,height:844,top:0,left:0,scale:1},after={width:390,height:420,top:100,left:0,scale:1};
 const restored=filePickerViewport(after,before);
 assert.equal(restored.height,844);assert.equal(restored.top,0);
 const frame=dialogFrame({...restored,safeTop:47,safeBottom:34,contentHeight:510});
 assert.ok(frame.top>=59&&frame.top+510<=844-34-12);
 assert.equal(filePickerViewport(after,null),after);
});
test('file-picker recovery respects text keyboards, pinch zoom, rotation and settled viewport metrics',()=>{
 const before={width:390,height:844,top:0,left:0};
 const keyboard={width:390,height:420,top:100,left:0,scale:1};
 assert.equal(filePickerViewport(keyboard,before,{editing:true}),keyboard);
 for(const current of [{...keyboard,scale:2},{width:740,height:390,scale:1},{width:390,height:800,scale:1}])assert.equal(filePickerViewport(current,before),current);
});
