// Milestone 4 playtest helpers. Run scripts with /opt/homebrew/bin/node.
import { createSim, STEP } from '../../src/sim/sim.js';
import { QUESTS } from '../../src/data/story.js';
import { heightAt } from '../../src/sim/terrain.js';
export { createSim, STEP, QUESTS, heightAt };

export const idle = { mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [] };
export const clone = (v) => JSON.parse(JSON.stringify(v));
let fails = 0;
export const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };
export const note = (...a) => console.log('NOTE ', ...a);
export const failCount = () => fails;

export function mk(seed = 99, { level = 1 } = {}) {
  const sim = createSim(seed), s = sim.state, p = s.player;
  if (level > 1) { p.level = level; sim.economy.recalc(); p.hp = p.maxHp; }
  const toasts = [];
  const step = (inp = {}) => { const ev = sim.step({ ...idle, ...inp }); for (const e of ev) if (e.type === 'toast') toasts.push(e.text); return ev; };
  const act = (...actions) => step({ actions });
  const wait = (sec, inp = {}) => { for (let i = 0; i < Math.round(sec / STEP); i++) step(inp); };
  const cmd = (c) => { const ev = sim.command(c); for (const e of ev) if (e.type === 'toast') toasts.push(e.text); return ev; };
  const aimAt = (t) => {
    const oy = heightAt(p.x, p.z) + 4, dx = t.x - p.x, dy = heightAt(t.x, t.z) + 1.6 - oy, dz = t.z - p.z, len = Math.hypot(dx, dy, dz);
    return { ox: p.x, oy, oz: p.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: Math.atan2(dx, dz) };
  };
  const dist = (a, b = p) => Math.hypot(a.x - b.x, a.z - b.z);
  const face = (t) => { p.yaw = Math.atan2(t.x - p.x, t.z - p.z); };
  // teleports the rider to open ground far from everything (found by scanning)
  const open = (x = 0, z = -120) => { p.x = x; p.z = z; p.ox = x; p.oz = z; };
  const wild = (kind) => s.enemies.filter(e => e.kind === kind && !e.outpost && !e.tag && !e.bounty && !e.dead);
  // puts an existing animal beside the rider, frozen unless told otherwise
  const bring = (e, dx = 0, dz = 6, { hpFrac = 1, held = 0, home = true } = {}) => {
    e.x = p.x + dx; e.z = p.z + dz; e.ox = e.x; e.oz = e.z; e.hp = e.maxHp * hpFrac; e.heldT = held; e.state = 'wander'; e.cd = 5;
    if (home) e.home = { x: e.x, z: e.z };
    return e;
  };
  const rideTo = (x, z, stop = 3, max = 90, also = {}) => {
    let lastX = p.x, lastZ = p.z, side = 0, sideT = 0, turn = 1;
    for (let i = 0; i < max / STEP && Math.hypot(p.x - x, p.z - z) > stop && !s.dialogue; i++) {
      const dx = x - p.x, dz = z - p.z;
      if (sideT > 0) { sideT -= STEP; step({ mx: -dz * side + dx * 0.3, mz: dx * side + dz * 0.3, sprint: true, ...also }); continue; }
      step({ mx: dx, mz: dz, sprint: true, ...also });
      if (i % 30 === 29) { if (Math.hypot(p.x - lastX, p.z - lastZ) < 1.5) { side = turn; turn = -turn; sideT = 0.9; } lastX = p.x; lastZ = p.z; }
    }
    return Math.hypot(p.x - x, p.z - z) <= stop + 1;
  };
  const stepOf = () => `${QUESTS[s.story.quest]?.id ?? 'end'}/${s.story.step}`;
  return { sim, s, p, step, act, wait, cmd, aimAt, dist, face, open, wild, bring, rideTo, toasts, stepOf, lastToast: () => toasts[toasts.length - 1] };
}

// Late game: act 2 done, town owned, three mates, several mounts.
export function lateGame(seed = 99, { level = 12, mates = ['mara', 'tobe', 'june'] } = {}) {
  const g = mk(seed, { level }), { sim, s, p } = g;
  s.story.quest = QUESTS.length; s.story.step = 0; s.story.standing = 80; s.story.done = QUESTS.map(q => q.id);
  for (const n of s.npcs) if (['mara', 'tobe', 'june'].includes(n.id)) n.hidden = true;
  for (const id of mates) sim.posse.join(id, true);
  sim.town.claim();
  for (const i of [1, 3, 4, 5]) { p.mounts[i] = true; }
  p.string = [0, 3, 4, 5];
  p.money = 2000; p.thrown.bolas = 5; p.thrown.trap = 3; p.thrown.dynamite = 5;
  p.weapons.rifle = 0; p.ammo.rifle = 5; p.weapons.shotgun = 0; p.ammo.shotgun = 2;
  sim.economy.recalc(); p.hp = p.maxHp;
  return g;
}

