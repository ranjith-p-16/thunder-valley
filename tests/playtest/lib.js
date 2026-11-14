// Shared helpers for the headless playtest bots. Run scripts with /opt/homebrew/bin/node.
import { createSim, STEP } from '../../src/sim/sim.js';
import { PEN, GATE, RIDER, HERD } from '../../src/data/content.js';
import { WEAPONS, TOWN, PLACES, FOOT, PEN_HOLDS } from '../../src/data/items.js';
import { heightAt, angleDiff, rng, WORLD } from '../../src/sim/terrain.js';
export { createSim, STEP, PEN, GATE, RIDER, HERD, WEAPONS, TOWN, PLACES, FOOT, heightAt, rng };

export const inp = (o = {}) => ({ mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [], ...o });
export const toward = (p, x, z) => ({ mx: x - p.x, mz: z - p.z });
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const aimAt = (p, t, h = 1.6) => {
  const oy = heightAt(p.x, p.z) + 4, dx = t.x - p.x, dy = heightAt(t.x, t.z) + h - oy, dz = t.z - p.z, len = Math.hypot(dx, dy, dz) || 1;
  return { ox: p.x, oy, oz: p.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: Math.atan2(dx, dz) };
};
export function run(sim, seconds, inputAt = () => ({}), each = null) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) { const ev = sim.step(inp(inputAt(i))); if (each && each(ev, i) === false) return i * STEP; }
  return seconds;
}
export const report = [];
export const note = (tag, text) => { report.push([tag, text]); console.log(`${tag.padEnd(5)} ${text}`); };

