// Ruling the town: ledger values, daily tick, upgrades, pay/supply edge cases, raids and their save/restore.
import { lateGame, mk, check, note, clone, createSim, sane, STEP, QUESTS } from './50-lib.js';
import { TOWN_RULE as R, TOWN_LEVELS, DAY } from '../../src/data/content.js';
import { TOWN, REST_PRICE } from '../../src/data/items.js';

const inTown = (g) => { g.p.x = 0; g.p.z = -10; };
const raiders = (g) => g.s.enemies.filter(e => e.tag === 'raid' && !e.dead && !e.gone);

{ // not owned
  const g = mk(); inTown(g);
  for (const type of ['townUpgrade', 'townSupply', 'townPay']) g.cmd({ type });
  check('ledger commands refused before the town is yours', !g.s.town.owned && g.s.town.treasury === 200 && g.p.money === 50, g.lastToast());
  g.wait(R.firstRaid + 10); check('no raids on a town that is not yours', !g.s.town.raid && !g.s.siege && raiders(g).length === 0);
}

{ // daily tick
  const g = lateGame(), t = g.s.town; inTown(g);
  const day0 = t.day; const b = { ...t };
  g.s.clock += DAY.length; g.step();
  check('one day: +$100 tax (morale 60), stores -8, safety -3, morale -2 toward 50', t.treasury === b.treasury + 100 && t.supplies === b.supplies - 8 && t.safety === b.safety - 3 && t.morale === b.morale - 2 && t.day === day0 + 1, JSON.stringify({ tr: t.treasury, su: t.supplies, sa: t.safety, mo: t.morale }));
  // several days at once
  const b2 = { ...t }; g.s.clock += DAY.length * 5; g.step();
  note(`5 days skipped in one jump: treasury +${t.treasury - b2.treasury}, stores ${b2.supplies}->${t.supplies}, safety ${b2.safety}->${t.safety} (one tick only; no command in the game skips more than one day, so only a clock edit shows this)`);
  // morale bands
  t.morale = 70; t.level = 3; const tr = t.treasury; g.s.clock += DAY.length; g.step(); check('level 3, morale 70: tax 360', t.treasury - tr === 360, t.treasury - tr);
  t.morale = 29; t.level = 2; const tr2 = t.treasury; g.s.clock += DAY.length; g.step(); check('level 2, morale 29: tax 120', t.treasury - tr2 === 120, t.treasury - tr2);
  // long run: 200 days untouched, raids ignored (rider far away)
  const h = lateGame(5), ht = h.s.town; h.p.x = 250; h.p.z = -250; let lo = { ...ht }, bad = [];
  for (let d = 0; d < 200; d++) { h.s.clock += DAY.length; h.step(); if (ht.raid) { for (const e of h.s.enemies) if (e.tag === 'raid') e.gone = true; } for (const k of ['treasury', 'supplies', 'safety', 'morale']) { if (!(ht[k] >= 0) || (k !== 'treasury' && ht[k] > 100)) bad.push(`${k}=${ht[k]}`); } }
  check('200 days untouched: all values stay in range', bad.length === 0, bad.slice(0, 3).join());
  note(`after 200 untended days: treasury ${ht.treasury}, stores ${ht.supplies}, safety ${ht.safety}, morale ${ht.morale}`);
}

