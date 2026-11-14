// Natures, mount growth, V melee and the Spit / Charge / Sweep abilities.
import { mk, lateGame, check, note, clone, createSim, sane, STEP } from './50-lib.js';
import { MOUNTS, KINDS, NATURE, STAGES, MELEE, SPIT, CHARGE, SWEEP, MOUNT_MAX_LEVEL, PEN, RIDER } from '../../src/data/content.js';
import { PLACES, TOWN } from '../../src/data/items.js';

const field = (g, x = 0, z = -120) => { g.open(x, z); for (const e of g.s.enemies) if (Math.hypot(e.x - g.p.x, e.z - g.p.z) < 80) { e.x += 150; e.home = { x: e.x, z: e.z }; } };
const ride = (g, i, lv = 1) => { g.p.mounts[i] = true; if (!g.p.string.includes(i)) g.p.string.push(i); g.p.mount = i; g.p.mountLv[i] = lv; };

{ // nature ring
  const { sim } = mk(); const ring = ['stone', 'storm', 'swamp', 'ember', 'thorn'];
  let ok = true;
  ring.forEach((a, i) => ring.forEach((b, j) => {
    const want = j === (i + 1) % 5 ? NATURE.strong : i === (j + 1) % 5 ? NATURE.weak : 1;
    if (sim.natureMul(a, b) !== want) { ok = false; console.log('  ring wrong', a, b, sim.natureMul(a, b), want); }
  }));
  check('nature ring: stone>storm>swamp>ember>thorn>stone, +25% / -20%, otherwise 1', ok && NATURE.strong === 1.25 && NATURE.weak === 0.8);
  check('no nature (rustlers) is neutral', sim.natureMul(undefined, 'stone') === 1 && sim.natureMul('stone', undefined) === 1 && sim.natureMul('bogus', 'stone') === 1);
}

{ // stages, xp table, level-up loop
  const g = mk(), { sim, p } = g;
  const stageAt = (l) => { p.mountLv[0] = l; return sim.stageOf(0).name; };
  check('stages: Young 1-9, Grown 10-19, Elder 20-30', stageAt(1) === 'Young' && stageAt(9) === 'Young' && stageAt(10) === 'Grown' && stageAt(19) === 'Grown' && stageAt(20) === 'Elder' && stageAt(30) === 'Elder');
  p.mountLv[0] = 1; check('melee at level 1 Young = base x 0.85', Math.abs(sim.meleeDamage(0) - 28 * 0.85) < 1e-9, sim.meleeDamage(0));
  p.mountLv[0] = 10; check('melee at level 10 Grown = base x 1.36', Math.abs(sim.meleeDamage(0) - 28 * 1.36) < 1e-9, sim.meleeDamage(0));
  p.mountLv[0] = 30; check('melee at level 30 Elder = base x 1.15 x 2.16', Math.abs(sim.meleeDamage(0) - 28 * 1.15 * 2.16) < 1e-9, sim.meleeDamage(0));
  let tot = 0; p.mountLv[0] = 1; const marks = {};
  for (let l = 1; l < 30; l++) { p.mountLv[0] = l; tot += sim.mountXpNeeded(0); if ([9, 19, 29].includes(l)) marks[l + 1] = tot; }
  note(`mount xp totals: Grown(10) ${marks[10]}, Elder(20) ${marks[20]}, max(30) ${marks[30]}; a raptor kill is ${KINDS.raptor.xp}, a re-tame ${150}`);
  let rt = 0; const rl = {}; for (let l = 1; l < 30; l++) { rt += Math.round(100 * Math.pow(l, 1.5)); rl[l + 1] = rt; }
  note(`rider xp totals for comparison: level 10 ${rl[10]}, 15 ${rl[15]}, 20 ${rl[20]}, 25 ${rl[25]}`);
  // one huge gain: loop ends, level capped
  p.mountLv[0] = 1; p.mountXp[0] = 0; field(g);
  const e = g.wild('raptor')[0]; e.def = { ...e.def, xp: 5e6 }; g.bring(e, 0, 5); e.hp = 1; g.face(e); g.act('melee');
  check('a 5,000,000 xp kill: mount stops at 30, no hang', p.mountLv[0] === MOUNT_MAX_LEVEL && Number.isFinite(p.mountXp[0]), `lv ${p.mountLv[0]} xp ${p.mountXp[0]} rider ${p.level}`);
  const xpAt = p.mountXp[0]; const e2 = g.wild('raptor')[0]; g.bring(e2, 0, 5); e2.hp = 1; g.face(e2); g.wait(1.2); g.act('melee');
  check('no xp added at max level', p.mountXp[0] === xpAt, `${xpAt} -> ${p.mountXp[0]}`);
}

