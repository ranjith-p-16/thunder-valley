// Plays act 2 (quests 7 to 12) and then rules the town, with a scripted rider:  node tests/act2.test.js
import { createSim, STEP } from '../src/sim/sim.js';
import { QUESTS, PLACES_OF_NOTE, ENDINGS } from '../src/data/story.js';
import { TOWN_RULE, DAY } from '../src/data/content.js';
import { heightAt } from '../src/sim/terrain.js';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; };

function play(choices, standing = 50, quest = 6) {
  const sim = createSim(), s = sim.state, p = s.player;
  p.level = 25; sim.economy.recalc(); p.hp = p.maxHp;   // a strong rider: this tests the story and the town, not the fights
  s.story.quest = quest; s.story.step = 0; s.story.standing = standing; sim.posse.join('mara', true); sim.story.enter();
  const idle = { mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [] };
  const step = (inp = {}) => sim.step({ ...idle, ...inp });
  const wait = (sec) => { for (let i = 0; i < sec / STEP; i++) step(); };
  const rideTo = (x, z, stop = 3, max = 90) => {
    let lastX = p.x, lastZ = p.z, side = 0, sideT = 0, turn = 1;
    for (let i = 0; i < max / STEP && Math.hypot(p.x - x, p.z - z) > stop && !s.dialogue; i++) {
      const dx = x - p.x, dz = z - p.z;
      if (sideT > 0) { sideT -= STEP; step({ mx: -dz * side + dx * 0.3, mz: dx * side + dz * 0.3, sprint: true }); continue; }
      step({ mx: dx, mz: dz, sprint: true });
      if (i % 30 === 29) { if (Math.hypot(p.x - lastX, p.z - lastZ) < 1.5) { side = turn; turn = -turn; sideT = 0.9; } lastX = p.x; lastZ = p.z; }
    }
  };
  const answer = () => { for (let n = 0; s.dialogue && n < 12; n++) sim.command({ type: 'say', i: choices[s.dialogue.id] ?? 0 }); };
  const talkTo = (id) => {
    for (let i = 0; i < 400 && p.dead; i++) step();   // a thrown rider gets up first
    for (let tries = 0; tries < 5; tries++) {
      const who = sim.story.whereIs(id);
      if (!who) return false;
      rideTo(who.x, who.z, 5);
      sim.command({ type: 'talk' });
      if (process.env.DEBUG_TALK && s.dialogue) console.log(`  [talk ${id}] step ${stepOf()} opened ${s.dialogue.id} forStep ${s.dialogue.forStep} said ${JSON.stringify(s.story.said)}`);
      if (s.dialogue) { if (tries) console.log(`  (talk to ${id} needed ${tries + 1} tries; hint was "${s.hint}")`); answer(); return true; }
      wait(1);
    }
    console.log(`  (could not talk to ${id}: step ${stepOf()} hint "${s.hint}" dead ${p.dead} onFoot ${p.onFoot})`);
    return false;
  };
  const aimAt = (t) => {
    const oy = heightAt(p.x, p.z) + 4, dx = t.x - p.x, dy = heightAt(t.x, t.z) + 1.6 - oy, dz = t.z - p.z, len = Math.hypot(dx, dy, dz);
    return { ox: p.x, oy, oz: p.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: Math.atan2(dx, dz) };
  };
  const left = (tag) => s.enemies.filter(e => e.tag.startsWith(tag) && !e.dead && !e.gone);
  // Fights whatever carries the tag. Stops when `done` says so (default: none left) or the time is up.
  const fight = (tag, max = 150, done = () => !left(tag).length) => {
    for (let i = 0; i < max / STEP && !done(); i++) {
      const t = left(tag).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (!t) { step(); continue; }
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (process.env.TRACE && t.state === 'return' && !t.wasRet) console.log(`  RETURN at t=${Math.round(i * STEP)}s homeDist ${Math.hypot(t.x - t.home.x, t.z - t.home.z).toFixed(0)} d ${d.toFixed(0)} provoked ${t.provokedT.toFixed(1)} rider ${p.x.toFixed(0)},${p.z.toFixed(0)} dead ${p.dead} townD ${Math.hypot(t.x, t.z + 10).toFixed(0)}`);
      t.wasRet = t.state === 'return';
      if (process.env.TRACE && i % 1800 === 0) console.log(`  trace ${tag} t=${Math.round(i * STEP)}s ${t.kind} hp ${Math.round(t.hp)}/${t.maxHp} state ${t.state} d ${d.toFixed(0)} | rider hp ${Math.round(p.hp)} dead ${p.dead} left ${left(tag).length}`);
      // close in when far, back away firing when a biter gets near, otherwise stand and shoot
      step(d > 20 ? { mx: t.x - p.x, mz: t.z - p.z, sprint: true } : d < 12 && t.def.range < 12 ? (Math.hypot(p.x, p.z + 10) < 80 ? { mx: -(p.z - t.z), mz: p.x - t.x, fire: true, aim: aimAt(t) } : { mx: p.x - t.x, mz: p.z - t.z, fire: true, aim: aimAt(t) }) : { fire: true, aim: aimAt(t) });
    }
    return done();
  };
  const stepOf = () => `${QUESTS[s.story.quest]?.id ?? 'end'}/${s.story.step}`;
  // shoots one animal (closing in when far) until `done`
  const shoot = (t, max, done) => {
    for (let i = 0; i < max / STEP && !done(); i++) {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      step(d > 22 ? { mx: t.x - p.x, mz: t.z - p.z, sprint: true } : { fire: true, aim: aimAt(t) });
    }
    return done();
  };
  return { sim, s, p, step, wait, rideTo, talkTo, answer, fight, shoot, left, stepOf };
}

