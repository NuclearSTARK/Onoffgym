import {fromLbs,toLbs} from './record-tools.js';
const weights=new WeakMap();
export function rmWeightLbs(form){const weight=Number(form.elements.weight.value),unit=form.elements.unit.value,c=weights.get(form);return c&&c.weight===weight&&c.unit===unit?c.lbs:toLbs(weight,unit);}
export function mountRmWeight(form,originalLbs){
 if(!form)return;let unit=form.elements.unit.value;
 if(Number.isFinite(originalLbs))weights.set(form,{lbs:originalLbs,weight:Number(form.elements.weight.value),unit});
 form.elements.weight.addEventListener('input',()=>weights.delete(form));
 form.elements.unit.addEventListener('change',()=>{const next=form.elements.unit.value,value=form.elements.weight.value,old=weights.get(form),weight=Number(value);const lbs=old&&old.weight===weight&&old.unit===unit?old.lbs:toLbs(weight,unit);if(value&&Number.isFinite(lbs)){const display=Number(fromLbs(lbs,next).toFixed(1));form.elements.weight.value=display;weights.set(form,{lbs,weight:display,unit:next});}unit=next;});
}
