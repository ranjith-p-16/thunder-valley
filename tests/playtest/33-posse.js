// Mara: following round the pen fence, "Help the herd" from many starts and herd states, AFK income, shooting rules, save/restore of orders.
import { createSim, bot, clone, STEP, PEN, idle } from './30-lib.js';
import { GATE, HERD_SPOTS } from '../../src/data/content.js';
import { TOWN, PLACES } from '../../src/data/items.js';
import { angleDiff } from '../../src/sim/terrain.js';

const log = (...a) => console.log(...a);
const inTown = (b) => Math.hypot(b.x - TOWN.x, b.z - TOWN.z) < TOWN.r;
const inPen = (b) => Math.hypot(b.x - PEN.x, b.z - PEN.z) < PEN.r;
const inBox = (b) => PLACES.find(q => Math.abs(b.x - q.x) < q.w / 2 && Math.abs(b.z - q.z) < q.d / 2);
function fresh(px, pz, order = 'follow') {
  const sim = createSim(), s = sim.state, p = s.player;
  p.x = px; p.z = pz; sim.posse.join('mara');
  if (order !== 'follow') sim.command({ type: 'order', id: order });
  return { sim, s, p, m: s.mates[0] };
}
// Watches a mate for fence crossings (side of the fence changes away from the gate without a catch-up jump) and time inside buildings.
function watch(m) {
  let was = inPen(m), crossings = 0, inBuilding = 0, jumps = 0, lx = m.x, lz = m.z;
  return { tick() {
    const jump = Math.hypot(m.x - lx, m.z - lz) > 3;
    if (jump) jumps++;
    const now = inPen(m);
    if (now !== was && !jump) { const ang = Math.atan2(m.z - PEN.z, m.x - PEN.x); if (Math.abs(angleDiff(ang, GATE.angle)) > GATE.half + 0.12) crossings++; }
    was = now; lx = m.x; lz = m.z;
    if (inBox(m)) inBuilding++;
  }, get: () => ({ crossings, inBuilding, jumps }) };
}

{ log('--- A. following round the pen fence');
  const cases = [
    ['rider north of the pen, Mara south of the gate', [0, 62], [0, 10]],
    ['rider west of the pen, Mara east', [-22, 34], [24, 34]],
    ['rider inside the pen (after penning), Mara north of it', [0, 40], [3, 62]],
    ['rider north-east of the pen, Mara inside it', [22, 52], [0, 38]],
    ['rider at the saloon door, Mara behind the saloon', [-16, -6], [-40, -6]],
  ];
  for (const [name, [px, pz], [mx, mz]] of cases) {
    const { sim, s, p, m } = fresh(px, pz);
    m.x = mx; m.z = mz; const w = watch(m);
    let t = 0, lastFar = Infinity, stuckFrom = null, firstStuck = null;
    for (; t < 120; t += STEP) {
      sim.step(idle); w.tick();
      const far = Math.hypot(m.x - p.x, m.z - p.z);
      if (Math.round(t / STEP) % 300 === 0) { if (far > 12 && Math.abs(far - lastFar) < 0.2) { firstStuck ??= t; } lastFar = far; }
    }
    const far = Math.hypot(m.x - p.x, m.z - p.z);
    log(`  ${name}: after 120 s Mara is ${far.toFixed(1)} from the rider at ${m.x.toFixed(1)},${m.z.toFixed(1)}${far > 12 ? `  STUCK since ~${firstStuck?.toFixed(0)}s (talk reach to a mate is 16)` : ''}  ${JSON.stringify(w.get())}`);
  }
}