function act2(label, choices) {
  const g = play(choices), { s } = g, W = PLACES_OF_NOTE.wagons, T = PLACES_OF_NOTE.toll;
  g.talkTo('ros');
  check(`${label}: quest 7 puts guards on the wagons`, g.stepOf() === 'q7/1' && g.left('q7').length === 5, g.stepOf());
  g.rideTo(W.x, W.z, 30); g.fight('q7');
  g.wait(0.2); g.rideTo(W.x, W.z, 8); g.answer();
  check(`${label}: the wagons choice is remembered`, s.story.done.includes('q7') && (s.story.flags.wagons === 'burned' || (s.story.flags.wagons === 'taken' && s.town.supplies === 80)), `${g.stepOf()} ${JSON.stringify(s.story.flags)} stores ${s.town.supplies}`);
  g.talkTo('ros'); g.talkTo('tobe');
  check(`${label}: Tobe joins on a Platewalker`, s.mates.some(m => m.id === 'tobe' && m.mount === 5) && !!s.story.flags.tobe && s.story.done.includes('q8'), g.stepOf());
  g.talkTo('tobe'); g.talkTo('pell');
  if (s.story.flags.pell === 'fought') { g.wait(0.2); check(`${label}: Deacon Pell is beaten`, g.fight('q9', 240), g.stepOf()); }
  g.wait(0.2);
  check(`${label}: quest 9 done`, s.story.done.includes('q9') && !!s.story.flags.pell, `${g.stepOf()} ${s.story.flags.pell}`);
  g.talkTo('mara'); g.rideTo(70, 214, 5); g.wait(0.2); g.talkTo('june');
  check(`${label}: June joins`, s.mates.some(m => m.id === 'june') && s.story.done.includes('q10'), g.stepOf());
  g.talkTo('june');
  check(`${label}: Hester blocks the mesa road`, s.enemies.some(e => e.kind === 'hester') && g.stepOf() === 'q11/1', g.stepOf());
  g.rideTo(T.x, T.z, 28); g.fight('q11', 300);
  g.wait(0.2); g.talkTo('tobe');
  check(`${label}: quest 11 done, Standing is enough for the gate`, s.story.done.includes('q11') && s.story.standing >= 60, `${g.stepOf()} standing ${s.story.standing}`);
  g.wait(0.2);
  g.talkTo('ros');
  check(`${label}: the stand in the square begins and the town's peace is off`, g.stepOf() === 'q12/2' && s.siege === true, g.stepOf());
  g.rideTo(0, -10, 4);
  g.fight('hold', 420, () => g.stepOf() !== 'q12/2');
  check(`${label}: the square is held for three minutes and the town changes hands`, s.town.owned === true && g.stepOf() === 'q12/3' && s.siege === false && !g.left('hold').length, `${g.stepOf()} count ${s.story.count.toFixed(0)} dead ${g.p.dead}`);
  g.talkTo('pike');
  check(`${label}: act 2 complete with the mayor decided`, s.story.done.includes('q12') && !!s.story.flags.mayor && g.stepOf() === 'q13/0', `${g.stepOf()} ${JSON.stringify(s.story.flags)}`);
  return g;
}