{ // where experience goes
  const g = lateGame(99, { level: 5 }); field(g); const { p, s, sim } = g; p.mountLv.fill(1); p.mountXp.fill(0);
  const tot = (i) => { let t = p.mountXp[i]; for (let l = 1; l < p.mountLv[i]; l++) t += Math.round(60 * Math.pow(l, 1.4)); return t; };
  const kill = () => { const e = g.wild('raptor')[0]; g.bring(e, 0, 30); e.hp = 1; for (let i = 0; i < 120 && !e.dead; i++) g.step({ fire: true, aim: g.aimAt(e) }); return e.dead; };
  kill(); check('a kill gives the ridden mount the kill xp (25)', tot(0) === 25, tot(0));
  g.act('swap'); kill(); check('after a swap the new mount gets it', tot(3) === 25 && tot(0) === 25, `${tot(0)} ${tot(3)}`);
  g.act('dismount'); const b = [0, 1, 2, 3, 4, 5].map(tot).join(); kill();
  check('on foot no mount gets xp', [0, 1, 2, 3, 4, 5].map(tot).join() === b, `${b} -> ${[0, 1, 2, 3, 4, 5].map(tot).join()}`);
  g.act('dismount'); g.wait(0.1); if (p.onFoot) { p.onFoot = false; }
  // Mara's kill
  const e = g.wild('raptor')[0]; g.bring(e, 0, 15); e.hp = 1; e.state = 'chase'; const t3 = tot(3), rx = p.xp;
  for (let i = 0; i < 300 && !e.dead; i++) g.step();
  check("a posse mate's kill gives rider and ridden mount the xp", e.dead && tot(3) === t3 + 25 && p.xp === rx + 25, `mount +${tot(3) - t3} rider +${p.xp - rx}`);
  // job reward, penned longhorn
  s.job = { type: 'hunt', title: 'Hunt contract', pay: 50, xp: 80, left: 0, done: 0, count: 1, text: '' }; p.res.hide = 1; p.x = 12; p.z = -25; const t3b = tot(3);
  g.cmd({ type: 'turnIn' }); check('job xp goes to the ridden mount', tot(3) === t3b + 80, `+${tot(3) - t3b}`);
  const a = s.animals[0]; a.x = PEN.x; a.z = PEN.z; const t3c = tot(3); p.x = 0; p.z = 10; g.wait(0.5);
  check('a penned longhorn gives the ridden mount xp', a.penned && tot(3) > t3c, `penned ${a.penned} +${tot(3) - t3c}`);
  // st.xp bonus (charm) applies to the rider only
  note(`mount xp ignores the rider's +xp gear/skills by design? gainXp gives the mount Math.round(n), the rider n*st.xp`);
}

