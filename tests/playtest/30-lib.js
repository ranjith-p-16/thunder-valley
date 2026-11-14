// Milestone 3 playtest helpers: a step-driven story bot that can resume from any quest step (so it works after a restore).
// Run scripts with /opt/homebrew/bin/node.
import { createSim, STEP } from '../../src/sim/sim.js';
import { PEN } from '../../src/data/content.js';
import { QUESTS, DIALOGUES } from '../../src/data/story.js';
import { heightAt } from '../../src/sim/terrain.js';
export { createSim, STEP, PEN, QUESTS, DIALOGUES, heightAt };

export const idle = { mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [] };
export const BRANCHES = {
  'paid/destroyed/revealed/fought': {},
  'refused/driven/secret/stampeded': { q3_collector: 1, q4_den: 1, q5_done: 1, q6_camp: 1 },
  'stalled/destroyed/secret/stampeded': { q3_collector: 2, q5_done: 1, q6_camp: 1 },
  'refused/destroyed/revealed/fought': { q3_collector: 1 },
  'stalled/driven/revealed/fought': { q3_collector: 2, q4_den: 1 },
};
export const expectedStanding = (c) => 5 + 5 + [0, 10, 5][c.q3_collector || 0] + 10 + (c.q5_done ? 5 : 10) + 15;

export function bot(sim, choices = {}, { tough = true } = {}) {
  const s = sim.state, p = s.player;
  if (tough) { p.level = 15; sim.economy.recalc(); p.hp = p.maxHp; }
  let thrown = null;
  const step = (inp = {}) => { try { return sim.step({ ...idle, ...inp }); } catch (e) { thrown = thrown || e; throw e; } };
  const wait = (sec) => { for (let i = 0; i < sec / STEP; i++) step(); };
  const rideTo = (x, z, stop = 3, max = 90, extra = null) => {
    let lastX = p.x, lastZ = p.z, side = 0, sideT = 0, turn = 1;
    for (let i = 0; i < max / STEP && Math.hypot(p.x - x, p.z - z) > stop && !s.dialogue; i++) {
      const dx = x - p.x, dz = z - p.z;
      if (extra && extra() === false) break;
      if (sideT > 0) { sideT -= STEP; step({ mx: -dz * side + dx * 0.3, mz: dx * side + dz * 0.3, sprint: true }); continue; }
      step({ mx: dx, mz: dz, sprint: true });
      if (i % 30 === 29) {
        if (Math.hypot(p.x - lastX, p.z - lastZ) < 1.5) { side = turn; turn = -turn; sideT = 0.9; }
        lastX = p.x; lastZ = p.z;
      }
    }
    return Math.hypot(p.x - x, p.z - z) <= stop + 1;
  };
  const answer = () => { for (let n = 0; s.dialogue && n < 12; n++) sim.command({ type: 'say', i: choices[s.dialogue.id] ?? 0 }); };
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
  // closes in when shots are not landing (a ridge, tree or rock in the way) and side-steps scenery on the way
  const killTagged = (tag, max = 120) => {
    let dry = 0, close = 22;
    for (let i = 0; i < max / STEP; i++) {
      const t = s.enemies.filter(e => e.tag.startsWith(tag) && !e.dead && !e.gone).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (!t) return true;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d > close) { rideTo(t.x, t.z, close - 2, 1.5); i += 1.5 / STEP; continue; }
      const ev = step({ fire: true, aim: aimAt(t) });
      if (ev.some(e => e.type === 'hit')) { dry = 0; close = 22; } else if (++dry > 150) { dry = 0; close = Math.max(6, close - 6); }
    }
    return false;
  };
  // ropes one and leads it in; a roped animal that jams on scenery is fetched again from another side, as a player would
  const penOne = (herd) => {
    if (s.herd.roped) step({ actions: ['lasso'] });
    const a = s.animals.find(k => !k.dead && !k.penned && !k.held && (herd === undefined || k.herd === herd));
    if (!a) return false;
    rideTo(a.x + 5, a.z, 6);
    step({ actions: ['lasso'] });
    const r = s.herd.roped;
    for (let k = 0; k < 5; k++) {
      rideTo(PEN.x, PEN.z - PEN.r - 12, 2);
      wait(1.5);
      if (!r || r.penned || Math.hypot(r.x - p.x, r.z - p.z) < 16) break;
      penOne.jams = (penOne.jams || 0) + 1;
      rideTo(r.x + (k % 2 ? -9 : 9), r.z + (k % 2 ? 9 : -9), 3, 30);   // go back and pull from a different side
    }
    rideTo(PEN.x, PEN.z + PEN.r - 5, 1.5, 40);
    wait(2);
    if (s.herd.roped) step({ actions: ['lasso'] });
    rideTo(PEN.x, PEN.z - PEN.r - 12, 2);
    return a.penned;
  };
  const stepOf = () => `${QUESTS[s.story.quest]?.id ?? 'end'}/${s.story.step}`;
  const cur = () => QUESTS[s.story.quest]?.steps[s.story.step] || null;

  // Does one attempt at whatever the current step asks for.
  function advance() {
    const st = cur();
    if (!st) return;
    if (s.dialogue) return answer();
    if (st.type === 'talk') { if (!talkTo(st.npc)) wait(0.5); }
    else if (st.type === 'clear') {
      if (st.tag === 'q1') {
        const c = s.enemies.find(e => e.tag === 'q1' && !e.gone && !e.dead);
        if (c) rideTo(c.x, c.z, 2, 3);
        wait(0.1);
      } else { killTagged(st.tag, 60); wait(0.1); }
    } else if (st.type === 'pen') { if (!penOne(st.herd)) wait(5); }
    else if (st.type === 'collect') {
      const k = s.pickups.find(q => q.tag === st.tag);
      if (k) rideTo(k.x, k.z, 2); else wait(0.5);
      step();
    } else if (st.type === 'goto') { rideTo(st.x, st.z, st.r - 12); step(); answer(); }
    else if (st.type === 'holler') {
      rideTo(st.x, st.z, st.r - 8);
      for (let i = 0; i < 400 && s.herd.hollerCd > 0; i++) step();
      step({ actions: ['holler'] });
    }
  }
  // Plays on until the story ends. onStep(key) is called each time a new step is reached, before acting on it.
  function finish({ onStep = null, maxTries = 400, until = null } = {}) {
    let last = null, tries = 0;
    while (cur() && tries < maxTries) {
      const key = stepOf();
      if (key !== last) { last = key; tries = 0; if (onStep && onStep(key) === false) return key; if (until && until === key) return key; }
      advance();
      tries++;
    }
    return cur() ? `STALLED at ${stepOf()}` : 'end';
  }
  return { sim, s, p, step, wait, rideTo, talkTo, killTagged, penOne, answer, stepOf, cur, advance, finish, aimAt, thrown: () => thrown };
}

