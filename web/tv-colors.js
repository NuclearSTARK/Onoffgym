export const TV_COLORS=[
  {id:'blue',name:'블루',color:'#7bb3ff'},
  {id:'sky',name:'하늘',color:'#79d5f5'},
  {id:'mint',name:'민트',color:'#83e4c7'},
  {id:'orange',name:'오렌지',color:'#ffad6c'},
  {id:'purple',name:'퍼플',color:'#c2a5ff'},
  {id:'pink',name:'핑크',color:'#f4afd2'},
  {id:'yellow',name:'옐로',color:'#efd785'},
  {id:'red',name:'레드',color:'#f2a6a6'}
];
export function normalizeTvPreferences(value={}){
  const b={btColor:value.btColor??'blue',wodColor:value.wodColor??'orange',unit:value.unit??'lbs',pageSeconds:Number(value.pageSeconds??20)};
  if(!TV_COLORS.some(c=>c.id===b.btColor)||!TV_COLORS.some(c=>c.id===b.wodColor)||!['lbs','kg'].includes(b.unit)||![15,20,30,45].includes(b.pageSeconds))throw Error('수업 색상·중량 단위·페이지 전환 시간을 확인해주세요.');
  return b;
}