{ // V melee
  const g = lateGame(99, { mates: [] }); field(g); const { p, s, sim } = g; p.mountLv.fill(1);
  const e = g.wild('raptor')[0]; g.bring(e, 0, 4); g.face(e); const st0 = p.stamina;
  g.act('melee'); check('melee hits: 28 x 0.85 x 1 (storm v storm)', Math.abs(60 - e.hp - 28 * 0.85) < 1e-6 && Math.abs(st0 - p.stamina - MELEE.stamina) < 0.5, `dealt ${60 - e.hp} stamina ${st0}->${p.stamina}`);
  g.act('melee'); check('melee cooldown 1.1 s', Math.abs(60 - e.hp - 28 * 0.85) < 1e-6);
  e.hp = 60; e.heldT = 30; g.wait(1.0); g.act('melee'); const a = e.hp; g.wait(0.12); g.act('melee'); check('ready after 1.1 s', a === 60 && e.hp < 60, `${a} ${e.hp}`);
  // natures in melee: Platewalker (stone) v raptor (storm) +25%; Strider (storm) v plate (stone) -20%
  ride(g, 5); e.hp = 60; e.heldT = 30; e.x = p.x; e.z = p.z + 4; g.face(e); g.wait(1.2); g.act('melee');
  check('stone mount v storm raptor: +25%', Math.abs(60 - e.hp - 45 * 0.85 * 1.25) < 1e-6, 60 - e.hp);
  ride(g, 0); const pl = g.wild('plate')[0]; g.bring(pl, 0, 5, { held: 30 }); e.x = 250; g.face(pl); g.wait(1.2); g.act('melee');
  check('storm mount v stone platewalker: -20%', Math.abs(260 - pl.hp - 28 * 0.85 * 0.8) < 1e-6, 260 - pl.hp);
  // behind the rider is not hit; reach
  pl.x = 250; const r2 = g.wild('raptor')[0]; g.bring(r2, 0, -4, { held: 30 }); p.yaw = 0; g.wait(1.2); g.act('melee'); check('nothing behind is hit', r2.hp === 60);
  r2.x = p.x; r2.z = p.z + MELEE.reach + 1.6 + 0.3; g.wait(1.2); g.act('melee'); check('out of reach (3.5 + radius) is not hit', r2.hp === 60);
  // stamina floor
  p.stamina = 5; r2.z = p.z + 4; g.act('melee'); check('too winded: no strike', r2.hp === 60, g.lastToast());
  // on foot
  p.stamina = 100; g.act('dismount'); g.wait(1.2); g.act('melee'); check('no melee on foot', r2.hp === 60); g.act('dismount'); p.onFoot = false;
  // town
  p.x = 0; p.z = -10 - 30; r2.x = 0; r2.z = -10 - 33; r2.heldT = 30; g.face(r2); g.wait(1.2); const stm = p.stamina; g.act('melee');
  check('no melee inside the peaceful town', r2.hp === 60 && p.stamina === stm);
  // abilities inside the town
  for (const [i, name] of [[5, 'Sweep'], [3, 'Spit'], [4, 'Charge']]) {
    ride(g, i); p.abilityCd = 0; p.x = 0; p.z = -10 - 30; r2.x = 0; r2.z = -10 - 39.5; r2.hp = 60; r2.heldT = 30; r2.state = 'wander'; g.face(r2);
    g.act('ability'); g.wait(0.9);
    note(`${name} used from inside the peaceful town on an animal at its edge: raptor hp 60 -> ${r2.dead ? 'dead' : r2.hp.toFixed(1)} (melee and guns are refused there)`);
    r2.dead = false; r2.hp = 60;
  }
  // things melee/abilities must not hurt: longhorns (penned, loose), npcs
  const hp = s.animals.map(a => a.hp).join(); ride(g, 5); p.abilityCd = 0; p.x = PEN.x; p.z = PEN.z; s.animals[0].x = p.x + 2; s.animals[0].z = p.z;
  g.act('ability'); g.act('melee'); check('Sweep and melee do not hurt longhorns', s.animals.map(a => a.hp).join() === hp);
}