export const clone = (v) => JSON.parse(JSON.stringify(v));
let fails = 0;
export const check = (name, ok, detail = '') => { if (!ok) fails++; if (!ok || process.env.VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };
export const failCount = () => fails;

// Scans everything for NaN/Infinity and out-of-range values. Returns a list of problems.
export function sane(sim) {
  const s = sim.state, p = s.player, bad = [];
  const fin = (who, o, keys) => { for (const k of keys) if (!Number.isFinite(o[k])) bad.push(`${who}.${k}=${o[k]}`); };
  fin('player', p, ['x', 'z', 'yaw', 'hp', 'maxHp', 'stamina', 'money', 'xp', 'level', 'blindT']);
  if (p.hp < 0 || p.hp > p.maxHp + 1e-9) bad.push(`player hp ${p.hp}/${p.maxHp}`);
  if (p.money < 0 || !Number.isInteger(p.money)) bad.push(`money ${p.money}`);
  for (const w in p.weapons) if (!(p.ammo[w] >= 0 && p.ammo[w] <= sim.magazine(w))) bad.push(`ammo ${w} ${p.ammo[w]}`);
  for (const k in p.tonics) if (!(p.tonics[k] >= 0 && p.tonics[k] <= 9)) bad.push(`tonic ${k} ${p.tonics[k]}`);
  for (const e of s.enemies) { fin(`enemy ${e.id}`, e, ['x', 'z', 'yaw', 'hp']); if (Math.abs(e.x) > 290.001 || Math.abs(e.z) > 290.001) bad.push(`enemy ${e.id} out of world`); }
  for (const a of s.animals) { fin(`animal ${a.id}`, a, ['x', 'z', 'yaw', 'hp', 'vx', 'vz']); if (Math.abs(a.x) > 290.001 || Math.abs(a.z) > 290.001) bad.push(`animal ${a.id} out of world`); }
  for (const m of s.mates) { fin(`mate ${m.id}`, m, ['x', 'z', 'yaw']); if (Math.abs(m.x) > 290.001 || Math.abs(m.z) > 290.001) bad.push('mate out of world'); }
  const st = s.story;
  if (!(st.standing >= 0 && st.standing <= 100) || !Number.isInteger(st.standing)) bad.push(`standing ${st.standing}`);
  if (s.enemies.length > 60) bad.push(`enemies ${s.enemies.length}`);
  if (s.pickups.length > 3) bad.push(`pickups ${s.pickups.length}`);
  if (s.mates.length > 1) bad.push(`mates ${s.mates.length}`);
  if (s.npcs.length !== 6) bad.push(`npcs ${s.npcs.length}`);
  if (s.loot.length > 64) bad.push(`loot ${s.loot.length}`);
  if (s.animals.filter(a => a.penned).length > 8) bad.push('pen over 8');
  return bad;
}
