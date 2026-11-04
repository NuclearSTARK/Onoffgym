// Fill actual display columns in reading order. A section badge is repeated only
// on a new page, never for another fragment of the same section on that page.
const graphemes=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ko',{granularity:'grapheme'}):null;
export function paginateTvSections(sections,{columns=1,fits}={}){
 const count=Math.max(1,Math.floor(columns)),pages=[];
 let page=Array.from({length:count},()=>[]),column=0,seen=new Set();
 const advance=()=>{if(++column<count)return;pages.push(page);page=Array.from({length:count},()=>[]);column=0;seen=new Set();};
 for(const [index,section] of sections.entries()){
  const text=String(section.text||'').replace(/\r\n?/g,'\n');
  let remaining=graphemes?Array.from(graphemes.segment(text),x=>x.segment):Array.from(text);
  if(!remaining.length)continue;
  const number=index+1;
  while(remaining.length){
   const fragment=text=>({...section,number,text,showNumber:!seen.has(number)});
   const accepts=n=>fits([...page[column],fragment(remaining.slice(0,n).join(''))],column);
   if(accepts(remaining.length)){page[column].push(fragment(remaining.join('')));seen.add(number);break;}
   let low=0,high=remaining.length;
   while(low<high){const middle=Math.ceil((low+high)/2);if(accepts(middle))low=middle;else high=middle-1;}
   if(!low){if(!page[column].length)throw Error('TV column cannot fit a character');advance();continue;}
   // Prefer a complete word/line near the fitted edge, including unspaced Korean.
   let cut=low;const lineEnd=remaining.slice(0,low).lastIndexOf('\n')+1;
   if(lineEnd>=low*.6)cut=lineEnd;
   else for(let n=low;n>=Math.max(1,Math.floor(low*.75));n--){if(/\s/u.test(remaining[n-1])){cut=n;break;}}
   if(!remaining.slice(0,cut).join('').trim()){remaining=remaining.slice(cut);continue;}
   page[column].push(fragment(remaining.slice(0,cut).join('')));seen.add(number);
   remaining=remaining.slice(cut);if(remaining.length)advance();
  }
 }
 if(page.some(col=>col.length))pages.push(page);
 return pages;
}
