// Save -> JSON -> restore into a fresh sim -> keep stepping, at awkward moments.
import { createSim, STEP, inp, toward, dist, aimAt, run, note, makeChecker, PEN, TOWN } from './lib.js';

const fresh = (seed = 99) => { const sim = createSim(seed); return { sim, s: sim.state, p: sim.state.player }; };
const roamer = (s, k = 0) => s.enemies.filter(e => !e.outpost && e !== s.rex && !e.bounty)[k];
const roundTrip = (sim, seed = 99) => { const b = createSim(seed); const ok = b.restore(JSON.parse(JSON.stringify(sim.snapshot()))); return { b, ok }; };
const die = ({ sim, s, p }) => { p.hp = 0.001; const e = roamer(s); e.x = p.x + 2; e.z = p.z; e.home = { x: e.x, z: e.z }; e.state = 'chase'; e.cd = 0; run(sim, 0.1); return p.dead; };
const same = (a, b) => JSON.stringify(a.snapshot()) === JSON.stringify(b.snapshot());

{ // plain mid-play round trip, then both keep stepping identically
  const f = fresh(4); const inputs = (i) => ({ mx: Math.sin(i / 50), mz: Math.cos(i / 70), sprint: i % 300 < 200, fire: i % 100 < 30 });
  f.p.x = 0; f.p.z = -80; run(f.sim, 60, inputs);
  const { b, ok } = roundTrip(f.sim, 4);
  note(ok && same(f.sim, b) ? 'PASS' : 'FAIL', 'snapshot == snapshot(restore(snapshot)) after a minute of play');
  run(f.sim, 60, inputs); run(b, 60, inputs);
  const diverged = !same(f.sim, b);
  const dp = dist(f.p, b.state.player);
  note(diverged ? 'INFO' : 'PASS', `continuing both for 60 s with identical inputs: ${diverged ? `states diverge (rider ${dp.toFixed(2)} apart, money ${f.p.money} vs ${b.state.player.money}) – AI state, cooldowns, stamina, loot and bullets are not in the save` : 'identical'}`);
}
{ // saved while dead
  const f = fresh(); f.p.x = 100; f.p.z = 100; f.p.money = 500; const d = die(f);
  const { b } = roundTrip(f.sim); const q = b.state.player;
  note(d && !q.dead && q.hp === 0 ? 'BUG' : 'PASS', `save while dead -> loads alive with hp ${q.hp} at (${q.x.toFixed(0)},${q.z.toFixed(0)}) (no respawn in town; death tax already taken: $${q.money})`);
  const chk = makeChecker(b, 'after dead-load'); let died = 0;
  run(b, 20, () => ({}), (ev) => { for (const x of ev) if (x.type === 'death') died++; chk.check(false); });
  note('INFO', `…20 s later: hp ${q.hp.toFixed(1)}, extra deaths ${died}, money $${q.money}`);
}
{ // saved on foot, away from the mount
  const f = fresh(); f.p.x = 100; f.p.z = 0; f.sim.step(inp({ actions: ['dismount'] })); run(f.sim, 6, () => ({ mx: 1, mz: 0, sprint: true }));
  const foot = { x: f.p.x, z: f.p.z }; const { b } = roundTrip(f.sim); const q = b.state.player;
  note(!q.onFoot && dist(q, f.p.steed) < 0.01 ? 'INFO' : 'FAIL', `save on foot ${dist(foot, f.p.steed).toFixed(0)} from the mount -> loads mounted at the mount's position (rider moved ${dist(q, foot).toFixed(0)} units)`);
}
{ // loot on the ground, traps placed, dynamite in the air, bullets flying
  const f = fresh(); const e = roamer(f.s); f.p.x = e.x; f.p.z = e.z - 14; f.p.thrown = { dynamite: 2, bolas: 0, trap: 3 };
  run(f.sim, 0.3, () => ({ aim: aimAt(f.p, e) }));
  run(f.sim, 8, () => ({ fire: true, aim: aimAt(f.p, e) }), () => !e.dead);
  f.sim.step(inp({ actions: ['throw:trap'] })); f.sim.step(inp({ actions: ['throw:dynamite'] }));
  const before = { loot: f.s.loot.length, lootMoney: f.s.loot.reduce((t, l) => t + l.money, 0), traps: f.s.traps.length, thrown: f.s.thrown.length, trapsCarried: f.p.thrown.trap };
  const { b } = roundTrip(f.sim);
  note(b.state.loot.length === 0 && before.loot > 0 ? 'BUG' : 'PASS', `save with ${before.loot} loot pile ($${before.lootMoney} + items), ${before.traps} placed trap, ${before.thrown} lit dynamite -> after load: loot ${b.state.loot.length}, traps ${b.state.traps.length}, thrown ${b.state.thrown.length} (all silently lost; the trap and dynamite were paid for)`);
}
{ // mid-reload with an empty gun
  const f = fresh(); f.p.x = 0; f.p.z = -80; run(f.sim, 2, () => ({ fire: true }), () => f.p.ammo.revolver > 0);
  const { b } = roundTrip(f.sim); const q = b.state.player;
  run(b, 5, () => ({ fire: true }));
  note(q.ammo.revolver === 0 && q.reloadT <= 0 ? 'BUG' : 'PASS', `save mid-reload (0 rounds) -> after load, holding fire for 5 s: ammo ${q.ammo.revolver}, reloadT ${q.reloadT.toFixed(2)} (gun stays empty until R is pressed; auto-reload only triggers on the shot that empties it)`);
}
{ // roped animal / rally / stamina / cooldowns / buffs
  const f = fresh(); const a = f.s.animals[0]; f.p.x = a.x + 6; f.p.z = a.z; f.sim.step(inp({ actions: ['lasso', 'holler', 'ability', 'dodge'] }));
  f.p.tonics.steady = 1; f.sim.command({ type: 'quick', slot: 'z', id: 'steady' }); f.sim.step(inp({ actions: ['quickZ'] }));
  run(f.sim, 2, () => ({ mx: 1, mz: 0, sprint: true }));
  const { b } = roundTrip(f.sim); const q = b.state.player;
  note('INFO', `not carried by a save: rope (${!!f.s.herd.roped} -> ${!!b.state.herd.roped}), steady-hand buff (${f.p.buffs.steady.toFixed(0)} s -> ${q.buffs.steady} s, tonic already spent), stamina (${f.p.stamina.toFixed(0)} -> ${q.stamina}), ability cooldown (${f.p.abilityCd.toFixed(1)} -> ${q.abilityCd.toFixed(1)}), holler cooldown (${f.s.herd.hollerCd.toFixed(1)} -> ${b.state.herd.hollerCd.toFixed(1)})`);
}
{ // enemy health and outpost capture progress
  const f = fresh(); const rex = f.s.rex; rex.hp = 100; rex.state = 'chase';
  const g = f.s.enemies.filter(e => e.outpost === f.s.outposts[0]); g.forEach(e => { e.dead = true; e.deadT = 0; e.hp = 0; });
  f.p.x = f.s.outposts[0].x; f.p.z = f.s.outposts[0].z; run(f.sim, 4);
  const prog = f.s.outposts[0].progress; const { b } = roundTrip(f.sim);
  note(b.state.rex.hp < 110 && b.state.enemies.filter(e => e.outpost && e.dead).length === 4 ? 'PASS' : 'FAIL', `Rex hp (${b.state.rex.hp.toFixed(0)}) and dead guards survive a save; capture progress ${(prog * 100).toFixed(0)}% -> ${(b.state.outposts[0].progress * 100).toFixed(0)}%`);
  run(b, 3); note(b.state.outposts[0].captured ? 'PASS' : 'FAIL', 'capture progress is carried by the save and the capture finishes after load');
}
{ // restore into a USED sim leaves stale state behind
  const f = fresh(); const save = JSON.parse(JSON.stringify(f.sim.snapshot()));
  const g = fresh(); g.p.x = 100; g.p.z = 100; g.p.thrown.trap = 2; g.sim.step(inp({ actions: ['ability'] })); g.sim.step(inp({ actions: ['dismount'] }));
  g.p.steed.coming = true; g.s.herd.hollerCd = 5; g.p.stamina = 3; g.p.buffs.steady = 50; g.s.outposts[0].progress = 0.9; g.p.dodgeCd = 5; g.p.fireCd = 9; g.p.deadT = 2;
  g.sim.restore(save); const q = g.p;
  const stale = [];
  if (q.abilityCd > 0) stale.push(`abilityCd ${q.abilityCd.toFixed(1)}`);
  if (q.stamina !== 100) stale.push(`stamina ${q.stamina}`);
  if (q.dodgeCd > 0) stale.push(`dodgeCd ${q.dodgeCd}`);
  if (q.fireCd > 0) stale.push(`fireCd ${q.fireCd}`);
  if (g.s.herd.hollerCd > 0) stale.push(`hollerCd ${g.s.herd.hollerCd}`);
  if (q.steed.coming) stale.push('steed.coming');
  if (q.buffs.steady) stale.push('buffs');
  note(stale.length ? 'BUG' : 'PASS', `restore() into a sim that has been played (Load from the pause menu) keeps: ${stale.join(', ') || 'nothing'}`);
}
{ // bad saves
  const f = fresh(); const good = JSON.parse(JSON.stringify(f.sim.snapshot())); const res = [];
  const tryIt = (label, save) => { const g = createSim(); let r; try { r = g.restore(save); g.step(inp()); res.push(`${label}: ${r ? 'accepted' : 'refused'}`); } catch (e) { res.push(`${label}: THROWS ${e.message}`); } };
  tryIt('null', null); tryIt('wrong version', { ...good, version: 1 });
  tryIt('no enemies key', { ...good, enemies: undefined });
  tryIt('player missing', { ...good, player: undefined });
  tryIt('money NaN', { ...good, player: { ...good.player, money: null } });
  tryIt('weapon not owned', { ...good, player: { ...good.player, weapon: 'rifle' } });
  tryIt('mount 7', { ...good, player: { ...good.player, mount: 7 } });
  for (const r of res) note(/THROWS/.test(r) ? 'BUG' : 'PASS', `corrupt save – ${r}`);
}
{ // long soak: save/restore into a fresh sim every 20 s for 20 min of monkey play, invariants on
  const R = (() => { let x = 12345; return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
  let sim = createSim(8), goal = { x: 0, z: -80 }, swaps = 0, refused = 0, viol = new Set();
  for (let i = 0; i < 20 * 60 * 60; i++) {
    const p = sim.state.player;
    if (i % 600 === 0) goal = { x: (R() - 0.5) * 560, z: (R() - 0.5) * 560 };
    const near = sim.state.enemies.filter(e => !e.dead && dist(e, p) < 40)[0];
    const o = inp({ ...toward(p, goal.x, goal.z), sprint: R() < 0.5, fire: !!near, aim: near ? aimAt(p, near) : null });
    if (R() < 0.01) o.actions.push(['lasso', 'holler', 'ability', 'dodge', 'dismount', 'reload'][Math.floor(R() * 6)]);
    sim.step(o);
    if (i % 1200 === 1199) { const b = createSim(8); if (!b.restore(JSON.parse(JSON.stringify(sim.snapshot())))) refused++; else { sim = b; swaps++; } }
    if (i % 60 === 0) { const chk = makeChecker(sim); chk.check(true); for (const k of chk.seen.keys()) viol.add(k); }
  }
  note(refused === 0 && [...viol].every(k => k === 'aliveWithZeroHp') ? 'PASS' : 'FAIL', `20 min with a save->fresh-sim->restore every 20 s: ${swaps} swaps, ${refused} refused, violations: ${[...viol].join(', ') || 'none'}`);
}