{ // compies and abilities (quest 1 says: no shooting in town, ride at them)
  const g = mk(); const { p, s, sim } = g; s.story.quest = 0; s.story.step = 1; sim.story.enter();
  const comp = s.enemies.filter(e => e.tag === 'q1'); p.x = 18; p.z = -1; for (const c of comp) { c.x = 18 + Math.random(); c.z = 0; c.heldT = 2; }
  ride(g, 5); const xp = p.xp; g.act('ability');
  note(`Sweep in town on the quest compies: ${comp.filter(c => c.dead).length} of ${comp.length} killed, rider xp +${p.xp - xp}`);
  ride(g, 4); p.abilityCd = 0; for (const c of comp) { c.dead = false; c.hp = 10; c.x = 18; c.z = 3; c.heldT = 2; } p.yaw = 0; g.act('ability'); g.wait(0.2);
  note(`Charge in town on the quest compies: ${comp.filter(c => c.dead).length} killed`);
  ride(g, 3); p.abilityCd = 0; p.dashT = 0; p.charging = false; for (const c of comp) { c.dead = false; c.hp = 10; c.x = 18; c.z = 8; c.heldT = 2; } p.yaw = 0; g.act('ability');
  check('Spit ignores compies', comp.every(c => !c.dead), g.lastToast());
}

{ // Spit / Sweep / Charge numbers
  const g = lateGame(99, { mates: [] }); field(g); const { p, s } = g; p.mountLv.fill(10);
  const e = g.wild('cinder')[0]; g.bring(e, 0, 20); g.face(e); ride(g, 3, 10); g.act('ability');
  check('Spit: 30 x 1.25 (swamp v ember) and holds 2.5 s', Math.abs(140 - e.hp - SPIT.dmg * 1.25) < 1e-6 && Math.abs(e.heldT - SPIT.hold) < 0.05, `dealt ${140 - e.hp} held ${e.heldT}`);
  check('Spit cooldown 8 s', Math.abs(p.abilityCd - 8) < 0.05, p.abilityCd);
  // Sweep
  ride(g, 5, 10); p.abilityCd = 0; const rs = g.wild('raptor').slice(0, 3); rs.forEach((r, i) => g.bring(r, [6, -6, 0][i], [0, 0, -7][i]));
  e.x = 250; g.act('ability');
  check('Sweep: 45 x 1.25 (stone v storm) to all round, holds 1.5 s', rs.every(r => Math.abs(60 - r.hp - 45 * 1.25) < 1e-6 && Math.abs(r.heldT - 1.5) < 0.05), rs.map(r => (60 - r.hp).toFixed(1)).join());
  // Charge: once per charge?
  rs.forEach(r => { r.x = 250; });
  for (const [kind, lv] of [['plate', 10], ['cinder', 10]]) {
    ride(g, 4, lv); p.abilityCd = 0; p.x = 0; p.z = -120; const t = g.wild(kind)[0]; g.bring(t, 0, 6, { held: 30 }); p.yaw = 0; const hp0 = t.hp;
    let hits = 0; g.step({ actions: ['ability'] }).forEach(ev => { if (ev.type === 'hit') hits++; });
    for (let i = 0; i < 60; i++) g.step().forEach(ev => { if (ev.type === 'hit') hits++; });
    const want = CHARGE.dmg * g.sim.natureMul('ember', t.def.nature);
    check(`Charge hits a ${kind} once for ${want}`, hits === 1 && Math.abs(hp0 - Math.max(0, t.hp) - want) < 1e-6, `hits ${hits}, dealt ${(hp0 - t.hp).toFixed(0)} of ${hp0} hp, dead ${t.dead}`);
    t.x = 250; t.z = 250;
  }
  // Charge on the big ones
  for (const who of ['rex', 'hester', 'pell']) {
    const h = lateGame(99, { mates: [] }); field(h); ride(h, 4, 1);
    let t;
    if (who === 'rex') t = h.s.rex; else { h.s.story.quest = who === 'pell' ? 8 : 10; h.s.story.step = who === 'pell' ? 2 : 1; h.s.story.flags.pell = 'fought'; h.sim.story.enter(); t = h.s.enemies.find(e => e.kind === who); }
    h.p.x = t.x; h.p.z = t.z - t.def.radius - 5; h.p.yaw = 0; const hp0 = t.hp; let steps = 0;
    h.act('ability'); while (!t.dead && steps < 60) { h.step(); steps++; }
    check(`one Charge (Young, level 1) does not kill ${who} (${hp0} hp)`, !t.dead, `dead after ${steps} steps (${(steps / 60).toFixed(2)} s)`);
  }
  // Sweep / Spit hold on the Rex and lieutenants
  const h = lateGame(); field(h); h.s.story.quest = 10; h.s.story.step = 1; h.sim.story.enter(); const hes = h.s.enemies.find(e => e.kind === 'hester');
  ride(h, 5, 10); h.p.x = hes.x; h.p.z = hes.z - 7; h.act('ability'); note(`Sweep on Hester: held ${hes.heldT.toFixed(1)} s, dealt ${(700 - hes.hp).toFixed(0)}`);
  h.p.thrown.bolas = 5; h.face(hes); h.act('throw:bolas'); note(`bolas on Hester: held ${hes.heldT.toFixed(1)} s (5 bolas + traps + Spit/Sweep: is she ever free?)`);
  const rx = h.s.rex; h.p.x = rx.x; h.p.z = rx.z - 8; h.p.abilityCd = 0; rx.heldT = 0; h.act('ability'); check('Sweep does not hold the Rex', rx.heldT === 0 && rx.hp < 900, `held ${rx.heldT} hp ${rx.hp}`);
}

