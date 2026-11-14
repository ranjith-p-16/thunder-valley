// Code-review reproductions (read-only checks of suspected defects). Run: node tests/playtest/90-code-review-checks.js
import { createSim, STEP } from '../../src/sim/sim.js';
import { heightAt } from '../../src/sim/terrain.js';
import { PEN } from '../../src/data/content.js';

const base = { mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [] };
const run = (sim, secs, f = () => ({})) => { for (let i = 0; i < secs / STEP; i++) sim.step({ ...base, ...f(i) }); };
const say = (name, v) => console.log(name.padEnd(58), v);

{ // A: save taken mid-reload restores an empty gun that never reloads by itself
  const sim = createSim(), p = sim.state.player;
  p.x = 0; p.z = -70;
  run(sim, 1.3, () => ({ fire: true }));
  const s = JSON.parse(JSON.stringify(sim.snapshot()));
  const b = createSim(); b.restore(s); b.state.player.x = 0; b.state.player.z = -70;
  run(b, 5, () => ({ fire: true }));
  say('A ammo/reloadT 5s after load while holding fire', `${b.state.player.ammo.revolver} / ${b.state.player.reloadT}`);
}
{ // B: swapping weapons resets the rifle's fire cooldown
  const count = (swap) => {
    const sim = createSim(), p = sim.state.player; let shots = 0;
    p.x = 0; p.z = -70; p.weapons.rifle = 0; p.ammo.rifle = 5; p.weapon = 'rifle';
    for (let i = 0; i < 3 / STEP; i++) {
      const acts = swap && p.fireCd > 0.3 ? [p.weapon === 'rifle' ? 'weapon0' : 'weapon1'] : swap && p.weapon !== 'rifle' ? ['weapon1'] : [];
      const ev = sim.step({ ...base, fire: p.weapon === 'rifle', actions: acts });
      shots += ev.filter(e => e.type === 'shot' && e.weapon === 'rifle').length;
    }
    return shots;
  };
  say('B rifle shots in 3s: plain vs swap-cancel', `${count(false)} vs ${count(true)}`);
}
{ // C: fast bullets tunnel through a raptor when aimed off-centre
  for (const [w, off] of [['rifle', 1.2], ['rifle', 0], ['revolver', 1.6]]) {
    let hits = 0, n = 0;
    for (let d = 20; d < 60; d += 0.37) {
      const sim = createSim(), p = sim.state.player, e = sim.state.enemies.find(e => !e.outpost && e.kind === 'raptor');
      p.weapons[w] = 0; p.ammo[w] = 5; p.weapon = w;
      p.x = e.x; p.z = e.z - d; p.yaw = 0; e.heldT = 99;
      const m = sim.muzzle(), ty = heightAt(e.x, e.z) + 1.6, dx = e.x + off - m.x, dy = ty - m.y, dz = e.z - m.z, len = Math.hypot(dx, dy, dz);
      const aim = { ox: m.x, oy: m.y, oz: m.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: 0 };
      let hit = false;
      for (let i = 0; i < 40; i++) { const ev = sim.step({ ...base, fire: i === 0, aim }); if (ev.some(x => x.type === 'hit')) hit = true; e.heldT = 99; }
      n++; if (hit) hits++;
    }
    say(`C ${w} aimed ${off} off-centre (hit radius 1.84)`, `${hits}/${n} hit`);
  }
}
{ // D: restore accepts markup in job text and non-numeric money
  const sim = createSim(), s = JSON.parse(JSON.stringify(sim.snapshot()));
  s.job = { type: 'hunt', title: '<img src=x onerror=alert(1)>', text: 'x', pay: 1, xp: 1, count: 1, left: 0, done: 0 };
  s.player.money = '<img src=x onerror=alert(2)>';
  const b = createSim();
  say('D restore ok / job title / money', `${b.restore(s)} / ${b.jobs.status().title} / ${b.state.player.money}`);
  let threw = ''; try { createSim().restore({ version: 2 }); } catch (e) { threw = e.constructor.name; }
  say('D restore({version:2}) throws', threw || 'no');
  const c = createSim(), s2 = JSON.parse(JSON.stringify(sim.snapshot())); s2.player.weapon = 'cannon';
  let t2 = ''; try { c.restore(s2); c.step(base); } catch (e) { t2 = e.message; }
  say('D unknown weapon id: step after restore', t2 || 'no throw');
}
{ // E: followT survives penning and being sold on
  const sim = createSim(), a = sim.state.animals[0];
  a.followT = 6; a.x = PEN.x; a.z = PEN.z;
  run(sim, 3);
  say('E penned / followT after 3s in pen', `${a.penned} / ${a.followT}`);
}
{ // F: the no-direction "hop backwards" turns the rider round
  const sim = createSim(), p = sim.state.player; p.yaw = 0;
  sim.step({ ...base, actions: ['dodge'] }); run(sim, 0.4);
  say('F yaw after backward hop (was 0)', p.yaw.toFixed(2));
}
{ // G: dash carries through death and respawn
  const sim = createSim(), p = sim.state.player; p.x = 0; p.z = -70;
  sim.step({ ...base, actions: ['ability'] });
  p.hp = 0.01; const e = sim.state.enemies[0]; e.x = p.x; e.z = p.z + 1; e.home = { x: e.x, z: e.z }; e.state = "chase"; e.cd = 0;
  run(sim, 0.1); const dead = p.dead; run(sim, 3.1); const z0 = p.z; run(sim, 0.5);
  say('G died / dashT at respawn / moved with no input', `${dead} / ${p.dashT.toFixed(2)} / ${(Math.hypot(p.z - z0)).toFixed(1)}`);
}
{ // H: snapshot -> restore -> snapshot with a bounty job
  const sim = createSim(), s = sim.state;
  s.board[0] = { type: 'bounty', title: 'Bounty', text: '', pay: 200, xp: 250, name: 'Scarback', x: 150, z: 150, left: 0, done: 0 };
  sim.command({ type: 'takeJob', i: 0 });
  const t = s.enemies.find(e => e.bounty); t.hp = 10;
  const a = JSON.stringify(sim.snapshot()), b = createSim(); b.restore(JSON.parse(a));
  const sb = b.snapshot(), sa = JSON.parse(a);
  say('H nextId / rand / target before->after', `${sa.nextId}->${sb.nextId}  ${sa.rand}->${sb.rand}  ${sa.job.target}->${sb.job.target}`);
  say('H bounty hp before->after load', `10 -> ${b.state.enemies.find(e => e.bounty).hp}`);
}
{ // I: state dropped by a save
  const sim = createSim(), p = sim.state.player;
  p.buffs.steady = 50; p.stamina = 5; p.abilityCd = 9; sim.state.traps.push({ id: 't', x: 0, z: 0 });
  sim.state.loot.push({ id: 'l', x: 99, z: 99, items: { hide: 3 }, money: 300, t: 100 });
  const b = createSim(); b.restore(JSON.parse(JSON.stringify(sim.snapshot())));
  const q = b.state.player;
  say('I after load: steady / stamina / abilityCd / traps / loot', `${q.buffs.steady} / ${q.stamina} / ${q.abilityCd} / ${b.state.traps.length} / ${b.state.loot.length}`);
}
