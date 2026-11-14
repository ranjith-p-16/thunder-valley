// Trace of the stand in the square for a level-10 rider who stands still and shoots the nearest raider.
import { createSim, STEP, QUESTS } from './50-lib.js';
import { heightAt } from "../../src/sim/terrain.js";
import { bot } from './54-act2.js';
const level = +process.argv[2] || 10;
const sim = createSim(99), s = sim.state;
s.story.quest = 11; s.story.step = 2; s.story.standing = 80; sim.story.enter();
const b = bot(sim, {}, { level }); b.p.x = 0; b.p.z = -10;
let t = 0, was = false, shots = 0, hits = 0, thuds = 0, lastLog = 0;
while (b.stepOf() === 'q12/2' && t < (+process.argv[3] || 400)) {
  const tg = b.left('hold').sort((x, y) => Math.hypot(x.x - b.p.x, x.z - b.p.z) - Math.hypot(y.x - b.p.x, y.z - b.p.z))[0];
  const ev = b.step(tg ? { fire: true, aim: b.aimAt(tg) } : {}); t += STEP;
  for (const e of ev) { if (e.type === 'shot') shots++; if (e.type === 'hit') hits++; if (e.type === 'thud') thuds++; }
  if (b.p.dead && !was) console.log(`t=${t.toFixed(0)} THROWN at ${b.p.x.toFixed(0)},${b.p.z.toFixed(0)} count ${s.story.count.toFixed(0)}`);
  was = b.p.dead;
  if (t - lastLog >= 20) { lastLog = t; console.log(`t=${t.toFixed(0)} hp ${b.p.hp.toFixed(0)}/${b.p.maxHp} lvl ${b.p.level} pos ${b.p.x.toFixed(0)},${b.p.z.toFixed(0)} count ${s.story.count.toFixed(0)} shots ${shots} hits ${hits} thuds ${thuds} enemies ${b.left('hold').map(e => `${Math.hypot(e.x - b.p.x, e.z - b.p.z).toFixed(0)}m/${e.hp.toFixed(0)}hp/${e.state}`).join(' ')}`); }
}
console.log('end', b.stepOf(), t.toFixed(0));
// what stops the rider's shots at the raiders standing 24 m off?
{
  const p = b.p, m = sim.muzzle();
  for (const e of b.left('hold')) {
    const d = Math.hypot(e.x - p.x, e.z - p.z); let why = 'clear';
    const ty = heightAt(e.x, e.z) + 1.6;
    for (let k = 1; k < 200; k++) { const f = k / 200, x = m.x + (e.x - m.x) * f, z = m.z + (e.z - m.z) * f, y = m.y + (ty - m.y) * f;
      if (y < heightAt(x, z)) { why = `ground at ${(f * d).toFixed(1)} m (bullet y ${y.toFixed(1)}, ground ${heightAt(x, z).toFixed(1)})`; break; }
      if (s.obstacles.blocksShot(x, y, z)) { why = `scenery/building at ${(f * d).toFixed(1)} m (${x.toFixed(0)},${z.toFixed(0)})`; break; } }
    console.log(`raider at ${e.x.toFixed(0)},${e.z.toFixed(0)} (${d.toFixed(0)} m, ground ${heightAt(e.x, e.z).toFixed(1)}; rider ground ${heightAt(p.x, p.z).toFixed(1)} muzzle ${m.y.toFixed(1)}): rider's shot -> ${why}`);
  }
}
