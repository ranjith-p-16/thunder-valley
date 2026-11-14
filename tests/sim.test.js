// Scripted checks of the rules, run without a browser:  node tests/sim.test.js
import { createSim, STEP, SAVE_VERSION } from '../src/sim/sim.js';
import { PEN, RIDER, KINDS, HERD, HERD_SPOTS, REX_HOME, OUTPOST_DEFS } from '../src/data/content.js';
import { WEAPONS, TOWN, JOBS } from '../src/data/items.js';
import { heightAt } from '../src/sim/terrain.js';

const REVOLVER = WEAPONS.revolver;
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; };
const run = (sim, seconds, inputAt) => { for (let i = 0; i < seconds / STEP; i++) sim.step({ mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [], ...inputAt(i) }); };
const toward = (p, x, z) => ({ mx: x - p.x, mz: z - p.z });
// an aim ray from above the rider straight at the middle of the target
const aimAt = (p, t) => {
  const oy = heightAt(p.x, p.z) + 4, dx = t.x - p.x, dy = heightAt(t.x, t.z) + 1.6 - oy, dz = t.z - p.z, len = Math.hypot(dx, dy, dz);
  return { ox: p.x, oy, oz: p.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: Math.atan2(dx, dz) };
};

{ // trees block the rider
  const sim = createSim(), p = sim.state.player, t = sim.state.obstacles.trees[0];
  p.x = t.x; p.z = t.z - 8;
  run(sim, 2, () => ({ mx: 0, mz: 1 }));
  const d = Math.hypot(p.x - t.x, p.z - t.z);
  check('tree blocks the rider', d >= t.r + RIDER.radius - 0.01 && p.z > t.z - 8, `distance ${d.toFixed(2)}`);
}
{ // the fence blocks, the gate lets through, buildings are solid
  const sim = createSim(), p = sim.state.player;
  p.x = PEN.x; p.z = PEN.z + PEN.r + 10;
  run(sim, 3, () => toward(p, PEN.x, PEN.z));
  check('fence blocks the rider', Math.hypot(p.x - PEN.x, p.z - PEN.z) > PEN.r, `z ${p.z.toFixed(1)}`);
  p.x = PEN.x; p.z = PEN.z - PEN.r - 10;
  run(sim, 3, () => toward(p, PEN.x, PEN.z));
  check('gate lets the rider in', Math.hypot(p.x - PEN.x, p.z - PEN.z) < PEN.r - 2, `z ${p.z.toFixed(1)}`);
  p.x = 0; p.z = -6;
  run(sim, 3, () => ({ mx: -1, mz: 0 }));
  check('the saloon wall stops the rider', p.x > -24 + 6.5, `x ${p.x.toFixed(1)}`);
  check('the saloon door is in reach', sim.nearPlace()?.id === 'saloon');
}
{ // magazine and reload
  const sim = createSim(), p = sim.state.player;
  run(sim, 1.3, () => ({ fire: true }));
  check('no shooting inside town', p.ammo.revolver === REVOLVER.magazine);
  p.x = 0; p.z = -70;
  run(sim, 2.2, () => ({ fire: true }));
  check('magazine empties and reload starts', p.ammo.revolver === 0 && p.reloadT > 0, `ammo ${p.ammo.revolver}`);
  run(sim, REVOLVER.reload + 0.1, () => ({}));
  check('reload refills the magazine', p.ammo.revolver === REVOLVER.magazine && p.reloadT <= 0);
}
{ // shooting kills and gives experience
  const sim = createSim(), p = sim.state.player, e = sim.state.enemies.find(e => !e.outpost && e.kind === 'raptor');
  p.x = e.x; p.z = e.z - 14; p.yaw = 0;
  run(sim, 12, () => ({ fire: true, aim: aimAt(p, e) }));
  check('raptor can be shot dead', e.dead, `hp ${e.hp.toFixed(0)}`);
  check('kill gives experience', p.xp > 0 || p.level > 1);
}
{ // dodge, and the town is safe
  const sim = createSim(), p = sim.state.player;
  sim.step({ mx: 1, mz: 0, sprint: false, fire: false, aim: null, actions: ['dodge'] });
  check('dodge moves and costs stamina', p.dodgeT > 0 && p.stamina < 100 && p.x > 0);
  run(sim, 30, () => ({}));
  check('predators stay out of town', sim.state.enemies.every(e => Math.hypot(e.x - TOWN.x, e.z - TOWN.z) > TOWN.r));
}
{ // a roped longhorn can be led through the gate and penned
  const sim = createSim(), p = sim.state.player, a = sim.state.animals[0];
  p.x = a.x + 6; p.z = a.z;
  sim.step({ mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: ['lasso'] });
  check('lasso catches a longhorn', !!sim.state.herd.roped);
  const stops = [[PEN.x, PEN.z - PEN.r - 14], [PEN.x, PEN.z + PEN.r - 4]];
  let leg = 0;
  run(sim, 45, () => {
    const [x, z] = stops[leg];
    if (Math.hypot(p.x - x, p.z - z) < 1.5 && leg < stops.length - 1) leg++;
    return Math.hypot(p.x - x, p.z - z) < 1 ? {} : toward(p, x, z);
  });
  check('roped longhorn is penned through the gate', sim.herding.counts().penned >= 1, `penned ${sim.herding.counts().penned}`);
  check('a penned longhorn pays', p.money >= 80, `$${p.money}`);
}
{ // shop, gear, skills
  const sim = createSim(), p = sim.state.player, cmd = (c) => sim.command(c);
  p.money = 5000; p.res.claws = 20; p.res.hide = 20;
  cmd({ type: 'buy', kind: 'weapon', id: 'rifle' });
  check('buying a rifle', 'rifle' in p.weapons && p.money === 4500, `$${p.money}`);
  const before = sim.damage('rifle');
  cmd({ type: 'upgrade', kind: 'weapon', id: 'rifle' });
  check('upgrade raises damage and uses claws', sim.damage('rifle') > before && p.res.claws === 15 && p.weapons.rifle === 1);
  cmd({ type: 'buy', kind: 'gear', id: 'duster' });
  check('duster adds health', p.maxHp === 150 && p.equipped.outfit === 'duster', `maxHp ${p.maxHp}`);
  cmd({ type: 'equip', id: 'duster' });
  check('taking it off removes the health', p.maxHp === 120);
  p.skillPoints = 2;
  cmd({ type: 'skill', tree: 'marshal' }); cmd({ type: 'skill', tree: 'gunslinger' });
  check('skills apply', p.maxHp === 140 && sim.st.reload === 0.85 && p.skillPoints === 0, `maxHp ${p.maxHp}`);
  cmd({ type: 'skill', tree: 'marshal' });
  check('no skill without a point', p.skills.marshal === 1);
  cmd({ type: 'sell', id: 'hide' });
  check('selling hides pays', p.res.hide === 0 && p.money > 3900, `$${p.money}`);
  cmd({ type: 'buy', kind: 'mount', i: 1 }); cmd({ type: 'mount', i: 1 });
  check('buying and riding the Bulwark', p.mount === 1);
  cmd({ type: 'buy', kind: 'mount', i: 2 });
  check('the Tyrant cannot be bought', !p.mounts[2]);
  p.hp = 20; cmd({ type: 'rest' });
  check('resting heals and moves the clock to seven', p.hp === p.maxHp && Math.abs(sim.dayPhase() - 7 / 24) < 0.001);
  p.x = 200; p.z = 200;
  const m = p.money; cmd({ type: 'buy', kind: 'tonic', id: 'tonic' });
  check('shops only work in town', p.money === m);
  run(sim, 0.1, () => ({ actions: ['weapon1'] }));
  check('switching to the rifle', p.weapon === 'rifle');
}
{ // loot, tonics, thrown items
  const sim = createSim(), p = sim.state.player, e = sim.state.enemies.find(e => !e.outpost && e.kind === 'raptor');
  p.thrown.dynamite = 1; p.thrown.trap = 1; p.thrown.bolas = 1;
  Object.assign(e, { x: 0, z: -110, tx: 0, tz: -110 }); Object.assign(e.home, { x: 0, z: -110 });   // open ground, wherever the packs happened to spawn
  p.x = e.x; p.z = e.z - 10; p.yaw = 0;
  run(sim, 0.05, () => ({ actions: ['throw:bolas'] }));
  check('bolas hold the animal', e.heldT > 2);
  e.hp = 15;   // already worn down, so the blast finishes it (a held animal above a third of its health would be left at 1)
  run(sim, 2.5, (i) => ({ actions: i === 0 ? ['throw:dynamite'] : [], aim: { ox: p.x, oy: 6, oz: p.z, dx: 0, dy: -0.4, dz: 0.9, yaw: 0 } }));
  check('dynamite kills a raptor', e.dead, `hp ${e.hp.toFixed(0)}`);
  check('the kill dropped loot', sim.state.loot.length === 1);
  p.x = e.x; p.z = e.z;
  run(sim, 0.1, () => ({}));
  check('riding over loot picks it up', sim.state.loot.length === 0 && p.money > 50, `$${p.money}`);
  p.hp = 10; p.tonics.tonic = 1;
  run(sim, 0.05, () => ({ actions: ['quickZ'] }));
  check('healing tonic heals', p.hp >= 110 && p.tonics.tonic === 0, `hp ${p.hp.toFixed(0)}`);
}
{ // on foot
  const sim = createSim(), p = sim.state.player;
  run(sim, 0.05, () => ({ actions: ['dismount'] }));
  const x0 = p.x;
  run(sim, 2, () => ({ mx: 1, mz: 0 }));
  check('walking is slower than riding', p.onFoot && p.x - x0 < 11 && p.x - x0 > 8, `moved ${(p.x - x0).toFixed(1)}`);
  run(sim, 0.05, () => ({ actions: ['dismount'] }));
  check('a far mount is whistled over', p.onFoot && p.steed.coming);
  run(sim, 2, () => ({}));
  run(sim, 0.05, () => ({ actions: ['dismount'] }));
  check('mounting up again', !p.onFoot);
}
{ // jobs
  const sim = createSim(), p = sim.state.player, s = sim.state;
  check('the board has three offers', s.board.length === 3);
  s.board[0] = { type: 'hunt', title: 'Hunt contract', text: '', pay: 100, xp: 150, count: 2, left: 0, done: 0 };
  sim.command({ type: 'takeJob', i: 0 });
  check('taking a job refills the board', s.job?.type === 'hunt' && s.board.length === 3);
  sim.command({ type: 'turnIn' });
  check('cannot turn in without the hides', !!s.job);
  p.res.hide = 3;
  sim.command({ type: 'turnIn' });
  check('hunt contract pays', !s.job && p.money === 150 && p.res.hide === 1, `$${p.money}`);
  s.board[0] = { type: 'bounty', title: 'Bounty', text: '', pay: 200, xp: 250, name: 'Scarback', x: 150, z: 150, left: 0, done: 0 };
  sim.command({ type: 'takeJob', i: 0 });
  const t = s.enemies.find(e => e.bounty);
  check('bounty target appears', !!t && t.hp === KINDS.raptor.hp * JOBS.bounty.hp);
  const save = JSON.parse(JSON.stringify(sim.snapshot())), again = createSim();
  check('a save with a job loads', again.restore(save) && again.state.enemies.some(e => e.bounty) && again.state.player.money === 150);
  p.x = t.x; p.z = t.z - 12;
  run(sim, 20, () => ({ fire: true, aim: aimAt(p, t) }));
  check('bounty pays when the target dies', !s.job && p.money >= 350, `$${p.money}`);
  s.board[0] = { type: 'supply', title: 'Supply run', text: '', pay: 120, xp: 200, x: 150, z: 20, place: 'the mesa road', carrying: false, left: 300, done: 0 };
  p.x = 0; p.z = -10;
  s.frontier.goal = 1e3;   // no goal rewards mixed into the sums below
  const m = p.money;
  sim.command({ type: 'takeJob', i: 0 });
  p.x = 150; p.z = 20; run(sim, 0.1, () => ({}));
  check('crate is picked up', s.job?.carrying === true);
  p.x = 0; p.z = -10; run(sim, 0.1, () => ({}));
  check('supply run pays in town', !s.job && p.money === m + 120, `$${p.money}`);
}
{ // save, load and repeatability
  const inputs = (i) => ({ mx: Math.sin(i / 40), mz: -1, sprint: i % 200 < 100, fire: i % 90 < 20 });
  const a = createSim(), b = createSim();
  run(a, 20, inputs); run(b, 20, inputs);
  check('same inputs give the same game', JSON.stringify(a.snapshot()) === JSON.stringify(b.snapshot()));
  const c = createSim();
  check('save loads', c.restore(JSON.parse(JSON.stringify(a.snapshot()))));
  check('loaded game matches the save', JSON.stringify(c.snapshot()) === JSON.stringify(a.snapshot()));
  check('a save from another version is refused', !createSim().restore({ ...a.snapshot(), version: 0 }));
}
{ // taming, natures, the string and mount growth
  const sim = createSim(), p = sim.state.player, s = sim.state;
  check('natures: storm beats swamp, loses to stone, is even with ember', sim.natureMul('storm', 'swamp') === 1.25 && sim.natureMul('storm', 'stone') === 0.8 && sim.natureMul('storm', 'ember') === 1 && sim.natureMul(undefined, 'stone') === 1);
  const c = s.enemies.find(e => e.kind === 'cinder');
  check('wild cinderjaws and platewalkers live on Red Mesa', !!c && s.enemies.filter(e => e.kind === 'plate').length === 4 && s.enemies.filter(e => e.kind === 'dilo').length === 3);
  park(sim, c);
  p.x = c.x; p.z = c.z - 6; p.yaw = 0; p.thrown.bolas = 2;
  run(sim, 0.05, () => ({ actions: ['tame'] }));
  check('a healthy animal cannot be tamed', !p.tame);
  c.hp = c.maxHp * 0.25;
  run(sim, 0.05, () => ({ actions: ['tame'] }));
  check('nor one that is not held', !p.tame);
  run(sim, 0.05, () => ({ actions: ['throw:bolas'] }));
  run(sim, 0.05, () => ({ actions: ['tame'] }));
  check('worn down and held: taming starts', !!p.tame && c.heldT > 0);
  run(sim, 3, () => ({}));
  check('the field journal noted the species', p.journal[4] === 1);
  run(sim, 3.2, () => ({}));
  check('after six seconds the Cinderjaw is yours and in the string', p.mounts[4] === true && p.string.join() === '0,4' && p.journal[4] === 2 && c.tamed && !p.tame, `string ${p.string}`);
  check('a tamed animal leaves no loot', s.loot.length === 0);
  p.hurtT = 99;
  run(sim, 0.05, () => ({ actions: ['swap'] }));
  check('B swaps to the next dinosaur in the string', p.mount === 4 && sim.mountOf().name === 'Cinderjaw');
  run(sim, 0.05, () => ({ actions: ['swap'] }));
  check('swapping has a short cooldown', p.mount === 4);
  // melee and natures: a Cinderjaw (ember) against a platewalker (stone, neutral) and against a compy-like thorn target
  const plate = s.enemies.find(e => e.kind === 'plate');
  park(sim, plate);
  p.x = plate.x; p.z = plate.z - 4; p.yaw = 0; p.stamina = 100;
  const hp0 = plate.hp;
  run(sim, 0.05, () => ({ actions: ['melee'] }));
  check('V strikes what is in front', Math.abs(hp0 - plate.hp - sim.meleeDamage()) < 0.01, `took ${(hp0 - plate.hp).toFixed(1)}`);
  // growth
  const before = sim.meleeDamage(4);
  p.mountLv[4] = 9; p.mountXp[4] = sim.mountXpNeeded(4) - 1;
  const dead = s.enemies.find(e => e.kind === 'raptor' && !e.outpost);
  park(sim, dead); p.x = dead.x; p.z = dead.z - 4; p.meleeCd = 0; dead.hp = 1;
  run(sim, 0.05, () => ({ actions: ['melee'] }));
  check('the mount you ride gains experience and grows a stage', p.mountLv[4] === 10 && sim.stageOf(4).name === 'Grown' && sim.meleeDamage(4) > before, `lv ${p.mountLv[4]}`);
  // taming a second one feeds the first
  const c2 = s.enemies.find(e => e.kind === 'cinder' && !e.tamed);
  park(sim, c2); c2.x = 100; c2.z = 100; c2.hp = 10; c2.heldT = 30; p.x = c2.x; p.z = c2.z - 5;   // away from the parked animals
  const xp0 = p.mountXp[4], lv0 = p.mountLv[4];
  run(sim, 0.05, () => ({ actions: ['tame'] }));
  run(sim, 6.2, () => ({}));
  check('a second of a kind you own becomes experience', (p.mountLv[4] > lv0 || p.mountXp[4] > xp0) && p.string.length === 2);
  // save and load
  const save = JSON.parse(JSON.stringify(sim.snapshot())), again = createSim();
  check('string, levels and journal survive a save', again.restore(save) && again.state.player.string.join() === '0,4' && again.state.player.mountLv[4] === p.mountLv[4] && again.state.player.journal[4] === 2 && again.state.player.mount === 4);
  check('a string naming untamed or repeated dinosaurs is cleaned', createSim().restore({ ...save, player: { ...save.player, mount: 0, string: [5, 4, 4, 'x', 0, 2] } }));
  // stables: choosing the string
  p.x = 0; p.z = -10;
  sim.command({ type: 'string', i: 4 });
  check('cannot drop the one you are riding', p.string.includes(4));
  sim.command({ type: 'string', i: 0 });
  check('stables: a dinosaur can be left behind', p.string.join() === '4');
}
{ // night makes predators bolder
  const sim = createSim();
  check('game starts in daytime', !sim.isNight());
  sim.state.clock = 0.6 * 24 * 60;
  check('night falls later in the day', sim.isNight(), `phase ${sim.dayPhase().toFixed(2)}`);
}
// ---- regression checks for the playtest findings (tests/playtest) ----
const NONE = { mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [] };
const toasts = (ev) => ev.filter(e => e.type === 'toast').map(e => e.text);
function park(sim, keep) { for (const e of sim.state.enemies) if (e !== keep) { e.heldT = 1e9; e.x = 285; e.z = 285 - sim.state.enemies.indexOf(e) * 4; } }
const clone = (v) => JSON.parse(JSON.stringify(v));
{ // 1: an animal hit from far away comes for the rider; one that has given up cannot be farmed
  const sim = createSim(), s = sim.state, p = s.player, rex = s.rex;
  park(sim, rex);
  p.weapons.rifle = 0; p.ammo.rifle = 5; p.weapon = 'rifle';
  p.x = rex.x; p.z = rex.z + 125;
  let hurt = 0, gaveUp = false;
  run(sim, 5, () => ({ fire: true, aim: aimAt(p, { x: rex.x, z: rex.z }) }));
  const d5 = Math.hypot(rex.x - p.x, rex.z - p.z);
  check('a Rex shot from 125 away charges the rider', rex.state === 'chase' && rex.provokedT > 0 && d5 < 100, `state ${rex.state}, ${d5.toFixed(0)} away`);
  rex.hp = rex.maxHp = 1e6;
  for (let i = 0; i < 20 / STEP && !hurt; i++) { for (const e of sim.step({ ...NONE, fire: true, aim: aimAt(p, rex) })) if (e.type === 'hurt') hurt++; if (rex.state === 'return') gaveUp = true; }
  check('and reaches and bites a rider who stands still', hurt > 0 && !gaveUp);
  const home = createSim(), hp = home.state.player, e = home.state.enemies.find(e => !e.outpost && e !== home.state.rex);
  park(home, e);
  e.x = e.home.x + 60; e.z = e.home.z; e.state = 'return'; e.hp = 20;
  hp.x = e.x; hp.z = e.z - 12;
  let thuds = 0, hits = 0;
  for (let i = 0; i < 1 / STEP; i++) for (const ev of home.step({ ...NONE, fire: true, aim: aimAt(hp, e) })) { if (ev.type === 'thud') thuds++; if (ev.type === 'hit') hits++; }
  check('an animal heading home takes no damage', !e.dead && hits === 0 && thuds > 0, `hits ${hits}, thuds ${thuds}`);
  const reach = (w) => Math.round(WEAPONS[w].speed * WEAPONS[w].life);
  check('weapon reach is 70 / 130 / 45 / 80', reach('revolver') === 70 && reach('rifle') === 130 && reach('shotgun') === 45 && reach('bow') === 80);
  const far = createSim(), q = far.state.player, r2 = far.state.rex;
  q.x = r2.x; q.z = r2.z + 160; let farHits = 0;
  for (let i = 0; i < 10 / STEP; i++) for (const ev of far.step({ ...NONE, fire: true, aim: aimAt(q, r2) })) if (ev.type === 'hit') farHits++;
  check('the revolver cannot reach the Rex from 160', farHits === 0 && r2.hp === r2.maxHp);
}
{ // 2: a chasing animal wedged on scenery works itself free; so does a whistled mount
  const sim = createSim(), s = sim.state, p = s.player, e = s.enemies.find(e => !e.outpost && e !== s.rex);
  park(sim, e);
  const t = s.obstacles.trees.find(t => Math.hypot(t.x, t.z) > 120 && Math.abs(t.x) < 230 && Math.abs(t.z) < 230);
  e.home = { x: t.x, z: t.z - 14 }; e.x = t.x; e.z = t.z - t.r - e.def.radius * 0.6; e.state = 'chase';
  p.x = t.x; p.z = t.z + 14;   // the tree is dead ahead of the animal
  let hurt = 0;
  for (let i = 0; i < 12 / STEP && !hurt; i++) for (const ev of sim.step(NONE)) if (ev.type === 'hurt') hurt++;
  check('a raptor with a tree dead ahead gets round it', hurt > 0, `raptor ${Math.hypot(e.x - p.x, e.z - p.z).toFixed(1)} away`);
  const w = createSim(), wp = w.state.player;
  park(w, null);
  wp.x = PEN.x; wp.z = PEN.z + PEN.r + 6;
  w.step({ ...NONE, actions: ['dismount'] });
  wp.x = PEN.x; wp.z = PEN.z - PEN.r - 20;
  w.step({ ...NONE, actions: ['dismount'] });
  run(w, 12, () => ({}));
  check('a whistled mount blocked by the fence still arrives', !wp.steed.coming && Math.hypot(wp.steed.x - wp.x, wp.steed.z - wp.z) < 5);
  check('the mount carries its previous position', Number.isFinite(wp.steed.ox) && Number.isFinite(wp.steed.oz));
}
{ // 3: fast bullets do not skip over an animal
  let hit = 0, n = 0;
  for (let d = 20; d < 60; d += 1.37) {
    const sim = createSim(), p = sim.state.player, e = sim.state.enemies.find(e => !e.outpost && e.kind === 'raptor');
    p.weapons.rifle = 0; p.ammo.rifle = 5; p.weapon = 'rifle';
    p.x = e.x; p.z = e.z - d; p.yaw = 0; e.heldT = 99;
    const m = sim.muzzle(), dx = e.x + 1.2 - m.x, dy = heightAt(e.x, e.z) + 1.6 - m.y, dz = e.z - m.z, len = Math.hypot(dx, dy, dz);
    const aim = { ox: m.x, oy: m.y, oz: m.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: 0 };
    let got = false;
    for (let i = 0; i < 40; i++) if (sim.step({ ...NONE, fire: i === 0, aim }).some(x => x.type === 'hit')) got = true;
    n++; if (got) hit++;
  }
  check('rifle shots aimed 1.2 off-centre all land', hit === n, `${hit}/${n}`);
}
{ // 4: swapping weapons does not shorten the fire delay
  const sim = createSim(), p = sim.state.player;
  p.x = 0; p.z = -70; p.weapons.rifle = 0; p.ammo.rifle = 5; p.weapon = 'rifle';
  sim.step({ ...NONE, fire: true });
  const cd = p.fireCd;
  sim.step({ ...NONE, actions: ['weapon0', 'weapon1'] });
  check('weapon swap keeps the fire delay', cd > 0.8 && p.fireCd > cd - 0.05 && p.weapon === 'rifle', `fireCd ${p.fireCd.toFixed(2)}`);
  const ev = sim.step({ ...NONE, actions: ['weapon3'] });
  check('switching to an unowned weapon says so', toasts(ev).includes('You do not own a bow') && p.weapon === 'rifle');
}
{ // 5: a dropped job goes back on the board
  const sim = createSim(), s = sim.state;
  const before = s.board.map(j => j.text + j.pay);
  for (let i = 0; i < 20; i++) { sim.command({ type: 'takeJob', i: i % 3 }); sim.command({ type: 'dropJob' }); }
  const after = s.board.map(j => j.text + j.pay);
  check('take + drop cannot reroll the board', s.board.length === 3 && before.slice().sort().join('|') === after.slice().sort().join('|') && !s.job);
  run(sim, 0.1, () => ({}));
  check('dropping a bounty leaves no target behind', !s.enemies.some(e => e.bounty));
}
{ // 6: balance numbers
  check('raptor bite is 13 every 1.1 s', KINDS.raptor.dmg === 13 && KINDS.raptor.bite === 1.1);
  check('job pay, xp and timers', JOBS.bounty.pay.join() === '80,160' && JOBS.herd.pay.join() === '60,120' && JOBS.hunt.pay.join() === '50,110' && JOBS.supply.pay.join() === '60,130'
    && JOBS.bounty.xp === 120 && JOBS.herd.xp === 100 && JOBS.hunt.xp === 80 && JOBS.supply.xp === 90 && JOBS.supply.time === 150 && JOBS.herd.time === 300 && JOBS.bounty.xpMul === 2);
  const sim = createSim(), p = sim.state.player, e = sim.state.enemies.find(e => !e.outpost && e.kind === 'raptor');
  park(sim, e);
  p.x = e.x + 2; p.z = e.z; e.state = 'chase'; e.cd = 0;
  run(sim, 0.05, () => ({}));
  check('a raptor bite takes 13 health, plus a tenth on a Young mount', Math.abs(p.maxHp - p.hp - 14.3) < 0.01, `hp ${p.hp.toFixed(1)}`);
}
{ // 7: nothing is thrown or fired in town, and the rider is told (not on every step)
  const sim = createSim(), p = sim.state.player;
  p.thrown = { dynamite: 2, bolas: 2, trap: 2 };
  let told = 0;
  for (let i = 0; i < 5 / STEP; i++) told += toasts(sim.step({ ...NONE, fire: true, actions: i % 30 === 0 ? ['throw:dynamite', 'throw:trap', 'throw:bolas'] : [] })).filter(t => t === 'No shooting in town').length;
  check('thrown items are refused in town', p.thrown.dynamite === 2 && p.thrown.trap === 2 && sim.state.thrown.length === 0 && sim.state.traps.length === 0);
  check('"No shooting in town" at most once every 3 s', told === 2, `${told} toasts in 5 s`);
}
{ // 8, 9, 10: longhorns
  const sim = createSim(), s = sim.state, a = s.animals[0];
  park(sim, null);
  s.player.x = -200; s.player.z = -200;
  sim.herding.hurt(a, 999);
  check('a longhorn can be lost', a.dead);
  run(sim, 119, () => ({}));
  const still = a.dead;
  run(sim, 2, () => ({}));
  const spot = HERD_SPOTS[a.herd];
  check('a lost longhorn is replaced at its herd after 120 s', still && !a.dead && a.hp === HERD.hp && Math.hypot(a.x - spot.x, a.z - spot.z) < 12);
  const b = s.animals[7], home = HERD_SPOTS[b.herd];
  b.x = home.x + 40; b.z = home.z; b.gx = b.x; b.gz = b.z; b.grazeT = 0;
  run(sim, 40, () => ({}));
  check('a calm stray drifts back to its herd\'s home', Math.hypot(b.x - home.x, b.z - home.z) < 15, `${Math.hypot(b.x - home.x, b.z - home.z).toFixed(1)} from home`);
  const c = s.animals[1];
  c.x = PEN.x; c.z = PEN.z + PEN.r - HERD.radius - 0.3; c.vx = c.vz = 0; c.followT = 6; c.panicT = 2;   // right against the inside of the fence
  run(sim, 0.1, () => ({}));
  check('a longhorn against the inside of the fence is penned', c.penned);
  check('penning clears follow and panic', c.followT === 0 && c.panicT === 0);
  for (const x of s.animals) x.dead = true;
  run(sim, 0.1, () => ({}));
  check('an empty range gives no NaN', s.animals.every(x => Number.isFinite(x.x) && Number.isFinite(x.gx)));
  let herdOffers = 0;
  for (let i = 0; i < 60; i++) { s.board = []; sim.jobs.refresh(); herdOffers += s.board.filter(j => j.type === 'herd').length; }
  check('no herd order is offered when there are no loose longhorns', herdOffers === 0);
}
{ // 11: nothing carries over a death; switching mounts ends a dash
  const sim = createSim(), p = sim.state.player, e = sim.state.enemies[0];
  p.x = 0; p.z = -70;
  sim.step({ ...NONE, actions: ['ability'] });
  p.hp = 0.01; e.x = p.x; e.z = p.z + 1; e.home = { x: e.x, z: e.z }; e.state = 'chase'; e.cd = 0;
  run(sim, 0.1, () => ({}));
  const died = p.dead;
  p.steed.coming = true; p.fireCd = 5;
  run(sim, 3.1, () => ({}));
  const z0 = p.z;
  run(sim, 0.5, () => ({}));
  check('respawn clears dash, fire delay and the whistle', died && !p.dead && p.dashT <= 0 && p.fireCd <= 0 && !p.steed.coming && Math.abs(p.z - z0) < 0.01);
  p.mounts[1] = true; p.dashT = 1;
  sim.command({ type: 'mount', i: 1 });
  check('switching mounts ends the dash', p.mount === 1 && p.dashT === 0);
  sim.command({ type: 'mount', i: '0' }); sim.command({ type: 'mount', i: 0.5 }); sim.command({ type: 'mount', i: -1 }); sim.command({ type: 'buy', kind: 'mount', i: 'constructor' });
  check('a bad mount index is ignored', p.mount === 1);
}
{ // 12: a save carries everything, and loading does not disturb the dice
  const sim = createSim(), s = sim.state, p = s.player;
  s.board[0] = { type: 'bounty', title: 'Bounty', text: 'x', pay: 200, xp: 120, name: 'Scarback', x: 150, z: 150, left: 0, done: 0 };
  sim.command({ type: 'takeJob', i: 0 });
  const t = s.enemies.find(e => e.bounty);
  t.hp = 10; t.x = 140; t.z = 141;
  p.buffs.steady = 50; p.stamina = 5; p.abilityCd = 9; s.herd.hollerCd = 3; s.outposts[1].progress = 0.4;
  s.traps.push({ id: 'trap900', x: 50, z: 60 });
  s.loot.push({ id: 'loot901', x: 99, z: 99, items: { hide: 3 }, money: 300, t: 100 });
  p.ammo.revolver = 0;
  const save = clone(sim.snapshot()), b = createSim();
  check('a full save loads', b.restore(clone(save)) === true);
  const q = b.state.player, tb = b.state.enemies.find(e => e.bounty);
  check('buffs, stamina and cooldowns are saved', q.buffs.steady === 50 && q.stamina === 5 && q.abilityCd === 9 && b.state.herd.hollerCd === 3);
  check('loot, traps and capture progress are saved', b.state.loot.length === 1 && b.state.loot[0].money === 300 && b.state.loot[0].items.hide === 3 && b.state.traps.length === 1 && b.state.outposts[1].progress === 0.4);
  check('the bounty target comes back as it was', !!tb && tb.id === t.id && tb.hp === 10 && tb.x === 140 && tb.z === 141 && b.state.job.target === t.id && tb.maxHp === KINDS.raptor.hp * JOBS.bounty.hp);
  const again = b.snapshot();
  check('loading leaves the dice and the id counter alone', again.rand === save.rand && again.nextId === save.nextId);
  check('save -> load -> save is identical', JSON.stringify(again) === JSON.stringify(save));
  check('an empty magazine starts reloading on load', q.reloadT > 0);
  q.reloadT = 0; q.x = 0; q.z = -70;
  run(b, 2, () => ({ fire: true }));
  check('holding fire on an empty gun reloads it', q.ammo.revolver > 0 || q.reloadT > 0);
  // into a game that has been played: nothing of the old game shows through
  const g = createSim(), gp = g.state.player;
  gp.x = 100; gp.z = 100;
  g.step({ ...NONE, actions: ['ability', 'dismount'] });
  Object.assign(gp, { fireCd: 9, dodgeCd: 5, hurtT: 0, dashT: 1 }); gp.steed.coming = true;
  g.state.enemies[0].heldT = 5; g.state.enemies[0].provokedT = 5; g.state.enemies[0].scaredT = 5; g.state.enemies[0].cd = 5; g.state.bullets[0].life = 1;
  g.restore(clone(save));
  const e0 = g.state.enemies[0];
  check('loading resets everything that is not saved', gp.fireCd === 0 && gp.dodgeCd === 0 && gp.hurtT === 99 && gp.dashT === 0 && !gp.onFoot && !gp.steed.coming
    && e0.heldT === 0 && e0.provokedT === 0 && e0.scaredT === 0 && e0.cd === 0 && g.state.bullets.every(x => x.life <= 0) && JSON.stringify(g.snapshot()) === JSON.stringify(save));
}
{ // (a), (b), 13: saves are untrusted
  const sim = createSim(), good = clone(sim.snapshot());
  const bad = [null, undefined, 7, 'save', [], {}, { version: SAVE_VERSION }, { ...good, version: 2 }, { ...good, enemies: undefined }, { ...good, enemies: good.enemies.slice(1) },
    { ...good, player: undefined }, { ...good, player: { ...good.player, x: 'NaN' } }, { ...good, animals: good.animals.map(() => null) }, { ...good, clock: null }, { ...good, nextId: 1.5 },
    { ...good, job: { type: 'bounty', x: 1, z: 1 }, bounty: null }, { ...good, outposts: [1, 2, 3] }];
  const g = createSim();
  run(g, 3, (i) => ({ mx: 1, mz: -1, fire: i % 20 < 5 }));
  const before = JSON.stringify(g.snapshot());
  let threw = 0, accepted = 0;
  for (const s of bad) { try { if (g.restore(s) !== false) accepted++; } catch { threw++; } }
  check('malformed saves are refused without throwing', threw === 0 && accepted === 0, `threw ${threw}, accepted ${accepted}`);
  check('a refused save changes nothing', JSON.stringify(g.snapshot()) === before);
  const evil = clone(good), x = '<img src=x onerror=alert(1)>';
  Object.assign(evil.player, { money: x, level: 1e9, skillPoints: -5, weapon: 'cannon', mount: 7, weapons: { cannon: 9, rifle: 99 }, ammo: { rifle: 1e9 }, quick: { z: x, x: 'toString' },
    gear: { duster: 9, [x]: 1 }, equipped: { outfit: 'pack', saddle: x, trinket: 'constructor' }, skills: { marshal: 500, gunslinger: -3, [x]: 4 }, tonics: { tonic: 1e9, [x]: 1 }, thrown: { dynamite: 99 },
    res: { hide: -4, meat: 2.6, claws: x }, mounts: 'yes', stamina: 1e9, abilityCd: -3, buffs: { steady: x } });
  evil.job = { type: 'hunt', title: x, text: x.repeat(50), pay: x, xp: 1e12, count: x, left: -1, done: x, extra: x };
  evil.board = [{ type: x }, { type: 'constructor' }, { type: 'supply', x: 5, z: 5, place: 'the ford', carrying: true }, null, 5, { type: 'herd', count: 3 }, { type: 'hunt' }, { type: 'hunt' }];
  evil.loot = [{ id: x, x: 5, z: 5, items: { hide: 2, [x]: 5 }, money: 3.7, t: 1e9 }, { x: 'a', z: 1 }, null];
  evil.traps = [{ id: x, x: 1, z: 2 }, 5]; evil.thrown = 'no'; evil.herdTotal = x; evil.hollerCd = x; evil.boardDay = x; evil.rand = 12.5;
  const h = createSim();
  let ok = false, err = '';
  try { ok = h.restore(evil); } catch (e) { err = e.message; }
  const hp = h.state.player, job = h.state.job, board = h.state.board.slice(), all = JSON.stringify({ ...h.snapshot(), job: null });
  check('a hostile save loads without throwing', ok && !err, err);
  check('unknown ids and keys are dropped', !all.includes('cannon') && !all.includes('constructor') && !all.includes('toString') && !all.includes('extra') && !all.includes('<img'));
  check('numbers are made sane', hp.money === 0 && hp.level === 200 && hp.skillPoints === 0 && hp.stamina === 100 && hp.abilityCd === 0 && hp.res.hide === 0 && hp.res.meat === 3 && hp.res.claws === 0
    && hp.skills.marshal === 10 && hp.skills.gunslinger === 0 && hp.tonics.tonic === 5 && hp.thrown.dynamite === 5 && hp.weapons.rifle === 2 && hp.ammo.rifle === h.magazine('rifle') && hp.gear.duster === 2
    && hp.buffs.steady === 0 && h.state.loot.length === 1 && h.state.loot[0].money === 4 && h.state.loot[0].t === 120 && h.state.traps.length === 1 && h.state.thrown.length === 0);
  check('bad ids fall back to defaults', hp.weapon === 'revolver' && hp.mount === 0 && hp.quick.z === 'tonic' && hp.quick.x === 'jerky' && hp.equipped.outfit === null && hp.equipped.saddle === null
    && hp.equipped.trinket === null && Object.keys(hp.weapons).sort().join() === 'revolver,rifle' && hp.mounts.every((m, i) => m === (i === 0)) && hp.string.join() === '0' && hp.mountLv.every(l => l === 1));
  check('jobs are rebuilt from known fields', job.title === 'Hunt contract' && job.text.length === 160 && job.pay === 0 && job.count === 1 && !('extra' in job)
    && board.length === 3 && board.map(j => j.type).join() === 'supply,herd,hunt' && board.every(j => j.title === JOBS[j.type].title) && board[0].carrying === false);
  try { run(h, 1, () => ({ fire: true, actions: ['quickZ', 'quickX', 'weapon1', 'reload'] })); h.jobs.status(); h.command({ type: 'turnIn' }); } catch (e) { err = e.message; }
  check('…and the game runs on from it', !err && Number.isFinite(hp.x) && Number.isFinite(hp.hp), err);
  // (b) saved at the moment of death
  const d = createSim(), dp = d.state.player;
  dp.x = 100; dp.z = 100; dp.hp = 0; dp.dead = true;
  const r = createSim(), rp = r.state.player;
  check('a rider saved dead wakes at the stables with full health', r.restore(clone(d.snapshot())) && !rp.dead && rp.hp === rp.maxHp && Math.hypot(rp.x + 20, rp.z + 21) < 0.01 && r.inTown());
}
{ // 14: stepping down beside the fence or a wall
  const sim = createSim(), p = sim.state.player;
  p.x = PEN.x + PEN.r + 1.6; p.z = PEN.z; p.yaw = Math.PI;
  run(sim, 0.05, () => ({}));
  sim.step({ ...NONE, actions: ['dismount'] });
  check('dismounting beside the fence stays outside it', p.onFoot && Math.hypot(p.x - PEN.x, p.z - PEN.z) > PEN.r && Math.hypot(p.x - p.steed.x, p.z - p.steed.z) <= 3.01);
  const b = createSim(), q = b.state.player;
  q.x = 12; q.z = -28 + 1.6; q.yaw = -Math.PI / 2;
  run(b, 0.05, () => ({}));
  const side = Math.sign(q.z + 28);
  b.step({ ...NONE, actions: ['dismount'] });
  check('dismounting beside the notice board stays on the same side', q.onFoot && Math.sign(q.z + 28) === side);
  b.step({ ...NONE, actions: ['dismount'] });
  check('remounting does not leave a streak', !q.onFoot && q.ox === q.x && q.oz === q.z);
}
{ // 15: a night's rest costs a timed job its time
  const sim = createSim(), s = sim.state;
  s.player.money = 100;
  s.board[0] = { type: 'herd', title: 'Herd order', text: '', pay: 100, xp: 100, count: 3, left: 300, done: 0 };
  sim.command({ type: 'takeJob', i: 0 });
  const day = s.boardDay;
  const ev = sim.command({ type: 'rest' });
  check('resting fails a timed job that runs out, and shows the new day\'s board', !s.job && toasts(ev).includes('Herd order failed') && s.boardDay === day + 1 && s.board.length === 3);
}
{ // 16: where the wild packs live
  let ok = true;
  const clear = (x, z) => Math.hypot(x - REX_HOME.x, z - REX_HOME.z) >= 80 && OUTPOST_DEFS.every(o => Math.hypot(x - o.x, z - o.z) >= 60);
  for (const seed of [1, 2, 3, 99, 1234]) {
    const s = createSim(seed).state;
    for (const e of s.enemies) if (!e.outpost && e !== s.rex && !clear(e.home.x, e.home.z)) ok = false;
    for (const j of s.board) if (j.type === 'bounty' && !clear(j.x, j.z)) ok = false;
  }
  check('wild packs and bounties keep clear of the Rex and the camps', ok);
}
{ // 17: odd commands and inputs
  const sim = createSim(), p = sim.state.player;
  p.money = 5000; p.skillPoints = 5;
  let err = '';
  try {
    for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', undefined, null, 5, {}]) {
      for (const kind of ['weapon', 'thrown', 'tonic', 'gear', 'mount', 'x']) { sim.command({ type: 'buy', kind, id, i: id }); sim.command({ type: 'upgrade', kind, id }); }
      sim.command({ type: 'sell', id }); sim.command({ type: 'equip', id }); sim.command({ type: 'skill', tree: id }); sim.command({ type: 'quick', slot: 'z', id }); sim.command({ type: 'quick', slot: id, id: 'tonic' });
      sim.command({ type: 'mount', i: id }); sim.command({ type: 'takeJob', i: id });
      p.x = 0; p.z = -70;
      sim.step({ ...NONE, actions: [`throw:${id}`, `weapon${id}`, id] });
      p.x = 0; p.z = -4;
    }
    sim.command(null); sim.command(undefined); sim.command('rest'); sim.command({});
    sim.step(); sim.step({}); sim.step(null); sim.step({ mx: NaN, mz: Infinity, actions: 'dodge', aim: { dx: 0, dy: 0, dz: 0 } });
    sim.state.frontier.goal = 1e3; p.x = 100; p.z = 100;
    run(sim, 0.5, () => ({ fire: true, aim: { ox: 100, oy: 5, oz: 100, dx: 0, dy: 0, dz: 0, yaw: 0 } }));
  } catch (e) { err = e.stack.split('\n').slice(0, 2).join(' '); }
  check('odd commands and inputs do nothing and do not throw', !err, err);
  check('…and leave the rider intact', p.money === 5000 && p.skillPoints === 5 && Number.isFinite(p.x) && Object.keys(p.weapons).join() === 'revolver' && sim.state.job === null
    && sim.state.bullets.every(b => Number.isFinite(b.x)), `$${p.money}`);
}
{ // 18: smaller rules
  const sim = createSim(), s = sim.state, p = s.player;
  let ev = sim.step({ ...NONE, actions: ['quickZ', 'quickX'] });
  check('tonic and jerky are refused at full health', p.tonics.tonic === 1 && p.tonics.jerky === 2 && toasts(ev).filter(t => t === 'Health is full').length === 2);
  sim.command({ type: 'quick', slot: 'z', id: 'jerky' });
  check('putting X\'s item on Z swaps the slots', p.quick.z === 'jerky' && p.quick.x === 'tonic');
  p.money = 1000; sim.command({ type: 'buy', kind: 'gear', id: 'pack' });
  p.res.hide = 30;
  ev = sim.command({ type: 'equip', id: 'pack' });
  check('the pack saddle stays on while the bags are over-full', p.equipped.saddle === 'pack' && toasts(ev).length === 1);
  p.res.hide = 10; sim.command({ type: 'equip', id: 'pack' });
  check('…and comes off once they are not', p.equipped.saddle === null);
  p.yaw = 0;
  sim.step({ ...NONE, actions: ['dodge'] });
  const z0 = p.z;
  run(sim, 0.4, () => ({}));
  check('the backward hop does not turn the rider', Math.abs(p.yaw) < 1e-9 && p.z < z0);
  p.stamina = 5; p.dodgeCd = 0; p.dodgeT = 0;
  ev = sim.step({ ...NONE, actions: ['dodge', 'holler', 'holler'] });
  check('a dodge with no stamina and a holler on cooldown say why', toasts(ev).includes('Too winded to dodge') && toasts(ev).some(t => /^Holler ready in \d+s$/.test(t)) && s.herd.hollerCd > 0);
  park(sim, null);
  p.x = 150; p.z = 0; p.res.hide = 0;
  s.loot.push({ id: 'lootA', x: p.x, z: p.z, items: { hide: 1 }, money: 7, t: 120 }, { id: 'lootB', x: p.x, z: p.z, items: {}, money: 4, t: 120 });
  ev = sim.step(NONE);
  check('the loot toast includes the money', toasts(ev).includes('+ $7, 1 hide') && toasts(ev).includes('+ $4') && ev.filter(e => e.type === 'pickup').length === 2, toasts(ev).join(' | '));
  const e = s.enemies.find(e => !e.outpost && e !== s.rex);
  e.dead = true; e.deadT = 0; e.flashT = 0.12;
  run(sim, 0.3, () => ({}));
  check('a dead animal stops flashing', e.flashT === 0);
  sim.step({ ...NONE, actions: ['dismount'] });
  Object.assign(e, { dead: false, hp: 60, heldT: 0, x: p.x + 2, z: p.z, state: 'chase', cd: 0 }); e.home = { x: e.x, z: e.z };
  p.hp = 1;
  let text = '';
  for (let i = 0; i < 3 / STEP && !text; i++) text = toasts(sim.step(NONE)).find(t => /^(Knocked|Thrown)/.test(t)) || '';
  check('falling on foot is "Knocked down…"', text.startsWith('Knocked down…'), text);
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
