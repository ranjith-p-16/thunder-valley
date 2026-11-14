// The q12 "hold the square" step, the lieutenants' leash, and three mates following.
import { createSim, STEP, QUESTS, check, note, clone, sane, mk } from './50-lib.js';
import { bot, startAct2 } from './54-act2.js';
import { PEN } from '../../src/data/content.js';

const atHold = (seed = 99, level = 25, mates = ['mara', 'tobe', 'june']) => {
  const sim = createSim(seed), s = sim.state;
  s.story.quest = 11; s.story.step = 2; s.story.standing = 80; s.story.done = QUESTS.slice(0, 11).map(q => q.id);
  for (const id of mates) sim.posse.join(id, true);
  for (const n of s.npcs) if (mates.includes(n.id)) n.hidden = true;
  sim.story.enter();
  const b = bot(sim, {}, { level }); b.p.x = 0; b.p.z = -10;
  return b;
};

{ // does the posse help in the square?
  const b = atHold(); let mateShots = 0, t = 0;
  while (b.stepOf() === 'q12/2' && t < 200) { for (const e of b.step()) if (e.type === 'mateShot') mateShots++; t += STEP; }
  check('WRONG? the posse fires at least once in 180 s of the stand in the square (rider idle)', mateShots > 0, `${mateShots} mate shots, rider hp ${b.p.hp.toFixed(0)}/${b.p.maxHp}, step ${b.stepOf()}, hold enemies ${b.left('hold').length}`);
  const c = atHold(); c.sim.command({ type: 'order', id: 'attack' }); mateShots = 0; t = 0;
  while (c.stepOf() === 'q12/2' && t < 60) { for (const e of c.step()) if (e.type === 'mateShot') mateShots++; t += STEP; }
  check('WRONG? on "attack" the posse fires in the square', mateShots > 0, `${mateShots} shots in 60 s`);
}

{ // waves, bounds, leaving, coming back
  const b = atHold(); const seen = new Set(); let maxAlive = 0, far = 0;
  for (let i = 0; i < 100 * 60; i++) { b.step(); const l = b.left('hold'); l.forEach(e => seen.add(e.id)); maxAlive = Math.max(maxAlive, l.length); }
  check('waves: 3 every 40 s, never more than 8 alive when nobody is killed', seen.size === 6 && maxAlive <= 8, `spawned ${seen.size} in 100 s, max alive ${maxAlive}`);
  const c0 = b.s.story.count;
  // where are they? any that never came within range
  const stuck = b.left('hold').filter(e => Math.hypot(e.x - b.p.x, e.z - b.p.z) > 30);
  check('no hold enemy is still more than 30 m from the rider after 100 s', stuck.length === 0, stuck.map(e => `${e.id}@${e.x.toFixed(0)},${e.z.toFixed(0)} ${e.state}`).join(' '));
  // leave the square: timer stops
  b.p.x = 0; b.p.z = -10 + 60; b.wait(10);
  check('outside the square the timer stops (and does not reset)', Math.abs(b.s.story.count - c0) < 0.1, `${c0.toFixed(1)} -> ${b.s.story.count.toFixed(1)}`);
  // go far away for 2 minutes then come back
  b.p.x = 250; b.p.z = 250; b.wait(120);
  const l = b.left('hold'); note(`rider 350 m away for 2 min: hold enemies ${l.length}, states ${[...new Set(l.map(e => e.state))].join()}, nearest to square ${Math.min(...l.map(e => Math.hypot(e.x, e.z + 10))).toFixed(0)} m, hp ${l.map(e => Math.round(e.hp)).join()}`);
  b.p.x = 0; b.p.z = -10; const r = b.finish({ maxTries: 20 });
  check('coming back, the stand can still be finished', r === 'end' && b.s.town.owned && !b.s.siege, r);
}

