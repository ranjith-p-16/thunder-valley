// More town probes (tester 87)
import { lateGame, check, note, clone, createSim, STEP, QUESTS } from './50-lib.js';
import { TOWN_RULE as R, TAX_LAWS, DAY } from '../../src/data/content.js';
import { TOWN } from '../../src/data/items.js';
const inTown = (g) => { g.p.x = 0; g.p.z = -10; };
const raiders = (g) => g.s.enemies.filter(e => e.tag === 'raid' && !e.dead && !e.gone);

{ // A: the stand in the square after a raid ended (won or lost) during it, minimal
  for (const how of ['won', 'lost']) {
    const g = lateGame(99, { mates: [] }); const { s, sim, p } = g; inTown(g);
    s.story.quest = 12; s.story.step = 1; s.story.done = QUESTS.slice(0, 12).map(q => q.id); sim.town.startRaid(); sim.story.enter();
    if (how === 'won') for (const e of s.enemies) if (e.tag === 'raid') e.gone = true; else s.town.raid.bell = 0.001;
    if (how === 'lost') s.town.raid.bell = 0.0001, s.enemies.filter(e => e.tag === 'raid').forEach(e => { e.x = 0; e.z = -10; });
    g.step(); g.step();
    let hurt = 0, hp = p.hp, log = [];
    for (let i = 0; i < 125 / STEP && g.stepOf() === 'q13/1'; i++) { g.step(); if (p.hp < hp) hurt++; hp = p.hp; if (i % 1200 === 0) log.push(s.story.count.toFixed(0)); }
    note(`A raid ${how} mid-stand: siege ${s.siege} right after; stand ended at ${g.stepOf()} with the rider hurt on ${hurt} steps (hp ${p.hp.toFixed(0)}/${p.maxHp}), count trace ${log.join(',')}; hold enemies left ${s.enemies.filter(e => e.tag === 'hold' && !e.gone).length}`);
  }
  // control: no raid
  const g = lateGame(99, { mates: [] }); const { s, sim, p } = g; inTown(g);
  s.story.quest = 12; s.story.step = 1; s.story.done = QUESTS.slice(0, 12).map(q => q.id); sim.story.enter();
  let hurt = 0, hp = p.hp, died = 0, was = false;
  for (let i = 0; i < 125 / STEP && g.stepOf() === 'q13/1'; i++) { g.step(); if (p.hp < hp) hurt++; hp = p.hp; if (p.dead && !was) died++; was = p.dead; }
  note(`A control (no raid): siege ${s.siege}, step ${g.stepOf()}, hurt on ${hurt} steps, died ${died}`);
}

{ // law as an array
  const g = lateGame(), t = g.s.town; inTown(g); t.level = 4;
  g.cmd({ type: 'townLaw', tax: ['high'] });
  note(`law set from ['high']: ${JSON.stringify(t.law)} typeof ${typeof t.law}; toast ${g.lastToast()}`);
  const a = createSim(); a.restore(clone(g.sim.snapshot())); note(`  after save/load: ${JSON.stringify(a.state.town.law)}`);
}

{ // roar on raiders
  const g = lateGame(99, { mates: [] }), t = g.s.town, p = g.p; inTown(g); p.mounts[2] = true; p.string = [0, 2]; g.cmd({ type: 'mount', i: 2 });
  g.sim.town.startRaid();
  for (let i = 0; i < 40 / STEP && raiders(g).filter(e => g.dist(e) < 40).length < 3; i++) g.step();
  const rs = raiders(g); for (const e of rs) e.hp = e.maxHp * 0.2;
  p.abilityCd = 0; g.step({ actions: ['ability'] });
  note(`roar: states ${rs.map(e => e.state).join(',')}`);
  g.wait(5.1);
  const back = rs.filter(e => e.state === 'return');
  let blocked = 0; const b0 = t.raid?.bell;
  for (let i = 0; i < 4 / STEP; i++) { const e = back.find(x => x.state === 'return' && !x.dead); if (!e) break; const hp = e.hp; g.step({ fire: true, aim: g.aimAt(e) }); if (e.hp >= hp) blocked++; }
  note(`roar+5 s: ${back.length}/${rs.length} raiders in 'return'; hp now ${rs.map(e => (e.hp / e.maxHp * 100).toFixed(0) + '%' + e.state + '@' + Math.hypot(e.x - TOWN.x, e.z - TOWN.z).toFixed(0)).join(' ')}; bell ${b0?.toFixed(1)} -> ${t.raid?.bell.toFixed(1)}`);
}

{ // tax law yield over 60 days, stores kept full, no raids
  for (const law of ['low', 'fair', 'high']) for (const m0 of [60]) {
    const g = lateGame(), t = g.s.town; g.p.x = 250; g.p.z = 250; t.level = 4; t.law = law; t.morale = m0; t.treasury = 0; const per = [];
    for (let d = 0; d < 60; d++) { t.supplies = 100; t.raidIn = 1e5; const tr = t.treasury; g.s.clock += DAY.length; g.step(); per.push(t.treasury - tr); }
    note(`law ${law}: 60 days at level 4 -> $${t.treasury}, morale ends ${t.morale}; first 10 days ${per.slice(0, 10).join(',')}; last ${per[59]}`);
  }
}

{ // rest at odd times
  for (const ph of [7 / 24, 7 / 24 + 1e-9, 0.2, 0.9, 0.2916]) {
    const g = lateGame(); inTown(g); g.s.clock = (3 + ph - DAY.start) * DAY.length; g.step(); const c = g.s.clock, m = g.p.money, d = g.s.town.day; g.cmd({ type: 'rest' }); g.step();
    note(`rest at phase ${ph.toFixed(4)}: +${((g.s.clock - c) / 3600 * (24 / (DAY.length / 3600))).toFixed(2)} game-hours, $${m - g.p.money}, day ${d}->${g.s.town.day}`);
  }
}

{ // raid during the blood moon and status text
  const g = lateGame(99, { mates: [] }), t = g.s.town; inTown(g); t.level = 5; g.s.clock = (4.9 - DAY.start) * DAY.length; g.step();
  g.sim.town.startRaid(); g.step();
  note(`raid in blood moon: bloodMoon ${g.s.bloodMoon}, ${g.sim.town.status().line}`);
  t.raid.bell = 1e-9; note(`  tiny bell: ${g.sim.town.status().line}`);
  g.cmd({ type: 'townUpgrade' }); g.cmd({ type: 'townPay' }); g.cmd({ type: 'rest' }); note(`  rest in raid: ${g.lastToast()}`);
}

{ // supply edge: fractional/odd room
  const g = lateGame(), t = g.s.town, p = g.p; inTown(g);
  t.supplies = 99; p.res.meat = 0; p.res.hide = 5; g.cmd({ type: 'townSupply' }); note(`stores 99 + hides only: ${g.lastToast()} stores ${t.supplies} hides ${p.res.hide}`);
  t.supplies = 0; t.morale = 0; p.res.meat = 20; p.res.hide = 0; g.cmd({ type: 'townSupply' }); note(`20 meat: stores ${t.supplies} morale ${t.morale}`);
  // morale farming: meat needed per morale; hides double
  t.supplies = 0; t.morale = 0; p.res.hide = 20; g.cmd({ type: 'townSupply' }); note(`20 hides: stores ${t.supplies} morale ${t.morale}`);
}
