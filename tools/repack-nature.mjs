// Repacks the nature models for download: every .glb carried its own copy of the same large PNG textures.
// This writes each model without its images and each unique texture once, as a smaller WebP the models point to.
//   node tools/repack-nature.mjs <source dir of original .glb files> <output dir>      (needs `cwebp` on the PATH)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: node tools/repack-nature.mjs <source dir> <output dir>'); process.exit(1); }
const SIZE = 512, QUALITY = 82;
fs.mkdirSync(path.join(out, 'tex'), { recursive: true });
const done = new Map();   // content hash -> texture file name
let before = 0, after = 0;

for (const file of fs.readdirSync(src).filter(f => f.endsWith('.glb')).sort()) {
  const buf = fs.readFileSync(path.join(src, file));
  before += buf.length;
  const jsonLen = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
  const bin = buf.subarray(20 + jsonLen + 8);
  const imageViews = new Set();
  for (const im of json.images || []) {
    const bv = json.bufferViews[im.bufferView], data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const hash = crypto.createHash('md5').update(data).digest('hex');
    if (!done.has(hash)) {
      const name = `${path.basename(im.name || `tex_${done.size}`, '.png').replace(/\W/g, '_')}.webp`, tmp = path.join(out, 'tex', `${name}.png`);
      fs.writeFileSync(tmp, data);
      execFileSync('cwebp', ['-quiet', '-q', String(QUALITY), '-resize', String(SIZE), '0', tmp, '-o', path.join(out, 'tex', name)]);
      fs.rmSync(tmp);
      done.set(hash, name);
      after += fs.statSync(path.join(out, 'tex', name)).size;
    }
    imageViews.add(im.bufferView);
    delete im.bufferView;
    im.mimeType = 'image/webp';
    im.uri = `tex/${done.get(hash)}`;
  }
  // rebuild the binary from the views that are left, 4-byte aligned, and renumber them
  const remap = new Map(), views = [], chunks = [];
  let offset = 0;
  json.bufferViews.forEach((bv, i) => {
    if (imageViews.has(i)) return;
    const data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength), pad = (4 - (data.length % 4)) % 4;
    remap.set(i, views.length);
    views.push({ ...bv, byteOffset: offset });
    chunks.push(data, Buffer.alloc(pad));
    offset += data.length + pad;
  });
  for (const a of json.accessors || []) if (a.bufferView !== undefined) a.bufferView = remap.get(a.bufferView);
  json.bufferViews = views;
  json.buffers = [{ byteLength: offset }];
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const body = Buffer.concat(chunks), head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + text.length + 8 + body.length, 8);
  jh.writeUInt32LE(text.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(body.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  const glb = Buffer.concat([head, jh, text, bh, body]);
  fs.writeFileSync(path.join(out, file), glb);
  after += glb.length;
}
console.log(`${done.size} textures, ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
