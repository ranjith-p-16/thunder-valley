// The three new animal kinds: compies (do they always leave, and only when chased?), dilophosaurs, rustlers (lethality to a low-level rider).
import { createSim, bot, STEP, idle, heightAt } from './30-lib.js';
import { TOWN } from '../../src/data/items.js';
import { PLACES_OF_NOTE } from '../../src/data/story.js';

const log = (...a) => console.log(...a);
const seeds = [99, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const startQ1 = (seed) => { const g = bot(createSim(seed), {}, { tough: false }); g.p.x = -13; g.p.z = -2; g.sim.command({ type: 'talk' }); g.answer(); return g; };
const stats = (a) => `min ${Math.min(...a).toFixed(0)} median ${[...a].sort((x, y) => x - y)[a.length >> 1].toFixed(0)} max ${Math.max(...a).toFixed(0)}`;

{ log('--- A. compies when the rider never goes near them (parked beside Ros, 30 game-minutes)');
  const times = [], left = [];
  for (const seed of seeds) {
    const g = startQ1(seed); let done = null, firstGone = null;
    for (let t = 0; t < 1800 && done === null; t += STEP) {
      g.step();
      if (firstGone === null && g.s.enemies.filter(e => e.tag === 'q1').length < 6) firstGone = t;
      if (g.stepOf() !== 'q1/1') done = t;
    }
    times.push(done ?? Infinity); left.push(g.s.enemies.filter(e => e.tag === 'q1').length);
    log(`  seed ${seed}: first compy left by itself at ${firstGone?.toFixed(0) ?? '-'} s; quest step ${done === null ? `NOT done after 1800 s (${left.at(-1)} left)` : `completed WITHOUT the rider at ${done.toFixed(0)} s`}`);
  }
}

{ log('--- B. compies when chased (bot rides at the nearest one)');
  const times = []; let stuck = 0;
  for (const seed of seeds) {
    const g = startQ1(seed); const t0 = g.s.clock; const scaredAt = new Map();
    for (let i = 0; i < 400 && g.stepOf() === 'q1/1'; i++) {
      const c = g.s.enemies.find(e => e.tag === 'q1' && !e.gone && !e.dead);
      if (c) g.rideTo(c.x, c.z, 2, 1); else g.wait(0.1);
      g.step();
      for (const e of g.s.enemies) if (e.tag === 'q1' && e.scaredT > 0) { if (!scaredAt.has(e.id)) scaredAt.set(e.id, g.s.clock); else if (g.s.clock - scaredAt.get(e.id) > 15) { stuck++; log(`   seed ${seed}: ${e.id} scared for ${(g.s.clock - scaredAt.get(e.id)).toFixed(0)} s and still at ${e.x.toFixed(1)},${e.z.toFixed(1)}`); scaredAt.set(e.id, Infinity); } }
    }
    times.push(g.stepOf() === 'q1/1' ? Infinity : g.s.clock - t0);
  }
  log(`  time to clear all six: ${stats(times)} s; compies still in town 15 s after being scared: ${stuck}`);
}

{ log('--- C. compies: can they be hurt? (rider outside town shooting in; Mara on attack order)');
  const g = startQ1(99), { sim, s, p } = g; sim.posse.join('mara'); sim.command({ type: 'order', id: 'attack' });
  // chase them to the edge, then shoot from outside
  p.x = 18; p.z = -1; g.wait(0.2);
  let kills = 0, shots = 0, thrown = '';
  try {
    for (let t = 0; t < 20; t += STEP) {
      const c = s.enemies.filter(e => e.tag === 'q1' && !e.gone && !e.dead)[0]; if (!c) break;
      p.x = c.x + (c.x - TOWN.x) * 0.2; p.z = c.z + (c.z - TOWN.z) * 0.2;   // just outside of it
      const ev = g.step({ fire: true, aim: g.aimAt(c) });
      for (const e of ev) { if (e.type === 'kill') kills++; if (e.type === 'mateShot') shots++; }
    }
  } catch (e) { thrown = e.stack.split('\n').slice(0, 3).join(' | '); }
  log(`  compies killed by the rider ${kills}; Mara shots ${shots}; step ${g.stepOf()}; loot piles ${s.loot.length} ${thrown}`);
}

// ---- fights at low level with starting gear ----
function fightSetup(level, quest, flags, seed = 99, mara = true) {
  const g = bot(createSim(seed), { q6_camp: 0 }, { tough: false }), { sim, s, p } = g;
  p.level = level; sim.economy.recalc(); p.hp = p.maxHp;
  Object.assign(s.story.flags, flags); s.story.quest = quest; s.story.step = 1;
  if (mara) sim.posse.join('mara');
  sim.story.enter();
  return g;
}
// policy: 'stand' = ride to 22 m and shoot standing still; 'strafe' = same but walking sideways while firing
function fight(g, tag, policy, max = 180) {
  const { s, p } = g; let deaths = 0, was = false, minHp = p.hp, blind = 0, t = 0, dry = 0, close = 22;
  for (; t < max; t += STEP) {
    const e = s.enemies.filter(k => k.tag.startsWith(tag) && !k.dead && !k.gone).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (!e) break;
    const d = Math.hypot(e.x - p.x, e.z - p.z), dx = e.x - p.x, dz = e.z - p.z;
    let ev;
    if (d > close) ev = g.step({ mx: dx, mz: dz, sprint: true });
    else if (policy === 'strafe') ev = g.step({ mx: -dz, mz: dx, fire: true, aim: g.aimAt(e) });
    else ev = g.step({ fire: true, aim: g.aimAt(e) });
    if (ev.some(k => k.type === 'hit')) { dry = 0; close = 22; } else if (d <= close && ++dry > 150) { dry = 0; close = Math.max(6, close - 6); }
    if (p.dead && !was) deaths++;
    was = p.dead; if (!p.dead) minHp = Math.min(minHp, p.hp); if (p.blindT > 0) blind += STEP;
    if (deaths) break;
  }
  const left = s.enemies.filter(k => k.tag.startsWith(tag) && !k.dead && !k.gone).length;
  return { died: deaths > 0, t, minHp, left, blind };
}
{ log('--- D. rustlers (quest 6, "fight"), starting revolver, by rider level; 8 seeds each');
  for (const [name, flags] of [['4 rustlers', { collector: 'paid', rustlers: 'fought' }], ['6 rustlers (collector refused)', { collector: 'refused', rustlers: 'fought' }]]) {
    for (const mara of [true, false]) for (const policy of ['stand', 'strafe']) {
      const row = [];
      for (const level of [1, 2, 3, 4]) {
        let died = 0, hp = 0, tt = 0; const n = 8;
        for (let k = 0; k < n; k++) {
          const g = fightSetup(level, 5, flags, 100 + k, mara);
          g.p.x = 185 - 60; g.p.z = 105; if (mara) { g.s.mates[0].x = g.p.x - 5; g.s.mates[0].z = g.p.z; }
          g.s.story.step = 2; g.sim.story.enter();
          const r = fight(g, 'q6', policy);
          if (r.died || r.left) died++; else { hp += r.minHp / g.p.maxHp; tt += r.t; }
        }
        row.push(`L${level}: lost ${died}/${n}${died < n ? `, won with ${(100 * hp / (n - died)).toFixed(0)}% hp left in ${(tt / (n - died)).toFixed(0)} s` : ''}`);
      }
      log(`  ${name}, ${mara ? 'with Mara' : 'alone'}, ${policy}: ${row.join(' | ')}`);
    }
  }
}
{ log('--- E. rustlers, "stampede" branch: ride from the 55 m ring to the 30 m ring and holler, level 1');
  for (const flags of [{ collector: 'paid', rustlers: 'stampeded' }, { collector: 'refused', rustlers: 'stampeded' }]) {
    let died = 0, hpSum = 0, after = 0; const n = 8;
    for (let k = 0; k < n; k++) {
      const g = fightSetup(1, 5, flags, 200 + k, true), { s, p } = g;
      p.x = 185 - 54; p.z = 105; s.story.step = 3; g.sim.story.enter();
      g.rideTo(185, 105, 28, 20); g.step({ actions: ['holler'] });
      const hpAt = p.hp, ok = g.stepOf() === 'q6/4';
      // then ride away west for 20 s
      for (let t = 0; t < 20; t += STEP) g.step({ mx: -1, mz: -0.5, sprint: true });
      if (p.dead || !ok) died++; else { hpSum += hpAt / p.maxHp; after += p.hp / p.maxHp; }
    }
    log(`  ${flags.collector}: died or failed ${died}/${n}; hp at the holler ${(100 * hpSum / (n - died || 1)).toFixed(0)}%, 20 s later ${(100 * after / (n - died || 1)).toFixed(0)}%`);
  }
}
{ log('--- F. rustlers: leash, heal, and shooting them from beyond their reach');
  const g = fightSetup(1, 5, { collector: 'paid', rustlers: 'fought' }, 99, false), { s, p } = g;
  s.story.step = 2; g.sim.story.enter();
  // stand 60 m out (revolver reach 70, rustler reach 24, aggro 46) and shoot; back away at a walk when they come
  p.x = 185 - 62; p.z = 105; let hurt = 0, kills = 0, thuds = 0, t = 0;
  for (; t < 300; t += STEP) {
    const e = s.enemies.filter(k => k.tag.startsWith('q6') && !k.dead).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (!e) break;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    const away = d < 40 ? { mx: p.x - e.x, mz: p.z - e.z } : d > 62 ? { mx: e.x - p.x, mz: e.z - p.z } : {};
    const ev = g.step({ ...away, fire: true, aim: g.aimAt(e) });
    for (const k of ev) { if (k.type === 'hurt') hurt++; if (k.type === 'kill') kills++; }
  }
  log(`  kiting at 40-62 m at a walk, level 1, alone: killed ${kills}/4 in ${t.toFixed(0)} s, rider hit ${hurt} times, hp ${p.hp.toFixed(0)}/${p.maxHp}, dead ${p.dead}, ended ${Math.hypot(p.x - 185, p.z - 105).toFixed(0)} m from camp`);
  // heal on return
  const h = fightSetup(1, 5, { collector: 'paid', rustlers: 'fought' }, 99, false); h.s.story.step = 2; h.sim.story.enter();
  const e = h.s.enemies.find(k => k.tag === 'q6'); e.hp = 10; e.state = 'return'; e.x += 30;
  h.wait(4); log(`  a rustler at 10 hp sent home: ${e.hp.toFixed(0)} hp after 4 s (state ${e.state})`);
}
{ log('--- G. dilophosaurs (quest 5), level 1, starting gear: gather the three herbs');
  for (const policy of ['ride straight through', 'fight each spitter first']) {
    let died = 0, hp = 0, blind = 0, tt = 0; const n = 8;
    for (let k = 0; k < n; k++) {
      const g = fightSetup(1, 4, {}, 300 + k, true), { s, p } = g;
      p.x = -150; p.z = 0; s.mates[0].x = -146; s.mates[0].z = 0;
      const t0 = s.clock; let b = 0, dead = false;
      const tick = () => { if (p.blindT > 0) b += STEP; if (p.dead) dead = true; };
      if (policy !== 'ride straight through') { const r = fight(g, 'q5', 'stand', 240); b += r.blind; dead = r.died; }
      for (const pk of [...s.pickups]) g.rideTo(pk.x, pk.z, 2, 60, tick);
      if (dead || g.stepOf() !== 'q5/2') died++; else { hp += p.hp / p.maxHp; blind += b / (s.clock - t0); tt += s.clock - t0; }
    }
    log(`  ${policy}: died or failed ${died}/${n}; hp left ${(100 * hp / (n - died || 1)).toFixed(0)}%; blinded ${(100 * blind / (n - died || 1)).toFixed(0)}% of the time; ${(tt / (n - died || 1)).toFixed(0)} s`);
  }
  // one spitter, rider standing still at 19 m for 60 s
  const g = fightSetup(1, 4, {}, 99, false), { s, p } = g; const d = s.enemies.find(e => e.kind === 'dilo');
  p.x = d.x + 19; p.z = d.z; let b = 0, hits = 0;
  for (let t = 0; t < 60; t += STEP) { const ev = g.step(); if (p.blindT > 0) b += STEP; hits += ev.filter(e => e.type === 'hurt').length; }
  log(`  standing 19 m from one spitter for 60 s: hit ${hits} times, blind ${(100 * b / 60).toFixed(0)}% of the time, hp ${p.hp.toFixed(0)}/${p.maxHp}`);
  // leash: lead one toward town
  const h = fightSetup(15, 4, {}, 99, false); const e = h.s.enemies.find(k => k.kind === 'dilo'); h.p.x = e.x + 25; h.p.z = e.z;
  let far = 0; for (let t = 0; t < 120; t += STEP) { h.step({ mx: 1, mz: 0.05, sprint: Math.hypot(e.x - h.p.x, e.z - h.p.z) < 15 }); far = Math.max(far, Math.hypot(e.x - e.home.x, e.z - e.home.z)); }
  log(`  a spitter led east toward town strays at most ${far.toFixed(0)} m from home (town is ~200 m away), ends ${e.state}`);
}
