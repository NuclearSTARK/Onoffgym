import {test} from 'node:test';
import assert from 'node:assert/strict';
import {meetupStart,meetupLifecycle,meetupBannerExpiresAt,pinnedMeetups} from '../web/meetups.js';
import {participationAccess} from '../web/participation-access.js';
const post={id:'meetup',category:'운동 번개',starts_at:meetupStart('2026-11-06','19:00'),banner_pinned:true},start=Date.parse(post.starts_at);
test('a meetup closes with the banner at 30 minutes and expires 24 hours from its start',()=>{
 const close=start+30*60000,expiry=start+86400000;
 assert.equal(meetupLifecycle(post,close-1).closed,false);assert.equal(meetupLifecycle(post,close).closed,true);
 assert.equal(meetupLifecycle(post,expiry-1).expired,false);assert.equal(meetupLifecycle(post,expiry).expired,true);
 assert.equal(meetupBannerExpiresAt(post),close);assert.equal(pinnedMeetups([post],close-1).length,1);assert.equal(pinnedMeetups([post],close).length,0);
});
test('retention never guesses dates for other categories or legacy meetups without a valid start',()=>{
 for(const p of [{...post,category:'공지사항'},{...post,category:'공동구매'},{...post,starts_at:null},{...post,starts_at:'invalid'}])assert.deepEqual(meetupLifecycle(p,start+7*86400000),{closed:false,expired:false,closesAt:null,deletesAt:null});
});
test('closed meetups reject new participation for every role without changing an active event',()=>{
 const base={author:{status:'approved',disclosure_consent:true},post,today:'2026-11-06'};
 for(const role of ['member','coach','admin']){const viewer={status:'approved',role,disclosure_consent:true};assert.equal(participationAccess({...base,viewer,now:start+29*60000}).allowed,true);assert.equal(participationAccess({...base,viewer,now:start+30*60000}).code,'meetup_closed');assert.equal(participationAccess({...base,viewer,now:start+86400000}).code,'post_expired');}
});
