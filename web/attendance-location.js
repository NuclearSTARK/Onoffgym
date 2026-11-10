// Coordinates are used for the current attendance request only, never persisted.
export function distanceMetres(a,b){const rad=n=>n*Math.PI/180,lat=rad(b.latitude-a.latitude),lon=rad(b.longitude-a.longitude),h=Math.sin(lat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(lon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
export function validateAttendanceLocation(config,position,now=Date.now()){
 if(!config?.enabled)return;
 const p=position,c=config;
 if(!p||![p.latitude,p.longitude,p.accuracy,p.timestamp,c.latitude,c.longitude,c.radius].every(v=>typeof v==='number'&&Number.isFinite(v))||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180||p.accuracy<0||p.accuracy>100||Math.abs(now-p.timestamp)>120000)throw Error('정확한 현재 위치가 필요해요. 위치 권한을 허용하고 창가에서 다시 시도해주세요.');
 if(distanceMetres(c,p)>c.radius)throw Error('체육관 근처에서만 출석할 수 있어요. 체육관에 계시면 위치를 다시 확인하거나 운영자에게 문의해주세요.');
}
export function currentPosition(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(Error('이 기기에서 위치 확인을 지원하지 않아요. 운영자에게 문의해주세요.'));navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp}),e=>reject(Error(e.code===1?'위치 권한을 허용한 뒤 다시 출석해주세요.':'위치를 확인하지 못했어요. 창가에서 다시 시도하거나 운영자에게 문의해주세요.')),{enableHighAccuracy:true,maximumAge:0,timeout:15000});});}
