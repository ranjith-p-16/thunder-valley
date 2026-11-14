// The stand in the square with a rider who does nothing: what happens to the waves?
import { createSim, STEP } from './50-lib.js';
import { bot } from './54-act2.js';
const sim = createSim(99), s = sim.state;
s.story.quest = 11; s.story.step = 2; s.story.standing = 80; sim.story.enter();
const b = bot(sim, {}, { level: +process.argv[2] || 25 }); b.p.x = 0; b.p.z = -10;
const seen = new Map();
for (let i = 0; i <= 200 * 60 && b.stepOf() === 'q12/2'; i++) {
  const ev = b.step();
  for (const e of s.enemies) if (e.tag === 'hold') { if (!seen.has(e.id)) { seen.set(e.id, e); console.log(`t=${(i / 60).toFixed(1)} spawn ${e.id} at ${e.x.toFixed(0)},${e.z.toFixed(0)} (${Math.hypot(e.x, e.z + 10).toFixed(0)} m from the square)`); } }
  for (const [id, e] of seen) if (!e.logged && (e.dead || e.gone || !s.enemies.includes(e))) { e.logged = true; console.log(`t=${(i / 60).toFixed(1)} ${id} removed: dead ${e.dead} gone ${e.gone} hp ${e.hp.toFixed(0)} at ${e.x.toFixed(0)},${e.z.toFixed(0)} state ${e.state}`); }
  if (i % 1200 === 0) console.log(`t=${i / 60} rider hp ${b.p.hp.toFixed(0)} count ${s.story.count.toFixed(0)} alive ${b.left('hold').map(e => `${e.id}:${e.state}:${Math.hypot(e.x - b.p.x, e.z - b.p.z).toFixed(0)}m:hp${e.hp.toFixed(0)}`).join(' ')}`);
}
console.log('end', b.stepOf(), 'town owned', s.town.owned);