{ // resting
  const g = lateGame(), t = g.s.town, p = g.p; inTown(g); p.money = 5000;
  const c0 = g.s.clock, tr0 = t.treasury, raidIn0 = t.raidIn, m0 = p.money; let ticks = 0, zero = 0;
  for (let i = 0; i < 20; i++) { const c = g.s.clock, tr = t.treasury; g.cmd({ type: 'rest' }); g.step(); if (g.s.clock - c < 1) zero++; if (t.treasury > tr) ticks++; }
  note(`20 rests in a row: clock +${((g.s.clock - c0) / DAY.length).toFixed(2)} days, ${ticks} tax days, treasury ${tr0} -> ${t.treasury}, cost $${m0 - p.money}, raid timer ${raidIn0.toFixed(0)} -> ${t.raidIn.toFixed(0)} s, rests that moved the clock by under a second: ${zero}`);
  check('EXPLOIT? resting through days also brings the next raid closer', raidIn0 - t.raidIn > 1000, `raid timer moved ${(raidIn0 - t.raidIn).toFixed(1)} s over ${((g.s.clock - c0) / 60).toFixed(0)} min of game time`);
  // rest during a raid
  g.sim.town.startRaid(); const left = t.raid.left; p.hp = 5; g.cmd({ type: 'rest' });
  note(`rest during a raid: allowed, hp ${p.hp}/${p.maxHp}, raid time left ${left} -> ${t.raid.left}, works anywhere inside the town circle (not only at the saloon)`);
  // rest far from the saloon but in town
  const k = lateGame(); k.p.x = 30; k.p.z = -10; k.p.hp = 1; k.cmd({ type: 'rest' });
  check('rest is only possible at the saloon door', k.p.hp === 1, `hp ${k.p.hp} at 54 m from the saloon door`);
}

{ // pay / supply / upgrade
  const g = lateGame(), t = g.s.town, p = g.p; inTown(g);
  p.money = 0; g.cmd({ type: 'townPay' }); check('pay with $0', t.treasury === 200, g.lastToast());
  p.money = 37; g.cmd({ type: 'townPay' }); check('pay with $37 pays 37', t.treasury === 237 && p.money === 0);
  p.money = 250; g.cmd({ type: 'townPay' }); check('pay is $100 at a time', t.treasury === 337 && p.money === 150);
  p.res.meat = 0; p.res.hide = 0; g.cmd({ type: 'townSupply' }); check('supply with nothing', t.supplies === 50, g.lastToast());
  // morale from supplying in small lots
  const mo = t.morale; p.res.meat = 8; g.cmd({ type: 'townSupply' }); const oneLot = t.morale - mo;
  const h = lateGame(), ht = h.s.town; inTown(h); const mo2 = ht.morale;
  for (let i = 0; i < 8; i++) { h.p.res.meat = 1; h.cmd({ type: 'townSupply' }); }
  note(`8 meat in one lot: morale +${oneLot}, stores +8. 8 meat one at a time: morale +${ht.morale - mo2}, stores +${ht.supplies - 50} (the UI gives everything at once, so this needs carrying one piece at a time)`);
  // full stores still take goods
  t.supplies = 100; p.res.hide = 10; const mo3 = t.morale; g.cmd({ type: 'townSupply' });
  note(`stores already 100: 10 hides taken, stores ${t.supplies}, morale +${t.morale - mo3}`);
  // upgrade rules
  t.supplies = 59; t.treasury = 5000; g.cmd({ type: 'townUpgrade' }); check('upgrade refused under 60 stores', t.level === 1, g.lastToast());
  t.supplies = 60; t.treasury = 1499; g.cmd({ type: 'townUpgrade' }); check('upgrade refused under $1500', t.level === 1, g.lastToast());
  t.treasury = 1500; const price = g.sim.economy.price(100); g.cmd({ type: 'townUpgrade' }); check('level 2 at 60 stores and $1500', t.level === 2 && t.treasury === 0 && g.sim.economy.price(100) === Math.round(price * 0.9));
  t.treasury = 4000; t.supplies = 79; g.cmd({ type: 'townUpgrade' }); check('level 3 needs 80 stores', t.level === 2);
  t.supplies = 80; g.sim.town.startRaid(); g.cmd({ type: 'townUpgrade' }); check('no upgrade during a raid', t.level === 2, g.lastToast());
  for (const e of g.s.enemies) if (e.tag === 'raid') e.gone = true; g.wait(0.1);
  t.treasury = 4000; g.cmd({ type: 'townUpgrade' }); check('level 3 at 80 stores and $4000', t.level === 3);
  t.treasury = 99999; g.cmd({ type: 'townUpgrade' }); check('no level 4', t.level === 3 && t.treasury === 99999);
  g.open(0, -120); g.cmd({ type: 'townPay' }); check('ledger needs the rider in town', /in town/.test(g.lastToast()));
  // discounts stack: standing 25, haggler, town level 2
  const k = lateGame(), kp = k.p; inTown(k); k.s.town.level = 3; kp.skills.marshal = 5; k.sim.economy.recalc();
  note(`stacked shop price for a $100 item (standing 25+, Haggler, town level 2+): $${k.sim.economy.price(100)}; best sell price hide $${k.sim.economy.sellPrice('hide')} (nothing bought can be sold back, so no money loop)`);
  // is there any way to take money out of the treasury?
  note('treasury money can only be spent on upgrades ($5500 in all); after level 3 it has no use and still grows');
}

