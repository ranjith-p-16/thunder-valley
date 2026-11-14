// Makes the folder to upload: only what the browser needs, nothing else.
//   node tools/build.mjs            -> dist/
// The game has no compile step; this copies index.html, src, vendor and assets, and reports the size.
// Any static host works (GitHub Pages, Netlify, itch.io as an HTML game, a plain web server).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const SHIP = ['index.html', 'src', 'vendor', 'assets', 'CREDITS.md'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
let bytes = 0, files = 0;
function copy(from, to) {
  const st = fs.statSync(from);
  if (st.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) if (!name.startsWith('.')) copy(path.join(from, name), path.join(to, name));
  } else { fs.copyFileSync(from, to); bytes += st.size; files++; }
}
for (const name of SHIP) copy(path.join(root, name), path.join(out, name));
console.log(`dist/: ${files} files, ${(bytes / 1048576).toFixed(1)} MB`);
