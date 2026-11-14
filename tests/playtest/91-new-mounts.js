// Playtest: Crestrunner, Hauler, Platewalker — wild behaviour, taming, abilities, Hauler bag, saves.
// Run: /opt/homebrew/bin/node tests/playtest/91-new-mounts.js
import { mk, check, note, sane, clone, failCount } from './50-lib.js';
import { KINDS, MOUNTS, WILD, STOMP, CALL, TAME } from '../../src/data/content.js';
import { MOUNT_PRICE, LOOT } from '../../src/data/items.js';

const ride = (g, i) => { g.p.mounts[i] = true; if (!g.p.string.includes(i)) g.p.string.push(i); g.p.mount = i; g.sim.economy.recalc(); };

// ---- 1. spawns ----
{
  const g = mk();
  for (const [kind, x, z, n, spread] of WILD) {
    const list = g.wild(kind);
    check(`spawn ${kind} x${n} within spread`, list.length === n && list.every(e => Math.hypot(e.x - x, e.z - z) <= spread + 6), list.map(e => Math.hypot(e.x - x, e.z - z).toFixed(0)).join(','));
  }
  check('MOUNT_PRICE length', MOUNT_PRICE.length === MOUNTS.length);
  for (const k in KINDS) check(`LOOT for ${k}`, !!LOOT[k]);
  for (const k of ['mounts', 'mountLv', 'mountXp', 'journal']) check(`player.${k} length 8`, g.p[k].length === 8);
}

// ---- 2. peaceful until hurt; gunshot nearby ----
for (const kind of ['crest', 'hauler', 'plate']) {
  const g = mk(), { p, s } = g, e = g.wild(kind)[0];
  // stand 25 m from it, natural home, wait
  g.open(e.x + 25, e.z); g.wait(5);
  check(`${kind} ignores a rider at 25 m`, e.state === 'wander', e.state);
  g.open(e.x + 6, e.z); g.wait(3);
  check(`${kind} ignores a rider at 6 m`, e.state === 'wander' && p.hp === p.maxHp, e.state);
  // shoot it with the revolver from 20 m: every shot should hurt
  g.open(e.x + 20, e.z); g.wait(0.2);
  const hp0 = e.hp; let shots = 0, thuds = 0;
  for (let i = 0; i < 240; i++) {
    const ev = g.step({ fire: true, aim: g.aimAt(e) });
    shots += ev.filter(v => v.type === 'shot').length; thuds += ev.filter(v => v.type === 'thud').length;
  }
  check(`${kind} revolver shots from 20 m all hurt (natural home)`, hp0 - e.hp > 0 && thuds === 0, `shots ${shots} thuds ${thuds} dmg ${(hp0 - e.hp).toFixed(0)} state ${e.state} homeDist ${Math.hypot(e.x - e.home.x, e.z - e.home.z).toFixed(1)}`);
}

// ---- 2b. gunshot at something else near a peaceful herd ----
{
  const g = mk(), { p } = g, hs = g.wild('hauler');
  g.open(hs[0].x + 30, hs[0].z); g.wait(1);
  const st0 = hs.map(e => e.state).join(',');
  g.step({ fire: true, aim: { ox: p.x, oy: 50, oz: p.z, dx: 1, dy: 0, dz: 0, yaw: Math.PI / 2 } });
  g.step();
  note('haulers after a gunshot into the air 30 m away:', st0, '->', hs.map(e => e.state).join(','));
  check('a gunshot does not put peaceful haulers into the bullet-proof return state', hs.every(e => e.state !== 'return'), hs.map(e => e.state).join(','));
}

// ---- 3. tame → right index ----
for (const [kind, idx] of [['crest', 6], ['hauler', 7], ['plate', 5]]) {
  const g = mk(), { p } = g, e = g.wild(kind)[0];
  g.open(e.x + 7, e.z);
  e.hp = e.maxHp * 0.25; e.heldT = 4;
  g.act('tame'); g.wait(TAME.time + 0.3);
  check(`tame ${kind} gives mount ${idx}`, p.mounts[idx] && p.string.includes(idx) && p.journal[idx] === 2, `${p.mounts} ${p.string} ${g.lastToast()}`);
  check(`sane after taming ${kind}`, sane(g.sim).length === 0, sane(g.sim).join(';'));
}