{ // raid: warning, start, win, loss, bell, towers
  const g = lateGame(), t = g.s.town, s = g.s; inTown(g);
  t.raidIn = R.warning + 0.5; g.wait(1); check('warning at two minutes', t.warned && g.sim.town.status()?.title === 'Raid coming' && !s.siege);
  t.raidIn = 0.05; g.wait(0.2);
  check('raid starts: 5 raiders at level 1, siege on, warned cleared', !!t.raid && s.siege && raiders(g).length === 5 && !t.warned, `raiders ${raiders(g).length}`);
  t.safety = 30; const h = lateGame(); h.s.town.safety = 30; h.s.town.level = 3; h.sim.town.startRaid(); check('level 3 and low safety: 3 + 6 + 2 raiders', raiders(h).length === 11, raiders(h).length);
  // win by killing
  const tr = t.treasury, sa = t.safety, mo = t.morale, xp = g.p.xp + g.p.level * 1e6;
  for (const e of raiders(g)) { e.hp = 0; e.dead = true; e.deadT = 0; } g.wait(0.1);
  check('all raiders dead: won, +$300, safety +10, morale +6, xp, siege off', !t.raid && !s.siege && t.raidsWon === 1 && t.treasury === tr + 300 && t.safety === sa + 10 && t.morale === mo + 6 && g.p.xp + g.p.level * 1e6 > xp);
  check('next raid 15 to 25 minutes off', t.raidIn >= 900 && t.raidIn <= 1500, t.raidIn);
  // loss by the bell
  g.sim.town.startRaid(); g.p.x = 250; g.p.z = 250; for (const m of s.mates) { m.x = 250; m.z = 245; } g.cmd({ type: 'order', id: 'hold' });
  const tr2 = t.treasury; let tt = 0; while (t.raid && tt < 400) { g.step(); tt += STEP; }
  check('rider far away: the raid is lost when the bell falls', t.raidsLost === 1 && !s.siege && t.treasury === tr2 - Math.round(tr2 * 0.3) && raiders(g).length === 0, `after ${tt.toFixed(0)} s lost ${t.raidsLost} won ${t.raidsWon}`);
  note(`undefended raid at level 1 is lost after ${tt.toFixed(0)} s`);
  // towers
  const k = lateGame(99, { mates: [] }), kt = k.s.town; kt.level = 3; k.p.x = 250; k.p.z = 250; k.sim.town.startRaid(); const n0 = raiders(k).length; let t3 = 0, towerShots = 0;
  while (kt.raid && t3 < 400) { for (const e of k.step()) if (e.type === 'mateShot') towerShots++; t3 += STEP; }
  note(`level 3 town, nobody defending, ${n0} raiders: ${kt.raidsWon ? 'WON' : 'lost'} after ${t3.toFixed(0)} s, ${towerShots} tower shots (15 dmg each second on the raider nearest the square)`);
}

