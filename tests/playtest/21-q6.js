import { createSim, STEP } from '../../src/sim/sim.js';
const sim = createSim(), s = sim.state, p = s.player;
const idle = { mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [] };
p.level = 15; sim.economy.recalc(); p.hp = p.maxHp;
s.story.quest = 5; s.story.step = 0; sim.posse.join('mara'); sim.story.enter();
p.x = s.mates[0].x + 3; p.z = s.mates[0].z;
sim.command({ type: 'talk' }); console.log('dialogue', s.dialogue?.id); while (s.dialogue) sim.command({ type: 'say', i: 0 });
console.log('step', s.story.step, 'rustlers', s.enemies.filter(e => e.tag.startsWith('q6')).length);
for (let t = 0; t < 60 / STEP; t++) {
  sim.step({ ...idle, mx: 185 - p.x, mz: 105 - p.z, sprint: true });
  if (t % 300 === 0) console.log((t * STEP).toFixed(0), 'player', p.x.toFixed(0), p.z.toFixed(0), 'hp', p.hp.toFixed(0), p.dead ? 'DEAD' : '', 'step', s.story.step, s.dialogue?.id || '');
  if (s.dialogue) break;
}
console.log('at camp: dialogue', s.dialogue?.id, 'dist', Math.hypot(185 - p.x, 105 - p.z).toFixed(0), 'held', s.animals.filter(a => a.held).length);
try { sim.command({ type: 'say', i: 0 }); } catch (e) { console.log('THROW', e.stack.split('\n').slice(0, 4).join(' | ')); }
console.log('after choice: step', s.story.step, 'flags', JSON.stringify(s.story.flags), 'dialogue', s.dialogue?.id);
