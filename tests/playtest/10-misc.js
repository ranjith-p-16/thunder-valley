// Win flow, outposts, night, loot with full bags, API robustness.
import { createSim, STEP, inp, toward, dist, aimAt, run, note, TOWN } from './lib.js';

{ // capture all camps + kill the Rex -> won, Tyrant rideable
  const sim = createSim(), s = sim.state, p = s.player; let xp0 = p.xp, lvl0 = p.level;
  for (const o of s.outposts) {
    const g = s.enemies.filter(e => e.outpost === o);
    p.x = o.x; p.z = o.z; run(sim, 1);
    const blocked = o.progress === 0;
    g.forEach(e => { e.hp = 0.01; e.x = o.x + 6; e.z = o.z; e.heldT = 99; });
    run(sim, 10, () => ({ fire: true, aim: aimAt(p, g.find(e => !e.dead) || { x: o.x + 6, z: o.z }) }), () => !o.captured);
    if (!blocked || !o.captured) note('FAIL', `outpost ${o.name}: blocked while guarded ${blocked}, captured ${o.captured}`);
  }
  note(s.outposts.every(o => o.captured) && !s.won ? 'PASS' : 'FAIL', 'three camps captured (each blocked while guards live), not yet won');
  run(sim, 120);
  note(s.enemies.filter(e => e.outpost && !e.dead).length === 0 ? 'PASS' : 'FAIL', 'camp guards never respawn');
  const rex = s.rex; rex.hp = 1; rex.heldT = 99; p.x = rex.x; p.z = rex.z - 15;
  run(sim, 5, () => ({ fire: true, aim: aimAt(p, rex, 4.6) }), () => !rex.dead);
  run(sim, 0.1);
  note(s.won && p.mounts[2] ? 'PASS' : 'FAIL', 'Rex dead + camps -> won, Tyrant unlocked');
  run(sim, 100);
  note(rex.dead ? 'PASS' : 'FAIL', 'the Rex stays dead');
  p.x = 0; p.z = -10; sim.command({ type: 'mount', i: 2 });
  note(p.mount === 2 ? 'PASS' : 'FAIL', 'Tyrant can be ridden');
  // captured camp heals
  p.x = s.outposts[0].x; p.z = s.outposts[0].z; p.hp = 10; run(sim, 2);
  note(p.hp > 30 ? 'PASS' : 'FAIL', `captured camp heals the rider (${p.hp.toFixed(0)})`);
}
{ // night: aggro range x1.4
  const reach = (clock) => { const sim = createSim(), s = sim.state, p = s.player, e = s.enemies.find(e => !e.outpost && e !== s.rex); s.clock = clock; p.x = e.x + 45; p.z = e.z; e.wanderT = 99; e.tx = e.x; e.tz = e.z; run(sim, 1); return e.state; };
  note(reach(0) === 'wander' && reach(0.6 * 1440) === 'chase' ? 'PASS' : 'FAIL', 'a raptor ignores a rider 45 away by day and charges at night');
}
{ // loot with a full bag
  const sim = createSim(), s = sim.state, p = s.player; p.x = 150; p.z = 0;
  sim.economy.addRes('meat', 20);
  s.loot.push({ id: 'lootX', x: p.x, z: p.z, items: { hide: 2 }, money: 7, t: 120 });
  let pickups = 0, toasts = 0; run(sim, 5, () => ({}), (ev) => { for (const x of ev) { if (x.type === 'pickup') pickups++; if (x.type === 'toast' && /full/.test(x.text)) toasts++; } });
  note(p.money === 57 && s.loot.length === 1 && toasts === 1 ? 'PASS' : 'FAIL', `full bags: money taken ($${p.money}), items left on the ground, one "bags are full" toast (${toasts}), pickup events ${pickups} (none even though $7 was collected – cosmetic)`);
  run(sim, 120); note(s.loot.length === 0 ? 'PASS' : 'FAIL', 'unclaimed loot expires');
}
{ // API robustness
  const r = [];
  for (const [label, fn] of [
    ['step() with no argument', (sim) => sim.step()],
    ['step({}) (no actions array)', (sim) => sim.step({})],
    ['step with mx/mz = NaN', (sim) => { sim.step(inp({ mx: NaN, mz: NaN })); if (!Number.isFinite(sim.state.player.x)) throw new Error(`player.x = ${sim.state.player.x}`); }],
    ['step with mx = Infinity', (sim) => { sim.step(inp({ mx: Infinity, mz: 1 })); if (!Number.isFinite(sim.state.player.x)) throw new Error(`player.x = ${sim.state.player.x}`); }],
    ['command({})', (sim) => sim.command({})],
    ['fire with a zero-length aim ray', (sim) => { const p = sim.state.player; p.x = 100; p.z = 100; sim.step(inp({ fire: true, aim: { ox: 100, oy: 5, oz: 100, dx: 0, dy: 0, dz: 0, yaw: 0 } })); for (let i = 0; i < 30; i++) sim.step(inp()); if (sim.state.bullets.some(b => !Number.isFinite(b.x))) throw new Error('bullet position NaN'); }],
  ]) { const sim = createSim(); try { fn(sim); r.push([label, 'ok']); } catch (e) { r.push([label, 'THROWS/NaN: ' + e.message]); } }
  for (const [label, res] of r) note(res === 'ok' ? 'PASS' : 'BUG', `${label}: ${res}`);
}