{ // win by time-out: keep the raiders out of town
  for (const lvl of [1, 3]) {
    const g = lateGame(99, { mates: [], level: 10 }), t = g.s.town, p = g.p; t.level = lvl; p.x = 0; p.z = -110; g.sim.town.startRaid(); const n = raiders(g).length;
    let tt = 0, ang = 0, hp0 = p.hp, minHp = p.hp, inTownT = 0;
    while (t.raid && tt < 300) {
      // ride a circle 100 m from the town, never firing
      const a = Math.atan2(p.z + 10, p.x), tx = Math.cos(a + 0.25) * 100, tz = -10 + Math.sin(a + 0.25) * 100;
      g.step({ mx: tx - p.x, mz: tz - p.z, sprint: p.stamina > 20 }); tt += STEP; minHp = Math.min(minHp, p.hp);
      if (raiders(g).some(e => Math.hypot(e.x, e.z + 10) < 36)) inTownT += STEP;
    }
    note(`town level ${lvl}, ${n} raiders, rider circles 100 m out and never fires: ${t.raidsWon ? `raid WON by time-out after ${tt.toFixed(0)} s (+$300, +400 xp)` : `lost after ${tt.toFixed(0)} s`}; lowest hp ${minHp.toFixed(0)}/${hp0}, thrown ${p.dead}, raiders inside town for ${inTownT.toFixed(0)} s, bell ${t.raid ? '' : 'n/a'}`);
  }
  // standing still 60 m outside town
  const g = lateGame(99, { mates: [], level: 10 }), t = g.s.town, p = g.p; p.x = 0; p.z = -10 - 75; g.sim.town.startRaid(); let tt = 0, deaths = 0, was = false;
  while (t.raid && tt < 300) { g.step(); tt += STEP; if (p.dead && !was) deaths++; was = p.dead; }
  note(`rider waits 75 m south of the square doing nothing: ${t.raidsWon ? 'won' : 'lost'} after ${tt.toFixed(0)} s, thrown ${deaths}x`);
}

{ // raid and the rider's states
  // dead when it starts
  let g = lateGame(), t = g.s.town; inTown(g); g.p.dead = true; g.p.hp = 0; g.p.deadT = 0; t.raidIn = 0.01; g.wait(0.1);
  check('raid starts while the rider is down', !!t.raid && g.s.siege); g.wait(4); check('rider respawns into the raid', !g.p.dead && !!t.raid);
  // conversation open
  g = lateGame(); t = g.s.town; g.p.x = -15; g.p.z = -2.5 + 4; g.cmd({ type: 'talk' }); const open = !!g.s.dialogue; t.raidIn = 0.01; g.wait(1);
  check('raid starts with small talk open; leaving it works', open && !!t.raid && g.s.siege); g.cmd({ type: 'leave' }); check('small talk closed', !g.s.dialogue);
  // shops and board during a raid
  g.p.x = 12; g.p.z = -25; g.cmd({ type: 'takeJob', i: 0 }); const took = !!g.s.job; g.cmd({ type: 'buy', kind: 'tonic', id: 'tonic' });
  check('notice board and shops work during a raid', took);
  // a bounty taken during a raid; the raid ends; is the bounty target kept?
  const bt = g.s.enemies.find(e => e.bounty); for (const e of raiders(g)) { e.dead = true; e.hp = 0; } g.wait(0.2);
  check('ending a raid does not remove other animals (bounty target, wild ones)', !t.raid && (!bt || (!bt.gone && !bt.dead)) && g.s.enemies.filter(e => !e.tag).length >= 39);
  // quest fight + raid: q12/3 (talk to Pike) pending while raids run
  const sim = createSim(), s = sim.state; s.story.quest = 11; s.story.step = 3; s.story.standing = 80; sim.story.enter(); sim.town.claim();
  s.town.raidIn = 0.01; for (let i = 0; i < 10; i++) sim.step();
  s.player.x = -6; s.player.z = -10; sim.command({ type: 'talk' }); for (let n = 0; s.dialogue && n < 5; n++) sim.command({ type: 'say', i: 0 });
  check('talking to Pike (ending act 2) during a raid keeps the siege on', !QUESTS[s.story.quest] && !!s.town.raid && s.siege === true, `quest ${s.story.quest} raid ${!!s.town.raid} siege ${s.siege}`);
  // hold step and a raid cannot overlap; but a story step change during a raid?
  const sim2 = createSim(), s2 = sim2.state; s2.story.quest = 6; s2.story.step = 0; sim2.story.enter(); sim2.town.claim(); sim2.town.startRaid();
  s2.player.x = -15; s2.player.z = 1; sim2.command({ type: 'talk' }); for (let n = 0; s2.dialogue && n < 5; n++) sim2.command({ type: 'say', i: 0 });
  note(`(forced state) a quest step completed during a raid: siege ${s2.siege} raid ${!!s2.town.raid}`);
}

