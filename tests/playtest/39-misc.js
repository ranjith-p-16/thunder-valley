// Smaller checks: cover against gunners/spitters, a roped longhorn jamming in scenery, F at a door beside a character,
// F while Mara is the quest's talk target, rally on the held herd.
import { createSim, bot, STEP, idle, PEN, heightAt } from './30-lib.js';
import { PLACES, PLACE_REACH, TOWN } from '../../src/data/items.js';
import { NPCS } from '../../src/data/story.js';

const log = (...a) => console.log(...a);

{ log('--- A. a tree between the rider and a rustler / spitter: who can hit whom?');
  for (const [quest, step, tag, kind] of [[5, 2, 'q6', 'rustler'], [4, 1, 'q5', 'dilo']]) {
    const g = bot(createSim(), {}, { tough: true }), { sim, s, p } = g;
    Object.assign(s.story.flags, { collector: 'paid', rustlers: 'fought' }); s.story.quest = quest; s.story.step = step; sim.story.enter();
    const foes = s.enemies.filter(e => e.tag.startsWith(tag)); for (const e of foes.slice(1)) e.gone = true;
    const e = foes[0];
    // a fat tree well away from other scenery and from anything alive
    const all = [...s.obstacles.trees, ...s.obstacles.rocks];
    const tree = s.obstacles.trees.filter(t => t.r > 0.9 && Math.hypot(t.x, t.z + 10) > 90 && all.every(o => o === t || Math.hypot(o.x - t.x, o.z - t.z) > 14)
      && s.enemies.every(k => k === e || Math.hypot(k.home.x - t.x, k.home.z - t.z) > 70) && Math.abs(heightAt(t.x - 9, t.z) - heightAt(t.x + 9, t.z)) < 0.5)[0];
    e.x = tree.x + 9; e.z = tree.z; e.home = { x: e.x, z: e.z }; e.state = 'chase'; e.provokedT = 999;
    let shots = 0, hits = 0, hurt = 0, thuds = 0;
    for (let t = 0; t < 20; t += STEP) {
      p.x = tree.x - 9; p.z = tree.z; e.x = tree.x + 9; e.z = tree.z; e.state = 'chase'; e.hp = e.maxHp;
      const ev = g.step({ fire: true, aim: g.aimAt(e) });
      for (const k of ev) { if (k.type === 'shot') shots++; if (k.type === 'hit') hits++; if (k.type === 'hurt') hurt++; if (k.type === 'thud') thuds++; }
    }
    log(`  ${kind} 9 m behind a tree (r ${tree.r.toFixed(2)}) and the rider 9 m in front, 20 s: rider fired ${shots}, hit ${hits} (stopped by the trunk ${thuds}); ${kind} hit the rider ${hurt} times`);
  }
}

{ log('--- B. a roped longhorn led in a straight line from herd 0 toward the gate');
  const sim = createSim(), s = sim.state, p = s.player, a = s.animals[0];
  const all = [...s.obstacles.trees.map(o => ({ ...o, t: 'tree' })), ...s.obstacles.rocks.map(o => ({ ...o, t: 'rock' }))];
  let jams = 0, runs = 0; const spots = new Map();
  // the rider rides the straight line from where the animal stands to the gate mouth, from 40 start points east and north-east of the ranch
  for (let k = 0; k < 40; k++) {
    const ang = -0.2 + k * 0.035, R = 60 + (k % 4) * 30, x0 = Math.cos(ang) * R, z0 = 10 + Math.sin(ang) * R + 20;
    Object.assign(a, { x: x0, z: z0, vx: 0, vz: 0, penned: false, dead: false, held: null, followT: 0, panicT: 0 });
    p.x = x0 - 6; p.z = z0 - 2; s.herd.roped = null; sim.step({ ...idle, actions: ['lasso'] });
    if (s.herd.roped !== a) continue;
    runs++;
    let still = 0, lx = a.x, lz = a.z;
    for (let t = 0; t < 40; t += STEP) {
      const dx = 0 - p.x, dz = 9 - p.z, d = Math.hypot(dx, dz);
      sim.step(d > 2 ? { ...idle, mx: dx, mz: dz, sprint: true } : idle);
      if (Math.round(t / STEP) % 60 === 0) { still = Math.hypot(a.x - lx, a.z - lz) < 0.05 && Math.hypot(a.x - p.x, a.z - p.z) > 12 ? still + 1 : 0; lx = a.x; lz = a.z; }
    }
    if (still >= 5) { jams++; const near = all.filter(o => Math.hypot(o.x - a.x, o.z - a.z) < o.r + 1.5).map(o => `${o.t}@${o.x.toFixed(1)},${o.z.toFixed(1)} r${o.r.toFixed(2)}`); spots.set(`${a.x.toFixed(1)},${a.z.toFixed(1)}`, near.join(' + ')); }
  }
  log(`  ${jams} of ${runs} straight leads ended with the longhorn jammed for good (rider waiting at the gate, rope taut):`);
  for (const [k, v] of spots) log(`     at ${k} against ${v}`);
}

