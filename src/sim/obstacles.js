// Solid scenery: trees, rocks and the ranch fence. Positions are generated once from a seed,
// so the rules and the renderer agree on where everything stands.
import { WORLD, heightAt, rng, angleDiff } from './terrain.js';
import { CLEARINGS, SCENERY, PEN, GATE, WATER_Y } from '../data/content.js';
import { PLACES } from '../data/items.js';

const CELL = 12;

export function createObstacles() {
  const rand = rng(1337);
  const isClear = (x, z) => CLEARINGS.some(k => Math.hypot(x - k.x, z - k.z) < k.r) || heightAt(x, z) < WATER_Y + 0.6;
  const place = (n) => {
    const out = [];
    while (out.length < n) {
      const x = (rand() - 0.5) * WORLD.size * 0.95, z = (rand() - 0.5) * WORLD.size * 0.95;
      if (!isClear(x, z)) out.push({ x, z });
    }
    return out;
  };

  // r is the solid radius, top the height a bullet must clear
  const trees = place(SCENERY.trees).map(t => {
    const k = 0.8 + rand() * 0.9;
    return { ...t, k, spin: rand() * 6.28, r: 0.6 * k, top: heightAt(t.x, t.z) + 8 * k };
  });
  const rocks = place(SCENERY.rocks).map(t => {
    const sx = 0.6 + rand() * 2, sy = 0.5 + rand() * 1.4, sz = 0.6 + rand() * 2;
    return { ...t, sx, sy, sz, rx: rand() * 3, ry: rand() * 3, rz: rand() * 3, r: 0.8 * Math.max(sx, sz), top: heightAt(t.x, t.z) + sy * 1.2 };
  });

  const posts = [];
  const N = 34;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    if (Math.abs(angleDiff(a, GATE.angle)) < GATE.half) continue;
    posts.push({ x: PEN.x + Math.cos(a) * PEN.r, z: PEN.z + Math.sin(a) * PEN.r, a });
  }

  const grid = new Map();
  for (const o of [...trees, ...rocks]) {
    const key = `${Math.floor(o.x / CELL)},${Math.floor(o.z / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(o);
  }
  const near = (x, z, fn) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) {
      const list = grid.get(`${i},${j}`);
      if (list) for (const o of list) if (fn(o)) return true;
    }
    return false;
  };

  // Pushes a body (anything with x, z) out of solid scenery and keeps it inside the valley.
  function resolve(body, radius) {
    // a body pushed out of one trunk can land in its neighbour, so a push is followed by a second look
    let pushed = false;
    const push = (o) => {
      const dx = body.x - o.x, dz = body.z - o.z, d = Math.hypot(dx, dz), min = o.r + radius;
      if (d < min && d > 1e-4) { body.x = o.x + (dx / d) * min; body.z = o.z + (dz / d) * min; pushed = true; }
    };
    near(body.x, body.z, push);
    if (pushed) near(body.x, body.z, push);
    const dx = body.x - PEN.x, dz = body.z - PEN.z, d = Math.hypot(dx, dz), gap = radius + 0.3;
    if (Math.abs(d - PEN.r) < gap && d > 1e-4 && Math.abs(angleDiff(Math.atan2(dz, dx), GATE.angle)) > GATE.half) {
      const to = d >= PEN.r ? PEN.r + gap : PEN.r - gap;
      body.x = PEN.x + (dx / d) * to;
      body.z = PEN.z + (dz / d) * to;
    }
    // buildings are boxes: push out through the nearest wall
    for (const b of PLACES) {
      const ox = body.x - b.x, oz = body.z - b.z, hx = b.w / 2 + radius, hz = b.d / 2 + radius;
      if (Math.abs(ox) >= hx || Math.abs(oz) >= hz) continue;
      if (hx - Math.abs(ox) < hz - Math.abs(oz)) body.x = b.x + Math.sign(ox || 1) * hx;
      else body.z = b.z + Math.sign(oz || 1) * hz;
    }
    body.x = Math.max(-WORLD.half, Math.min(WORLD.half, body.x));
    body.z = Math.max(-WORLD.half, Math.min(WORLD.half, body.z));
  }

  // True when a point in the air is inside a trunk or a rock.
  const blocksShot = (x, y, z) => near(x, z, (o) => y < o.top && Math.hypot(x - o.x, z - o.z) < o.r)
    || PLACES.some(b => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2 && y < heightAt(b.x, b.z) + b.h);

  return { trees, rocks, posts, resolve, blocksShot };
}