{ // save / restore before, during, after a raid
  const g = lateGame(), t = g.s.town; inTown(g);
  t.raidIn = 300; t.treasury = 777; t.safety = 33; t.morale = 71; t.supplies = 64; t.level = 2; t.raidsWon = 3; t.raidsLost = 2;
  let a = createSim(); a.restore(clone(g.sim.snapshot())); let at = a.state.town;
  check('ledger survives a save', at.treasury === 777 && at.safety === 33 && at.morale === 71 && at.supplies === 64 && at.level === 2 && at.raidsWon === 3 && at.raidsLost === 2 && at.raidIn === 300 && at.day === t.day);
  t.raidIn = 60; g.wait(0.1); a = createSim(); a.restore(clone(g.sim.snapshot())); at = a.state.town;
  note(`saved 60 s before a raid (already warned): restored raidIn ${at.raidIn.toFixed(0)}, warned ${at.warned} -> the bell warning toast plays again`);
  g.sim.town.startRaid(); g.wait(5); const bell = t.raid.bell;
  const sv = clone(g.sim.snapshot()); a = createSim(); a.restore(sv); at = a.state.town;
  check('saved during a raid: restored without the raid, raiders two minutes out, no siege', !at.raid && !a.state.siege && at.raidIn === R.warning && !a.state.enemies.some(e => e.tag === 'raid') && sane(a).length === 0, `raidIn ${at.raidIn} ${sane(a).join(';')}`);
  note('EXPLOIT: reloading during a raid that is going badly cancels it at no cost (bell damage forgotten, raiders gone, 2 min to prepare)');
  for (let i = 0; i < 130 * 60; i++) a.step();
  check('the restored game raids again after two minutes', !!a.state.town.raid && a.state.siege);
  // after a raid
  for (const e of raiders(g)) { e.dead = true; e.hp = 0; } g.wait(0.1); a = createSim(); a.restore(clone(g.sim.snapshot()));
  check('saved after a raid: ok', !a.state.town.raid && !a.state.siege && a.state.town.raidsWon === 4);
  // tampered town blocks
  for (const town of [null, 5, 'x', [], { owned: true }, { owned: true, level: 0, treasury: -1, supplies: 1e9, safety: -1, morale: NaN, day: -5, raidIn: -1, raidsWon: 'a', raiding: 1 }, { owned: 1, level: 3 }, { owned: true, level: 2.5, treasury: 1e99, raidIn: Infinity }]) {
    const b = createSim(); const ok = b.restore({ ...sv, town }); const bad = ok ? sane(b) : ['refused']; for (let i = 0; i < 120; i++) b.step(); bad.push(...sane(b));
    check(`tampered town ${JSON.stringify(town)?.slice(0, 60)} loads clean`, ok && bad.length === 0, bad.join(';'));
  }
  // pre-takeover stores (wagons taken) and a reload
  const pre = mk(); pre.sim.town.addSupplies(30); const stores = pre.s.town.supplies; const b = createSim(); b.restore(clone(pre.sim.snapshot()));
  check('WRONG? stores gathered before the takeover (the wagons, +30) survive a save', b.state.town.supplies === stores, `${stores} -> ${b.state.town.supplies}`);
}

{ // raid frequency over a long idle stretch (rider parked far away, town level 1)
  const g = lateGame(3, { mates: [] }), t = g.s.town; g.p.x = 250; g.p.z = -250; const starts = []; let was = false;
  for (let i = 0; i < 4 * 3600 * 60; i++) { g.s.enemies.length > 60 && 0; g.step(); if (!!t.raid && !was) starts.push(g.s.clock); was = !!t.raid; }
  const gaps = starts.slice(1).map((c, i) => Math.round((c - starts[i]) / 60));
  note(`4 h of game time: ${starts.length} raids; first at ${(starts[0] / 60).toFixed(0)} min after the takeover; minutes between raids: ${gaps.join(', ')}; lost ${t.raidsLost}, treasury ${t.treasury}, safety ${t.safety}, morale ${t.morale}, stores ${t.supplies}`);
  check('state sane after 4 h', sane(g.sim).length === 0, sane(g.sim).join(';'));
}
process.exit(0);
