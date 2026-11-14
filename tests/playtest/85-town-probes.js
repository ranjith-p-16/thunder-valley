// Town/world probes (tester 85): siege flag, rest loop, restore, blood moon, roar on raiders.
import { lateGame, mk, check, note, clone, createSim, STEP, QUESTS } from './50-lib.js';
import { TOWN_RULE as R, TOWN_LEVELS, TAX_LAWS, BLOOD_MOON, DAY } from '../../src/data/content.js';
import { TOWN } from '../../src/data/items.js';

const inTown = (g) => { g.p.x = 0; g.p.z = -10; };
const raiders = (g) => g.s.enemies.filter(e => e.tag === 'raid' && !e.dead && !e.gone);
const toClock = (g, dayT) => { g.s.clock = (dayT - DAY.start) * DAY.length; };

{ // A: raid ends while a story hold step is running
  const g = lateGame(); const { s, sim, p } = g; inTown(g);
  s.story.quest = 12; s.story.step = 0; s.story.done = QUESTS.slice(0, 12).map(q => q.id);
  for (const n of s.npcs) n.hidden = n.id !== 'ros' && n.hidden; sim.story.enter();
  sim.town.startRaid(); g.step();
  s.story.step = 1; sim.story.enter();   // the stand begins (as when Ros is spoken to) while the raid is on
  check('A0 hold step + raid: siege on', s.siege === true && QUESTS[12].steps[1].type === 'hold');
  for (const e of s.enemies) if (e.tag === 'raid') e.gone = true;   // raiders all dead
  g.step(); g.step();
  check('A1 raid beaten during the stand: siege must stay on', s.siege === true, `siege ${s.siege} raid ${!!s.town.raid} step ${g.stepOf()}`);
  g.wait(30);
  const hold = s.enemies.filter(e => e.tag === 'hold' && !e.dead && !e.gone);
  note(`A after 30 s: siege ${s.siege}, hold enemies ${hold.length}, states ${hold.map(e => e.state + '@' + Math.hypot(e.x - TOWN.x, e.z - TOWN.z).toFixed(0)).join(',')}, count ${s.story.count.toFixed(1)}, hp ${p.hp.toFixed(0)}/${p.maxHp}`);
  const m0 = p.money; g.cmd({ type: 'rest' }); note(`A rest during the stand: ${g.lastToast()} (money ${m0}->${p.money})`);
  g.wait(120);
  note(`A after 150 s: step ${g.stepOf()} count ${s.story.count.toFixed(1)} siege ${s.siege} raidIn ${s.town.raidIn.toFixed(0)} raid ${!!s.town.raid}`);
}

{ // B: rest and the raid timer
  const g = lateGame(), t = g.s.town; inTown(g); g.p.money = 5000;
  t.raidIn = 20; t.warned = true; g.cmd({ type: 'rest' });
  check('B1 resting never pushes a raid further away', t.raidIn <= 20, `raidIn 20 -> ${t.raidIn}`);
  let raids = 0, tax0 = t.treasury, m0 = g.p.money, d0 = t.day;
  for (let i = 0; i < 30; i++) { g.cmd({ type: 'rest' }); g.wait(5); if (t.raid) raids++; }
  note(`B2 30 x (rest + 5 s): days ${t.day - d0}, raids ${raids}, treasury ${tax0}->${t.treasury}, cost $${m0 - g.p.money}, raidIn ${t.raidIn.toFixed(1)}, stores ${t.supplies} morale ${t.morale} safety ${t.safety}`);
  // zero-length rest
  const h = lateGame(); inTown(h); h.p.money = 500; h.cmd({ type: 'rest' }); const c = h.s.clock, m = h.p.money; h.cmd({ type: 'rest' });
  note(`B3 second rest straight after waking: clock +${(h.s.clock - c).toFixed(3)} s, paid $${m - h.p.money}`);
  // warning text after a rest
  const k = lateGame(), kt = k.s.town; inTown(k); k.p.money = 500; kt.raidIn = 900; k.cmd({ type: 'rest' }); k.step();
  note(`B4 after rest raidIn ${kt.raidIn.toFixed(0)}; toasts: ${k.toasts.slice(-3).join(' | ')}; status ${JSON.stringify(k.sim.town.status()?.line)}`);
}