{ // dying over and over; realistic levels
  for (const [level, mates] of [[6, []], [8, []], [10, []], [10, ['mara', 'tobe', 'june']], [14, []]]) {
    const b = atHold(99, level, mates); let deaths = 0, was = false, t = 0; const money0 = b.p.money = 500;
    while (b.stepOf() === 'q12/2' && t < 1500) {
      const tg = b.left('hold').sort((x, y) => Math.hypot(x.x - b.p.x, x.z - b.p.z) - Math.hypot(y.x - b.p.x, y.z - b.p.z))[0];
      b.step(tg && Math.hypot(tg.x - b.p.x, tg.z - b.p.z) < 60 ? { fire: true, aim: b.aimAt(tg) } : {}); t += STEP;
      if (b.p.dead && !was) deaths++; was = b.p.dead;
    }
    note(`stand in the square, level ${level} rider, revolver, standing and shooting, ${mates.length} mates: ${b.stepOf() !== 'q12/2' ? `held after ${(t / 60).toFixed(1)} min` : 'NOT held in 25 min'}, thrown ${deaths} times, money ${money0} -> ${b.p.money}`);
  }
  // a rider who cannot fight at all: is there a loop he cannot leave?
  const b = atHold(99, 1, []); let deaths = 0, was = false;
  for (let i = 0; i < 600 * 60; i++) { b.step(); if (b.p.dead && !was) deaths++; was = b.p.dead; }
  note(`level-1 rider doing nothing for 10 min of the stand: thrown ${deaths} times, count ${b.s.story.count.toFixed(0)}, step ${b.stepOf()}`);
  b.p.x = -16; b.p.z = -6; b.sim.command({ type: 'takeJob', i: 0 });
  check('during the stand the notice board and shops still answer', !!b.s.job);
  const save = clone(b.sim.snapshot()), a = createSim();
  check('save during the stand with a job reloads', a.restore(save) && a.state.siege === true && sane(a).length === 0, sane(a).join(';'));
}

{ // starting the stand with a roped longhorn and a timed job
  const b = atHold(); const s = b.s;
  s.job = { type: 'herd', title: 'Herd order', pay: 100, xp: 100, left: 20, done: 0, count: 3, text: '' };
  const a = s.animals[0]; a.x = 5; a.z = 12; b.p.x = 0; b.p.z = 10; b.step({ actions: ['lasso'] });
  const roped = !!s.herd.roped; b.p.x = 0; b.p.z = -10;
  const r = b.finish({ maxTries: 20 });
  check('stand finished with a roped longhorn and a timed job running', r === 'end' && roped && !sane(b.sim).length, `${r} roped ${roped} ${sane(b.sim).join(';')} longhorn hp ${a.hp} dead ${a.dead}`);
}

{ // after the stand: peace is back
  const b = atHold(); const w = b.s.enemies.find(e => e.kind === 'raptor' && !e.outpost); w.x = 5; w.z = -10; w.state = 'chase'; w.provokedT = 100; w.home = { x: 5, z: -60 };
  b.finish({ maxTries: 20 }); b.wait(1);
  check('after the stand: no siege, no hold enemies, wild animals put out of town', !b.s.siege && !b.left('hold').length && (w.dead || Math.hypot(w.x, w.z + 10) >= 38.9), `siege ${b.s.siege} raptor ${Math.hypot(w.x, w.z + 10).toFixed(1)} m`);
  let shot = 0; for (let i = 0; i < 30; i++) for (const e of b.step({ fire: true })) if (e.type === 'shot') shot++;
  check('no shooting in town once the stand is over', shot === 0);
}

