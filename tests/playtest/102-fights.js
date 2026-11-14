// Short scripted fights to confirm the tables: bosses and giants against riders as strong as the story makes them.
//   /opt/homebrew/bin/node tests/playtest/102-fights.js
import { createSim, STEP } from '../../src/sim/sim.js';
import { QUESTS } from '../../src/data/story.js';
import { heightAt } from '../../src/sim/terrain.js';

const idle = { mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [] };
// o: level, gs (gunslinger points), weapon, grade, mount, mountLv, mates, mode ('stand' | 'kite' | 'melee'), quest (index whose step spawns the boss), step, kind
export function duel(o) {
  const sim = createSim(o.seed || 99), s = sim.state, p = s.player;
  p.level = o.level; p.skills.gunslinger = o.gs || 0; p.skills.marshal = o.marshal || 0;
  const w = o.weapon || 'revolver'; p.weapons[w] = o.grade || 0; p.weapon = w; p.ammo[w] = 0;
  if (o.mount) { p.mounts[o.mount] = true; p.mount = o.mount; p.string = [o.mount]; }
  p.mountLv[p.mount] = o.mountLv || 1;
  sim.economy.recalc(); p.hp = p.maxHp; p.ammo[w] = sim.magazine(w);
  for (const m of o.mates || []) sim.posse.join(m, true);
  let targets;
  if (o.giant) {
    sim.frontier.restore({ giant: { kind: o.giant, x: 150, z: 150, name: 'Old Scar' }, giantDay: 99 });
    targets = () => s.enemies.filter(e => e.tag === 'giant' && !e.dead);
    p.x = 150; p.z = 110;
  } else if (o.rex) { targets = () => (s.rex.dead ? [] : [s.rex]); p.x = s.rex.x; p.z = s.rex.z + 45; }
  else {
    s.story.quest = o.quest; s.story.step = o.step; s.story.flags = { ...(o.flags || {}) }; s.story.standing = 80; sim.story.enter();
    const all = () => s.enemies.filter(e => e.tag && e.tag.startsWith(QUESTS[o.quest].steps[o.step].tag) && !e.dead && !e.gone);
    targets = all;
    const t = all()[0]; p.x = t.x; p.z = t.z + 45;
  }
  for (const m of s.mates) { m.x = p.x + 4; m.z = p.z + 3; }
  s.obstacles.resolve(p, 1.2);
  const aimAt = (t) => { const oy = heightAt(p.x, p.z) + 4, dx = t.x - p.x, dy = heightAt(t.x, t.z) + 1.6 - oy, dz = t.z - p.z, len = Math.hypot(dx, dy, dz); return { ox: p.x, oy, oz: p.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: Math.atan2(dx, dz) }; };
  let t = 0, deaths = 0, was = false, minHp = p.hp, started = -1, hurt = 0, lastHp = p.hp, bossDead = -1;
  const boss = targets().sort((a, b) => b.maxHp - a.maxHp)[0];
  while (targets().length && t < (o.max || 300)) {
    const live = targets().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)), e = o.focus && !boss.dead ? boss : live[0];
    const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz), acts = [];
    let inp;
    if (o.mode === 'kite') {
      // circle at 25 to 40 m: away when close, in when far, always sidling, shooting all the while
      const k = d < 28 ? -1 : d > 40 ? 1 : 0;
      inp = { mx: dx / d * k - dz / d * 0.7, mz: dz / d * k + dx / d * 0.7, sprint: d < 16, fire: d < 60, aim: aimAt(e) };
    } else if (o.mode === 'melee') {
      // ride up, then stand and strike: walking on would carry the rider through the animal and out of the arc
      inp = d > 2 + e.def.radius ? { mx: dx, mz: dz, sprint: d > 12 } : {};
      if (d < 3.4 + e.def.radius) { acts.push('melee', 'move'); if (['Sweep', 'Stomp', 'Spit'].includes(sim.mountOf().ability.name)) acts.push('ability'); }
    } else inp = d > 22 ? { mx: dx, mz: dz, sprint: true } : { fire: true, aim: aimAt(e) };
    if (o.tonic && p.hp < p.maxHp * 0.4) acts.push('quickZ');
    const ev = sim.step({ ...idle, ...inp, actions: acts });
    t += STEP;
    if (started < 0 && ev.some(v => v.type === 'hit')) started = t;
    if (bossDead < 0 && boss.dead) bossDead = t;
    if (p.hp < lastHp) hurt += lastHp - p.hp;
    lastHp = p.hp;
    if (p.dead && !was) deaths++;
    was = p.dead; minHp = Math.min(minHp, p.hp);
  }
  const won = !targets().length;
  return `${won ? 'won ' : 'NOT WON'} fight ${(t - Math.max(0, started)).toFixed(1).padStart(5)}s (boss down after ${bossDead < 0 ? '-' : (bossDead - started).toFixed(1)}s)  damage taken ${hurt.toFixed(0).padStart(4)} of ${p.maxHp} hp  thrown ${deaths}x  ${won ? '' : `boss hp ${boss.hp.toFixed(0)}/${boss.maxHp}`}`;
}
export const run = (label, o) => console.log(label.padEnd(74), duel(o));
export const POSSE = ['mara', 'tobe', 'june'];

