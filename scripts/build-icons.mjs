// Export the approved square brand icon into standard browser/iOS app sizes.
// Run only when replacing the master icon. Requires the sharp image encoder.
import {createRequire} from 'node:module';
const sharp=createRequire(import.meta.url)('sharp');
import {readFile,writeFile,copyFile} from 'node:fs/promises';
const logo=await readFile('web/assets/onoff-logo-v3.svg','utf8');
const inner=logo.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');
const master=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#11274b"/><g transform="translate(48 177) scale(0.670967742) translate(-50 -59)">${inner}</g></svg>`;
const source='web/assets/onoff-app-icon-source-v3.png';
await sharp(Buffer.from(master)).png().toFile(source);
for(const size of [32,48,180,192,512])await sharp(source).resize(size,size).png().toFile(`web/assets/onoff-app-icon-v3-${size}.png`);
await copyFile('web/assets/onoff-app-icon-v3-180.png','web/apple-touch-icon.png');
const png=await readFile('web/assets/onoff-app-icon-v3-48.png');const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=48;header[7]=48;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);await writeFile('web/favicon.ico',Buffer.concat([header,png]));
const icon=await readFile('web/assets/onoff-app-icon-v3-192.png');await writeFile('web/assets/favicon.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><image width="192" height="192" href="data:image/png;base64,${icon.toString('base64')}"/></svg>`);
console.log('Exported ONOFF browser and Apple home-screen icons.');