// ---- 4. Hauler bag ----
{
  const g = mk(), { p, sim } = g;
  check('bag 20 on Strider', sim.st.bag === 20);
  ride(g, 7);
  check('bag 60 on Hauler', sim.st.bag === 60, sim.st.bag);
  p.res.hide = 50;
  g.open(0, -120);
  // dismount
  g.act('dismount'); g.wait(0.5);
  note('on foot beside Hauler, no command yet: bag', sim.st.bag);
  const bagFoot = sim.st.bag;
  g.cmd({ type: 'quick', id: 'tonic', slot: 'z' });   // any menu action recalcs
  note('on foot after an unrelated menu action: bag', sim.st.bag);
  check('bag on foot does not depend on an unrelated menu action', bagFoot === sim.st.bag, `${bagFoot} -> ${sim.st.bag}`);
  g.act('dismount'); g.wait(0.5);
  check('remounted Hauler has its 60 bag', !p.onFoot && sim.st.bag === 60, `onFoot ${p.onFoot} bag ${sim.st.bag}`);
  check('remounted Hauler can pick up loot (50/60)', sim.economy.addRes('meat', 5) === 5, `fit ${p.res.meat}`);
}
{
  // swap away from a Hauler with 50 items
  const g = mk(), { p, sim } = g;
  ride(g, 7); p.res.hide = 50; g.open(0, -120);
  g.act('swap'); g.wait(0.2);
  note(`swapped Hauler -> ${MOUNTS[p.mount].name}: bag ${sim.economy.bagUsed()}/${sim.st.bag}`);
  check('swap off Hauler keeps items', p.res.hide === 50);
  const snap = clone(sim.snapshot());
  const g2 = mk(); check('restore ok', g2.sim.restore(snap));
  check('save/load on Strider after swapping off the Hauler keeps the 50 hides', g2.p.res.hide === 50, `hide ${g2.p.res.hide}`);
}
{
  // save while on foot beside the Hauler after a menu action
  const g = mk(), { p, sim } = g;
  ride(g, 7); p.res.hide = 50; g.open(0, -120);
  const snap = clone(sim.snapshot());
  const g2 = mk(); g2.sim.restore(snap);
  check('save/load riding Hauler keeps 50 hides and 60 bag', g2.p.res.hide === 50 && g2.sim.st.bag === 60, `${g2.p.res.hide} ${g2.sim.st.bag}`);
  // die on Hauler
  p.hp = 1; const e = g.wild('raptor')[0]; g.bring(e, 0, 2); e.state = 'chase'; e.cd = 0;
  for (let i = 0; i < 600 && !p.dead; i++) g.step();
  g.wait(4);
  check('death on Hauler keeps bag and items', !p.dead && p.res.hide === 50 && sim.st.bag === 60, `dead ${p.dead} hide ${p.res.hide} bag ${sim.st.bag}`);
  // die on foot after menu
  g.open(0, -120); g.act('dismount'); g.cmd({ type: 'quick', id: 'tonic', slot: 'z' });
  p.hp = 1; g.bring(e, 0, 2); e.dead = false; e.hp = e.maxHp; e.state = 'chase'; e.cd = 0;
  for (let i = 0; i < 900 && !p.dead; i++) g.step();
  g.wait(4);
  check('respawn after dying on foot: mounted on Hauler with 60 bag', !p.dead && !p.onFoot && sim.st.bag === 60, `dead ${p.dead} onFoot ${p.onFoot} bag ${sim.st.bag}`);
}
{
  // sell in town with overfull, pack saddle
  const g = mk(), { p, sim } = g;
  ride(g, 7); p.res.hide = 30; p.res.meat = 30; p.money = 1000;
  g.cmd({ type: 'buy', kind: 'gear', id: 'pack' });
  check('pack saddle on Hauler = 80', sim.st.bag === 80, sim.st.bag);
  p.res.claws = 20;
  g.cmd({ type: 'equip', id: 'pack' });
  check('cannot take off pack saddle when 80 full', p.equipped.saddle === 'pack');
  g.cmd({ type: 'mount', i: 0 });
  note(`stables: Hauler -> Strider with 80 items: ${sim.economy.bagUsed()}/${sim.st.bag}`);
  g.cmd({ type: 'sell', id: 'hide' });
  check('sell works overfull', p.res.hide === 0 && sim.economy.bagUsed() === 50);
  check('sane', sane(sim).length === 0, sane(sim).join(';'));
}

