// Act 3 playtest helpers: the scripted rider from tests/act2.test.js, wrapped so it can drive any sim (also one just restored),
// plus a step-driven `advance` that does whatever the current story step asks.   /opt/homebrew/bin/node tests/playtest/81-*.js
import { createSim, STEP } from '../../src/sim/sim.js';
import { QUESTS, PLACES_OF_NOTE, ENDINGS, DIALOGUES } from '../../src/data/story.js';
import { heightAt } from '../../src/sim/terrain.js';
export { createSim, STEP, QUESTS, PLACES_OF_NOTE, ENDINGS, DIALOGUES };

let failed = 0;
export const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; return ok; };
export const failures = () => failed;

export function wrap(sim, choices = {}) {
  const s = sim.state, p = s.player;
  const idle = { mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [] };
  const events = [];
  const step = (inp = {}) => { const ev = sim.step({ ...idle, ...inp }); for (const e of ev || []) if (e.type === 'toast' || e.type === 'say') events.push(e); return ev; };
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
  const stepOf = () => `${QUESTS[s.story.quest]?.id ?? 'end'}/${s.story.step}`;
  const talkTo = (id) => {
    for (let i = 0; i < 400 && p.dead; i++) step();
    for (let tries = 0; tries < 5; tries++) {
      const who = sim.story.whereIs(id);
      if (!who) return false;
      rideTo(who.x, who.z, 5);
      sim.command({ type: 'talk' });
      if (s.dialogue) { answer(); return true; }
      wait(1);
    }
    return false;
  };
  const aimAt = (t) => {
    const oy = heightAt(p.x, p.z) + 4, dx = t.x - p.x, dy = heightAt(t.x, t.z) + 1.6 - oy, dz = t.z - p.z, len = Math.hypot(dx, dy, dz);
    return { ox: p.x, oy, oz: p.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: Math.atan2(dx, dz) };
  };
  const left = (tag) => s.enemies.filter(e => e.tag && e.tag.startsWith(tag) && !e.dead && !e.gone);
  const fight = (tag, max = 150, done = () => !left(tag).length) => {
    for (let i = 0; i < max / STEP && !done(); i++) {
      const t = left(tag).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (!t) { step(); continue; }
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      step(d > 20 ? { mx: t.x - p.x, mz: t.z - p.z, sprint: true } : { fire: true, aim: aimAt(t) });
    }
    return done();
  };
  const shoot = (t, max, done) => {
    for (let i = 0; i < max / STEP && !done(); i++) {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      step(d > 22 ? { mx: t.x - p.x, mz: t.z - p.z, sprint: true } : { fire: true, aim: aimAt(t) });
    }
    return done();
  };
  const g = { sim, s, p, step, wait, rideTo, talkTo, answer, fight, shoot, left, stepOf, events, choices, aimAt };
  // Does the current story step. Returns false when there is nothing left to do.
  g.advance = () => {
    const q = QUESTS[s.story.quest], st = q?.steps[s.story.step];
    if (!st) return false;
    const before = stepOf();
    if (st.type === 'talk') talkTo(st.npc);
    else if (st.type === 'hold') { rideTo(st.x, st.z, 4); fight('hold', st.time + 240, () => stepOf() !== before); }
    else if (st.type === 'clear') { const t = left(st.tag)[0]; if (t) rideTo(t.x, t.z, 28); fight(st.tag, 400); wait(0.3); }
    else if (st.type === 'goto') { for (let i = 0; i < 30 && stepOf() === before; i++) { rideTo(st.x, st.z, Math.max(2, st.r - 6), 8); wait(0.1); answer(); } }
    else if (st.type === 'collect') { for (let n = 0; n < 6 && stepOf() === before; n++) { const k = s.pickups.find(c => c.tag === st.tag); if (!k) { wait(0.2); break; } rideTo(k.x, k.z, 2, 120); wait(0.1); } }
    else if (st.type === 'slay') { shoot(s.rex, 600, () => s.rex.dead); wait(0.2); }
    else if (st.type === 'drive') {
      const rex = s.rex;
      shoot(rex, 400, () => rex.hp <= rex.maxHp * 0.45 || rex.dead);
      for (let i = 0; i < 40 && stepOf() === before && !rex.dead; i++) { rideTo(rex.x, rex.z, 25, 6); wait(5.2); step({ actions: ['holler'] }); }
    } else wait(0.5);
    wait(0.2);
    return true;
  };
  g.finish = (max = 60) => { for (let i = 0; i < max && QUESTS[s.story.quest]; i++) g.advance(); return !QUESTS[s.story.quest]; };
  g.reload = () => { const save = JSON.parse(JSON.stringify(sim.snapshot())), again = createSim(); if (!again.restore(save)) throw new Error('restore failed'); return wrap(again, choices); };
  return g;
}

// A strong rider at the start of act 3 (quest index 12 = q13), with the whole posse and the town.
export function act3Start(choices = {}, nettle = 'secret', quest = 12) {
  const sim = createSim(), s = sim.state, p = s.player;
  p.level = 25; sim.economy.recalc(); p.hp = p.maxHp;
  s.story.quest = quest; s.story.step = 0; s.story.standing = 80;
  for (const id of ['mara', 'tobe', 'june']) sim.posse.join(id, true);
  sim.town.claim();
  s.story.flags.nettle = nettle;
  s.story.done = QUESTS.slice(0, quest).map(q => q.id);
  sim.story.enter();
  return wrap(sim, choices);
}