{ log('--- B. "Help the herd" from many starts and states (600 s each, rider parked)');
  const setups = {
    'plain': () => {},
    'night': (g) => { g.s.clock = 0.55 * 24 * 60; },                 // 0.32 + 0.55 = 0.87 of the day: night
    'pen already holds 8': (g) => { let n = 0; for (const a of g.s.animals) if (n < 8 && a.herd !== 0) { a.penned = true; a.pennedAt = ++g.s.herd.total; a.x = PEN.x + (n % 3) * 3 - 3; a.z = PEN.z + Math.floor(n / 3) * 3 - 3; n++; } },
    'herd 0 held by quest 6': (g) => { g.sim.herding.hold(0, 185, 105); },
    'every animal panicking': (g) => { for (const a of g.s.animals) Object.assign(a, { panicT: 30, px: a.x + 5, pz: a.z }); },
    'rider holds one on the rope': (g) => { const a = g.s.animals[0]; g.p.x = a.x + 4; g.p.z = a.z; g.sim.step({ ...idle, actions: ['lasso'] }); },
    'no loose animals': (g) => { for (const a of g.s.animals) { a.dead = true; a.deadT = -1e6; } },
  };
  const starts = [[0, -4], [60, -60], [85, 70], [-75, 120], [-105, -70], [0, 40], [0, 70], [-40, 30], [200, 200], [-250, -250]];
  for (const [name, setup] of Object.entries(setups)) {
    let pennedAll = 0, timeouts = 0, lost = 0, longestLead = 0, stale = 0, crossings = 0, inBuilding = 0, ended = 0, worst = '';
    for (const [x, z] of starts) {
      const g = fresh(x, z), { sim, s, m } = g;
      setup(g);
      m.x = x + 4; m.z = z - 3;
      if (name === 'rider holds one on the rope') { m.x = g.p.x + 4; m.z = g.p.z - 3; }
      sim.command({ type: 'order', id: 'herd' });
      const before = s.herd.total, w = watch(m);
      let leadT = 0, endedAt = null;
      for (let t = 0; t < 600; t += STEP) {
        const ev = sim.step(idle); w.tick();
        for (const e of ev) if (e.type === 'say') { if (/will not come/.test(e.text)) timeouts++; if (/Lost them/.test(e.text)) lost++; }
        if (m.task?.phase === 'lead') { leadT += STEP; longestLead = Math.max(longestLead, leadT); } else leadT = 0;
        if (s.order !== 'herd' && endedAt === null) { endedAt = t; ended++;
          // order over: nothing should still be following Mara
          const left = s.animals.filter(a => a.leader || (a.followT > 0 && a !== s.herd.roped)).length;
          if (left) { stale++; worst = `${left} animals still have leader/followT at ${t.toFixed(0)}s from ${x},${z}`; }
        }
      }
      // long after the order ended
      if (endedAt !== null && s.animals.some(a => a.leader)) worst += ` | leader still set 600 s later from ${x},${z}`;
      pennedAll += s.herd.total - before; crossings += w.get().crossings; inBuilding += w.get().inBuilding;
    }
    log(`  ${name}: penned ${pennedAll} over ${starts.length} starts; order ended by itself ${ended}x; "will not come" ${timeouts}; "Lost them" ${lost}; longest lead phase ${longestLead.toFixed(0)} s; fence crossings ${crossings}; steps inside a building ${inBuilding}; stale leader at end ${stale} ${worst}`);
  }
}

{ log('--- C. AFK income: rider parked at the notice board, order "Help the herd", re-issued whenever it lapses; herd jobs taken as offered');
  for (const jobs of [false, true]) {
    const { sim, s, p } = fresh(12, -25, 'herd');
    const m0 = p.money, lvl0 = p.level; let done = 0;
    for (let t = 0; t < 20 * 60; t += STEP) {
      sim.step(idle);
      if (s.order !== 'herd') sim.command({ type: 'order', id: 'herd' });
      if (jobs && !s.job) { const i = s.board.findIndex(j => j.type === 'herd'); if (i >= 0) sim.command({ type: 'takeJob', i }); }
    }
    log(`  20 min, herd jobs ${jobs ? 'taken' : 'ignored'}: money ${m0} -> ${p.money}, level ${lvl0} -> ${p.level}, penned ${s.herd.total}, jobs done ${s.jobsDone}, standing ${s.story.standing}, hp ${p.hp.toFixed(0)}/${p.maxHp}`);
  }
}

