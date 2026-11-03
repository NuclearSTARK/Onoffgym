// Lock the form itself as well as its submit controls: Enter/requestSubmit can
// dispatch another submit even while the visible save button is disabled.
const pending=new WeakSet();
export function beginFormSubmit(form){
 if(pending.has(form))return null;
 pending.add(form);
 const buttons=[...form.elements].filter(el=>el.type==='submit'),disabled=buttons.map(el=>el.disabled),busy=form.getAttribute('aria-busy');
 buttons.forEach(el=>el.disabled=true);form.setAttribute('aria-busy','true');
 let finished=false;
 return ()=>{if(finished)return;finished=true;pending.delete(form);buttons.forEach((el,i)=>el.disabled=disabled[i]);if(busy===null)form.removeAttribute('aria-busy');else form.setAttribute('aria-busy',busy);};
}
