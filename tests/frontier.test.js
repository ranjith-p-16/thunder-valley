// Scripted checks of the frontier rules (weather, moves, bait, hatchery, trader, giants, favours):  node tests/frontier.test.js
import { createSim, STEP } from '../src/sim/sim.js';
import { MOUNTS, DAY, TAME } from '../src/data/content.js';
import { TOWN } from '../src/data/items.js';
import { heightAt } from '../src/sim/terrain.js';
import { WEATHER, MOVES, MOVE_FROM, BAIT, HATCH, TRADER, GIANT, FAVOURS, FAVOUR_MAX, GOALS, LANDMARKS, CACHES } from '../src/data/frontier.js';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; };
const IDLE = { mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [] };
function mk() {
  const sim = createSim(), s = sim.state, p = s.player, f = s.frontier;
  const texts = [];
  const step = (input = {}) => { const ev = sim.step({ ...IDLE, ...input }); for (const e of ev) if (e.type === 'toast') texts.push(e.text); return ev; };
  const wait = (sec, input) => { for (let i = 0; i < sec / STEP; i++) step(input); };
  const cmd = (c) => { for (const e of sim.command(c)) if (e.type === 'toast') texts.push(e.text); };
  // open ground south of town, and a wild animal of our own to work on
  const open = () => { p.x = 0; p.z = -120; p.yaw = 0; p.steed.x = 0; p.steed.z = -120; };
  const place = (kind, dz = 8) => {
    const e = s.enemies.find(k => k.kind === kind && !k.outpost && !k.tag && !k.dead);
    Object.assign(e, { x: p.x, z: p.z + dz, tx: p.x, tz: p.z + dz, state: 'wander' }); Object.assign(e.home, { x: p.x, z: p.z + dz });
    return e;
  };
  const toTown = () => { p.x = TOWN.x; p.z = TOWN.z; };
  return { sim, s, p, f, texts, step, wait, cmd, open, place, toTown };
}

