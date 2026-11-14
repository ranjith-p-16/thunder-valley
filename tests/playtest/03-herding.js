// Herding: drive a LOOSE herd (no rope) through the gate with movement only, + holler, + each mount ability.
// Also pen recycling, limbo at the fence, predators vs penned / in-town animals.
import { createSim, STEP, inp, toward, dist, run, note, makeChecker, steer, PEN, TOWN, HERD } from './lib.js';
import { HERD_SPOTS } from '../../src/data/content.js';
import { angleDiff } from '../../src/sim/terrain.js';

const APPROACH = { x: PEN.x, z: PEN.z - PEN.r - 12 }, INSIDE = { x: PEN.x, z: PEN.z + 2 };

// Shepherding bot (collect strays / drive from behind), circling round the herd instead of riding through it.
function drive(seed, herd, { holler = false, ability = null, mount = 0, limit = 600, quiet = false } = {}) {
  const sim = createSim(seed), s = sim.state, p = s.player, chk = makeChecker(sim, `drive herd ${herd}`);
  p.mount = mount; p.mounts[mount] = true;
  // remove predators' influence so this measures the herding rules alone
  const mine = () => s.animals.filter(a => a.herd === herd && !a.dead && !a.penned);
  let first = null, pennedAt = [], hollers = 0, abilities = 0;
  const t = run(sim, limit, () => {
    const free = mine(); if (!free.length) return {};
    const C = { x: free.reduce((t, a) => t + a.x, 0) / free.length, z: free.reduce((t, a) => t + a.z, 0) / free.length };
    const lined = (b) => Math.abs(b.x - PEN.x) < 6 && b.z > APPROACH.z - 4;
    const far = free.reduce((m, a) => (dist(a, C) > dist(m, C) ? a : m));
    const stray = dist(far, C) > 10, focus = stray ? far : C;
    const T = lined(focus) ? INSIDE : APPROACH;
    const fd = dist(focus, T) || 1, off = stray ? 7 : 9;
    const P = { x: focus.x + (focus.x - T.x) / fd * off, z: focus.z + (focus.z - T.z) / fd * off };
    const ab = Math.atan2(p.z - C.z, p.x - C.x), ap = Math.atan2(P.z - C.z, P.x - C.x), diff = angleDiff(ab, ap), R = Math.max(18, dist(P, C));
    const W = Math.abs(diff) > 0.4 && dist(p, C) < 40 ? { x: C.x + Math.cos(ab + Math.sign(diff) * 0.5) * R, z: C.z + Math.sin(ab + Math.sign(diff) * 0.5) * R } : P;
    const S = steer(p, W), o = { ...toward(p, S.x, S.z), sprint: dist(p, W) > 12, actions: [] };
    if (dist(p, W) < 0.5) { o.mx = 0; o.mz = 0; }
    const behind = dist(p, P) < 5;
    if (holler && behind && !stray && fd > 30 && s.herd.hollerCd <= 0) { o.actions.push('holler'); hollers++; }
    if (ability === 'Dash' && dist(p, W) > 25 && p.abilityCd <= 0) { o.actions.push('ability'); abilities++; }
    if (ability === 'Roar' && behind && p.abilityCd <= 0) { o.actions.push('ability'); abilities++; }
    return o;
  }, (ev) => { for (const e of ev) if (e.type === 'penned') { pennedAt.push(+s.clock.toFixed(0)); } chk.check(true); return mine().length > 0; });
  const left = mine();
  if (!quiet) note(left.length ? 'FAIL' : 'PASS', `seed ${seed} herd ${herd} (${dist(HERD_SPOTS[herd], PEN).toFixed(0)} from pen) mount ${mount}${holler ? ' +holler' : ''}${ability ? ' +' + ability : ''}: penned ${pennedAt.length}/6 at [${pennedAt.join(',')}]s, total ${t.toFixed(0)}s, hollers ${hollers}, abilities ${abilities}${left.length ? '; left at ' + left.map(a => `(${a.x.toFixed(0)},${a.z.toFixed(0)})`).join(' ') : ''}`);
  if (chk.seen.size) chk.summary();
  return { t, penned: pennedAt.length, sim };
}