act2('first choices', {});
const g = act2('other choices', { q7_wagons: 1, q8_tobe: 2, q9_pell: 1, q12_done: 1 });

{ // ruling the town
  const { sim, s, p } = g, t = s.town, cmd = (c) => sim.command(c);
  check('the town starts with a ledger, and the taken wagons are in its stores', t.owned && t.level === 1 && t.treasury >= 200 && t.supplies === 80, `treasury ${t.treasury} stores ${t.supplies}`);
  p.x = 0; p.z = -10; p.money = 3000; p.res.meat = 10; p.res.hide = 5;
  cmd({ type: 'townSupply' });
  check('meat and hides fill the stores', t.supplies === 100 && p.res.meat === 0 && p.res.hide === 0, `stores ${t.supplies}`);
  cmd({ type: 'townUpgrade' });
  check('no upgrade without the money', t.level === 1);
  for (let i = 0; i < 15; i++) cmd({ type: 'townPay' });
  const price = sim.economy.price(100);
  cmd({ type: 'townUpgrade' });
  check('level 2 costs $1500 and lowers shop prices', t.level === 2 && sim.economy.price(100) < price, `level ${t.level} treasury ${t.treasury}`);
  const before = t.treasury, stores = t.supplies;
  s.clock += DAY.length; g.wait(0.1);
  check('a new day brings taxes and uses stores', t.treasury > before && t.supplies < stores, `+$${t.treasury - before}`);
  // a raid, won
  t.raidIn = TOWN_RULE.warning + 1; g.wait(2);
  check('the bell warns two minutes ahead', t.warned && !!sim.town.status());
  t.raidIn = 0.1; g.wait(0.5);
  check('raiders arrive and the town is under siege', !!t.raid && s.siege && g.left('raid').length === TOWN_RULE.raiders + 2 * TOWN_RULE.raidersPerLevel, `raiders ${g.left('raid').length}`);
  const tr = t.treasury;
  g.fight('raid', 300, () => !t.raid);
  check('beating the raid pays the treasury and lifts the siege', !t.raid && !s.siege && t.raidsWon === 1 && t.treasury === tr + TOWN_RULE.win.treasury, `won ${t.raidsWon} lost ${t.raidsLost}`);
  // a raid, lost: the rider is far away and the raiders stand in the square
  t.raidIn = 0.1; g.wait(0.5); p.x = 250; p.z = 250; sim.command({ type: 'order', id: 'hold' });
  for (const m of s.mates) { m.x = 250; m.z = 240; }
  for (const e of s.enemies) if (e.tag === 'raid') { e.x = 0; e.z = -10; e.heldT = 1e6; }
  const tr2 = t.treasury;
  g.wait(150);
  check('an undefended raid loots the town', !t.raid && t.raidsLost === 1 && t.treasury < tr2, `lost ${t.raidsLost} treasury ${tr2} -> ${t.treasury}`);
  // save and load
  const save = JSON.parse(JSON.stringify(sim.snapshot())), again = createSim();
  check('the town, the posse and act 2 survive a save', again.restore(save) && again.state.town.owned && again.state.town.level === 2 && again.state.mates.length === 3 && again.state.story.done.includes('q12') && again.state.town.treasury === t.treasury);
  check('a tampered town ledger is cleaned', createSim().restore({ ...save, town: { owned: true, level: 99, treasury: -5, supplies: 'x', raidIn: null } }));
}
{ // dying in the square starts the stand over; saving mid-stand is safe
  const h = play({}, 80);
  h.s.story.quest = 11; h.s.story.step = 2; h.sim.story.enter();
  h.p.x = 0; h.p.z = -10; h.wait(20);
  const c = h.s.story.count;
  const save = JSON.parse(JSON.stringify(h.sim.snapshot())), again = createSim();
  check('a save taken during the stand loads into the stand, from the start', again.restore(save) && again.state.siege === true && again.state.story.count === 0);
  h.s.mates.length = 0;   // nobody to save the rider this time
  for (let i = 0; i < 3000 && !h.left('hold').length; i++) h.step();   // wait for the next wave if the posse cleared the first
  h.p.hp = 0.5; for (const e of h.s.enemies) if (e.tag === 'hold') { e.x = h.p.x + 2; e.z = h.p.z; e.cd = 0; }
  h.wait(2.5);
  check('the stand counts up, and falling resets it', c > 15 && h.s.story.count < 3 && h.p.dead, `count ${c.toFixed(0)} -> ${h.s.story.count.toFixed(0)}`);
}
// ---- act 3: quests 13 to 18 and the endings ----
function act3(label, choices, nettle) {
  const g = play(choices, 80, 12), { sim, s, p } = g, K = PLACES_OF_NOTE.kettles, H = PLACES_OF_NOTE.hollow;
  sim.posse.join('tobe', true); sim.posse.join('june', true); sim.town.claim();
  s.story.flags.nettle = nettle;
  g.talkTo('ros');
  check(`${label}: quest 13 is a stand against stampeding predators`, g.stepOf() === 'q13/1' && s.siege, g.stepOf());
  g.rideTo(0, -10, 4); g.fight('hold', 300, () => g.stepOf() !== 'q13/1');
  g.talkTo('doc');
  check(`${label}: the burn marks point south`, s.story.done.includes('q13') && !s.siege, g.stepOf());
  g.talkTo('june'); g.rideTo(K.x, K.z, 30); g.fight('q14', 300);
  g.wait(0.2); g.rideTo(K.x, K.z, 6); g.answer();
  check(`${label}: the Kettle twins fall and the eggs are decided`, s.story.done.includes('q14') && !!s.story.flags.eggs, `${g.stepOf()} ${s.story.flags.eggs}`);
  g.talkTo('tobe'); const money = p.money, standing = s.story.standing; g.talkTo('nettle');
  check(`${label}: Nettle tells what she saw${nettle === 'secret' ? ', freely' : ', at a price'}`, s.story.done.includes('q15') && (nettle === 'secret' || p.money < money || s.story.standing < standing), g.stepOf());
  g.talkTo('june');
  check(`${label}: fire pits and their guards are set out`, s.pickups.filter(k => k.tag === 'firepit').length === 3 && g.left('q16').length === (s.story.flags.fires === 'assault' ? 6 : 2), `guards ${g.left('q16').length}`);
  for (const [x, z] of PLACES_OF_NOTE.firepits) { g.rideTo(x, z, 2, 120); g.wait(0.1); }
  check(`${label}: the fires are out`, s.story.done.includes('q16'), `${g.stepOf()} count ${s.story.count}`);
  const rex = s.rex;
  g.talkTo('tobe');
  if (process.env.DEBUG_TALK) console.log(`  [hollow] after tobe: step ${g.stepOf()} rex dead ${rex.dead} hp ${rex.hp.toFixed(0)} dist ${Math.hypot(H.x - p.x, H.z - p.z).toFixed(0)} flags ${JSON.stringify(s.story.flags)}`);
  for (let i = 0; i < 20 && g.stepOf() === 'q17/1' && !rex.dead; i++) { g.rideTo(H.x, H.z, 40, 8); g.wait(0.1); g.answer(); }   // time has to pass for the arrival to be noticed
  if (process.env.DEBUG_TALK) console.log(`  [hollow] after ride: step ${g.stepOf()} rex dead ${rex.dead} dist ${Math.hypot(H.x - p.x, H.z - p.z).toFixed(0)} dlg ${s.dialogue?.id} flags ${JSON.stringify(s.story.flags)}`);
  if (s.story.flags.rex === 'sealed') {
    g.shoot(rex, 400, () => rex.hp <= rex.maxHp * 0.45 || rex.dead);
    check(`${label}: the Alpha is worn down, not killed`, !rex.dead && rex.hp <= rex.maxHp * 0.5, `hp ${rex.hp.toFixed(0)}`);
    for (let i = 0; i < 40 && g.stepOf() === 'q17/3'; i++) { g.rideTo(rex.x, rex.z, 25, 6); s.herd.hollerCd = 0; if (rex.hp > rex.maxHp * 0.5) g.shoot(rex, 120, () => rex.hp <= rex.maxHp * 0.45 || rex.dead); const ev = g.step({ actions: ['holler'] }); if (process.env.TRACE) console.log('  holler', i, ev.filter(e => e.type === 'toast').map(e => e.text).join(' / '), 'rex hp', Math.round(rex.hp), rex.state, 'd', Math.hypot(rex.x - p.x, rex.z - p.z).toFixed(0), 'dead', p.dead, 'cd', s.herd.hollerCd.toFixed(1)); }
    check(`${label}: a holler drives it back and it is out of the fight`, g.stepOf() === 'q17/4' && !rex.dead, g.stepOf());
  } else {
    g.shoot(rex, 600, () => rex.dead);
    check(`${label}: the Alpha Rex is killed`, rex.dead, `hp ${rex.hp.toFixed(0)}`);
  }
  g.wait(0.3); g.talkTo('mara');
  { const m = s.mates.find(k => k.id === 'mara'); check(`${label}: the Tyrant egg is the reward either way`, s.story.done.includes('q17') && p.mounts[2] === true, `${g.stepOf()} dead ${p.dead} dlg ${s.dialogue?.id} mara ${m ? Math.hypot(m.x - p.x, m.z - p.z).toFixed(0) : 'none'} order ${s.order} hint ${s.hint}`); }
  if (s.story.flags.rex === 'sealed') { const hp = rex.hp; g.shoot(rex, 3, () => false); check(`${label}: the sealed Alpha cannot be hurt and does not attack`, rex.hp >= hp && rex.state !== 'chase', `hp ${hp.toFixed(0)} -> ${rex.hp.toFixed(0)} state ${rex.state} done ${s.story.done.includes('q17')}`); }
  g.talkTo('ros'); g.rideTo(126, -82, 30); g.fight('q18', 1800);
  g.wait(0.3); g.talkTo('blackthorn');
  const end = `${s.story.flags.rex}|${s.story.flags.blackthorn}`;
  check(`${label}: the story ends (${end})`, s.story.done.includes('q18') && !QUESTS[s.story.quest] && !!ENDINGS[end], `${g.stepOf()} ${end}`);
  const save = JSON.parse(JSON.stringify(sim.snapshot())), again = createSim();
  check(`${label}: the finished game loads`, again.restore(save) && again.state.story.done.includes('q18') && again.state.story.flags.rex === s.story.flags.rex);
  return g;
}
act3('kill and jail', {}, 'secret');
const e3 = act3('seal and exile', { q14_camp: 1, q16_june: 1, q17_hollow: 1, q18_blackthorn: 1 }, 'revealed');
{ // town levels 4 and 5, the tax law, the blood moon
  const { sim, s, p } = e3, t = s.town;
  p.x = 0; p.z = -10; t.level = 3; t.treasury = 40000; t.supplies = 100;
  sim.command({ type: 'townLaw', tax: 'high' });
  check('no tax law before the town hall', t.law === 'fair');
  sim.command({ type: 'townUpgrade' }); sim.command({ type: 'townUpgrade' });
  check('levels 4 and 5 can be bought', t.level === 5 && t.treasury === 40000 - 9000 - 20000, `level ${t.level}`);
  sim.command({ type: 'townLaw', tax: 'high' });
  const before = t.treasury, morale = t.morale;
  s.clock += DAY.length; e3.wait(0.1);
  check('high taxes bring in more and cost morale', t.law === 'high' && t.treasury - before >= 600 && t.morale < morale, `+$${t.treasury - before} morale ${morale} -> ${t.morale}`);
  let seen = false;
  for (let d = 0; d < 6 && !seen; d++) { s.clock = (d + 0.9 - DAY.start) * DAY.length; if (sim.bloodMoon()) seen = true; }
  check('a blood moon comes round', seen);
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
