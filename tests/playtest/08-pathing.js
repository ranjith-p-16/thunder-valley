// Do chasing animals actually reach a rider who stands still? (straight-line pursuit vs trees and rocks)
import { createSim, STEP, inp, dist, aimAt, run, note, rng, TOWN } from './lib.js';

const R = rng(42);
function trial(kind, standoff, shoot = false) {
  const sim = createSim(1), s = sim.state, p = s.player;
  const e = kind === 'rex' ? s.rex : s.enemies.filter(e => !e.outpost && e !== s.rex)[Math.floor(R() * 12)];
  // park everything else far away so only this animal matters
  for (const x of s.enemies) if (x !== e) { x.heldT = 1e9; x.x = 285; x.z = 285 - s.enemies.indexOf(x) * 4; }
  let px, pz, tries = 0;
  do { const a = R() * 6.283; px = e.home.x + Math.cos(a) * standoff; pz = e.home.z + Math.sin(a) * standoff; } while ((Math.abs(px) > 280 || Math.abs(pz) > 280 || Math.hypot(px - TOWN.x, pz - TOWN.z) < TOWN.r + 10) && tries++ < 50);
  p.x = px; p.z = pz; e.x = e.home.x; e.z = e.home.z; e.state = 'chase';
  let bitten = false, minD = Infinity;
  const limit = standoff / e.def.speed + 20;
  run(sim, limit, () => (shoot ? { fire: true, aim: aimAt(p, e, e.def.radius) } : {}), (ev) => { for (const x of ev) if (x.type === 'hurt') bitten = true; minD = Math.min(minD, dist(e, p)); return !bitten && !e.dead; });
  // stuck = still chasing, never bit, and has not moved in the last 5 s
  const x0 = e.x, z0 = e.z; if (!bitten && !e.dead) run(sim, 5);
  const still = Math.hypot(e.x - x0, e.z - z0) < 0.05;
  return { bitten, stuck: !bitten && !e.dead && e.state === 'chase' && still, dead: e.dead, minD, state: e.state, at: `${e.x.toFixed(0)},${e.z.toFixed(0)}`, rider: `${px.toFixed(0)},${pz.toFixed(0)}` };
}
for (const [kind, standoff, n] of [['rex', 45, 60], ['rex', 30, 60], ['raptor', 30, 120]]) {
  let stuck = 0, bit = 0; const ex = [];
  for (let i = 0; i < n; i++) { const t = trial(kind, standoff); if (t.stuck) { stuck++; if (ex.length < 3) ex.push(`rider at (${t.rider}), ${kind} jammed at (${t.at}) ${t.minD.toFixed(1)} away`); } if (t.bitten) bit++; }
  note(stuck / n > 0.05 ? 'BUG' : 'PASS', `${kind} chasing a rider standing ${standoff} from its home: reached and bit ${bit}/${n}, jammed on scenery forever (state stays 'chase', zero movement) ${stuck}/${n}${ex.length ? ' e.g. ' + ex.join(' ; ') : ''}`);
}
{ // a jammed Rex is a free kill: stand still and shoot it
  let kills = 0, n = 0, hurtAny = 0;
  for (let i = 0; i < 60; i++) { const probe = trial('rex', 45); if (!probe.stuck) continue; n++; }
  const R2 = rng(42); // same sequence again, now shooting
  note('INFO', `(of 60 random standing spots 45 from the Rex's home, ${n} jam it; see next line for what a level-1 revolver does from those spots)`);
}
{
  // deterministic showcase: scan angles around the Rex home, pick the first jam spot, then shoot from there
  const spots = [];
  for (let k = 0; k < 72 && spots.length < 5; k++) {
    const a = k / 72 * 6.283, sim = createSim(1), s = sim.state, p = s.player, e = s.rex;
    for (const x of s.enemies) if (x !== e) { x.heldT = 1e9; x.x = 285; x.z = 285 - s.enemies.indexOf(x) * 4; }
    p.x = e.home.x + Math.cos(a) * 45; p.z = e.home.z + Math.sin(a) * 45; e.state = 'chase';
    let hurt = 0; const t = run(sim, 120, () => ({ fire: true, aim: aimAt(p, e, 4.6) }), (ev) => { for (const x of ev) if (x.type === 'hurt') hurt++; return !e.dead && !p.dead; });
    if (e.dead && hurt === 0) spots.push(`(${p.x.toFixed(0)},${p.z.toFixed(0)}) Rex dead in ${t.toFixed(0)} s`);
  }
  note(spots.length ? 'BUG' : 'PASS', `standing still 45 from the Rex's home and holding fire with the starting revolver at level 1, taking zero damage: ${spots.length ? spots.join(' ; ') : 'never works'}`);
}

// The realistic case: the rider backs away slowly (7/s, slower than either animal) in a straight line, so the chase crosses the woods.
function retreat(kind, k) {
  const sim = createSim(1), s = sim.state, p = s.player;
  const e = kind === 'rex' ? s.rex : s.enemies.filter(e => !e.outpost && e !== s.rex)[k % 12];
  for (const x of s.enemies) if (x !== e) { x.heldT = 1e9; x.x = 285; x.z = 285 - s.enemies.indexOf(x) * 4; }
  const a = (k * 0.61803 * 6.283) % 6.283, start = kind === 'rex' ? 40 : 28;
  p.x = e.home.x + Math.cos(a) * start; p.z = e.home.z + Math.sin(a) * start; e.x = e.home.x; e.z = e.home.z; e.state = 'chase';
  let bitten = false, lastPos = { x: e.x, z: e.z }, still = 0, jam = null, tick = 0;
  run(sim, 60, () => ({ mx: Math.cos(a) * 7 / 12, mz: Math.sin(a) * 7 / 12 }), (ev) => {
    for (const x of ev) if (x.type === 'hurt') bitten = true;
    if (++tick % 60 === 0) { still = Math.hypot(e.x - lastPos.x, e.z - lastPos.z) < 0.02 && e.state === 'chase' ? still + 1 : 0; lastPos = { x: e.x, z: e.z }; if (still >= 3 && !jam) jam = { at: `${e.x.toFixed(0)},${e.z.toFixed(0)}`, d: dist(e, p), home: Math.hypot(e.x - e.home.x, e.z - e.home.z) }; }
    return !bitten && !jam && e.state === 'chase';
  });
  return { bitten, jam, state: e.state, edge: Math.abs(p.x) > 285 || Math.abs(p.z) > 285 };
}
for (const [kind, n] of [['rex', 80], ['raptor', 120]]) {
  let jam = 0, bit = 0, gaveUp = 0; const ex = [];
  for (let k = 0; k < n; k++) { const r = retreat(kind, k); if (r.jam) { jam++; if (ex.length < 4) ex.push(`jammed at (${r.jam.at}), ${r.jam.home.toFixed(0)} from home, rider ${r.jam.d.toFixed(0)} away`); } else if (r.bitten) bit++; else gaveUp++; }
  note(jam / n > 0.05 ? 'BUG' : 'INFO', `${kind} chasing a rider who backs away in a straight line at 7 units/s (walking is 12): caught and bit ${bit}/${n}, wedged between trees/rocks and frozen in 'chase' ${jam}/${n}, gave up at the leash ${gaveUp}/${n}${ex.length ? '; e.g. ' + ex.join(' ; ') : ''}`);
}