// ---- invariant checker ----
export function makeChecker(sim, label = '') {
  const s = sim.state, obs = [...s.obstacles.trees, ...s.obstacles.rocks], CELL = 12, grid = new Map();
  for (const o of obs) { const k = `${Math.floor(o.x / CELL)},${Math.floor(o.z / CELL)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o); }
  const seen = new Map(), max = { loot: 0, enemies: 0, thrown: 0, traps: 0, bullets: 0, pen: 0, treePen: 0, boxPen: 0, fencePen: 0 };
  const fail = (key, detail) => { if (!seen.has(key)) { seen.set(key, { n: 0, first: detail, at: s.clock }); } seen.get(key).n++; };
  const fin = (who, obj, keys) => { for (const k of keys) if (!Number.isFinite(obj[k])) fail(`nonfinite:${who}.${k}`, `${obj.id || who} ${k}=${obj[k]}`); };
  function solid(who, b, r) {
    if (Math.abs(b.x) > WORLD.half + 1e-6 || Math.abs(b.z) > WORLD.half + 1e-6) fail(`bounds:${who}`, `${b.x},${b.z}`);
    const cx = Math.floor(b.x / CELL), cz = Math.floor(b.z / CELL);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) for (const o of grid.get(`${i},${j}`) || []) {
      const pen = o.r + r - Math.hypot(b.x - o.x, b.z - o.z);
      if (pen > max.treePen) max.treePen = pen;
      if (pen > 0.35) fail(`inTreeOrRock:${who}`, `pen ${pen.toFixed(2)} at ${b.x.toFixed(1)},${b.z.toFixed(1)}`);
      if (Math.hypot(b.x - o.x, b.z - o.z) < o.r) fail(`centreInsideTreeOrRock:${who}`, `at ${b.x.toFixed(1)},${b.z.toFixed(1)}`);
    }
    for (const p of PLACES) {
      const px = p.w / 2 + r - Math.abs(b.x - p.x), pz = p.d / 2 + r - Math.abs(b.z - p.z), pen = Math.min(px, pz);
      if (pen > max.boxPen) max.boxPen = pen;
      if (pen > 0.35) fail(`inBuilding:${who}:${p.id}`, `pen ${pen.toFixed(2)} at ${b.x.toFixed(1)},${b.z.toFixed(1)}`);
    }
    const dx = b.x - PEN.x, dz = b.z - PEN.z, d = Math.hypot(dx, dz);
    if (Math.abs(angleDiff(Math.atan2(dz, dx), GATE.angle)) > GATE.half) {
      const pen = r - Math.abs(d - PEN.r);
      if (pen > max.fencePen) max.fencePen = pen;
      if (pen > 0.35) fail(`inFence:${who}`, `pen ${pen.toFixed(2)}`);
    }
  }
  function check(full = true) {
    const p = s.player;
    fin('player', p, ['x', 'z', 'yaw', 'hp', 'maxHp', 'stamina', 'money', 'xp', 'level', 'reloadT', 'fireCd']);
    fin('steed', p.steed, ['x', 'z', 'yaw']);
    if (p.hp < 0 || p.hp > p.maxHp + 1e-9) fail('hpRange:player', `hp ${p.hp} max ${p.maxHp}`);
    if (!p.dead && p.hp <= 0) fail('aliveWithZeroHp', `hp ${p.hp}`);
    if (p.money < 0) fail('moneyNegative', `${p.money}`);
    if (!Number.isInteger(p.money)) fail('moneyNotInteger', `${p.money}`);
    if (p.stamina < 0 || p.stamina > 100) fail('staminaRange', `${p.stamina}`);
    for (const w in p.weapons) if (!(p.ammo[w] >= 0 && p.ammo[w] <= sim.magazine(w))) fail(`ammoRange:${w}`, `${p.ammo[w]}/${sim.magazine(w)}`);
    for (const k in p.res) if (!(p.res[k] >= 0) || !Number.isInteger(p.res[k])) fail(`res:${k}`, `${p.res[k]}`);
    for (const k in p.thrown) if (!(p.thrown[k] >= 0)) fail(`thrown:${k}`, `${p.thrown[k]}`);
    for (const k in p.tonics) if (!(p.tonics[k] >= 0)) fail(`tonics:${k}`, `${p.tonics[k]}`);
    if (sim.economy.bagUsed() > Math.floor(sim.st.bag)) fail('bagOver', `${sim.economy.bagUsed()}/${sim.st.bag}`);
    if (p.skillPoints < 0) fail('skillPointsNeg', `${p.skillPoints}`);
    for (const e of s.enemies) {
      fin('enemy', e, ['x', 'z', 'yaw', 'hp']);
      if (e.hp > e.maxHp + 1e-9) fail('hpRange:enemy', `${e.hp}/${e.maxHp}`);
      if (!e.dead && e.hp <= 0) fail('enemyAliveZeroHp', e.id);
      if (!e.dead && Math.hypot(e.x - TOWN.x, e.z - TOWN.z) < TOWN.r - 0.5) fail('enemyInTown', `${e.id} ${e.state} d=${Math.hypot(e.x - TOWN.x, e.z - TOWN.z).toFixed(1)}`);
    }
    for (const a of s.animals) {
      fin('animal', a, ['x', 'z', 'yaw', 'hp', 'vx', 'vz']);
      if (a.hp > HERD.hp + 1e-9 || (!a.dead && a.hp <= 0)) fail('hpRange:animal', `${a.hp}`);
      if (a.penned && Math.hypot(a.x - PEN.x, a.z - PEN.z) > PEN.r) fail('pennedOutsidePen', a.id);
      if (a.penned && a.dead) fail('pennedDead', a.id);
    }
    const r = s.herd.roped;
    if (r && (r.dead || r.penned)) fail('ropedNotFree', r.id);
    const penned = s.animals.filter(a => a.penned).length;
    max.pen = Math.max(max.pen, penned);
    if (penned > PEN_HOLDS) fail('penOver', `${penned}`);
    for (const l of s.loot) fin('loot', l, ['x', 'z', 't', 'money']);
    for (const b of s.bullets) if (b.life > 0) fin('bullet', b, ['x', 'y', 'z']);
    for (const t of s.thrown) fin('thrown', t, ['x', 'z']);
    max.loot = Math.max(max.loot, s.loot.length); max.enemies = Math.max(max.enemies, s.enemies.length);
    max.thrown = Math.max(max.thrown, s.thrown.length); max.traps = Math.max(max.traps, s.traps.length);
    max.bullets = Math.max(max.bullets, s.bullets.filter(b => b.life > 0).length);
    if (s.bullets.length !== 64) fail('bulletPoolSize', `${s.bullets.length}`);
    if (full) {
      if (!p.dead) solid('player', p, p.onFoot ? FOOT.radius : RIDER.radius);
      for (const e of s.enemies) if (!e.dead) solid(`enemy:${e.kind}`, e, e.def.radius * 0.6);
      for (const a of s.animals) if (!a.dead) solid('animal', a, HERD.radius);
    }
  }
  function summary() {
    console.log(`--- ${label} invariants: ${seen.size ? 'VIOLATIONS' : 'clean'}; max ${JSON.stringify(Object.fromEntries(Object.entries(max).map(([k, v]) => [k, +v.toFixed(2)])))}`);
    for (const [k, v] of seen) console.log(`   ${k}  x${v.n}  first @${v.at.toFixed(1)}s: ${v.first}`);
    return seen;
  }
  return { check, summary, seen, max };
}

// Ride to a point with crude stuck handling: if the rider has not closed 0.4 units in half a second, sidestep for 0.8 s.
export function ride(sim, x, z, { max = 200, reach = 1.5, sprint = true, extra = () => ({}), until = null } = {}) {
  const p = sim.state.player; let lastD = Infinity, tick = 0, side = 0, sideT = 0, stuck = 0;
  const t = run(sim, max, () => {
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1;
    if (++tick % 30 === 0) { if (lastD - d < 0.4 && sideT <= 0) { side = side > 0 ? -1 : 1; sideT = 0.8 + 0.4 * (stuck++ % 4); } lastD = d; }
    sideT -= STEP;
    const mv = sideT > 0 ? { mx: -dz / d * side + dx / d * 0.2, mz: dx / d * side + dz / d * 0.2 } : { mx: dx, mz: dz };
    return { ...mv, sprint, ...extra() };
  }, () => Math.hypot(x - p.x, z - p.z) > reach && !(until && until()));
  return { t, stuck, arrived: Math.hypot(x - p.x, z - p.z) <= reach || !!(until && until()) };
}

// Fence-aware waypoint: returns where to head right now to reach (x,z) without jamming on the pen fence.
export function steer(p, W) {
  const inP = Math.hypot(p.x - PEN.x, p.z - PEN.z) < PEN.r, inW = Math.hypot(W.x - PEN.x, W.z - PEN.z) < PEN.r;
  const gateOut = { x: PEN.x, z: PEN.z - PEN.r - 4 }, gateIn = { x: PEN.x, z: PEN.z - PEN.r + 4 };
  if (inP && inW) return W;
  if (inP) return Math.abs(p.x - PEN.x) < 3 && p.z < PEN.z - PEN.r + 5 ? gateOut : gateIn;
  if (inW) return Math.abs(p.x - PEN.x) < 3 && p.z < PEN.z - PEN.r ? W : gateOut;
  // both outside: does the straight line pass through the fenced circle (with margin)?
  const dx = W.x - p.x, dz = W.z - p.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  const t = (PEN.x - p.x) * ux + (PEN.z - p.z) * uz;
  if (t <= 0 || t >= L) return W;
  const cx = p.x + ux * t, cz = p.z + uz * t, off = Math.hypot(cx - PEN.x, cz - PEN.z), R = PEN.r + 4;
  if (off >= R) return W;
  const side = ((cx - PEN.x) * -uz + (cz - PEN.z) * ux) >= 0 ? 1 : -1;
  return { x: PEN.x - uz * side * (R + 2), z: PEN.z + ux * side * (R + 2) };
}