{ // lieutenants: leash and healing; can a level-10 rider win?
  for (const [who, q, st] of [['pell', 8, 2], ['hester', 10, 1]]) {
    for (const [level, mates] of [[8, ['mara', 'tobe']], [10, ['mara', 'tobe', 'june']], [10, []], [12, []]]) {
      const sim = createSim(99), s = sim.state; s.story.quest = q; s.story.step = st; s.story.flags.pell = 'fought'; s.story.standing = 60;
      for (const id of mates) sim.posse.join(id, true);
      sim.story.enter(); const b = bot(sim, {}, { level }); b.p.level = level; sim.economy.recalc(); b.p.hp = b.p.maxHp;
      const boss = s.enemies.find(e => e.kind === who); b.p.x = boss.x - 45; b.p.z = boss.z; for (const m of s.mates) { m.x = b.p.x - 3; m.z = b.p.z; }
      let deaths = 0, was = false, t = 0, heals = 0, lastHp = boss.hp; const key = b.stepOf();
      while (b.stepOf() === key && t < 600) {
        const tg = b.left(st === 2 ? 'q9' : 'q11').sort((x, y) => Math.hypot(x.x - b.p.x, x.z - b.p.z) - Math.hypot(y.x - b.p.x, y.z - b.p.z))[0];
        if (b.p.dead) { b.step(); } else if (!tg) b.step(); else {
          const d = Math.hypot(tg.x - b.p.x, tg.z - b.p.z);
          if (d > 26) b.step({ mx: tg.x - b.p.x, mz: tg.z - b.p.z, sprint: true }); else b.step({ fire: true, aim: b.aimAt(tg), mx: d < 10 ? b.p.x - tg.x : 0, mz: d < 10 ? b.p.z - tg.z : 0, sprint: d < 10 });
        }
        t += STEP; if (b.p.dead && !was) deaths++; was = b.p.dead;
        if (boss.hp > lastHp + 50) heals++; lastHp = boss.hp;
      }
      note(`${who} v level ${level} rider (revolver, back off when close) with ${mates.length} mates: ${b.stepOf() !== key ? `won in ${t.toFixed(0)} s` : `NOT won in 10 min (boss hp ${boss.hp.toFixed(0)}/${boss.maxHp}, state ${boss.state})`}, thrown ${deaths}x, boss healed back ${heals}x`);
    }
  }
}

{ // three mates following: through town, round the pen, into the pen and out
  const sim = createSim(99), s = sim.state; for (const id of ['mara', 'tobe', 'june']) sim.posse.join(id, true);
  const b = bot(sim, {}); let maxFar = 0, overlap = 0, steps = 0, inScenery = 0;
  const track = () => { steps++; for (const m of s.mates) { maxFar = Math.max(maxFar, Math.hypot(m.x - b.p.x, m.z - b.p.z)); for (const n of s.mates) if (m !== n && Math.hypot(m.x - n.x, m.z - n.z) < 0.5) overlap++; } };
  const route = [[0, 8], [0, PEN.z - 4], [0, PEN.z + 6], [0, 8], [-16, -6], [17, -6], [12, -25], [-20, -24], [60, 60], [-60, 100], [0, 8], [0, PEN.z + 6], [0, 0]];
  for (const [x, z] of route) { for (let i = 0; i < 40 * 60 && Math.hypot(b.p.x - x, b.p.z - z) > 2; i++) { b.step({ mx: x - b.p.x, mz: z - b.p.z, sprint: true }); track(); } for (let i = 0; i < 240; i++) { b.step(); track(); } }
  const end = s.mates.map(m => Math.hypot(m.x - b.p.x, m.z - b.p.z).toFixed(1)).join();
  check('three mates keep up through town and pen (never more than 60 m behind, all within 16 m at the end)', maxFar < 60 && s.mates.every(m => Math.hypot(m.x - b.p.x, m.z - b.p.z) < 16), `max ${maxFar.toFixed(0)} m, at end ${end}`);
  note(`mates stacked on the same spot (<0.5 m apart) for ${overlap / 2} mate-pair steps of ${steps} (mates do not push each other apart)`);
  // rider stands in the pen gate with three mates: can longhorns still be driven in?
}
process.exit(0);
