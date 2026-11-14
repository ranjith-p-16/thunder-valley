// Reproduces the stalls found by 31-branches-save.js:  node 34-stall-repro.js <branch prefix> <save step>
import { createSim, bot, BRANCHES, clone, STEP } from './30-lib.js';

const [prefix = 'stalled/driven', at = 'q3/1'] = process.argv.slice(2);
const [label, choices] = Object.entries(BRANCHES).find(([k]) => k.startsWith(prefix));
const g = bot(createSim(), choices);
let save = null;
g.finish({ onStep: (key) => { if (key === at) { save = clone(g.sim.snapshot()); return false; } } });
const b = createSim(); b.restore(save);
const h = bot(b, choices), s = b.state, p = s.player;
let deaths = 0, lastKey = '';
const end = h.finish({ maxTries: 60, onStep: (key) => { lastKey = key; } });
console.log(label, 'saved at', at, '->', end, 'clock', s.clock.toFixed(0));
const st = h.cur();
if (st) {
  console.log('step', JSON.stringify({ type: st.type, tag: st.tag, herd: st.herd, count: st.count }), 'count', s.story.count, 'player', p.x.toFixed(0), p.z.toFixed(0), 'hp', p.hp.toFixed(0), 'dead', p.dead, 'onFoot', p.onFoot);
  if (st.type === 'clear') for (const e of s.enemies.filter(k => k.tag.startsWith(st.tag))) console.log('  ', e.id, e.tag, e.state, 'hp', e.hp.toFixed(0), 'at', e.x.toFixed(0), e.z.toFixed(0), 'home', e.home.x.toFixed(0), e.home.z.toFixed(0), 'dead', e.dead, 'gone', e.gone, 'held', e.heldT.toFixed(1), 'homeDist', Math.hypot(e.x - e.home.x, e.z - e.home.z).toFixed(0), 'toRider', Math.hypot(e.x - p.x, e.z - p.z).toFixed(0));
  if (st.type === 'pen') {
    for (const a of s.animals) console.log('  ', a.id, 'herd', a.herd, a.penned ? 'PENNED' : a.dead ? 'dead' : 'loose', 'at', a.x.toFixed(0), a.z.toFixed(0), 'held', !!a.held, 'safe', !!a.safe, 'pennedAt', a.pennedAt, 'follow', a.followT.toFixed(1), 'leader', a.leader?.id || '');
    console.log('  roped', s.herd.roped?.id, 'penned total', s.animals.filter(a => a.penned).length, 'order', s.order, 'Mara', s.mates[0]?.x.toFixed(0), s.mates[0]?.z.toFixed(0), JSON.stringify(s.mates[0]?.task));
  }
}