// Rally (Bulwark): call the herd and lead it in.
function rallyDrive(seed, herd, limit = 600) {
  const sim = createSim(seed), s = sim.state, p = s.player; p.mount = 1; p.mounts[1] = true;
  const mine = () => s.animals.filter(a => a.herd === herd && !a.dead && !a.penned);
  let pennedAt = [], rallies = 0;
  const t = run(sim, limit, () => {
    const free = mine(); if (!free.length) return {};
    const following = free.filter(a => a.followT > 0.5).length;
    const C = { x: free.reduce((t, a) => t + a.x, 0) / free.length, z: free.reduce((t, a) => t + a.z, 0) / free.length };
    const o = { actions: [], sprint: false };
    const inPen = dist(p, PEN) < PEN.r;
    if (following) {
      const S = steer(p, { x: PEN.x, z: PEN.z + 8 });
      Object.assign(o, toward(p, S.x, S.z));
      if (dist(p, S) < 1) { o.mx = 0; o.mz = 0; }
    } else {
      // wait near the herd (outside its flight distance, outside the pen) on the gate side, then rally when ready
      const cd = dist(C, APPROACH) || 1, Wt = cd < 22 ? { x: APPROACH.x, z: APPROACH.z - 8 } : { x: C.x + (APPROACH.x - C.x) / cd * 22, z: C.z + (APPROACH.z - C.z) / cd * 22 };
      if (dist(Wt, PEN) < PEN.r + 5) { const k = dist(C, PEN) || 1; Wt.x = C.x - (C.z - PEN.z) / k * 20; Wt.z = C.z + (C.x - PEN.x) / k * 20; }
      if (p.abilityCd <= 0 && dist(p, C) < 32 && !inPen) { o.actions.push('ability'); rallies++; }
      else if (dist(p, Wt) > 2) { const S = steer(p, Wt); Object.assign(o, toward(p, S.x, S.z), { sprint: dist(p, C) > 40 }); }
    }
    return o;
  }, (ev) => { for (const e of ev) if (e.type === 'penned') pennedAt.push(+s.clock.toFixed(0)); return mine().length > 0; });
  const left = mine();
  note(left.length ? 'FAIL' : 'PASS', `seed ${seed} herd ${herd} Bulwark Rally lead: penned ${pennedAt.length}/6 at [${pennedAt.join(',')}]s, total ${t.toFixed(0)}s, rallies ${rallies}${left.length ? '; left at ' + left.map(a => `(${a.x.toFixed(0)},${a.z.toFixed(0)})`).join(' ') : ''}`);
}

const which = process.argv[2] || 'all';
if (which === 'all' || which === 'drive') {
  for (const herd of [0, 1, 2]) {
    drive(1, herd);
    drive(1, herd, { holler: true });
    drive(1, herd, { ability: 'Dash' });
    drive(1, herd, { ability: 'Roar', mount: 2 });
    rallyDrive(1, herd);
  }
  for (const seed of [2, 3, 4]) drive(seed, 0);
}

