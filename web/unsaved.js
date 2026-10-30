// Compare form values instead of treating every click as an edit. Filters are opt-out.
export function createUnsavedGuard({root,extraDirty=()=>false,onDiscard=()=>{},confirmDiscard=()=>window.confirm('작성 중인 내용이 있어요. 저장하지 않고 나갈까요?')}){
  const baselines=new WeakMap();
  function forms(container){return [...(container||root).querySelectorAll('form')].filter(f=>!f.closest('dialog')||f.closest('dialog').open);}
  function snapshot(form){
    return JSON.stringify([...form.querySelectorAll('input,select,textarea')].filter(el=>!el.matches('[data-unsaved-ignore], [type="search"]')).map(el=>[
      el.name||el.id||el.dataset.batchValue!==undefined&&'result'||el.dataset.batchNote!==undefined&&'note'||'',
      el.type==='checkbox'||el.type==='radio'?el.checked:el.value
    ]));
  }
  function track(container){for(const form of forms(container))baselines.set(form,snapshot(form));}
  function dirty(container){return forms(container).some(form=>baselines.has(form)&&baselines.get(form)!==snapshot(form));}
  function allow(container=root,includeExtra=true){
    if(!dirty(container)&&!(includeExtra&&extraDirty()))return true;
    if(!confirmDiscard())return false;
    track(container);if(includeExtra)onDiscard();return true;
  }
  return{track,dirty,allow,hasChanges:()=>dirty(root)||extraDirty()};
}