{ // Charge and Dash against walls and the pen fence
  for (const [name, i] of [['Charge', 4], ['Dash', 0]]) {
    const g = lateGame(); const { p } = g; ride(g, i, 10);
    // saloon wall: from the east side, charging west
    const b = PLACES[0]; p.x = b.x + b.w / 2 + 6; p.z = b.z; p.yaw = -Math.PI / 2; let inside = false;
    g.step({ actions: ['ability'], mx: -1, mz: 0 }); for (let k = 0; k < 90; k++) { g.step({ mx: -1, mz: 0 }); if (Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.z - b.z) < b.d / 2) inside = true; }
    check(`${name} does not go through the saloon`, !inside && p.x > b.x, `ended x=${p.x.toFixed(1)} (wall at ${b.x + b.w / 2})`);
    // notice board is 0.6 thick
    const nb = PLACES[3]; p.abilityCd = 0; p.x = nb.x; p.z = nb.z + 6; let crossed = false;
    g.step({ actions: ['ability'], mx: 0, mz: -1 }); for (let k = 0; k < 90; k++) { g.step({ mx: 0, mz: -1 }); if (p.z < nb.z - 0.5 && Math.abs(p.x - nb.x) < nb.w / 2) crossed = true; }
    check(`${name} does not pass through the thin notice board`, !crossed, `ended ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    // pen fence from the east, heading west
    p.abilityCd = 0; p.x = PEN.x + PEN.r + 8; p.z = PEN.z; let inPen = false;
    g.step({ actions: ['ability'], mx: -1, mz: 0 }); for (let k = 0; k < 90; k++) { g.step({ mx: -1, mz: 0 }); if (Math.hypot(p.x - PEN.x, p.z - PEN.z) < PEN.r - 1.6) inPen = true; }
    check(`${name} does not jump the pen fence`, !inPen, `ended ${(Math.hypot(p.x - PEN.x, p.z - PEN.z)).toFixed(1)} m from the pen centre (fence at ${PEN.r})`);
    // trees: charge through a line of scenery
    let through = 0, tried = 0;
    for (const t of g.s.obstacles.trees.slice(0, 60)) { p.abilityCd = 0; p.x = t.x + 5; p.z = t.z; tried++; g.step({ actions: ['ability'], mx: -1, mz: 0 }); for (let k = 0; k < 12; k++) { g.step({ mx: -1, mz: 0 }); if (Math.hypot(p.x - t.x, p.z - t.z) < t.r + RIDER.radius - 0.05) through++; } p.dashT = 0; p.charging = false; }
    check(`${name} never ends a step inside a tree trunk`, through === 0, `${through} steps inside over ${tried} trees`);
  }
}

{ // Young-stage penalty at the start: level-1 rider standing still v a 6-raptor pack, and the damage numbers
  const run = (stage) => {
    const g = mk(); field(g); const { p } = g; if (stage === 'Grown') p.mountLv[0] = 10;
    const pack = g.wild('raptor').slice(0, 6); pack.forEach((e, i) => { g.bring(e, Math.cos(i) * 30, Math.sin(i) * 30); e.state = 'chase'; e.cd = 0; });
    let t = 0; while (!p.dead && t < 60) { g.step(); t += STEP; } return t;
  };
  const a = run('Young'), b = run('Grown');
  note(`level-1 rider standing still v 6 raptors from 30 m: thrown after ${a.toFixed(1)} s as Young (new), ${b.toFixed(1)} s as Grown (= the old rules). Previous tester: 6 s.`);
  // fighting back: shoot the nearest, backpedal
  const fightRun = (lv, n, melee) => {
    const g = mk(); field(g); const { p } = g; p.mountLv[0] = lv;
    const pack = g.wild('raptor').slice(0, n); pack.forEach((e, i) => { g.bring(e, Math.cos(i * 2) * 32, Math.sin(i * 2) * 32); e.state = 'chase'; e.cd = 0; e.provokedT = 60; });
    let t = 0;
    while (!p.dead && pack.some(e => !e.dead) && t < 120) {
      const tg = pack.filter(e => !e.dead).sort((x, y) => g.dist(x) - g.dist(y))[0], d = g.dist(tg);
      const acts = melee && d < 5 ? ['melee'] : [];
      g.step({ fire: true, aim: g.aimAt(tg), mx: p.x - tg.x, mz: p.z - tg.z, sprint: d < 12, actions: acts }); t += STEP;
    }
    return { t, won: !p.dead, hp: p.hp, left: pack.filter(e => !e.dead).length };
  };
  for (const n of [2, 3, 4, 6]) {
    const y = fightRun(1, n, false), gr = fightRun(10, n, false), ym = fightRun(1, n, true);
    note(`level-1 rider, revolver, backing away v ${n} raptors: Young ${y.won ? `wins ${y.t.toFixed(0)} s hp ${y.hp.toFixed(0)}` : `thrown ${y.t.toFixed(0)} s, ${y.left} left`} | Grown(old) ${gr.won ? `wins ${gr.t.toFixed(0)} s hp ${gr.hp.toFixed(0)}` : `thrown ${gr.t.toFixed(0)} s, ${gr.left} left`} | Young+melee ${ym.won ? `wins ${ym.t.toFixed(0)} s hp ${ym.hp.toFixed(0)}` : `thrown ${ym.t.toFixed(0)} s, ${ym.left} left`}`);
  }
  // hurt numbers
  const g = mk(); field(g); const e = g.wild('raptor')[0]; g.bring(e, 2, 0); e.state = 'chase'; e.cd = 0; g.step();
  check('Young Strider takes 9 x 1.1 from a raptor', Math.abs(120 - g.p.hp - 9.9) < 0.05, 120 - g.p.hp);
  const speed = () => { const h = mk(); field(h); const x0 = h.p.z; h.wait(1, { mx: 0, mz: -1 }); return Math.abs(h.p.z - x0); };
  note(`Young walk speed ${speed().toFixed(2)} m/s (Strider 12 x 0.95 = 11.4)`);
}
process.exit(0);