// ---- 5. Stomp ----
{
  const g = mk(), { p, sim } = g; ride(g, 7); g.open(0, -120);
  const r = g.wild('raptor'), a = g.bring(r[0], 0, STOMP.radius + KINDS.raptor.radius - 0.3), b = g.bring(r[1], 0, -(STOMP.radius + KINDS.raptor.radius + 0.5));
  const ev = g.act('ability');
  check('Stomp hits inside radius, not outside', a.hp < a.maxHp && b.hp === b.maxHp, `${a.hp} ${b.hp}`);
  check('Stomp holds', Math.abs(a.heldT - STOMP.hold) < 0.1, a.heldT);
  check('Stomp cd 11', Math.abs(p.abilityCd - 11) < 0.1, p.abilityCd);
  note('Stomp on raptor (storm beats swamp → 0.8, Young 0.85):', (a.maxHp - a.hp).toFixed(1), 'expected', 60 * 0.85 * 0.8);
}
{
  // Rex, in a fresh game so the raptors above do not interfere
  const g = mk(); ride(g, 7); g.open(0, -120);
  const rex = g.s.rex; g.bring(rex, 0, 8); g.act('ability');
  check('Stomp hurts Rex without holding it', rex.hp < rex.maxHp && rex.heldT === 0, `${rex.hp} ${rex.heldT}`);
  note('Stomp on Rex (swamp beats ember):', (rex.maxHp - rex.hp).toFixed(1));
}
{
  const g = mk(), { p } = g; ride(g, 7);
  p.x = 0; p.z = -10; g.act('ability');
  check('Stomp refused in town', g.lastToast() === 'No shooting in town' && p.abilityCd === 0, g.lastToast());
}

// ---- 6. Call ----
{
  const g = mk(), { p, s } = g; ride(g, 6); g.open(0, -120);
  g.act('ability');
  check('Call with no longhorns: refused, no cooldown', g.lastToast() === 'No longhorns close enough to call' && p.abilityCd === 0, `${g.lastToast()} ${p.abilityCd}`);
  const a = s.animals.find(x => !x.dead && !x.penned);
  g.open(a.x + CALL.radius - 3, a.z); g.act('ability');
  check('Call reaches 52 m', a.followT > 0 && Math.abs(p.abilityCd - 12) < 0.1, `${a.followT} ${p.abilityCd}`);
  g.act('dismount'); g.wait(13); g.act('ability');
  check('Call refused on foot', g.lastToast() === 'Mount up first');
}

// ---- 7. all 8: save/load riding each, ability on foot, stats ----
for (let i = 0; i < 8; i++) {
  const g = mk(), { p, sim } = g; ride(g, i); g.open(0, -120); p.mountLv[i] = 12; p.mountXp[i] = 33;
  const snap = clone(sim.snapshot()), g2 = mk();
  check(`save/load riding ${MOUNTS[i].name}`, g2.sim.restore(snap) && g2.p.mount === i && g2.p.string.includes(i) && g2.p.mountLv[i] === 12 && g2.p.mountXp[i] === 33 && sane(g2.sim).length === 0, sane(g2.sim).join(';'));
  check(`melee dmg finite ${MOUNTS[i].name}`, Number.isFinite(sim.meleeDamage(i)) && Number.isFinite(sim.mountXpNeeded(i)));
  g.act('dismount'); g.act('ability');
  check(`${MOUNTS[i].ability.name} refused on foot`, g.lastToast() === 'Mount up first' && p.abilityCd === 0);
}
// old save with 6-long arrays
{
  const g = mk(), snap = clone(g.sim.snapshot());
  for (const k of ['mounts', 'mountLv', 'mountXp', 'journal']) snap.player[k] = snap.player[k].slice(0, 6);
  const g2 = mk();
  check('old 6-mount save loads with 8-long arrays', g2.sim.restore(snap) && ['mounts', 'mountLv', 'mountXp', 'journal'].every(k => g2.p[k].length === 8 && g2.p[k].every(v => v !== undefined && v === v)) && sane(g2.sim).length === 0);
}
// natures
{
  const g = mk(), n = g.sim.natureMul;
  check('thorn>stone, ember>thorn, swamp>ember, storm>swamp', n('thorn', 'stone') === 1.25 && n('thorn', 'ember') === 0.8 && n('swamp', 'ember') === 1.25 && n('swamp', 'storm') === 0.8);
}
// growth
{
  const g = mk(), { p, sim } = g; ride(g, 7); g.open(0, -120);
  for (let k = 0; k < 400; k++) { const e = g.wild('raptor')[0]; if (!e) break; g.bring(e, 0, 4); e.hp = 1; g.face(e); g.act('melee'); g.wait(1.2); e.dead = false; e.hp = e.maxHp; }
  note('Hauler level after 400 raptor kills', p.mountLv[7], sim.stageOf(7).name);
  check('Hauler grows', p.mountLv[7] >= 10 && sane(sim).length === 0, sane(sim).join(';'));
}
console.log(failCount() ? `\n${failCount()} FAILED` : '\nall passed');
