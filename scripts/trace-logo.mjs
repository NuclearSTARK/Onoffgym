// Follow the supplied artwork's existing contours. No font substitution, layout
// reconstruction or generated logo is used. The original JPEG stays unchanged.
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const {trace}=createRequire(import.meta.url)('potrace');
const svg=await new Promise((resolve,reject)=>trace('web/assets/onoff-logo-original-v3.jpg',{threshold:118,blackOnWhite:false,color:'#ffffff',background:'transparent',alphaMax:1,optTolerance:0.15,turdSize:2},(error,svg)=>error?reject(error):resolve(svg)));
const output=svg.replace(/<svg[^>]*>/,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="50 59 620 236" width="620" height="236"><title>ONOFF · Challenge starts today</title>');
if(/<image|<filter|<text/.test(output))throw Error('Logo must use original contour paths only.');
await writeFile('web/assets/onoff-logo-v4.svg',output);
console.log('Converted supplied logo contours into resolution-independent SVG paths.');