if (which === 'all' || which === 'rules') {
  { // limbo: a longhorn pushed in through the gate slides along the inside of the fence and does not count as penned
    for (const after of ['rider stays in the pen', 'rider leaves']) {
      const sim = createSim(), s = sim.state, p = s.player, a = s.animals[0];
      a.x = PEN.x; a.z = PEN.z - PEN.r - 3; p.x = PEN.x; p.z = PEN.z - PEN.r - 16;
      run(sim, 4, () => ({ mx: 0, mz: 1 }));
      if (after === 'rider leaves') { p.x = -200; p.z = -200; }
      let limbo = 0;
      run(sim, 600, () => ({}), () => { if (!a.penned && dist(a, PEN) < PEN.r) limbo += STEP; });
      note(limbo > 10 ? 'BUG' : 'PASS', `lone longhorn pushed through the gate (${after}): stood INSIDE the fence but unpenned/unpaid for ${limbo.toFixed(0)} s (pen test is d < ${(PEN.r - 1.6).toFixed(1)}, fence lets it rest at d = ${(PEN.r - HERD.radius - 0.3).toFixed(1)})`);
    }
  }
  { // recycling: 10 pens -> pen holds 8, oldest two are back on the range, nothing roped teleports
    const sim = createSim(), s = sim.state, p = s.player, chk = makeChecker(sim, 'recycle');
    const order = [];
    p.x = 0; p.z = 8;
    for (let k = 0; k < 12; k++) {
      const a = s.animals.find(a => !a.penned && !order.includes(a)); order.push(a);
      a.x = PEN.x; a.z = PEN.z - 4; run(sim, 0.05, () => ({}), () => chk.check(false));
    }
    const c = sim.herding.counts(), back = order.slice(0, 4).every(a => !a.penned && dist(a, HERD_SPOTS[a.herd]) < 10);
    note(c.penned === 8 && c.total === 12 && back && p.money === 50 + 12 * 30 ? 'PASS' : 'FAIL', `12 pens: in pen ${c.penned}, total ${c.total}, oldest four back at their herd spot ${back}, money $${p.money}`);
    chk.summary();
  }
  { // a longhorn penned while it is following (Rally) keeps its follow timer and runs to the rider when sold back
    const sim = createSim(), s = sim.state, p = s.player; p.mount = 1; p.mounts[1] = true;
    const a = s.animals[0]; p.x = 0; p.z = 12; a.x = 0; a.z = 20;
    sim.step(inp({ actions: ['ability'] }));
    a.x = PEN.x; a.z = PEN.z; run(sim, 0.05);
    const ft = a.followT;
    for (let k = 1; k <= 8; k++) { const b = s.animals[k]; b.x = PEN.x; b.z = PEN.z - 3; run(sim, 0.05); }
    const sold = !a.penned, x0 = a.x, z0 = a.z, d0 = dist(a, p);
    run(sim, 3);
    note(sold && ft > 0 && dist(a, p) < d0 - 10 ? 'BUG' : 'PASS', `rallied longhorn penned with followT=${ft.toFixed(1)}s left; after being sold back to the range (${x0.toFixed(0)},${z0.toFixed(0)}) it ran ${(d0 - dist(a, p)).toFixed(0)} units toward the rider in 3 s (stale followT; hint says "${s.hint}")`);
  }
  { // stale panic survives the pen as well
    const sim = createSim(), s = sim.state, p = s.player, a = s.animals[0];
    p.x = 0; p.z = 0; a.x = 0; a.z = 16; sim.step(inp({ actions: ['holler'] }));
    a.x = PEN.x; a.z = PEN.z; run(sim, 0.05); const pt = a.panicT;
    note(a.penned && pt > 0 ? 'INFO' : 'PASS', `panicT ${pt.toFixed(2)} is frozen while penned (released animal bolts from an old holler spot)`);
  }
  { // predators vs penned animals and animals standing in town
    const sim = createSim(), s = sim.state, p = s.player; p.x = -250; p.z = -250;
    for (let k = 0; k < 6; k++) { s.animals[k].x = PEN.x + k - 3; s.animals[k].z = PEN.z; }
    run(sim, 0.1);
    for (let k = 6; k < 12; k++) { s.animals[k].x = 4 * (k - 9); s.animals[k].z = -10; }   // the whole of herd 1 in the town centre
    const packs = s.enemies.filter(e => !e.outpost && e !== s.rex).slice(0, 6);
    packs.forEach((e, i) => { e.x = PEN.x + 20 + i * 2; e.z = PEN.z + 18; e.home = { x: e.x, z: e.z }; });
    s.rex.x = PEN.x - 22; s.rex.z = PEN.z + 18; s.rex.home = { x: s.rex.x, z: s.rex.z };
    run(sim, 180);
    const pen = s.animals.slice(0, 6), town = s.animals.slice(6, 12);
    note(pen.every(a => a.penned && !a.dead && a.hp === HERD.hp) ? 'PASS' : 'FAIL', `6 raptors + the Rex living 25 from the pen for 3 min: penned animals unharmed`);
    note(town.every(a => !a.dead) ? 'PASS' : 'FAIL', `longhorns left in the town centre: alive ${town.filter(a => !a.dead).length}/6, at ${town.map(a => `(${a.x.toFixed(0)},${a.z.toFixed(0)})`).join(' ')}`);
  }
  { // longhorns grazing at the edge of town can still be bitten from outside
    const sim = createSim(), s = sim.state, p = s.player; p.x = -250; p.z = -250;
    const a = s.animals[0]; for (const b of s.animals) if (b.herd === 0 && b !== a) b.dead = true;
    a.x = TOWN.x + TOWN.r - 1; a.z = TOWN.z;
    const e = s.enemies.find(e => !e.outpost && e !== s.rex); e.x = TOWN.x + TOWN.r + 12; e.z = TOWN.z; e.home = { x: e.x, z: e.z };
    run(sim, 60);
    note('INFO', `longhorn 1 unit inside the town edge with a raptor living 12 outside: dead=${a.dead} hp=${a.hp.toFixed(0)} at (${a.x.toFixed(0)},${a.z.toFixed(0)}), raptor state ${e.state}`);
  }
  { // idle world: do herds survive / drift with nobody near?
    for (const seed of [1, 2, 3]) {
      const sim = createSim(seed), s = sim.state, p = s.player; p.x = 0; p.z = -10;
      run(sim, 3600);
      const c = sim.herding.counts(), drift = HERD_SPOTS.map((h, i) => { const f = s.animals.filter(a => a.herd === i && !a.dead && !a.penned); return f.length ? dist({ x: f.reduce((t, a) => t + a.x, 0) / f.length, z: f.reduce((t, a) => t + a.z, 0) / f.length }, h).toFixed(0) : 'none'; });
      note(c.lost ? 'INFO' : 'PASS', `seed ${seed}: 60 min idle in town: lost ${c.lost}, self-penned ${c.penned}, herd centroid drift from spawn ${drift.join('/')}`);
    }
  }
  { // dead longhorns never come back
    const sim = createSim(), s = sim.state, p = s.player; p.x = 0; p.z = -10;
    for (const a of s.animals) sim.herding.hurt(a, 999);
    run(sim, 1800);
    const c = sim.herding.counts(); let herdOffers = 0;
    for (let k = 0; k < 60; k++) { if (s.board[0].type === 'herd') herdOffers++; sim.command({ type: 'takeJob', i: 0 }); sim.command({ type: 'dropJob' }); }
    note(c.lost === 18 ? 'BUG' : 'PASS', `all 18 longhorns killed, 30 min later lost=${c.lost} (no respawn); the board still offered ${herdOffers}/60 herd orders that can never be done`);
  }
}
