export const THEMES=[{id:'navy',name:'네이비 블루',accent:'#7ba6ff',background:'#0c1422'},{id:'mint',name:'블랙 민트',accent:'#8ee6ca',background:'#0b1110'},{id:'orange',name:'차콜 오렌지',accent:'#ffb477',background:'#17191d'}];
export function applyTheme(id,key='onoff-theme'){
  const theme=THEMES.find(t=>t.id===id)||THEMES[0];document.documentElement.dataset.theme=theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.background);
  try{localStorage.setItem(key,theme.id)}catch{}return theme.id;
}
export function savedTheme(key='onoff-theme'){try{return THEMES.some(t=>t.id===localStorage.getItem(key))?localStorage.getItem(key):'navy'}catch{return'navy'}}
