// Scratch tracer for stalls: node 35-debug.js <branch> <step> <mode>
import { createSim, bot, BRANCHES, clone, STEP, PEN, idle } from './30-lib.js';
const [prefix, at, mode] = process.argv.slice(2);
const [label, choices] = Object.entries(BRANCHES).find(([k]) => k.startsWith(prefix));
const g = bot(createSim(), choices);
let save = null;
g.finish({ onStep: (key) => { if (key === at) { save = clone(g.sim.snapshot()); return false; } } });
const b = createSim(); b.restore(save);
const h = bot(b, choices), s = b.state, p = s.player;
const stopAt = mode === 'pen' ? 'q6/4' : 'q6/2';
h.finish({ until: stopAt });
console.log('reached', h.stepOf(), 'clock', s.clock.toFixed(0), 'night', b.isNight());
if (mode === 'pen') {
  for (let n = 0; n < 6 && h.stepOf() === 'q6/4'; n++) {
    const a = s.animals.find(k => !k.dead && !k.penned && !k.held && k.herd === 0);
    console.log(`try ${n}: target ${a.id} at ${a.x.toFixed(0)},${a.z.toFixed(0)} count ${s.story.count} rider ${p.x.toFixed(0)},${p.z.toFixed(0)}`);
    const ok1 = h.rideTo(a.x + 5, a.z, 6);
    const ev = h.step({ actions: ['lasso'] });
    console.log(`   arrived ${ok1} dist ${Math.hypot(a.x - p.x, a.z - p.z).toFixed(0)} roped ${s.herd.roped?.id} herd ${s.herd.roped?.herd} toasts ${ev.filter(e => e.type === 'toast').map(e => e.text)}`);
    const ok2 = h.rideTo(PEN.x, PEN.z - PEN.r - 12, 2);
    console.log(`   to gate ${ok2} rider ${p.x.toFixed(0)},${p.z.toFixed(0)} roped at ${s.herd.roped?.x.toFixed(0)},${s.herd.roped?.z.toFixed(0)} dead ${p.dead}`);
    h.rideTo(PEN.x, PEN.z + PEN.r - 5, 1.5, 40); h.wait(2);
    console.log(`   in pen: rider ${p.x.toFixed(0)},${p.z.toFixed(0)} roped ${s.herd.roped?.id} at ${s.herd.roped?.x.toFixed(1)},${s.herd.roped?.z.toFixed(1)} target penned ${a.penned} count ${s.story.count}`);
    if (s.herd.roped) h.step({ actions: ['lasso'] });
    h.rideTo(PEN.x, PEN.z - PEN.r - 12, 2);
  }
} else {
  for (let n = 0; n < 8 && h.stepOf() === stopAt; n++) {
    const before = s.clock; let hurt = 0, shots = 0, thuds = 0, hits = 0;
    for (let i = 0; i < 20 / STEP; i++) {
      const t = s.enemies.filter(e => e.tag.startsWith('q6') && !e.dead && !e.gone).sort((x, y) => Math.hypot(x.x - p.x, x.z - p.z) - Math.hypot(y.x - p.x, y.z - p.z))[0];
      if (!t) break;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      const ev = h.step(d > 22 ? { mx: t.x - p.x, mz: t.z - p.z, sprint: true } : { fire: true, aim: h.aimAt(t) });
      for (const e of ev) { if (e.type === 'hurt') hurt++; if (e.type === 'shot') shots++; if (e.type === 'thud') thuds++; if (e.type === 'hit') hits++; }
    }
    console.log(`20 s: rider ${p.x.toFixed(0)},${p.z.toFixed(0)} hp ${p.hp.toFixed(0)} dead ${p.dead} inTown ${b.inTown()} shots ${shots} hits ${hits} thuds ${thuds} hurt ${hurt} |`, s.enemies.filter(e => e.tag.startsWith('q6')).map(e => `${e.state} hp${e.hp.toFixed(0)} @${e.x.toFixed(0)},${e.z.toFixed(0)} d${Math.hypot(e.x - p.x, e.z - p.z).toFixed(0)}`).join(' | '));
  }
}
