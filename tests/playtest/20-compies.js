import { createSim, STEP } from '../../src/sim/sim.js';
const sim = createSim(), s = sim.state, p = s.player;
const idle = { mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [] };
p.x = -15; p.z = 0; sim.command({ type: 'talk' }); while (s.dialogue) sim.command({ type: 'say', i: 0 });
for (let t = 0; t < 120 / STEP; t++) {
  const c = s.enemies.find(e => e.tag === 'q1' && !e.gone);
  if (!c) { console.log('all gone at', (t * STEP).toFixed(1)); break; }
  sim.step({ ...idle, mx: c.x - p.x, mz: c.z - p.z, sprint: true });
  if (t % 600 === 0) console.log((t * STEP).toFixed(0), s.enemies.filter(e => e.tag === 'q1' && !e.gone).map(e => `${e.x.toFixed(0)},${e.z.toFixed(0)} hp${e.hp} ${e.dead ? 'dead' : ''} held${e.heldT.toFixed(1)}`).join(' | '), 'player', p.x.toFixed(0), p.z.toFixed(0));
}