{ // C: restore mid-raid at each level
  for (const lv of [1, 4, 5]) {
    const g = lateGame(), t = g.s.town; inTown(g); t.level = lv; g.sim.town.startRaid(); g.p.x = 250; g.p.z = 250; g.wait(40);
    const st0 = g.sim.town.status().line, bell0 = t.raid.bell, n0 = raiders(g).length;
    const save = clone(g.sim.snapshot()), a = createSim(7); const ok = a.restore(save);
    const st1 = a.town.status().line;
    check(`C level ${lv}: raid restored with same bell and count`, ok && a.state.town.raid?.bell === bell0 && a.state.enemies.filter(e => e.tag === 'raid').length === n0 && st0 === st1 && a.state.siege, `${st0} -> ${st1}`);
    // tampered bell
    const b = createSim(7); b.restore({ ...save, town: { ...save.town, raiding: { bell: 1e9, n: 999 } } });
    note(`C level ${lv} tampered bell: ${b.town.status().line}`);
    const c2 = createSim(7); c2.restore({ ...save, town: { ...save.town, level: 5.4, law: 'constructor', morale: NaN, treasury: 1e99, raiding: { bell: -5, n: 3 } } });
    note(`C level ${lv} tampered: ${JSON.stringify({ ...c2.state.town, raid: !!c2.state.town.raid })} siege ${c2.state.siege}`);
  }
  // law + levels survive
  const g = lateGame(), t = g.s.town; inTown(g); t.level = 5; g.cmd({ type: 'townLaw', tax: 'high' });
  const a = createSim(3); a.restore(clone(g.sim.snapshot()));
  check('C law/level survive', a.state.town.law === 'high' && a.state.town.level === 5 && a.economy.price(100) === g.sim.economy.price(100), `${a.state.town.law} ${a.state.town.level}`);
  for (const bad of ['constructor', '__proto__', 'toString', null, undefined, 5, {}, ['high']]) { g.cmd({ type: 'townLaw', tax: bad }); }
  check('C invalid law values ignored', t.law === 'high');
  // restoring into a sim with a raid going on
  const h = lateGame(); inTown(h); h.sim.town.startRaid(); h.step();
  const quiet = clone(lateGame().sim.snapshot()); h.sim.restore(quiet);
  check('C restore over a running raid clears it', !h.s.town.raid && !h.s.siege && h.s.enemies.filter(e => e.tag === 'raid' && !e.gone).length === 0, `raid ${!!h.s.town.raid} siege ${h.s.siege} raidTagged ${h.s.enemies.filter(e => e.tag === 'raid').length}`);
}

