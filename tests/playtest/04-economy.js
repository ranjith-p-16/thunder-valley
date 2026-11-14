// Economy edge cases and exploit hunting.
import { createSim, STEP, inp, dist, run, note, rng, PEN, TOWN } from './lib.js';
import { WEAPONS, THROWN, TONICS, GEAR, SKILLS, UPGRADE, TONIC_MAX } from '../../src/data/items.js';

const fresh = (seed = 99) => { const sim = createSim(seed); return { sim, s: sim.state, p: sim.state.player, cmd: (c) => sim.command(c) }; };
const tryCmd = (cmd, c) => { try { cmd(c); return null; } catch (e) { return e.message; } };

{ // cannot go into debt, cannot buy twice, caps hold
  const { p, cmd } = fresh(); p.money = 499;
  cmd({ type: 'buy', kind: 'weapon', id: 'rifle' });
  note(!('rifle' in p.weapons) && p.money === 499 ? 'PASS' : 'FAIL', 'cannot buy a $500 rifle with $499');
  p.money = 100000;
  cmd({ type: 'buy', kind: 'weapon', id: 'rifle' }); cmd({ type: 'buy', kind: 'weapon', id: 'rifle' });
  note(p.money === 99500 ? 'PASS' : 'FAIL', 'second rifle purchase is refused');
  for (let i = 0; i < 20; i++) { for (const id in THROWN) cmd({ type: 'buy', kind: 'thrown', id }); for (const id in TONICS) cmd({ type: 'buy', kind: 'tonic', id }); }
  note(Object.entries(THROWN).every(([id, d]) => p.thrown[id] === d.max) && Object.keys(TONICS).every(id => p.tonics[id] === TONIC_MAX) ? 'PASS' : 'FAIL', `carry caps hold (thrown ${JSON.stringify(p.thrown)}, tonics ${JSON.stringify(p.tonics)})`);
  cmd({ type: 'buy', kind: 'mount', i: 2 }); cmd({ type: 'buy', kind: 'mount', i: 0 }); cmd({ type: 'buy', kind: 'mount', i: 5 }); cmd({ type: 'buy', kind: 'mount', i: -1 });
  note(!p.mounts[2] && p.mounts.length === 3 ? 'PASS' : 'FAIL', 'Tyrant / bogus mounts cannot be bought');
  cmd({ type: 'mount', i: 2 });
  note(p.mount === 0 ? 'PASS' : 'FAIL', 'cannot ride an unowned mount');
}
{ // selling with empty / full bags, bag overflow
  const { sim, s, p, cmd } = fresh();
  const m = p.money; cmd({ type: 'sell', id: 'hide' }); cmd({ type: 'sell', id: 'nonsense' });
  note(p.money === m ? 'PASS' : 'FAIL', 'selling nothing / unknown resource pays nothing');
  note(sim.economy.addRes('hide', 50) === 20 && sim.economy.addRes('claws', 5) === 0 && sim.economy.bagUsed() === 20 ? 'PASS' : 'FAIL', 'bag caps at 20');
  // pack saddle: fill to 40, take the saddle off -> 40 items in a 20 bag
  p.money = 5000; cmd({ type: 'buy', kind: 'gear', id: 'pack' }); sim.economy.addRes('claws', 50);
  cmd({ type: 'buy', kind: 'gear', id: 'war' });
  note(sim.economy.bagUsed() > sim.st.bag ? 'INFO' : 'PASS', `pack saddle swapped for war saddle with a full bag: carrying ${sim.economy.bagUsed()} in a ${sim.st.bag} bag (nothing dropped; equip is not town-gated so the saddle can be swapped in the field)`);
  p.x = 200; p.z = 200; cmd({ type: 'equip', id: 'pack' });
  note(p.equipped.saddle === 'pack' ? 'INFO' : 'PASS', 'gear can be swapped anywhere (equip/skill/quick are not town-gated) – fine if intended');
}
{ // upgrade edge cases
  const { sim, p, cmd } = fresh(); p.money = 5000; p.res.claws = 4;
  cmd({ type: 'upgrade', kind: 'weapon', id: 'revolver' });
  note(p.weapons.revolver === 0 && p.money === 5000 ? 'PASS' : 'FAIL', 'upgrade without materials refused, no charge');
  p.res.claws = 17; cmd({ type: 'upgrade', kind: 'weapon', id: 'revolver' }); cmd({ type: 'upgrade', kind: 'weapon', id: 'revolver' }); cmd({ type: 'upgrade', kind: 'weapon', id: 'revolver' });
  note(p.weapons.revolver === 2 && p.res.claws === 0 && p.money === 4200 ? 'PASS' : 'FAIL', `two grades then capped (grade ${p.weapons.revolver}, $${p.money})`);
  cmd({ type: 'upgrade', kind: 'weapon', id: 'rifle' }); cmd({ type: 'upgrade', kind: 'gear', id: 'duster' }); cmd({ type: 'upgrade', kind: 'gear', id: 'revolver' });
  note(p.money === 4200 ? 'PASS' : 'FAIL', 'upgrading unowned / wrong-kind items does nothing');
  p.money = 150; p.res.hide = 5; p.gear.duster = 0;
  cmd({ type: 'upgrade', kind: 'gear', id: 'duster' });
  note(p.gear.duster === 0 && p.res.hide === 5 ? 'PASS' : 'FAIL', 'upgrade without money keeps the materials');
}
{ // equip/unequip max-health drift
  const { sim, p, cmd } = fresh(); p.money = 5000;
  cmd({ type: 'buy', kind: 'gear', id: 'duster' });
  const hp0 = p.hp;
  for (let i = 0; i < 101; i++) cmd({ type: 'equip', id: 'duster' });
  note(p.hp === Math.min(hp0, p.maxHp) && p.maxHp === 120 ? 'PASS' : 'FAIL', `101 duster toggles: hp ${p.hp}, maxHp ${p.maxHp} (only clips, no gain)`);
  cmd({ type: 'equip', id: 'duster' });
  note(p.hp === 120 && p.maxHp === 150 ? 'PASS' : 'FAIL', 'putting it back on adds max health but no free healing');
}
{ // skill point edge cases
  const { sim, p, cmd } = fresh(); p.skillPoints = 40;
  for (let i = 0; i < 15; i++) for (const tree in SKILLS) cmd({ type: 'skill', tree });
  note(Object.values(p.skills).every(n => n === 10) && p.skillPoints === 10 ? 'PASS' : 'FAIL', `trees cap at 10 each, spare points kept (${p.skillPoints})`);
  note(Math.abs(sim.st.deathLoss) < 1e-9 && p.maxHp === 180 && sim.magazine('revolver') === 7 ? 'PASS' : 'FAIL', `all skills apply: maxHp ${p.maxHp}, magazine ${sim.magazine('revolver')}, deathLoss ${sim.st.deathLoss}`);
  cmd({ type: 'skill', tree: 'nonsense' }); cmd({ type: 'skill' });
  note(p.skillPoints === 10 ? 'PASS' : 'FAIL', 'unknown tree ignored');
}
{ // rest clock maths
  const { sim, s, p, cmd } = fresh(); p.money = 1000; let ok = true, worst = 0; const R = rng(5);
  for (let i = 0; i < 500; i++) {
    s.clock = R() * 24 * 60 * 30; const c0 = s.clock, d0 = Math.floor(0.32 + c0 / 1440);
    cmd({ type: 'rest' });
    const adv = s.clock - c0, ph = sim.dayPhase();
    if (adv < -1e-6 || adv > 1440 + 1e-6 || Math.abs(ph - 7 / 24) > 1e-6) ok = false;
    worst = Math.max(worst, adv);
    p.money = 1000;
  }
  note(ok ? 'PASS' : 'FAIL', `rest from 500 random clock times always lands on 07:00 and moves 0..24 h forward (max ${(worst / 60).toFixed(1)} game-min)`);
  const c1 = s.clock; cmd({ type: 'rest' }); const again = s.clock - c1;
  note(again < 1 || again > 1439 ? 'INFO' : 'FAIL', `resting twice in a row advances ${again.toFixed(3)} s the second time (0 or a full day, decided by float rounding)`);
  p.money = 9; const hp = (p.hp = 50); cmd({ type: 'rest' });
  note(p.hp === hp && p.money === 9 ? 'PASS' : 'FAIL', 'cannot rest without $10');
}
{ // mount switching
  const { sim, s, p, cmd } = fresh(); p.mounts = [true, true, true];
  run(sim, 0.05, () => ({ actions: ['dismount'] }));
  cmd({ type: 'mount', i: 1 });
  note(p.mount === 0 ? 'PASS' : 'FAIL', 'cannot switch mounts while on foot');
  run(sim, 0.05, () => ({ actions: ['dismount'] }));
  // ability cooldown is shared and survives the swap; Dash carries over onto the Bulwark
  run(sim, 0.05, () => ({ actions: ['ability'] }));
  cmd({ type: 'mount', i: 1 });
  const x0 = p.x, z0 = p.z; run(sim, 1.0);
  note(Math.hypot(p.x - x0, p.z - z0) > 20 ? 'BUG' : 'PASS', `Dash started on the Strider keeps going after switching to the Bulwark: moved ${Math.hypot(p.x - x0, p.z - z0).toFixed(1)} in 1 s with no input (Bulwark sprint is 15/s)`);
  cmd({ type: 'mount', i: 'x' }); cmd({ type: 'mount' });
  note(p.mount === 1 ? 'PASS' : 'FAIL', 'bogus mount index ignored');
}
{ // money loop search: every command, repeated, from a rich state must never raise money except sell
  const { sim, s, p, cmd } = fresh(3); p.money = 20000; p.skillPoints = 30;
  const R = rng(9), pick = (a) => a[Math.floor(R() * a.length)], gains = {};
  const kinds = [['weapon', Object.keys(WEAPONS)], ['thrown', Object.keys(THROWN)], ['tonic', Object.keys(TONICS)], ['gear', Object.keys(GEAR)]];
  for (let i = 0; i < 20000; i++) {
    const [kind, ids] = pick(kinds), id = pick(ids), before = p.money;
    const c = pick([{ type: 'buy', kind, id }, { type: 'upgrade', kind, id }, { type: 'equip', id }, { type: 'skill', tree: pick(Object.keys(SKILLS)) }, { type: 'rest' }, { type: 'mount', i: pick([0, 1, 2]) }, { type: 'buy', kind: 'mount', i: pick([0, 1, 2]) }, { type: 'quick', slot: pick(['z', 'x', 'q']), id }, { type: 'dropJob' }, { type: 'takeJob', i: pick([0, 1, 2]) }, { type: 'turnIn' }]);
    cmd(c);
    if (p.money > before) gains[c.type] = (gains[c.type] || 0) + p.money - before;
    if (p.money < 200) p.money = 20000;
  }
  note(Object.keys(gains).length === 0 ? 'PASS' : 'FAIL', `20000 random shop/menu commands without selling: money-raising commands ${JSON.stringify(gains)}`);
}
{ // malformed commands (matters once the sim runs on a server)
  const out = [];
  let f = fresh(); f.cmd({ type: 'sell', id: 'constructor' }); out.push(`sell id:'constructor' -> money ${f.p.money}`);
  f = fresh(); f.cmd({ type: 'buy', kind: 'thrown', id: 'toString' }); out.push(`buy thrown id:'toString' -> money ${f.p.money}`);
  f = fresh(); f.cmd({ type: 'buy', kind: 'tonic', id: 'constructor' }); out.push(`buy tonic id:'constructor' -> money ${f.p.money}`);
  f = fresh(); f.p.skillPoints = 1; out.push(`skill tree:'constructor' -> ${tryCmd(f.cmd, { type: 'skill', tree: 'constructor' }) || 'no throw'}`);
  f = fresh(); f.cmd({ type: 'mount', i: 'constructor' }); out.push(`mount i:'constructor' -> mount=${typeof f.p.mount === 'string' ? f.p.mount : f.p.mount}, next step: ${(() => { try { f.sim.step(inp({ actions: ['ability'] })); return 'ok'; } catch (e) { return 'THROWS ' + e.message; } })()}`);
  f = fresh(); out.push(`step with unknown throw id -> ${(() => { try { f.sim.step(inp({ actions: ['throw:nuke'] })); return 'ok'; } catch (e) { return 'THROWS ' + e.message; } })()}`);
  f = fresh(); out.push(`quickZ after quick slot set to bad id -> ${(() => { try { f.cmd({ type: 'quick', slot: 'z', id: 'nope' }); f.sim.step(inp({ actions: ['quickZ'] })); return 'ok'; } catch (e) { return 'THROWS ' + e.message; } })()}`);
  f = fresh(); out.push(`command(null-ish {}) -> ${tryCmd(f.cmd, {}) || 'ok'}`);
  for (const o of out) note(/NaN|THROWS|Cannot|undefined|constructor,/.test(o) ? 'BUG' : 'PASS', `malformed: ${o}`);
}
{ // death tax arithmetic
  const { sim, s, p } = fresh(); p.money = 5; p.x = 100; p.z = 100;
  const kill = () => { p.hp = 0.001; const e = s.enemies.find(e => !e.dead && !e.outpost && e !== s.rex); e.x = p.x + 2; e.z = p.z; e.home = { x: e.x, z: e.z }; e.state = 'chase'; e.cd = 0; e.heldT = 0; run(sim, 0.1); const d = p.dead; run(sim, 3.2); return d; };
  const seq = [];
  for (let i = 0; i < 6; i++) { p.x = 100; p.z = 100; kill(); seq.push(p.money); }
  note(seq.every(m => m >= 0 && Number.isInteger(m)) ? 'PASS' : 'FAIL', `six deaths from $5: ${seq.join(',')} (never negative)`);
}
