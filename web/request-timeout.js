// Race as well as abort: mocks, platform APIs and a stalled decoder may ignore signals.
export async function withTimeout(task,{timeoutMs=10000,signal,message='연결이 지연되고 있어요. 다시 시도해주세요.'}={}){
 const controller=new AbortController();let timer,abort;
 const stopped=new Promise((_,reject)=>{abort=()=>{controller.abort();reject(signal?.reason instanceof Error?signal.reason:Error(message));};if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{controller.abort();reject(Error(message));},timeoutMs);});
 try{return await Promise.race([Promise.resolve().then(()=>{if(controller.signal.aborted)throw Error(message);return task(controller.signal);}),stopped]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