{ log('--- C. F at a building door that has a character beside it');
  const sim = createSim(), s = sim.state, p = s.player;
  for (const pl of PLACES) {
    let n = 0, talk = 0;
    for (let x = pl.door.x - 7; x <= pl.door.x + 7; x += 0.5) for (let z = pl.door.z - 7; z <= pl.door.z + 7; z += 0.5) {
      if (Math.hypot(x - pl.door.x, z - pl.door.z) >= PLACE_REACH) continue;
      const b = { x, z }; s.obstacles.resolve(b, 1.2); if (Math.hypot(b.x - x, b.z - z) > 0.01) continue;   // not standable
      p.x = x; p.z = z; n++;
      if (sim.nearPlace()?.id === pl.id && sim.story.canTalk()) talk++;
    }
    p.x = pl.door.x; p.z = pl.door.z; sim.step(idle);
    const hint = s.hint; sim.command({ type: 'talk' });
    log(`  ${pl.name}: standing on the door spot the hint reads "${hint}" and F opens ${s.dialogue ? `the conversation ${s.dialogue.id}` : 'the place'}; F is taken by a character on ${(100 * talk / n).toFixed(0)}% of the ground from which the place can be used`);
    while (s.dialogue) sim.command({ type: 'say', i: 0 });
  }
}

{ log('--- D. F while "Talk to Mara" is the quest step and she rides with the posse');
  const g = bot(createSim(), {}); g.finish({ until: 'q4/0' });
  const { sim, s, p } = g; p.x = 17; p.z = -11.5; g.wait(3);
  const m = s.mates[0];
  sim.step(idle); const hint = s.hint; sim.command({ type: 'talk' });
  log(`  rider at the store door (${sim.nearPlace()?.name}), Mara ${Math.hypot(m.x - p.x, m.z - p.z).toFixed(0)} m behind: hint "${hint}", F opens ${s.dialogue?.id}`);
}

{ log('--- E. Bulwark rally / holler on the held herd before it is released (quest 6)');
  const g = bot(createSim(), { q6_camp: 0 }); g.finish({ until: 'q6/2' });
  const { sim, s, p } = g; p.mounts[1] = true; p.mount = 1; p.x = 185 - 20; p.z = 105; p.abilityCd = 0;
  g.step({ actions: ['ability'] });
  const f = s.animals.filter(a => a.held && a.followT > 0).length;
  for (const e of s.enemies) if (e.tag.startsWith('q6')) e.gone = true;
  g.step(); g.step();
  const h0 = s.animals.filter(a => a.herd === 0);
  log(`  rallied while held: ${f}; after the rustlers are gone step ${g.stepOf()}, herd 0: following the rider ${h0.filter(a => a.followT > 0).length}, panicking ${h0.filter(a => a.panicT > 0).length}`);
}
