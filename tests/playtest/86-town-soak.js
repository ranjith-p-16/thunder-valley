// Long soak of the town (tester 86):  node 86-town-soak.js [days] [mode]
import { lateGame, note, clone, createSim, STEP } from './50-lib.js';
import { TOWN_RULE as R, DAY } from '../../src/data/content.js';
import { TOWN } from '../../src/data/items.js';

const DAYS = +process.argv[2] || 32;
function soak(label, level, where, opts = {}) {
  const g = lateGame(opts.seed || 99, { level: opts.rider || 12, mates: opts.mates || [] }), { s, sim, p } = g, t = s.town;
  t.level = level; if (opts.law) t.law = opts.law;
  p.x = where[0]; p.z = where[1];
  const bad = new Set(); let maxEn = 0, maxLoot = 0, maxEv = 0, raidStart = 0, raidLens = [], deaths = 0, wasDead = false, maxPick = 0;
  const lv0 = p.level, xp0 = p.xp, m0 = p.money;
  const steps = Math.round(DAYS * DAY.length / STEP);
  for (let i = 0; i < steps; i++) {
    let inp = {};
    if (opts.active) {
      // defend: fight raiders from the square; otherwise stand in town; top stores up each morning
      const rs = s.enemies.filter(e => e.tag === 'raid' && !e.dead && !e.gone).sort((a, b) => g.dist(a) - g.dist(b));
      if (rs[0]) inp = g.dist(rs[0]) > 22 ? { mx: rs[0].x - p.x, mz: rs[0].z - p.z, sprint: true } : { fire: true, aim: g.aimAt(rs[0]) };
      else if (g.dist({ x: 0, z: -10 }) > 4) inp = { mx: -p.x, mz: -10 - p.z };
      if (i % (60 * 600) === 0 && !t.raid) { p.res.meat = 8; g.cmd({ type: 'townSupply' }); g.cmd({ type: 'townUpgrade' }); if (opts.rest) g.cmd({ type: 'rest' }); }
    }
    const ev = g.step(inp);
    if (ev.length > maxEv) maxEv = ev.length;
    if (p.dead && !wasDead) deaths++; wasDead = p.dead;
    if (t.raid && !raidStart) raidStart = s.clock; if (!t.raid && raidStart) { raidLens.push(Math.round(s.clock - raidStart)); raidStart = 0; }
    if (i % 600 === 0) {
      maxEn = Math.max(maxEn, s.enemies.length); maxLoot = Math.max(maxLoot, s.loot.length); maxPick = Math.max(maxPick, s.pickups.length);
      for (const k of ['treasury', 'supplies', 'safety', 'morale', 'raidIn', 'day']) if (!Number.isFinite(t[k]) || t[k] < 0 || (k !== 'treasury' && k !== 'raidIn' && k !== 'day' && t[k] > 100)) bad.add(`${k}=${t[k]}`);
      if (!Number.isFinite(p.hp) || !Number.isFinite(p.money) || p.money < 0 || !Number.isFinite(p.xp)) bad.add(`player hp ${p.hp} money ${p.money}`);
      for (const e of s.enemies) if (!Number.isFinite(e.x + e.z + e.hp)) bad.add(`enemy ${e.id} NaN`);
      if (!!s.siege !== !!t.raid) bad.add(`siege ${s.siege} raid ${!!t.raid}`);
    }
    if (opts.saveEvery && i % opts.saveEvery === opts.saveEvery - 1) { const sv = clone(sim.snapshot()); if (!sim.restore(sv)) bad.add('restore failed'); }
  }
  note(`${label}: L${t.level} ${DAYS} d | treasury ${t.treasury} stores ${t.supplies} safety ${t.safety} morale ${t.morale.toFixed(1)} | raids won ${t.raidsWon} lost ${t.raidsLost}, lengths ${raidLens.slice(0, 12).join(',')}${raidLens.length > 12 ? '…' : ''} (max ${Math.max(0, ...raidLens)}) raidOpen ${raidStart ? Math.round(s.clock - raidStart) : 0} | maxEnemies ${maxEn} maxLoot ${maxLoot} pickups ${maxPick} maxEvents/step ${maxEv} | rider L${lv0}->${p.level} money ${m0}->${p.money} deaths ${deaths} | bad: ${[...bad].slice(0, 5).join('; ') || 'none'}`);
}
const mode = process.argv[3] || 'all';
if (mode === 'all' || mode === 'far') for (const lv of [1, 3, 5]) soak(`idle far away`, lv, [250, 250]);
if (mode === 'all' || mode === 'town') for (const lv of [1, 3, 5]) soak(`idle in the square`, lv, [0, -10]);
if (mode === 'all' || mode === 'edge') for (const lv of [3, 5]) soak(`idle just outside town (r+50)`, lv, [0, -96]);
if (mode === 'all' || mode === 'active') { soak('active defender L25 with posse', 1, [0, -10], { active: true, rider: 25, mates: ['mara', 'tobe', 'june'] }); soak('active defender, high tax, saves every 30 s', 4, [0, -10], { active: true, rider: 25, mates: ['mara', 'tobe', 'june'], law: 'high', saveEvery: 1800 }); soak('active, low tax', 5, [0, -10], { active: true, rider: 25, mates: ['mara', 'tobe', 'june'], law: 'low' }); }
