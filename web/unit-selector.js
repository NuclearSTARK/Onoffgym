const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function unitSelector(value='lbs',{name='',id='',attributes='',global=false,disabled=false}={}){
 const unit=value==='kg'?'kg':'lbs';
 return `<div class="unit-toggle unit-segmented ${global?'':'unit-field-toggle'}" role="group" aria-label="중량 단위">${global?'':`<select hidden data-unit-value ${name?`name="${escape(name)}"`:''} ${id?`id="${escape(id)}"`:''} ${attributes} ${disabled?'disabled':''}><option value="lbs" ${unit==='lbs'?'selected':''}>lbs</option><option value="kg" ${unit==='kg'?'selected':''}>kg</option></select>`}${['lbs','kg'].map(v=>`<button type="button" class="${v===unit?'active':''}" ${global?'data-unit':'data-unit-choice'}="${v}" aria-pressed="${v===unit}" ${disabled?'disabled':''}>${v}</button>`).join('')}</div>`;
}
function sync(root){const value=root.querySelector('[data-unit-value]')?.value;for(const button of root.querySelectorAll('[data-unit-choice]')){const selected=button.dataset.unitChoice===value;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));}}
if(typeof document!=='undefined'){
 document.addEventListener('click',e=>{const button=e.target.closest('[data-unit-choice]');if(!button)return;const root=button.closest('.unit-segmented'),select=root.querySelector('[data-unit-value]');if(!select||select.disabled||select.value===button.dataset.unitChoice)return;select.value=button.dataset.unitChoice;sync(root);select.dispatchEvent(new Event('change',{bubbles:true}));});
 document.addEventListener('change',e=>{if(e.target.matches('[data-unit-value]'))sync(e.target.closest('.unit-segmented'));});
}
