// Plays act 1 (quests 1 to 6) with a scripted rider, without a browser:  node tests/story.test.js
import { createSim, STEP } from '../src/sim/sim.js';
import { PEN } from '../src/data/content.js';
import { QUESTS, PLACES_OF_NOTE } from '../src/data/story.js';
import { heightAt } from '../src/sim/terrain.js';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; };

function play(choices) {
  const sim = createSim(), s = sim.state, p = s.player;
  p.level = 15; sim.economy.recalc(); p.hp = p.maxHp;   // a tough rider, so the script tests the story and not the fights
  const idle = { mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [] };
  const step = (inp = {}) => sim.step({ ...idle, ...inp });
  const wait = (sec) => { for (let i = 0; i < sec / STEP; i++) step(); };
  const rideTo = (x, z, stop = 3, max = 90) => {
    // rides straight at the goal; when scenery stops it, steps sideways for a moment as a player would steer round
    let lastX = p.x, lastZ = p.z, side = 0, sideT = 0, turn = 1;
    for (let i = 0; i < max / STEP && Math.hypot(p.x - x, p.z - z) > stop && !s.dialogue; i++) {
      const dx = x - p.x, dz = z - p.z;
      if (sideT > 0) { sideT -= STEP; step({ mx: -dz * side + dx * 0.3, mz: dx * side + dz * 0.3, sprint: true }); continue; }
      step({ mx: dx, mz: dz, sprint: true });
      if (i % 30 === 29) {
        if (Math.hypot(p.x - lastX, p.z - lastZ) < 1.5) { side = turn; turn = -turn; sideT = 0.9; }
        lastX = p.x; lastZ = p.z;
      }
    }
    return Math.hypot(p.x - x, p.z - z) <= stop + 1;
  };
  // answers every conversation node with the wanted reply (default: the first one)
  const answer = () => { for (let n = 0; s.dialogue && n < 12; n++) { const pick = choices[s.dialogue.id] ?? 0; sim.command({ type: 'say', i: pick }); } };
  const talkTo = (id) => {
    const who = sim.story.whereIs(id);
    if (!who) return false;
    rideTo(who.x, who.z, 5);
    sim.command({ type: 'talk' });
    const opened = !!s.dialogue;
    answer();
    return opened;
  };
  const aimAt = (t) => {
    const oy = heightAt(p.x, p.z) + 4, dx = t.x - p.x, dy = heightAt(t.x, t.z) + 1.6 - oy, dz = t.z - p.z, len = Math.hypot(dx, dy, dz);
    return { ox: p.x, oy, oz: p.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: Math.atan2(dx, dz) };
  };
  const killTagged = (tag, max = 120) => {
    for (let i = 0; i < max / STEP; i++) {
      const t = s.enemies.filter(e => e.tag.startsWith(tag) && !e.dead && !e.gone).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (!t) return true;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      step(d > 22 ? { mx: t.x - p.x, mz: t.z - p.z, sprint: true } : { fire: true, aim: aimAt(t) });
    }
    return false;
  };
  const penOne = (herd) => {
    const a = s.animals.find(k => !k.dead && !k.penned && !k.held && (herd === undefined || k.herd === herd));
    if (!a) return false;
    rideTo(a.x + 5, a.z, 6);
    step({ actions: ['lasso'] });
    rideTo(PEN.x, PEN.z - PEN.r - 12, 2);
    rideTo(PEN.x, PEN.z + PEN.r - 5, 1.5, 40);
    wait(2);
    step({ actions: ['lasso'] });   // let go if it is somehow still roped
    rideTo(PEN.x, PEN.z - PEN.r - 12, 2);
    return a.penned;
  };
  const stepOf = () => `${QUESTS[s.story.quest]?.id ?? 'end'}/${s.story.step}`;
  return { sim, s, p, step, wait, rideTo, talkTo, killTagged, penOne, answer, stepOf };
}

