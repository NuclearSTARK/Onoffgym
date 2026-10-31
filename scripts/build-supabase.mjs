import {build} from 'esbuild';
await build({entryPoints:['supabase/functions/onoff-api/entry.js'],bundle:true,format:'esm',platform:'neutral',external:['npm:*'],outfile:'supabase/functions/onoff-api/index.ts'});
console.log('Bundled Supabase Edge API and shared gym validation.');
