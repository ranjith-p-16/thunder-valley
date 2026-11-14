// Minimal repros: what the drive step checks when you holler, the toasts at the very end, and the lines spoken when the Alpha died early.
import { act3Start, check, failures, PLACES_OF_NOTE, DIALOGUES, QUESTS } from './80-lib.js';
const H = PLACES_OF_NOTE.hollow;
const texts = (ev) => (ev || []).filter(e => e.type === 'toast').map(e => e.text);

{ // drive: state set by hand so that only the holler rules are under test
  const mk = () => { const g = act3Start({ q17_hollow: 1 }, 'secret', 16); g.s.story.flags.rex = 'sealed'; g.s.story.step = 3; g.sim.story.enter(); g.sim.command({ type: 'order', id: 'calm' }); return g; };
  const holler = (g) => texts(g.step({ actions: ['holler'] }));
  let g = mk(), rex = g.s.rex;
  g.p.x = rex.x + 20; g.p.z = rex.z; console.log('full health   :', g.stepOf(), holler(g));
  g = mk(); rex = g.s.rex; rex.hp = rex.maxHp * 0.4; g.p.x = rex.x + 60; g.p.z = rex.z; console.log('worn, 60 m   :', g.stepOf(), holler(g));
  g = mk(); rex = g.s.rex; rex.hp = rex.maxHp * 0.4; rex.x = H.x + 200; rex.z = H.z + 200; g.p.x = rex.x + 20; g.p.z = rex.z;
  const t = holler(g);
  check('BUG? drive only counts within r=60 of the hollow (step data x,z,r)', g.stepOf() === 'q17/3', `rex and rider ~283 m from the hollow: ${g.stepOf()} ${t}`);
  g = mk(); rex = g.s.rex; rex.hp = 0; rex.dead = true; g.p.x = rex.x + 20; g.p.z = rex.z; console.log('dead (no flag):', g.stepOf(), holler(g), JSON.stringify(g.sim.story.status()));
}
{ // the last toasts of the game
  const g = act3Start({}, 'secret', 17); g.s.story.flags.rex = 'killed'; g.s.story.step = 2; g.sim.story.enter();
  const w = g.sim.story.whereIs('blackthorn'); g.p.x = w.x + 3; g.p.z = w.z; g.step();
  const ev = [...g.sim.command({ type: 'talk' }) || []];
  for (let n = 0; g.s.dialogue && n < 5; n++) ev.push(...(g.sim.command({ type: 'say', i: 0 }) || []));
  console.log('final toasts  :', texts(ev));
  check('BUG? no "more comes with the next milestone" after the true ending', !texts(ev).some(x => /next milestone/.test(x)));
}
{ // Alpha killed before act 3: who says what
  const g = act3Start({}, 'secret', 14); g.shoot(g.s.rex, 900, () => g.s.rex.dead);
  const seen = []; const orig = g.answer;
  for (let i = 0; i < 40 && QUESTS[g.s.story.quest] && g.s.story.quest < 17; i++) {
    const st = QUESTS[g.s.story.quest].steps[g.s.story.step];
    if (st.dialogue) seen.push(`${g.stepOf()} ${st.dialogue}: "${DIALOGUES[st.dialogue].text.slice(0, 110)}..."`);
    g.advance();
  }
  console.log(seen.join('\n'));
}
console.log(failures() ? `\n${failures()} flagged` : '\nall passed');