function act1(label, choices) {
  const g = play(choices), { sim, s, p } = g;
  // quest 1
  check(`${label}: quest 1 opens with Ros`, g.talkTo('ros') && g.stepOf() === 'q1/1', g.stepOf());
  check(`${label}: six compies appear at the store`, s.enemies.filter(e => e.tag === 'q1').length === 6);
  for (let i = 0; i < 200 && g.stepOf() === 'q1/1'; i++) {
    const c = s.enemies.find(e => e.tag === 'q1' && !e.gone && !e.dead);
    if (c) g.rideTo(c.x, c.z, 2, 3);
    g.wait(0.1);   // time always passes, even when the rider is already on top of one
  }
  check(`${label}: compies chased out of town`, g.stepOf() === 'q1/2', `${g.stepOf()} dlg ${s.dialogue?.id} rider ${p.x.toFixed(0)},${p.z.toFixed(0)} compies ${s.enemies.filter(e => e.tag === 'q1').map(e => `${e.x.toFixed(0)},${e.z.toFixed(0)}${e.gone ? 'gone' : ''} sc${e.scaredT}`).join(' ')}`);
  g.talkTo('winifred');
  check(`${label}: quest 1 pays and raises standing`, s.story.done.includes('q1') && p.money === 90 && s.story.standing === 5, `$${p.money}, standing ${s.story.standing}`);
  // quest 2
  g.talkTo('mara');
  check(`${label}: quest 2 asks for two longhorns`, g.stepOf() === 'q2/1', g.stepOf());
  g.penOne(); g.penOne();
  check(`${label}: two longhorns penned`, g.stepOf() === 'q2/2', `${g.stepOf()} count ${s.story.count}`);
  g.talkTo('mara');
  check(`${label}: Mara joins the posse`, s.mates.length === 1 && s.mates[0].id === 'mara' && s.story.done.includes('q2'));
  // quest 3
  g.talkTo('ros');
  check(`${label}: the collector shows up`, !s.npcs.find(n => n.id === 'collector').hidden && g.stepOf() === 'q3/1', g.stepOf());
  const before = p.money;
  g.talkTo('collector');
  const paid = choices.q3_collector === undefined || choices.q3_collector === 0;
  check(`${label}: collector choice is remembered`, s.story.flags.collector === (paid ? 'paid' : choices.q3_collector === 1 ? 'refused' : 'stalled') && p.money === before - (paid ? 50 : 0), JSON.stringify(s.story.flags));
  // quest 4
  g.talkTo('mara');
  check(`${label}: quest 4 sends the posse to the den`, g.stepOf() === 'q4/1', g.stepOf());
  g.rideTo(PLACES_OF_NOTE.den.x, PLACES_OF_NOTE.den.z, 30);
  g.answer();
  if (s.story.flags.den === 'driven') {
    g.wait(6);   // let the holler cool down from earlier herding, well back from the pack
    g.rideTo(PLACES_OF_NOTE.den.x, PLACES_OF_NOTE.den.z, 20);
    g.step({ actions: ['holler'] });
    check(`${label}: the pack is driven off`, s.enemies.every(e => e.tag !== 'den'), g.stepOf());
  } else check(`${label}: the den is cleared`, g.killTagged('den'), g.stepOf());
  g.talkTo('mara');
  check(`${label}: quest 4 done`, s.story.done.includes('q4'), g.stepOf());
  // quest 5
  g.talkTo('doc');
  check(`${label}: herbs and spitters appear in the woods`, s.pickups.length === 3 && s.enemies.filter(e => e.kind === 'dilo' && e.tag.startsWith('q5')).length === 3);
  for (const k of [...s.pickups]) g.rideTo(k.x, k.z, 2);
  check(`${label}: three herbs gathered`, g.stepOf() === 'q5/2', `${g.stepOf()} count ${s.story.count}`);
  g.talkTo('nettle'); g.talkTo('doc');
  check(`${label}: quest 5 done, Nettle choice remembered`, s.story.done.includes('q5') && !!s.story.flags.nettle, JSON.stringify(s.story.flags));
  // quest 6
  g.talkTo('mara');
  const camp = PLACES_OF_NOTE.rustlers;
  check(`${label}: the herd is held at the rustler camp`, s.animals.filter(a => a.herd === 0 && a.held).length === 6);
  check(`${label}: rustlers guard it`, s.enemies.filter(e => e.tag.startsWith('q6')).length === (s.story.flags.collector === 'refused' ? 6 : 4));
  const pre = `from ${p.x.toFixed(0)},${p.z.toFixed(0)} hp ${p.hp.toFixed(0)} dlg ${s.dialogue?.id} roped ${!!s.herd.roped}`;
  g.rideTo(camp.x, camp.z, 45);
  const at = `${pre} -> ${p.x.toFixed(0)},${p.z.toFixed(0)} hp ${p.hp.toFixed(0)} dead ${p.dead} dlg ${s.dialogue?.id}`;
  g.answer();
  if (s.story.flags.rustlers === 'stampeded') { g.rideTo(camp.x, camp.z, 22); g.step({ actions: ['holler'] }); }
  else g.killTagged('q6');
  check(`${label}: the herd is loose`, s.animals.filter(a => a.herd === 0 && a.held).length === 0 && g.stepOf() === 'q6/4', `${g.stepOf()} ${at}`);
  for (let i = 0; i < 6 && g.stepOf() === 'q6/4'; i++) g.penOne(0);
  check(`${label}: three of Mara's herd penned`, g.stepOf() === 'q6/5', `${g.stepOf()} count ${s.story.count}`);
  g.talkTo('mara');
  check(`${label}: act 1 complete, Bulwark earned`, s.story.done.length === 6 && p.mounts[1] === true && s.story.standing >= 45, `standing ${s.story.standing}`);
  check(`${label}: quest animals are gone`, s.enemies.every(e => !e.tag), s.enemies.filter(e => e.tag).map(e => e.tag).join(','));
  return g;
}

