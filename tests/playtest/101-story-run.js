// A plain bot rides the whole story from a new game with nothing but what the story gives: how strong is the rider at each quest?
// It buys nothing, does no jobs, tames nothing: this is the floor.   /opt/homebrew/bin/node tests/playtest/101-story-run.js [seed]
import { wrap, createSim, QUESTS } from './80-lib.js';
import { bot } from './30-lib.js';
const seed = +(process.argv[2] || 99);
if (process.env.PROPOSED) (await import('./105-proposed.js')).apply();   // PROPOSED=1: with the proposed numbers
const sim = createSim(seed), g = wrap(sim, {}), b = bot(sim, {}, { tough: false }), { s, p } = g;
let deaths = 0, lastQ = 0, was = false;
const row = () => console.log(`${String(QUESTS[lastQ]?.id).padEnd(4)} done at ${(s.clock / 60).toFixed(1).padStart(6)} min  rider L${String(p.level).padEnd(2)} hp ${String(p.maxHp).padEnd(3)} mount#${p.mount} L${String(p.mountLv[p.mount]).padEnd(2)} $${String(p.money).padEnd(5)} standing ${String(s.story.standing).padEnd(3)} thrown ${deaths}x skills ${Object.values(p.skills).join('/')} res ${Object.values(p.res).join('/')}`);
const upkeep = () => {
  while (p.skillPoints > 0) { const t = p.skills.gunslinger < 10 ? 'gunslinger' : p.skills.marshal < 10 ? 'marshal' : 'wrangler'; sim.command({ type: 'skill', tree: t }); }
};
let guard = 0;
while (QUESTS[s.story.quest] && guard++ < 3000) {
  const before = g.stepOf(), q = s.story.quest, t0 = s.clock;
  if (p.dead) { deaths++; g.wait(4); }
  if (q < 6) b.advance(); else g.advance();
  upkeep();
  if (s.story.quest !== q) { lastQ = q; row(); }
  if (g.stepOf() === before && s.clock - t0 < 1) g.wait(2);
  if (s.clock > 8 * 3600) break;
}
console.log(`ended at ${g.stepOf()} after ${(s.clock / 60).toFixed(0)} sim minutes; rider L${p.level}; mounts owned ${p.mounts.map((m, i) => (m ? i : '')).join('')}; mount levels ${p.mountLv.join(',')}; raids won ${s.town.raidsWon} lost ${s.town.raidsLost}; treasury ${s.town.treasury}`);
