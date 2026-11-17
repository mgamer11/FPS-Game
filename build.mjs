// Bundles the whole game into ONE html file (dist/index.html, also copied to BlockBlitz.html)
// that runs straight from a website or by double-clicking it. Run with: npm run build
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Fingerprint of every source file, so two copies of the game can tell if they match.
function sourceHash(dir) {
  const hash = crypto.createHash('sha256');
  const walk = (d) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) hash.update(path.relative(dir, p).replace(/\\/g, '/')).update(fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'));
    }
  };
  walk(dir);
  return hash.digest('hex').slice(0, 10);
}
const buildId = sourceHash('public/js');

const result = await build({
  entryPoints: ['public/js/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  write: false,
  legalComments: 'none',
  define: { __BUILD__: JSON.stringify(buildId) },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('public/css/style.css', 'utf8');
let html = fs.readFileSync('public/index.html', 'utf8');
html = html.replace('<link rel="stylesheet" href="css/style.css" />', () => `<style>\n${css}</style>`);
html = html.replace('<script type="module" src="js/main.js"></script>', () => `<script>\n${js}</script>`);
if (html.includes('js/main.js') || html.includes('css/style.css')) throw new Error('build: template placeholders not found');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
fs.writeFileSync('BlockBlitz.html', html);
console.log(`Built dist/index.html and BlockBlitz.html (${(html.length / 1024).toFixed(0)} KB, version ${buildId})`);