{ // weather
  const g = mk(), seen = new Set();
  let nan = false;
  for (let i = 0; i < 40; i++) { g.f.weatherT = 0; g.step(); seen.add(g.f.weather); if (!(g.f.weatherT > 0)) nan = true; }
  check('weather changes and every kind turns up', seen.size === Object.keys(WEATHER).length && !nan, [...seen].join(','));
  g.open();
  const speed = (kind) => { g.f.weather = kind; g.f.weatherT = 999; g.p.x = 0; g.p.z = -120; g.p.stamina = 100; g.wait(2, { mz: -1 }); return -120 - g.p.z; };
  const clear = speed('clear'), dust = speed('dust');
  check('a dust storm slows the ride', dust < clear * 0.95 && dust > clear * 0.8, `${clear.toFixed(1)} -> ${dust.toFixed(1)}`);
  check('weather reports its effect', g.sim.frontier.weather().aggro === WEATHER.dust.aggro);
}
{ // the second move
  const g = mk(), { p, sim } = g;
  g.open();
  const e = g.place('raptor', 6), hp = e.hp;
  g.step({ actions: ['move'] });
  check('no move while the mount is Young', e.hp === hp && g.texts.some(t => t.includes('Grown')));
  p.mountLv[0] = MOVE_FROM;
  g.step({ actions: ['move'] });
  check('Pounce hits and pins the animal ahead', e.hp < hp && e.heldT > 0 && p.moveCd > 0, `hp ${hp} -> ${e.hp.toFixed(0)}`);
  const hp2 = e.hp;
  g.step({ actions: ['move'] });
  check('the move has a cooldown', e.hp === hp2);
  // Brace
  p.mounts[5] = true; p.mount = 5; p.mountLv[5] = MOVE_FROM; p.moveCd = 0; sim.economy.recalc();
  g.step({ actions: ['move'] });
  check('Brace guards the rider', p.guardT > 0 && sim.frontier.hurtK() === MOVES[5].hurt);
  // Tail whip all round
  p.mounts[7] = true; p.mount = 7; p.mountLv[7] = MOVE_FROM; p.moveCd = 0; sim.economy.recalc();
  const behind = g.place('raptor', -7); behind.hp = behind.maxHp;
  g.step({ actions: ['move'] });
  check('Tail whip reaches behind', behind.hp < behind.maxHp);
  // not in town
  g.toTown(); p.moveCd = 0; g.texts.length = 0;
  g.step({ actions: ['move'] });
  check('fighting moves are refused in town', p.moveCd === 0 && g.texts.some(t => t.includes('town')));
}
{ // bait and taming
  const g = mk(), { p } = g;
  g.open();
  p.thrown.bait = 1; g.step({ actions: ['throw:bait'] });
  const far = g.texts.some(t => t.includes('close enough'));
  const e = g.place('raptor', 8);
  for (const k of g.s.enemies) if (k !== e && Math.hypot(k.x - p.x, k.z - p.z) < 80) k.dead = true;   // nothing else about to interrupt
  p.thrown.bait = 1; g.step({ actions: ['throw:bait'] });
  check('bait needs an animal near, and then holds it', (far || p.thrown.bait === 0) && e.baited && e.heldT > BAIT.hold - 1 && p.thrown.bait === 0);
  e.hp = e.maxHp * 0.5;   // above a third, under 60%
  g.step({ actions: ['tame'] });
  check('a baited animal can be tamed at half health', !!p.tame, g.texts.slice(-1)[0]);
  const had = p.mounts[0];
  g.wait(TAME.time + 0.5);
  check('the taming completes', had && e.dead && e.tamed, g.texts.slice(-3).join(' / '));
}
{ // hatchery and breeding
  const g = mk(), { p, f } = g;
  g.toTown(); p.money = 5000;
  g.cmd({ type: 'hatch', i: 6 });
  check('no egg, no hatching', !f.hatch);
  p.eggs[6] = 2;
  g.cmd({ type: 'hatch', i: 6 });
  g.cmd({ type: 'hatch', i: 6 });
  check('one egg at a time under the lamps', f.hatch?.i === 6 && p.eggs[6] === 1 && p.money < 5000);
  const save = JSON.parse(JSON.stringify(g.sim.snapshot())), again = createSim();
  check('a warming egg survives a save', again.restore(save) && again.state.frontier.hatch?.i === 6 && again.state.player.eggs[6] === 1);
  f.hatch.t = 0.05; g.wait(0.2);
  check('an egg of a new kind hatches into a mount', p.mounts[6] === true && !f.hatch && p.string.includes(6));
  g.cmd({ type: 'hatch', i: 6 }); f.hatch.t = 0.05; g.wait(0.2);
  const before = g.sim.meleeDamage(6) / (1 + HATCH.bloodDmg);
  check('an egg of a kind you own strengthens the bloodline', p.blood[6] === 1 && Math.abs(g.sim.meleeDamage(6) / before - (1 + HATCH.bloodDmg)) < 1e-9);
  g.cmd({ type: 'breed', i: 6 });
  check('a Young mount cannot breed', p.eggs[6] === 0);
  p.mountLv[6] = MOVE_FROM; p.res.meat = HATCH.breedMeat;
  g.cmd({ type: 'breed', i: 6 }); g.cmd({ type: 'breed', i: 6 });
  check('a Grown mount lays one egg a day', p.eggs[6] === 1 && p.res.meat === 0);
  g.cmd({ type: 'breed', i: 1 });
  check('mounts that are not tamed from the wild do not breed', p.eggs[1] === 0);
}
{ // Silas
  const g = mk(), { p, f, s } = g;
  g.toTown(); p.money = 5000;
  g.cmd({ type: 'trader', buy: 'egg' });
  check('Silas is not here on the first day', !g.sim.frontier.traderHere() && p.money === 5000);
  s.clock += DAY.length * 2; g.wait(0.1);
  check('Silas arrives on the third day with an egg', g.sim.frontier.traderHere() && f.traderEgg >= 0 && f.traderFeed === TRADER.feedStock);
  const egg = f.traderEgg;
  g.cmd({ type: 'trader', buy: 'egg' }); g.cmd({ type: 'trader', buy: 'egg' });
  check('his egg can be bought once', p.eggs[egg] === 1 && f.traderEgg === -1);
  const lv = p.mountXp[p.mount] + p.mountLv[p.mount] * 1000;
  g.cmd({ type: 'trader', buy: 'feed' }); g.cmd({ type: 'trader', buy: 'feed' }); g.cmd({ type: 'trader', buy: 'feed' });
  check('growth feed is limited and levels the mount', f.traderFeed === 0 && p.mountXp[p.mount] + p.mountLv[p.mount] * 1000 > lv);
  p.res.claws = 3; const m = p.money;
  g.cmd({ type: 'trader', buy: 'claws' });
  check('he pays double for claws', p.res.claws === 0 && p.money === m + 3 * g.sim.economy.sellPrice('claws') * TRADER.clawsMul);
  s.clock += DAY.length; g.wait(0.1);
  check('and is gone the next day', !g.sim.frontier.traderHere());
}
{ // giants
  const g = mk(), { p, f, s } = g;
  check('no giant on the first day', !f.giant);
  s.clock += DAY.length * GIANT.first; g.wait(0.1);
  const e = s.enemies.find(k => k.tag === 'giant');
  check('a giant is sighted', !!e && !!g.sim.frontier.giantMark() && e.maxHp > 200 && g.texts.some(t => t.includes('giant')), e && `${e.name} hp ${e.maxHp}`);
  const save = JSON.parse(JSON.stringify(g.sim.snapshot())), again = createSim();
  check('the giant survives a save', again.restore(save) && again.state.enemies.filter(k => k.tag === 'giant').length === 1 && again.state.frontier.giant?.name === e.name);
  g.cmd({ type: 'favour', id: 'nettleGiant', act: 'take' });   // refused: not in town
  g.toTown(); g.cmd({ type: 'favour', id: 'nettleGiant', act: 'take' });
  p.x = e.x; p.z = e.z - 6; p.yaw = 0;
  const money = p.money;
  e.hp = 1; p.mountLv[0] = MOVE_FROM; g.step({ actions: ['move'] }); g.wait(0.1);
  check('killing it pays and schedules the next', e.dead && p.money >= money + GIANT.money && !f.giant && f.giantDay > GIANT.first, `money ${money} -> ${p.money}`);
  g.toTown(); const m2 = p.money;
  g.cmd({ type: 'favour', id: 'nettleGiant', act: 'done' });
  check("Old Nettle's favour is handed in", f.done.includes('nettleGiant') && p.money === m2 + 500);
}
{ // favours
  const g = mk(), { p, f } = g;
  g.toTown();
  for (const d of FAVOURS.slice(0, FAVOUR_MAX + 1)) g.cmd({ type: 'favour', id: d.id, act: 'take' });
  check(`only ${FAVOUR_MAX} favours at once`, f.favours.length === FAVOUR_MAX);
  g.cmd({ type: 'favour', id: 'docHides', act: 'done' });
  check('a favour cannot be handed in early', !f.done.length);
  p.res.hide = 7; const money = p.money;
  g.cmd({ type: 'favour', id: 'docHides', act: 'done' }); g.cmd({ type: 'favour', id: 'docHides', act: 'take' });
  check('hides are taken, the reward is paid once', p.res.hide === 1 && p.money === money + 120 && f.done.includes('docHides') && !f.favours.some(k => k.id === 'docHides'));
  g.cmd({ type: 'favour', id: 'tobeRaptors', act: 'take' });
  const fav = f.favours.find(k => k.id === 'tobeRaptors');
  g.open();
  for (let i = 0; i < 3; i++) { const e = g.place('raptor', 6); e.hp = 1; p.mountLv[0] = MOVE_FROM; p.moveCd = 0; g.step({ actions: ['move'] }); g.wait(0.1); }
  check('kills count toward a favour', fav && fav.n === 3, `n ${fav?.n}`);
  const save = JSON.parse(JSON.stringify(g.sim.snapshot())), again = createSim();
  check('favours survive a save', again.restore(save) && again.state.frontier.favours.find(k => k.id === 'tobeRaptors')?.n === 3 && again.state.frontier.done.includes('docHides'));
  const bad = { ...save, frontier: { weather: 'lava', weatherT: 'x', hatch: { i: 99 }, favours: [{ id: 'nope' }, { id: 'docHides', n: 5 }, 7], done: ['<b>', 'docHides'], eggs: [9, 9, 9, 9, 9, 9, 9, 9], blood: 'x', giant: { kind: 'rex', x: 0, z: 0 }, traderEgg: 2 } };
  const t = createSim();
  check('a tampered frontier save is cleaned', t.restore(bad) && t.state.frontier.weather === 'clear' && !t.state.frontier.hatch && t.state.frontier.favours.length === 0
    && t.state.frontier.done.join() === 'docHides' && t.state.player.eggs[0] === HATCH.eggMax && t.state.player.eggs[1] === 0 && t.state.player.blood.every(b => b === 0) && !t.state.frontier.giant && t.state.frontier.traderEgg === -1);
  check('an old save without a frontier loads', (() => { const o = { ...save }; delete o.frontier; const k = createSim(); return k.restore(o) && k.state.frontier.weather === 'clear' && MOUNTS.length === k.state.player.eggs.length; })());
}
{ // a long idle soak: nothing breaks
  const g = mk();
  let ok = true;
  for (let d = 0; d < 12 && ok; d++) { g.s.clock += DAY.length * 0.5; g.wait(20); ok = Number.isFinite(g.f.weatherT) && g.s.enemies.filter(e => e.tag === 'giant').length <= 1 && g.s.enemies.length < 90; }
  check('twelve half-days pass without trouble', ok, `enemies ${g.s.enemies.length} weather ${g.f.weather}`);
}
{ // goals, discovery and caches
  const g = mk(), { p, f, s, sim } = g;
  check('the first goal is shown', sim.frontier.goalStatus()?.at === 1 && s.caches.length === CACHES.count, `caches ${s.caches.length}`);
  const m = LANDMARKS.find(k => k.id === 'eastgraze'), money = p.money, xp = p.xp;
  p.x = m.x; p.z = m.z; g.wait(0.6);
  check('riding into a named place discovers it and pays the first goal', f.found.includes('eastgraze') && p.money === money + GOALS[0].reward.money && p.xp > xp && f.goal === 1);
  g.wait(0.6);
  check('a place is discovered once', f.found.length === 1);
  const c = s.caches[0], before = p.money;
  p.x = c.x; p.z = c.z; g.wait(0.6);
  check('a cache is opened by riding over it', p.money > before && !s.caches.includes(c) && f.tally.cache === 1);
  const save = JSON.parse(JSON.stringify(sim.snapshot())), again = createSim();
  check('goals, places and caches survive a save', again.restore(save) && again.state.frontier.goal === f.goal && again.state.frontier.found.join() === 'eastgraze' && again.state.caches.length === CACHES.count - 1 && again.state.frontier.tally.cache === 1);
  p.x = 0; p.z = -120;   // off the spot, or the returning cache would be opened again at once
  s.clock += DAY.length * CACHES.refill; g.wait(0.3);
  check('caches are put back after a few days', s.caches.length === CACHES.count);
  f.tally.raptor = 3; g.wait(0.6);
  check('a counted goal pays when its tally is met, and the chain moves on', f.goal >= 3 && p.tonics.jerky >= 2, `goal ${f.goal}`);
}
{ // stagger, alphas and ambush
  const g = mk(), { p, f, s, sim } = g;
  g.open();
  const e = g.place('raptor', 9);
  for (const k of s.enemies) if (k !== e && Math.hypot(k.x - p.x, k.z - p.z) < 90) k.dead = true;
  Object.assign(e, { state: 'chase', windT: 0.5, provokedT: 20 });
  const hp = e.hp, aimAt = (t) => { const oy = heightAt(p.x, p.z) + 4, dx = t.x - p.x, dy = heightAt(t.x, t.z) + 1.6 - oy, dz = t.z - p.z, len = Math.hypot(dx, dy, dz); return { ox: p.x, oy, oz: p.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: Math.atan2(dx, dz) }; }, aim = aimAt(e);
  for (let i = 0; i < 12 && e.hp === hp; i++) g.step({ fire: true, aim });
  check('a shot during the crouch staggers: stopped, harder hit, counted', e.hp < hp && e.windT === 0 && e.heldT > 1 && f.tally.stagger === 1 && hp - e.hp > 22 * 1.2, `dmg ${(hp - e.hp).toFixed(0)}`);
  const alphas = s.enemies.filter(k => k.alpha);
  check('some roaming raptors lead a pack', alphas.length === 3 && alphas.every(k => k.maxHp > 150 && k.def.dmg > 13), `${alphas.length}`);
  const a = alphas[0]; a.dead = false; a.hp = 1; Object.assign(a, { x: p.x, z: p.z + 7, state: 'wander', heldT: 3 });
  for (let i = 0; i < 30 && !a.dead; i++) g.step({ fire: true, aim: aimAt(a) });
  check('killing one counts toward the goal', a.dead && f.tally.alpha === 1);
  // ambush: far from town, riding, nothing chasing
  for (const k of s.enemies) k.dead = true;
  p.x = 150; p.z = 150; f.ambushT = 0.2;
  g.wait(1, { mx: 1, mz: 0 });
  const pack = s.enemies.filter(k => k.tag === 'ambush');
  check('an ambush springs ahead of a rider on the move', pack.length >= 2 && pack.every(k => k.state === 'chase') && f.ambushT > 100 && g.texts.some(t => t.startsWith('Ambush')), `${pack.length}`);
  p.x = -200; p.z = -200; g.wait(0.6);
  check('a pack that loses the rider is gone', !s.enemies.some(k => k.tag === 'ambush' && !k.gone));
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