act1('first choices', {});
const g = act1('other choices', { q3_collector: 1, q4_den: 1, q5_done: 1, q6_camp: 1 });

{ // saving in the middle of a quest
  const h = play({});
  h.talkTo('ros');
  const save = JSON.parse(JSON.stringify(h.sim.snapshot())), again = createSim();
  check('a save in the middle of quest 1 loads', again.restore(save) && again.state.story.step === 1 && again.state.enemies.filter(e => e.tag === 'q1').length === 6);
  const end = JSON.parse(JSON.stringify(g.sim.snapshot())), late = createSim();
  check('a finished act 1 loads with Mara and the choices', late.restore(end) && late.state.mates.length === 1 && late.state.story.flags.den === 'driven' && late.state.story.done.length === 6);
  check('a tampered story is cleaned', createSim().restore({ ...end, story: { quest: 99, step: -4, flags: { '<img>': 'x', ok: '<b>' }, standing: 1e9, done: ['nope'], npcs: 'x' } }));
}
{ // posse orders
  const h = play({});
  h.sim.posse.join('mara');
  h.p.x = 60; h.p.z = -60;
  h.wait(8);   // long enough for her to deal with a raptor on the way
  const m = h.s.mates[0];
  check('Mara follows the rider', Math.hypot(m.x - h.p.x, m.z - h.p.z) < 14, `distance ${Math.hypot(m.x - h.p.x, m.z - h.p.z).toFixed(1)}`);
  h.step({ actions: ['order'] });
  check('G steps to the next order', h.s.order === 'hold');
  h.sim.command({ type: 'order', id: 'herd' });
  const before = h.sim.herding.counts().total;
  h.wait(150);
  check('"Help the herd" pens longhorns without the rider', h.sim.herding.counts().total > before, `penned ${h.sim.herding.counts().total - before}`);
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
