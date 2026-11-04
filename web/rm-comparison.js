export function rmStanding({total,lower,equal}){
 if(!Number.isInteger(total)||total<2||!Number.isInteger(lower)||!Number.isInteger(equal)||lower<0||equal<1||lower+equal>total)return null;
 const position=100*(lower+equal/2)/total,top=Math.max(1,Math.round(100-position)),bottom=Math.max(1,Math.round(position));
 return {position,top,bottom,group:position>=100*2/3?'상위권':position<=100/3?'하위권':'중위권',label:position>=100*2/3?'상위 '+top+'%':position<=100/3?'하위 '+bottom+'%':'중위권 · 상위 '+top+'%'};
}
