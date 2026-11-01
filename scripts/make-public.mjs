// Vercel build step: the standalone page plus the one vendored library become the static site.
import { mkdirSync, copyFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
mkdirSync(new URL('public/vendor/', root), { recursive: true });
copyFileSync(new URL('web/standalone.html', root), new URL('public/index.html', root));
copyFileSync(new URL('web/vendor/gsap.min.js', root), new URL('public/vendor/gsap.min.js', root));
console.log('public/ ready');
