// Every act 3 choice combination reaches an ending; and the same with a save + restore before every step.
import { act3Start, check, failures, ENDINGS, QUESTS } from './80-lib.js';

const RELOAD = process.argv.includes('--reload');
const only = process.argv.find(a => /^\d+$/.test(a));
for (let m = 0; m < 32; m++) {
  if (only !== undefined && +only !== m) continue;
  const c = { q14_camp: m & 1, q16_june: (m >> 1) & 1, q17_hollow: (m >> 2) & 1, q18_blackthorn: (m >> 3) & 1 };
  const nettle = m & 16 ? 'revealed' : 'secret';
  let g = act3Start(c, nettle);
  const t0 = Date.now(), trail = [];
  for (let i = 0; i < 80 && QUESTS[g.s.story.quest]; i++) {
    if (RELOAD) g = g.reload();
    const b = g.stepOf(), st = g.s.story.standing, mo = g.p.money;
    g.advance();
    trail.push(`${b}${g.stepOf() === b ? '!' : ''}`);
  }
  const f = g.s.story.flags, end = `${f.rex}|${f.blackthorn}`;
  const label = `#${m} eggs${c.q14_camp} fires${c.q16_june} rex${c.q17_hollow} bt${c.q18_blackthorn} ${nettle}${RELOAD ? ' +reload' : ''}`;
  check(`${label} -> ${end}`, !QUESTS[g.s.story.quest] && !!ENDINGS[end] && g.s.story.done.length === 18
    && f.rex === (c.q17_hollow ? 'sealed' : 'killed') && g.p.mounts[2] === true,
    `${g.stepOf()} standing ${g.s.story.standing} money ${g.p.money} lvl ${g.p.level} rexdead ${g.s.rex.dead} ${((Date.now() - t0) / 1000).toFixed(1)}s ${trail.filter(t => t.endsWith('!')).join(' ')}`);
}
console.log(failures() ? `\n${failures()} failed` : '\nall passed');
