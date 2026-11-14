// Each job type end to end, plus the awkward cases.
import { createSim, STEP, inp, toward, dist, aimAt, run, note, steer, TOWN, PEN } from './lib.js';
import { JOBS } from '../../src/data/items.js';

const mk = (type, extra = {}) => ({ type, title: JOBS[type].title, text: '', pay: 100, xp: JOBS[type].xp, left: 0, done: 0, ...extra });
const fresh = (seed = 99) => { const sim = createSim(seed); return { sim, s: sim.state, p: sim.state.player }; };
const goto = (sim, x, z, max = 120, extra = {}) => { const p = sim.state.player; return run(sim, max, () => { const S = steer(p, { x, z }); return { ...toward(p, S.x, S.z), sprint: true, ...extra }; }, () => dist(p, { x, z }) > 1.5); };

{ // ---- take twice / wrong turn-in / drop / reroll ----
  const { sim, s, p } = fresh();
  const first = s.board[0];
  sim.command({ type: 'takeJob', i: 0 });
  const second = s.board[0];
  sim.command({ type: 'takeJob', i: 0 });
  note(s.job === first && s.board.length === 3 && s.board[0] === second ? 'PASS' : 'FAIL', 'second takeJob while one is active is refused and the board is untouched');
  s.job = null; s.board[0] = mk('supply', { x: 150, z: 20, place: 'x', carrying: false, left: 300 });
  sim.command({ type: 'takeJob', i: 0 });
  const m = p.money; p.res.hide = 10;
  sim.command({ type: 'turnIn' });
  note(s.job?.type === 'supply' && p.money === m && p.res.hide === 10 ? 'PASS' : 'FAIL', 'turnIn with a non-hunt job does nothing');
  sim.command({ type: 'takeJob', i: 7 }); sim.command({ type: 'takeJob', i: -1 }); sim.command({ type: 'takeJob' });
  note('PASS', 'takeJob with a bad index does not crash');
  // reroll: take + drop cycles the board for free
  sim.command({ type: 'dropJob' });
  const board0 = s.board.map(j => j.type + j.pay).sort().join('|');
  let best = 0, n = 0; const seenPay = [];
  for (; n < 200; n++) { const i = s.board.reduce((bi, j, k) => (j.pay > s.board[bi].pay ? k : bi), 0); if (s.board[i].pay >= 290) { best = s.board[i].pay; break; } const lo = s.board.reduce((bi, j, k) => (j.pay < s.board[bi].pay ? k : bi), 0); seenPay.push(s.board[lo].pay); sim.command({ type: 'takeJob', i: lo }); sim.command({ type: 'dropJob' }); }
  note(best || s.board.map(j => j.type + j.pay).sort().join('|') !== board0 ? 'BUG' : 'PASS', `board reroll: take+drop the worst offer ${n} times (no cost, no time, clock ${s.clock.toFixed(2)}s) until a $${best} offer appears; board now ${s.board.map(j => `${j.type} $${j.pay}`).join(', ')}`);
  p.x = 100; p.z = 100;
  sim.command({ type: 'takeJob', i: 0 });
  note(!s.job ? 'PASS' : 'FAIL', 'takeJob outside town refused');
}
{ // ---- commands are town-wide, not tied to the notice board / shop door ----
  const { sim, s, p } = fresh();
  p.x = 0; p.z = 20;   // north edge of town, 46 from the notice board, nearPlace() is null
  sim.command({ type: 'takeJob', i: 0 });
  p.money = 1000; sim.command({ type: 'buy', kind: 'weapon', id: 'rifle' });
  note(s.job && 'rifle' in p.weapons && sim.nearPlace() === null ? 'INFO' : 'PASS', `takeJob/buy work anywhere in the town circle (nearPlace=${sim.nearPlace()?.id || null}); only the UI gates by door`);
}
{ // ---- bounty: complete, drop, death, restore ----
  const { sim, s, p } = fresh();
  s.board[0] = mk('bounty', { name: 'Scarback', x: 150, z: 150, pay: 200 });
  sim.command({ type: 'takeJob', i: 0 });
  const t = s.enemies.find(e => e.bounty), n0 = s.enemies.length;
  // drop removes the target
  sim.command({ type: 'dropJob' }); run(sim, 0.1);
  note(s.enemies.length === n0 - 1 && !s.enemies.some(e => e.bounty) ? 'PASS' : 'FAIL', 'dropping a bounty removes its target');
  s.board[0] = mk('bounty', { name: 'Scarback', x: 150, z: 150, pay: 200 });
  sim.command({ type: 'takeJob', i: 0 });
  const t2 = s.enemies.find(e => e.bounty);
  // hurt it, save, restore: hp returns to full
  p.x = t2.x; p.z = t2.z - 12; t2.heldT = 99;
  run(sim, 1.0, () => ({ fire: true, aim: aimAt(p, t2) }));
  const hurtHp = t2.hp, save = JSON.parse(JSON.stringify(sim.snapshot())), b = createSim();
  b.restore(save);
  const tb = b.state.enemies.find(e => e.bounty);
  note(tb.hp === tb.maxHp && hurtHp < t2.maxHp ? 'BUG' : 'PASS', `save/restore mid-bounty: target hp ${hurtHp.toFixed(0)} -> ${tb.hp} (full again), moved back to ${tb.x},${tb.z}; target id ${t2.id} -> ${tb.id}`);
  note(b.state.enemies.filter(e => e.bounty).length === 1 ? 'PASS' : 'FAIL', 'restore yields exactly one bounty target');
  // restore twice into the same sim must not duplicate
  b.restore(save); b.restore(save);
  note(b.state.enemies.filter(e => e.bounty).length === 1 ? 'PASS' : 'FAIL', 'restoring three times still yields one bounty target');
  // death mid-bounty keeps the job
  p.hp = 1; t2.heldT = 0; p.x = t2.x + 1; p.z = t2.z; run(sim, 5);
  note(s.job?.type === 'bounty' && s.enemies.includes(t2) ? 'PASS' : 'FAIL', `death mid-bounty keeps the job (target hp ${t2.hp.toFixed(0)}/${t2.maxHp})`);
  // kill it
  p.x = t2.x; p.z = t2.z - 12; t2.heldT = 99; const m = p.money;
  run(sim, 20, () => ({ fire: true, aim: aimAt(p, t2) }), () => !!s.job);
  note(!s.job && p.money >= m + 200 ? 'PASS' : 'FAIL', `bounty pays on kill ($${p.money - m} incl. loot later)`);
  run(sim, 8);
  note(!s.enemies.includes(t2) ? 'PASS' : 'FAIL', 'dead bounty target is cleaned out of the enemy list');
}
{ // ---- bounty can it be done legitimately by a level-1 rider? (ride there, shoot, ride back) ----
  for (const seed of [1, 2, 3]) {
    const { sim, s, p } = fresh(seed);
    let i = s.board.findIndex(j => j.type === 'bounty'), tries = 0;
    // the board can no longer be rerolled by take+drop, so put a bounty on it at a wild pack's home
    if (i < 0) { const h = s.enemies.find(e => !e.outpost && e !== s.rex).home; s.board[0] = mk('bounty', { name: 'Scarback', x: h.x, z: h.z, pay: 120 }); i = 0; }
    sim.command({ type: 'takeJob', i });
    const t = s.enemies.find(e => e.bounty), t0 = s.clock; let deaths = 0, minHp = p.hp;
    run(sim, 600, () => {
      const d = dist(p, t), near = s.enemies.filter(e => !e.dead && dist(e, p) < 30).sort((a, b) => dist(a, p) - dist(b, p))[0] || t;
      const S = steer(p, t), mv = d > 16 ? toward(p, S.x, S.z) : dist(near, p) < 9 ? { mx: p.x - near.x, mz: p.z - near.z } : {};
      return { ...mv, sprint: d > 25, fire: dist(near, p) < 45, aim: aimAt(p, near) };
    }, (ev) => { for (const e of ev) if (e.type === 'death') deaths++; minHp = Math.min(minHp, p.hp); return !!s.job; });
    note(!s.job ? 'PASS' : 'FAIL', `seed ${seed}: bounty at ${dist(t, TOWN).toFixed(0)} from town done in ${(s.clock - t0).toFixed(0)}s, deaths ${deaths}, min hp ${minHp.toFixed(0)}, $${p.money}, level ${p.level}`);
  }
}
{ // ---- hunt: turn-in maths ----
  const { sim, s, p } = fresh();
  s.board[0] = mk('hunt', { count: 3, pay: 100 }); sim.command({ type: 'takeJob', i: 0 });
  p.res.hide = 3; sim.command({ type: 'turnIn' });
  note(!s.job && p.res.hide === 0 && p.money === 150 ? 'PASS' : 'FAIL', 'hunt contract with exact hides pays');
  sim.command({ type: 'turnIn' });
  note(p.money === 150 ? 'PASS' : 'FAIL', 'second turnIn with no job pays nothing');
  // hides already in the bag count at once
  p.res.hide = 4; s.board[0] = mk('hunt', { count: 4, pay: 180 }); sim.command({ type: 'takeJob', i: 0 }); sim.command({ type: 'turnIn' });
  note(!s.job ? 'INFO' : 'PASS', 'hunt contract can be taken and turned in within the same instant if hides are already carried');
  // save/restore keeps a hunt job
  s.board[0] = mk('hunt', { count: 2, pay: 80 }); sim.command({ type: 'takeJob', i: 0 });
  const b = createSim(); b.restore(JSON.parse(JSON.stringify(sim.snapshot())));
  note(b.state.job?.type === 'hunt' && b.state.job.count === 2 ? 'PASS' : 'FAIL', 'hunt job survives save/restore');
}
{ // ---- supply: complete, timeout, death, restore ----
  const { sim, s, p } = fresh();
  s.board[0] = mk('supply', { x: 150, z: 20, place: 'the mesa road', carrying: false, left: 300, pay: 120 });
  sim.command({ type: 'takeJob', i: 0 });
  const t0 = s.clock; goto(sim, 150, 20);
  note(s.job?.carrying ? 'PASS' : 'FAIL', `crate reached by riding in ${(s.clock - t0).toFixed(0)}s`);
  // save/restore while carrying
  const b = createSim(); b.restore(JSON.parse(JSON.stringify(sim.snapshot())));
  note(b.state.job?.carrying === true && Math.abs(b.state.job.left - s.job.left) < 1e-9 ? 'PASS' : 'FAIL', 'carrying + timer survive save/restore');
  // death while carrying
  p.hp = 0.01; const e = s.enemies.find(e => !e.dead && !e.outpost && e !== s.rex); e.x = p.x + 2; e.z = p.z; e.state = 'chase'; e.cd = 0; e.home = { x: p.x, z: p.z };
  run(sim, 0.2);
  note(p.dead && s.job && s.job.carrying === false ? 'PASS' : 'FAIL', `death while carrying puts the crate back (dead ${p.dead}, carrying ${s.job?.carrying})`);
  run(sim, 4);
  // let the timer run out
  const left = s.job.left; run(sim, left + 1);
  note(!s.job ? 'PASS' : 'FAIL', 'supply run fails when the clock runs out');
  // full legit loop timing
  const c = fresh(5); c.s.board[0] = mk('supply', { x: -20, z: 200, place: 'the north ford', carrying: false, left: 300, pay: 170 });
  c.sim.command({ type: 'takeJob', i: 0 }); const m = c.p.money, c0 = c.s.clock;
  goto(c.sim, -20, 200, 200); goto(c.sim, 0, -10, 200);
  note(!c.s.job && c.p.money >= m + 170 ? 'PASS' : 'FAIL', `farthest supply run (north ford, 210 away) round trip ${(c.s.clock - c0).toFixed(0)}s of 300 allowed, hp ${c.p.hp.toFixed(0)}`);
}
{ // ---- rest does not run job timers ----
  const { sim, s, p } = fresh();
  s.board[0] = mk('herd', { count: 3, left: 420 }); sim.command({ type: 'takeJob', i: 0 });
  const c0 = s.clock; sim.command({ type: 'rest' });
  note(s.job && s.job.left === 420 ? 'BUG' : 'PASS', `rest skipped ${((s.clock - c0) / 60).toFixed(1)} game-minutes but the herd-order timer still shows ${s.job?.left}s (timed jobs ignore sleeping)`);
}
{ // ---- herd order: complete, fail, death, new day ----
  const { sim, s, p } = fresh();
  s.board[0] = mk('herd', { count: 2, left: 420, pay: 150 }); sim.command({ type: 'takeJob', i: 0 });
  const m = p.money;
  for (let k = 0; k < 2; k++) { const a = s.animals.find(a => !a.penned); a.x = PEN.x; a.z = PEN.z - 4; run(sim, 0.1); }
  note(!s.job && p.money === m + 150 + 60 ? 'PASS' : 'FAIL', `herd order completes on the 2nd pen ($${p.money - m})`);
  s.board[0] = mk('herd', { count: 5, left: 3, pay: 150 }); sim.command({ type: 'takeJob', i: 0 }); run(sim, 3.2);
  note(!s.job ? 'PASS' : 'FAIL', 'herd order fails on timeout');
  // board refresh at a new day keeps the active job and replaces offers
  s.board[0] = mk('herd', { count: 5, left: 4000, pay: 150 }); sim.command({ type: 'takeJob', i: 0 });
  const before = s.board.map(j => j.text + j.pay).join('|'), day0 = s.boardDay;
  s.clock += 24 * 60; run(sim, 0.05);
  note(s.job?.type === 'herd' && s.boardDay === day0 + 1 && s.board.length === 3 ? 'PASS' : 'FAIL', `new day: job kept, board replaced (${before !== s.board.map(j => j.text + j.pay).join('|')})`);
  // a longhorn that walks in by itself while the rider is far away still pays
  const q = fresh(); const a = q.s.animals[0]; a.x = PEN.x; a.z = PEN.z; q.p.x = -200; q.p.z = -200; run(q.sim, 0.1);
  note(a.penned && q.p.money === 80 ? 'INFO' : 'PASS', 'a longhorn inside the pen radius is penned and paid wherever the rider is');
}
{ // ---- every offer the board can generate is well-formed over many refreshes ----
  const { sim, s, p } = fresh(11); const types = {}; let bad = 0;
  for (let k = 0; k < 3000; k++) {
    sim.command({ type: 'takeJob', i: k % 3 });
    const j = s.job; types[j.type] = (types[j.type] || 0) + 1;
    if (!(j.pay > 0) || !j.text || (j.type === 'bounty' && !s.enemies.some(e => e.id === j.target))) bad++;
    sim.command({ type: 'dropJob' }); if (k % 50 === 0) run(sim, 0.05);
  }
  run(sim, 0.1);
  note(bad === 0 && s.enemies.length === 28 ? 'PASS' : 'FAIL', `3000 take/drop cycles: ${JSON.stringify(types)}, malformed ${bad}, enemies ${s.enemies.length} (no leaked bounty targets)`);
}
