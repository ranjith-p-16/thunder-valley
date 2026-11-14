// Shrinks a rigged .glb by keeping only the animations whose names match, then dropping the data nothing uses any more.
//   node tools/trim-glb.mjs <in.glb> <out.glb> '<regex of animation names to keep>'
import fs from 'node:fs';

const [src, out, keep] = process.argv.slice(2);
if (!src || !out) { console.error("usage: node tools/trim-glb.mjs <in.glb> <out.glb> '<keep regex>'"); process.exit(1); }
const re = new RegExp(keep || '.');
const buf = fs.readFileSync(src);
const jsonLen = buf.readUInt32LE(12), j = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
const bin = buf.subarray(20 + jsonLen + 8);

j.animations = (j.animations || []).filter(a => re.test(a.name));
if (!j.animations.length) delete j.animations;

// which accessors are still referenced
const used = new Set();
for (const m of j.meshes || []) for (const p of m.primitives) {
  for (const k in p.attributes) used.add(p.attributes[k]);
  if (p.indices !== undefined) used.add(p.indices);
  for (const t of p.targets || []) for (const k in t) used.add(t[k]);
}
for (const s of j.skins || []) if (s.inverseBindMatrices !== undefined) used.add(s.inverseBindMatrices);
for (const a of j.animations || []) for (const s of a.samplers) { used.add(s.input); used.add(s.output); }

const accMap = new Map(), accessors = [];
(j.accessors || []).forEach((a, i) => { if (used.has(i)) { accMap.set(i, accessors.length); accessors.push(a); } });
const fix = (i) => accMap.get(i);
for (const m of j.meshes || []) for (const p of m.primitives) {
  for (const k in p.attributes) p.attributes[k] = fix(p.attributes[k]);
  if (p.indices !== undefined) p.indices = fix(p.indices);
  for (const t of p.targets || []) for (const k in t) t[k] = fix(t[k]);
}
for (const s of j.skins || []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = fix(s.inverseBindMatrices);
for (const a of j.animations || []) for (const s of a.samplers) { s.input = fix(s.input); s.output = fix(s.output); }
j.accessors = accessors;

// which buffer views are still referenced; rebuild the binary from those
const viewUsed = new Set();
for (const a of accessors) if (a.bufferView !== undefined) viewUsed.add(a.bufferView);
for (const im of j.images || []) if (im.bufferView !== undefined) viewUsed.add(im.bufferView);
const viewMap = new Map(), views = [], chunks = [];
let offset = 0;
(j.bufferViews || []).forEach((bv, i) => {
  if (!viewUsed.has(i)) return;
  const data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength), pad = (4 - (data.length % 4)) % 4;
  viewMap.set(i, views.length);
  views.push({ ...bv, byteOffset: offset });
  chunks.push(data, Buffer.alloc(pad));
  offset += data.length + pad;
});
for (const a of accessors) if (a.bufferView !== undefined) a.bufferView = viewMap.get(a.bufferView);
for (const im of j.images || []) if (im.bufferView !== undefined) im.bufferView = viewMap.get(im.bufferView);
j.bufferViews = views;
j.buffers = [{ byteLength: offset }];

let text = Buffer.from(JSON.stringify(j));
text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
const body = Buffer.concat(chunks), head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + text.length + 8 + body.length, 8);
jh.writeUInt32LE(text.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
bh.writeUInt32LE(body.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(out, Buffer.concat([head, jh, text, bh, body]));
console.log(`${out}: ${(buf.length / 1024).toFixed(0)}k -> ${((28 + text.length + body.length) / 1024).toFixed(0)}k, animations: ${(j.animations || []).map(a => a.name.split('|').pop()).join(', ') || 'none'}`);
