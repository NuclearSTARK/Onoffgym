import {test} from 'node:test';
import assert from 'node:assert/strict';
import {movementToken,replaceMovementToken} from '../web/movement-autocomplete.js';
import {communityKey,unreadCommunityPosts} from '../web/community-read.js';
import {mountRmWeight,rmWeightLbs} from '../web/rm-weight.js';
test('movement suggestions replace the active comma/semicolon/newline token without changing other movements',()=>{
 assert.equal(movementToken('Front Squat, Pow').text,'Pow');
 assert.equal(replaceMovementToken('Front Squat, Pow',16,'Power Clean').value,'Front Squat, Power Clean, ');
 assert.equal(replaceMovementToken('Front Squat; Pow; Row',16,'Power Clean').value,'Front Squat; Power Clean; Row');
 assert.equal(movementToken('Clean\nSnat').text,'Snat');
 assert.equal(replaceMovementToken('Snat',4,'Snatch').value,'Snatch, ');
 assert.equal(movementToken('Hang Power Clean').text,'Hang Power Clean');
});
test('community unread counts include notices, exclude own posts and distinguish matching IDs by kind',()=>{
 const posts=[{id:'1',authorId:'me'},{id:'2',authorId:'other'},{id:'2',serverNotice:true,author_id:'admin'}];
 assert.equal(unreadCommunityPosts(posts,{},'me').length,2);
 assert.equal(communityKey(posts[2]),'notice:2');
 assert.deepEqual(unreadCommunityPosts(posts,{'post:2':'read'},'me'),[posts[2]]);
 assert.equal(unreadCommunityPosts(posts,{'post:2':'read','notice:2':'read'},'me').length,0);
});
const field=value=>({value,listeners:{},addEventListener(k,f){this.listeners[k]=f;},emit(k){this.listeners[k]?.();}});
test('editing 1RM in kg and switching units preserves exact canonical lbs until the weight is changed',()=>{
 const form={elements:{weight:field('83.9'),unit:field('kg')}};mountRmWeight(form,185);
 assert.equal(rmWeightLbs(form),185);
 form.elements.unit.value='lbs';form.elements.unit.emit('change');assert.equal(form.elements.weight.value,185);assert.equal(rmWeightLbs(form),185);
 form.elements.unit.value='kg';form.elements.unit.emit('change');assert.equal(rmWeightLbs(form),185);
 form.elements.weight.value='100';form.elements.weight.emit('input');assert.ok(Math.abs(rmWeightLbs(form)-220.46226218)<1e-8);
});
