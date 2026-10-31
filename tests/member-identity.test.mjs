import {test} from 'node:test';
import assert from 'node:assert/strict';
import {belongsTo,synchronizeIdentity,linkLegacyRecord} from '../web/member-identity.js';
import {findClassRecord} from '../web/record-tools.js';
test('renames update display names without changing ownership or merging namesakes',()=>{
 const state={records:[{id:'a',memberId:'alice',name:'같은이름'},{id:'b',memberId:'bob',name:'같은이름'},{id:'legacy',name:'같은이름'}],rms:[{id:'r1',source:'a',lbs:200},{id:'r2',lbs:300}],posts:[{authorId:'alice',author:'같은이름',comments:[{authorId:'bob',author:'같은이름',text:'안녕'}]}]};
 assert.equal(synchronizeIdentity(state,{id:'alice',name:'정정된실명'},[{id:'bob',name:'같은이름'}]),true);
 assert.equal(state.records[0].name,'정정된실명');assert.equal(state.records[1].name,'같은이름');assert.equal(state.records[2].memberId,undefined);
 assert.equal(belongsTo(state.records[0],'alice'),true);assert.equal(belongsTo(state.records[1],'alice'),false);assert.equal(belongsTo(state.records[2],'alice'),false);
 assert.equal(state.rms[0].memberId,'alice');assert.equal(state.rms[1].memberId,undefined);assert.equal(state.posts[0].author,'정정된실명');assert.equal(state.posts[0].comments[0].author,'같은이름');
 assert.equal(synchronizeIdentity(state,{id:'alice',name:'정정된실명'},[{id:'bob',name:'같은이름'}]),false);
});
test('legacy records require an explicit approved member association',()=>{
 const state={records:[{id:'legacy',name:'같은이름',lbs:200}],rms:[{id:'r1',source:'legacy',lbs:200}],posts:[]};
 assert.throws(()=>linkLegacyRecord(state,'record','legacy',{id:'bob',status:'pending'}));
 linkLegacyRecord(state,'record','legacy',{id:'bob',name:'같은이름',status:'approved'});
 assert.equal(state.records[0].memberId,'bob');assert.equal(state.rms[0].memberId,'bob');assert.equal(state.records[0].lbs,200);
 assert.throws(()=>linkLegacyRecord(state,'record','legacy',{id:'alice',name:'같은이름',status:'approved'}));
});
test('a legacy name match never grants a batch overwrite',()=>{
 const context={date:'2026-11-02',program:'WOD',session:'09:30',section:'S1'},legacy={...context,id:'old',name:'같은이름'};
 assert.equal(findClassRecord([legacy],{id:'alice',name:'같은이름'},context),undefined);
 assert.equal(findClassRecord([{...legacy,memberId:'alice'}],{id:'alice',name:'새이름'},context).id,'old');
});
