import {writeFile} from 'node:fs/promises';

// Reuse the static Supabase build; never publish the legacy Worker/D1 build.
await import('./build-pages.mjs');

await writeFile('pages-dist/_headers', `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'
  Cache-Control: no-cache
`);

// Existing push payloads use the GitHub project path. Keep those links working
// on the new origin while existing GitHub installations remain supported.
await writeFile('pages-dist/_redirects', `/Onoffgym / 302
/Onoffgym/ / 302
/Onoffgym/* /:splat 302
`);

console.log('Cloudflare Pages metadata ready in pages-dist; backend origin and Auth redirects must be configured before member use.');
