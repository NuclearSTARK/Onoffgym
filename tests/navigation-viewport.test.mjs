import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keyboardViewportOpen} from '../web/app-viewport.js';
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