// Scans the whole state for NaN/Infinity and out-of-range values.
export function sane(sim) {
  const s = sim.state, p = s.player, bad = [];
  const fin = (who, o, keys) => { for (const k of keys) if (!Number.isFinite(o[k])) bad.push(`${who}.${k}=${o[k]}`); };
  fin('player', p, ['x', 'z', 'yaw', 'hp', 'maxHp', 'stamina', 'money', 'xp', 'level', 'blindT', 'abilityCd', 'dashT', 'hurtT']);
  if (p.hp < 0 || p.hp > p.maxHp + 1e-9) bad.push(`player hp ${p.hp}/${p.maxHp}`);
  if (p.money < 0 || !Number.isInteger(p.money)) bad.push(`money ${p.money}`);
  if (p.stamina < 0 || p.stamina > 100) bad.push(`stamina ${p.stamina}`);
  for (const w in p.weapons) if (!(p.ammo[w] >= 0 && p.ammo[w] <= sim.magazine(w))) bad.push(`ammo ${w} ${p.ammo[w]}`);
  for (const k in p.tonics) if (!(p.tonics[k] >= 0 && p.tonics[k] <= 5)) bad.push(`tonic ${k} ${p.tonics[k]}`);
  for (const k in p.thrown) if (!(p.thrown[k] >= 0 && p.thrown[k] <= 5)) bad.push(`thrown ${k} ${p.thrown[k]}`);
  p.mountLv.forEach((l, i) => { if (!(Number.isInteger(l) && l >= 1 && l <= 30)) bad.push(`mountLv[${i}]=${l}`); if (!(p.mountXp[i] >= 0) || !Number.isFinite(p.mountXp[i])) bad.push(`mountXp[${i}]=${p.mountXp[i]}`); });
  if (p.string.length < 1 || p.string.length > 4 || new Set(p.string).size !== p.string.length || !p.string.includes(p.mount) || p.string.some(i => !p.mounts[i])) bad.push(`string ${JSON.stringify(p.string)} mount ${p.mount}`);
  for (const e of s.enemies) { fin(`enemy ${e.id}`, e, ['x', 'z', 'yaw', 'hp']); if (Math.abs(e.x) > 290.001 || Math.abs(e.z) > 290.001) bad.push(`enemy ${e.id} out of world`); }
  for (const a of s.animals) { fin(`animal ${a.id}`, a, ['x', 'z', 'yaw', 'hp', 'vx', 'vz']); if (Math.abs(a.x) > 290.001 || Math.abs(a.z) > 290.001) bad.push(`animal ${a.id} out of world`); }
  for (const m of s.mates) { fin(`mate ${m.id}`, m, ['x', 'z', 'yaw']); if (Math.abs(m.x) > 290.001 || Math.abs(m.z) > 290.001) bad.push('mate out of world'); }
  if (Math.abs(p.x) > 290.001 || Math.abs(p.z) > 290.001) bad.push('player out of world');
  const st = s.story, t = s.town;
  if (!(st.standing >= 0 && st.standing <= 100) || !Number.isInteger(st.standing)) bad.push(`standing ${st.standing}`);
  for (const k of ['supplies', 'safety', 'morale']) if (!(t[k] >= 0 && t[k] <= 100)) bad.push(`town.${k}=${t[k]}`);
  if (!(t.treasury >= 0) || !Number.isFinite(t.treasury)) bad.push(`treasury ${t.treasury}`);
  if (![1, 2, 3].includes(t.level)) bad.push(`town level ${t.level}`);
  const hold = QUESTS[st.quest]?.steps[st.step]?.type === 'hold';
  if (!!s.siege !== (!!t.raid || hold)) bad.push(`siege ${s.siege} raid ${!!t.raid} hold ${hold}`);
  if (s.enemies.length > 90) bad.push(`enemies ${s.enemies.length}`);
  if (s.mates.length > 3) bad.push(`mates ${s.mates.length}`);
  if (s.loot.length > 200) bad.push(`loot ${s.loot.length}`);
  if (s.traps.length > 3) bad.push(`traps ${s.traps.length}`);
  if (s.thrown.length > 20) bad.push(`thrown ${s.thrown.length}`);
  if (s.board.length > 3) bad.push(`board ${s.board.length}`);
  if (s.animals.filter(a => a.penned).length > 8) bad.push('pen over 8');
  return bad;
}
