import { createSim, STEP } from '../../src/sim/sim.js';
const sim = createSim(), s = sim.state, p = s.player;
const idle = { mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [] };
p.mounts[4] = true; p.string = [0, 4];
const c2 = s.enemies.find(e => e.kind === 'cinder');
for (const e of s.enemies) if (e !== c2) { e.heldT = 1e9; e.x = 285; e.z = 285 - s.enemies.indexOf(e) * 4; }
c2.hp = 10; c2.heldT = 30; p.x = c2.x; p.z = c2.z - 5;
let ev = sim.step({ ...idle, actions: ['tame'] });
console.log('start', JSON.stringify(p.tame), ev.filter(e => e.type === 'toast').map(e => e.text));
for (let i = 0; i < 6.3 / STEP; i++) { ev = sim.step(idle); const t = ev.filter(e => e.type === 'toast').map(e => e.text); if (t.length) console.log((i * STEP).toFixed(1), t, 'hp', c2.hp.toFixed(0), 'dist', Math.hypot(c2.x - p.x, c2.z - p.z).toFixed(1)); }
console.log('end', p.mountXp[4], p.mountLv[4], c2.tamed);
