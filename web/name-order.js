const english=new Intl.Collator('en',{sensitivity:'base',numeric:true}),korean=new Intl.Collator('ko',{sensitivity:'base',numeric:true});
export const movementOrder=(a,b)=>english.compare(a.name||'',b.name||'')||String(a.id||a.name).localeCompare(String(b.id||b.name));
export const memberOrder=(a,b)=>korean.compare(a.name||'',b.name||'')||String(a.id).localeCompare(String(b.id));