{ // D: blood moon
  const g = lateGame(); g.p.x = 250; g.p.z = -250;
  const nights = [];
  for (let d = 0; d < 16; d++) for (const ph of [0.1, 0.21, 0.23, 0.5, 0.79, 0.81, 0.95]) { toClock(g, d + ph); if (g.sim.bloodMoon()) nights.push((d + ph).toFixed(2)); }
  note(`D blood at: ${nights.join(' ')}`);
  toClock(g, 4.79); g.toasts.length = 0; let n = 0;
  for (let i = 0; i < DAY.length * 0.5 / STEP; i++) { g.step(); }
  n = g.toasts.filter(t => t.includes('blood moon')).length;
  check('D toast once across the whole night (crossing midnight)', n === 1, `toasts ${n}`);
  // save / load mid blood moon
  toClock(g, 9.9); g.step(); g.toasts.length = 0;
  const save = clone(g.sim.snapshot()); check('D state.bloodMoon true', g.s.bloodMoon === true);
  const a = createSim(5); a.restore(save); const ev = a.step(); const toasts = ev.filter(e => e.type === 'toast' && e.text.includes('blood')).length;
  note(`D load mid blood-moon into a fresh game: state.bloodMoon ${a.state.bloodMoon}, toast again: ${toasts}`);
  // load a daytime save into a sim that is in a blood moon; kill before a step
  const day = lateGame(); const daySave = clone(day.sim.snapshot());
  g.sim.restore(daySave);
  note(`D after loading a daytime save over a blood-moon game: state.bloodMoon ${g.s.bloodMoon} (sim.bloodMoon() ${g.sim.bloodMoon()})`);
  // loot doubling
  const lootOf = (blood, bounty) => {
    const k = lateGame(11); toClock(k, blood ? 4.95 : 4.5); k.p.x = 250; k.p.z = -250; k.step();
    const e = k.s.enemies.find(x => x.kind === 'plate' && !x.dead); if (bounty) e.bounty = true;
    k.s.loot.length = 0; e.hp = 1; e.heldT = 0; k.sim.town; // kill through a tower-less path: use bullets
    // damageEnemy is not exported: shoot it
    e.x = k.p.x + 6; e.z = k.p.z; e.heldT = 9;
    for (let i = 0; i < 200 && !e.dead; i++) k.step({ fire: true, aim: k.aimAt(e) });
    return k.s.loot[0];
  };
  note(`D loot plate: day ${JSON.stringify(lootOf(false, false))} | blood ${JSON.stringify(lootOf(true, false))} | blood+bounty ${JSON.stringify(lootOf(true, true))}`);
}

{ // E: Roar on raiders
  const g = lateGame(), t = g.s.town, p = g.p; inTown(g); p.mounts[2] = true; p.string = [0, 2]; g.cmd({ type: 'mount', i: 2 }); t.level = 1;
  g.sim.town.startRaid(); g.wait(12);
  const rs = raiders(g); const near = rs.filter(e => Math.hypot(e.x - p.x, e.z - p.z) < 45).length;
  g.step({ actions: ['ability'] });
  note(`E roar with ${near}/${rs.length} raiders in reach: states ${rs.map(e => e.state).join(',')}`);
  g.wait(5.2);
  const r0 = rs.find(e => e.state === 'return' && !e.dead);
  if (r0) { r0.hp = 10; const hp = r0.hp; r0.x = p.x + 8; r0.z = p.z; for (let i = 0; i < 120; i++) g.step({ fire: true, aim: g.aimAt(r0) }); note(`E a roared raider is in state ${r0.state}, hp 10 -> ${r0.hp.toFixed(0)}/${r0.maxHp} after 2 s of shooting, dead ${r0.dead}`); }
  else note(`E states after roar: ${rs.map(e => e.state).join(',')}`);
}

{ // F: upgrade ladder, what each grants
  const g = lateGame(), t = g.s.town, p = g.p; inTown(g);
  for (let lv = 1; lv <= 5; lv++) {
    t.level = lv; t.morale = 50; t.law = 'fair'; t.supplies = 100; g.sim.economy.recalc(); const tr = t.treasury; g.s.clock += DAY.length; g.step();
    g.sim.town.startRaid(); const n = raiders(g).length, bell = t.raid.bell; for (const e of g.s.enemies) if (e.tag === 'raid') e.gone = true; g.step(); g.step();
    note(`F level ${lv}: tax ${t.treasury - tr - 0} (incl. +${R.win.treasury} raid win), price(100) ${g.sim.economy.price(100)}, raiders ${n}, bell ${bell}, bell lasts ${(bell / (n * R.bellHurt)).toFixed(0)} s with all inside`);
  }
  t.level = 5; t.treasury = 1e6; g.cmd({ type: 'townUpgrade' }); check('F no level 6', t.level === 5 && t.treasury === 1e6);
  // upgrade granted twice? price after save/load at level 2 with standing 80
  t.level = 2; g.sim.economy.recalc(); const a = createSim(1); a.restore(clone(g.sim.snapshot()));
  check('F shop discount same after load', a.economy.price(1000) === g.sim.economy.price(1000), `${g.sim.economy.price(1000)} vs ${a.economy.price(1000)}`);
}
