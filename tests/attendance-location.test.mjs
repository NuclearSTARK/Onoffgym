import {test} from 'node:test';
import assert from 'node:assert/strict';
import {distanceMetres,validateAttendanceLocation} from '../web/attendance-location.js';
const pos={latitude:35.3,longitude:129.2,accuracy:20,timestamp:1000000},config={enabled:true,latitude:35.3,longitude:129.2,radius:200};
test('GPS attendance requires a fresh precise fix and rejects outside, missing and malformed coordinates',()=>{
 assert.doesNotThrow(()=>validateAttendanceLocation(config,pos,1000000));
 assert(distanceMetres(pos,{...pos,latitude:35.301})>110);
 for(const p of [null,{...pos,latitude:36},{...pos,accuracy:101},{...pos,timestamp:0},{...pos,latitude:'35.3'},{...pos,latitude:Infinity},{...pos,longitude:181}])assert.throws(()=>validateAttendanceLocation(config,p,1000000));
 assert.doesNotThrow(()=>validateAttendanceLocation({enabled:false},null));
});