if (process.argv[1].endsWith('102-fights.js')) {
console.log('--- Alpha Rex (900 hp). The story bot reaches him at rider level 8-9 with 7-8 gunslinger points and a Common revolver ---');
run('L1 Common revolver, Young Strider, stand at 22 m, alone', { rex: 1, level: 1 });
run('L1 Common revolver, Young Strider, circle at 28-40 m, alone', { rex: 1, level: 1, mode: 'kite' });
run('L5 Common revolver, circle, alone', { rex: 1, level: 5, gs: 4, mode: 'kite', mountLv: 6 });
run('L9 Common revolver GS8, Grown Strider, stand, alone', { rex: 1, level: 9, gs: 8, mountLv: 11 });
run('L9 Common revolver GS8, Grown Strider, circle, alone', { rex: 1, level: 9, gs: 8, mountLv: 11, mode: 'kite' });
run('L9 Common revolver GS8, stand, with Mara+Tobe+June', { rex: 1, level: 9, gs: 8, mountLv: 11, mates: POSSE });
run('L1 Common revolver, stand, with Mara+Tobe+June', { rex: 1, level: 1, mates: POSSE });
run('L9 Sturdy shotgun GS8, stand, alone', { rex: 1, level: 9, gs: 8, mountLv: 11, weapon: 'shotgun', grade: 1 });
run('L12 Fine rifle GS10, stand, alone', { rex: 1, level: 12, gs: 10, mountLv: 14, weapon: 'rifle', grade: 2 });
run('L12 Fine bow GS10, stand, alone', { rex: 1, level: 12, gs: 10, mountLv: 14, weapon: 'bow', grade: 2 });
run('L9, no shooting: Grown Strider V + Pounce only', { rex: 1, level: 9, mountLv: 11, mode: 'melee' });
run('L9, no shooting: Grown Platewalker V + Sweep + Brace', { rex: 1, level: 9, mount: 5, mountLv: 11, mode: 'melee' });
run('L9, no shooting: Grown Cinderjaw V + Charge + Rend', { rex: 1, level: 9, mount: 4, mountLv: 11, mode: 'melee' });

console.log('--- lieutenants at the level the story bot met them ---');
run('q9 Pell (500) + 2 dilos: L5 Common revolver GS4, stand, with Mara+Tobe', { quest: 8, step: 2, flags: { pell: 'fought' }, level: 5, gs: 4, mountLv: 6, mates: ['mara', 'tobe'], focus: true });
run('q9 Pell: same, alone', { quest: 8, step: 2, flags: { pell: 'fought' }, level: 5, gs: 4, mountLv: 6, focus: true });
run('q11 Hester (700) + 3 rustlers: L5 Common revolver GS4, stand, posse', { quest: 10, step: 1, level: 5, gs: 4, mountLv: 6, mates: POSSE, focus: true });
run('q11 Hester: same, alone', { quest: 10, step: 1, level: 5, gs: 4, mountLv: 6, focus: true });
run('q11 Hester: alone, circling', { quest: 10, step: 1, level: 5, gs: 4, mountLv: 6, focus: true, mode: 'kite' });
run('q14 Kettle twins (420 x2) + 3 rustlers: L8 Common GS7, stand, posse', { quest: 13, step: 1, level: 8, gs: 7, mountLv: 10, mates: POSSE });
run('q14 Kettle twins: same, alone', { quest: 13, step: 1, level: 8, gs: 7, mountLv: 10 });
run('q18 Blackthorn (1300) + 4 rustlers: L9 Common GS8, stand, posse', { quest: 17, step: 1, level: 9, gs: 8, mountLv: 12, mates: POSSE, focus: true });
run('q18 Blackthorn: same, alone', { quest: 17, step: 1, level: 9, gs: 8, mountLv: 12, focus: true });
run('q18 Blackthorn: alone, circling', { quest: 17, step: 1, level: 9, gs: 8, mountLv: 12, focus: true, mode: 'kite' });
run('q18 Blackthorn: L1 Common revolver alone, circling', { quest: 17, step: 1, level: 1, focus: true, mode: 'kite' });

console.log('--- giants (5x health, 1.7x bite) ---');
for (const kind of ['raptor', 'dilo', 'cinder']) {
  run(`giant ${kind}: L4 Common revolver GS3, stand, alone`, { giant: kind, level: 4, gs: 3, mountLv: 5 });
  run(`giant ${kind}: L4 Common revolver GS3, circle, alone`, { giant: kind, level: 4, gs: 3, mountLv: 5, mode: 'kite' });
  run(`giant ${kind}: L9 Sturdy revolver GS8, stand, alone`, { giant: kind, level: 9, gs: 8, grade: 1, mountLv: 11 });
}
}