{ log('--- D. where Mara shoots, and what at (attack order, rider walking the town edge with raptors drawn in)');
  const { sim, s, p, m } = fresh(0, 30, 'attack');
  let inTownShots = 0, riderInTownShots = 0, shots = 0, pestHits = 0, returnShots = 0;
  // put a pack just outside town and compies inside
  sim.story.enter();
  const dmg0 = new Map();
  for (let t = 0; t < 180; t += STEP) {
    const ang = t * 0.15; p.x = TOWN.x + Math.cos(ang) * (TOWN.r + (Math.sin(t) > 0 ? 2 : -2)); p.z = TOWN.z + Math.sin(ang) * (TOWN.r + (Math.sin(t) > 0 ? 2 : -2));
    if (Math.round(t / STEP) % 600 === 0) for (const e of s.enemies.slice(0, 6)) { e.x = p.x * 1.5; e.z = p.z * 1.5 + 10; e.state = 'chase'; e.home = { x: e.x, z: e.z }; }
    const ev = sim.step(idle);
    for (const e of ev) if (e.type === 'mateShot') { shots++; if (inTown(m)) inTownShots++; if (inTown(p)) riderInTownShots++; if (inTown({ x: e.x2, z: e.z2 })) pestHits++; }
  }
  log(`  shots ${shots}; fired while Mara stood in town ${inTownShots}; fired while the rider was in town ${riderInTownShots}; shots at targets inside town ${pestHits}`);
}

{ log('--- E. attack order with only peaceful animals near: does Mara start fights? (rider idle 40 m from a wandering pack)');
  for (const order of ['follow', 'attack']) {
    const { sim, s, p, m } = fresh(150, 150, order);
    const e = s.enemies.find(k => k.kind === 'raptor' && !k.outpost);
    p.x = e.home.x + 39.5; p.z = e.home.z; m.x = p.x + 4; m.z = p.z;
    let shots = 0, hurt = 0;
    for (let t = 0; t < 30; t += STEP) { const ev = sim.step(idle); for (const k of ev) { if (k.type === 'mateShot') shots++; if (k.type === 'hurt') hurt++; } }
    log(`  ${order}: Mara shots ${shots}, rider hit ${hurt} times, hp ${p.hp.toFixed(0)}`);
  }
}

{ log('--- F. order across save/restore');
  for (const order of ['follow', 'hold', 'attack', 'herd']) {
    const { sim, s, p, m } = fresh(60, 40, order);
    for (let t = 0; t < 20; t += STEP) sim.step(idle);
    const led = s.animals.filter(a => a.leader).length;
    const b = createSim(); b.restore(clone(sim.snapshot()));
    const bm = b.state.mates[0];
    let thrown = '';
    try { for (let t = 0; t < 200; t += STEP) b.step(idle); } catch (e) { thrown = e.message; }
    log(`  ${order}: before save Mara led ${led}; after load order ${b.state.order}, mates ${b.state.mates.length}, Mara moved ${Math.hypot(bm.x - m.x, bm.z - m.z).toFixed(0)} in 200 s, penned ${b.state.herd.total - s.herd.total}, leaders ${b.state.animals.filter(a => a.leader).length} ${thrown}`);
  }
  // hold order: does she keep her post when the rider leaves, and can the rider still reach her for a talk step?
  const { sim, s, p, m } = fresh(60, 40, 'hold');
  const [hx, hz] = [m.x, m.z];
  for (let t = 0; t < 60; t += STEP) sim.step({ ...idle, mx: -1, mz: -1, sprint: true });
  log(`  hold: rider now ${Math.hypot(p.x - hx, p.z - hz).toFixed(0)} away, Mara moved ${Math.hypot(m.x - hx, m.z - hz).toFixed(1)}`);
}
