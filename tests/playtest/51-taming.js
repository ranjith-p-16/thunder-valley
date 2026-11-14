// Taming rules: what can be tamed, when, and what interrupts it.
import { mk, check, note, clone, createSim, STEP } from './50-lib.js';
import { MOUNTS, TAME, KINDS } from '../../src/data/content.js';

const SPOT = [0, -120];
function setup(kind, opts = {}) {
  const g = mk(99, opts), { s, p } = g;
  g.open(...SPOT);
  for (const e of s.enemies) if (Math.hypot(e.x - p.x, e.z - p.z) < 80) { e.x += 150; e.home = { x: e.x, z: e.z }; }
  const e = kind ? g.wild(kind)[0] : null;
  if (e) g.bring(e, 0, 6, { hpFrac: 0.25, held: 30 });
  return { ...g, e };
}

// 1. every tameable kind
for (const [kind, name] of [['raptor', 'Strider'], ['dilo', 'Spitter'], ['cinder', 'Cinderjaw'], ['plate', 'Platewalker']]) {
  const g = setup(kind), { p, e, sim } = g, i = MOUNTS.findIndex(m => m.wild === kind);
  const lv0 = p.mountLv[i], xp0 = p.mountXp[i], rxp = p.xp, loot0 = g.s.loot.length;
  g.act('tame');
  check(`${kind}: tame starts`, !!p.tame, g.lastToast());
  g.wait(5.9); const before = !!p.tame && !e.dead;
  g.wait(0.3);
  check(`${kind} -> ${name} after 6 s`, before && e.dead && e.tamed && p.mounts[i] && MOUNTS[i].name === name && !p.tame, `${g.lastToast()}`);
  if (kind === 'raptor') check('raptor (already owned) gives the Strider experience', p.mountXp[0] + (p.mountLv[0] - 1) * 1e6 > xp0 + (lv0 - 1) * 1e6, `lv ${p.mountLv[0]} xp ${p.mountXp[0]}`);
  else check(`${kind}: joins string`, p.string.includes(i) && p.journal[i] === 2, JSON.stringify(p.string));
  check(`${kind}: no loot dropped by a tamed animal, rider xp +40`, g.s.loot.length === loot0 && p.xp + (p.level - 1) * 100 >= rxp + 40, `xp ${rxp}->${p.xp} lvl ${p.level}`);
  // respawn
  g.wait(41);
  note(`${kind}: 41 s later dead=${e.dead} tamed=${e.tamed} hp=${e.hp} at home ${Math.hypot(e.x - e.home.x, e.z - e.home.z).toFixed(1)} m (home is ${Math.hypot(e.home.x - p.x, e.home.z - p.z).toFixed(0)} m from rider)`);
  // tame a second one of the same kind: repeat xp
  const e2 = g.wild(kind).find(k => k !== e);
  if (e2) {
    e.x = 250; e.z = 250; e.home = { x: 250, z: 250 };
    g.bring(e2, 0, 6, { hpFrac: 0.25, held: 30 });
    const tot = () => { let t = p.mountXp[i]; for (let l = 1; l < p.mountLv[i]; l++) t += Math.round(60 * Math.pow(l, 1.4)); return t; };
    const b = tot(); const ridden = p.mount;
    g.act('tame'); g.wait(6.2);
    check(`${kind}: second tame gives that mount ${TAME.repeatXp} xp (+40 if ridden)`, tot() - b === TAME.repeatXp + (ridden === i ? 40 : 0), `gain ${tot() - b}`);
  }
}

// 2. what must not be tameable
{
  const g = setup(null), { s, p, sim } = g;
  const tryTame = (e, label) => {
    const keep = { x: e.x, z: e.z, hp: e.hp, heldT: e.heldT };
    e.x = p.x; e.z = p.z + 5; e.hp = e.maxHp * 0.1; e.heldT = 20;
    g.act('tame');
    const ok = !p.tame; p.tame = null;
    check(`not tameable: ${label}`, ok && !sim.tameable(e), g.lastToast());
    Object.assign(e, keep, { hp: e.maxHp }); e.x = keep.x; e.z = keep.z;
  };
  tryTame(s.rex, 'Alpha Rex');
  tryTame(s.enemies.find(e => e.outpost), 'camp guard');
  // bounty
  const bounty = sim.spawnEnemy ? null : null;
  s.board[0] = { type: 'bounty', title: 'Bounty', pay: 100, xp: 120, left: 0, done: 0, name: 'X', x: 100, z: -200, text: '' };
  p.x = 0; p.z = -10; g.cmd({ type: 'takeJob', i: 0 }); g.open(...SPOT);
  const b = s.enemies.find(e => e.bounty);
  check('a bounty target exists', !!b); if (b) tryTame(b, 'bounty target');
  // quest-tagged
  for (const [q, st, kind] of [[0, 1, 'compy'], [3, 2, 'raptor'], [4, 1, 'dilo'], [5, 1, 'rustler'], [8, 2, 'pell'], [10, 1, 'hester']]) {
    const h = setup(null); h.s.story.quest = q; h.s.story.step = st; if (q === 3) h.s.story.flags.den = 'destroyed'; if (q === 8) h.s.story.flags.pell = 'fought';
    h.sim.story.enter();
    const e = h.s.enemies.find(k => k.tag && k.kind === kind);
    if (!e) { check(`quest ${kind} spawned`, false); continue; }
    e.x = h.p.x; e.z = h.p.z + 5; e.hp = e.maxHp * 0.1; e.heldT = 20;
    h.act('tame');
    check(`not tameable: quest ${kind} (tag ${e.tag})`, !h.p.tame && !h.sim.tameable(e), h.lastToast());
  }
  // hold and raid enemies
  const h = setup(null); h.s.story.quest = 11; h.s.story.step = 2; h.sim.story.enter(); h.p.x = 0; h.p.z = -10; h.wait(0.2);
  const he = h.s.enemies.find(k => k.tag === 'hold'); check('hold wave spawned', !!he);
  if (he) { he.x = 0; he.z = -5; he.hp = 5; he.heldT = 20; h.act('tame'); check('not tameable: hold enemy', !h.p.tame, h.lastToast()); }
  const r = setup(null); r.sim.town.claim(); r.sim.town.startRaid();
  for (const kind of ['rustler', 'raptor']) {
    const re = r.s.enemies.find(k => k.tag === 'raid' && k.kind === kind);
    re.x = r.p.x; re.z = r.p.z + 5; re.hp = 5; re.heldT = 20; r.act('tame');
    check(`not tameable: raid ${kind}`, !r.p.tame, r.lastToast()); re.x = 200;
  }
  // den raptors driven to the mesa lose their tag: are they tameable afterwards?
  const d = setup(null); d.s.story.flags.den = 'driven'; d.s.story.quest = 3; d.s.story.step = 3; d.sim.story.enter();
  d.p.x = 100; d.p.z = 120; d.wait(0.1); d.act('holler'); d.wait(0.1);
  const dr = d.s.enemies.filter(e => e.id && !e.outpost && e.kind === 'raptor' && d.s.enemies.indexOf(e) >= 40);
  note(`driven den raptors: ${dr.length}, tameable ${dr.filter(e => d.sim.tameable(e)).length} (untagged after relocation: expected tameable)`);
}

// 3. rider states
{
  let g = setup('raptor'); g.act('dismount'); g.act('tame');
  check('taming on foot is possible (no rule against it)', !!g.p.tame); g.wait(6.2);
  note(`on foot: tamed=${g.e.tamed}; Strider xp ${g.p.mountXp[0]} lv ${g.p.mountLv[0]} (repeat xp goes to mount even on foot; the +40 rider xp does not reach the mount)`);

  g = setup('raptor'); g.p.dead = true; g.p.hp = 0; g.act('tame');
  check('a dead rider cannot start a tame', !g.p.tame);

  g = setup('raptor'); g.act('ability'); g.act('tame');
  check('taming can start mid-dash', !!g.p.tame && g.p.dashT > 0);
  g.wait(1.5); check('dashing away (>12 m) breaks it off', !g.p.tame, g.lastToast());

  // death during a tame
  g = setup('raptor'); g.act('tame'); g.wait(1); g.p.hp = 1;
  const k = g.wild('raptor').find(x => x !== g.e); g.bring(k, 2, 0); k.state = 'chase'; k.cd = 0;
  g.wait(0.5);
  check('rider killed mid-tame', g.p.dead);
  note(`while dead: player.tame=${JSON.stringify(g.p.tame)} hint="${g.s.hint}"`);
  g.wait(4);
  check('tame is cleared after respawn', !g.p.tame, JSON.stringify(g.p.tame));

  // in town: tame from inside the town's peace
  g = setup('raptor'); g.p.x = 0; g.p.z = -10 - 34; g.e.x = 0; g.e.z = -10 - 41; g.e.home = { x: 0, z: -70 };
  const others = g.wild('raptor').filter(x => x !== g.e).slice(0, 3);
  others.forEach((o, i) => { o.x = -6 + i * 6; o.z = -62; o.home = { x: o.x, z: o.z }; });
  g.wait(0.05);
  g.act('tame'); const started = !!g.p.tame; const hp0 = g.p.hp; g.wait(6.3);
  check('EXPLOIT? taming from inside the town works while a pack stands 20 m off', started && g.e.tamed && g.p.hp === hp0, `started ${started} tamed ${g.e.tamed} hp ${hp0}->${g.p.hp} inTown ${g.sim.inTown()}`);
}

// 4. things that happen to the animal mid-tame
{
  let g = setup('raptor'); g.act('tame'); g.wait(2); g.e.hp = 0; g.e.dead = true; g.wait(0.1);
  check('animal dying breaks the tame', !g.p.tame && g.lastToast().includes('broken'));

  g = setup('raptor'); g.e.heldT = 1; g.act('tame'); g.wait(3);
  check('the animal stays held after its bolas would have run out', g.e.heldT > 0 && !!g.p.tame, `heldT ${g.e.heldT.toFixed(2)}`);
  g.e.hp = g.e.maxHp; g.wait(3.2);
  note(`healing to full mid-tame: tamed=${g.e.tamed} (no re-check of the 30% rule once started)`);

  g = setup('raptor'); g.e.heldT = 0.3; g.wait(0.5); g.act('tame');
  check('held timer run out -> cannot start', !g.p.tame && /Hold it/.test(g.lastToast()), g.lastToast());

  g = setup('raptor'); g.e.hp = g.e.maxHp * 0.31; g.act('tame');
  check('31% health -> refused', !g.p.tame && /Wear it down/.test(g.lastToast()), g.lastToast());
  g.e.hp = g.e.maxHp * 0.30; g.act('tame'); check('exactly 30% -> allowed', !!g.p.tame);

  // a hit restarts the bar
  g = setup('raptor'); g.act('tame'); g.wait(4);
  const k = g.wild('raptor').find(x => x !== g.e); g.bring(k, 2, 0); k.state = 'chase'; k.cd = 0; g.wait(0.1); k.x = 250; k.z = 250; k.state = 'wander';
  check('a hit restarts the bar', g.p.tame && g.p.tame.t < 0.2, JSON.stringify(g.p.tame));
  // dodge frames
  g = setup('raptor'); g.act('tame'); g.wait(4); g.step({ actions: ['dodge'], mx: 1, mz: 0 });
  const k2 = g.wild('raptor').find(x => x !== g.e); g.bring(k2, 2, 0); k2.state = 'chase'; k2.cd = 0; g.wait(0.1); k2.x = 250; k2.state = 'wander';
  note(`dodging through a bite keeps the bar: t=${g.p.tame?.t.toFixed(2)}`);

  // killed by a posse mate mid-tame
  g = setup('cinder'); g.sim.posse.join('mara', true); g.e.state = 'chase'; g.e.hp = g.e.maxHp * 0.29; g.act('tame'); g.wait(6.2);
  check('WRONG? Mara does not kill the animal being tamed', g.e.tamed, `tamed ${g.e.tamed} dead ${g.e.dead} toast "${g.lastToast()}"`);
  for (const order of ['hold', 'attack']) {
    g = setup('cinder'); g.sim.posse.join('mara', true); g.cmd({ type: 'order', id: order }); g.e.state = 'chase'; g.e.hp = g.e.maxHp * 0.29; g.act('tame'); g.wait(6.2);
    check(`WRONG? Mara on "${order}" does not kill the animal being tamed`, g.e.tamed, `tamed ${g.e.tamed} dead ${g.e.dead}`);
  }

  // two tames at once
  g = setup('raptor'); const b = g.wild('raptor').find(x => x !== g.e); g.bring(b, 3, 6, { hpFrac: 0.2, held: 30 });
  g.act('tame'); const id = g.p.tame.id; g.act('tame');
  check('a second T while taming changes nothing', g.p.tame.id === id);

  // nearest animal is not the ready one
  g = setup('raptor'); const c = g.wild('raptor').find(x => x !== g.e); g.bring(c, 0, 4, { hpFrac: 1, held: 0 }); c.cd = 99;
  g.step(); const hint = g.s.hint; g.act('tame');
  check('WRONG? T tames the ready animal when a healthy one is nearer', !!g.p.tame, `hint "${hint}" but toast "${g.lastToast()}"`);

  // leash-return mid tame
  g = setup('raptor'); g.e.state = 'return'; g.e.home = { x: g.e.x + 60, z: g.e.z }; g.act('tame'); g.wait(6.2);
  note(`animal in 'return' state: tamed=${g.e.tamed} (held, so it never walks off)`);
}

// 5. save/restore mid-tame and after
{
  const g = setup('dilo'); g.act('tame'); g.wait(3);
  const save = clone(g.sim.snapshot()), again = createSim();
  check('restore mid-tame works; tame is dropped', again.restore(save) && !again.state.player.tame);
  g.wait(3.2);
  const save2 = clone(g.sim.snapshot()), a2 = createSim(); a2.restore(save2);
  const idx = g.s.enemies.indexOf(g.e), e2 = a2.state.enemies[idx];
  check('tamed mount and string survive a save', a2.state.player.mounts[3] && a2.state.player.string.includes(3));
  note(`tamed animal after reload: dead=${e2.dead} tamed=${e2.tamed} (the 'tamed' mark is not saved: a reload shows it as a carcass until it respawns)`);
}

// 6. farming: experience per minute by re-taming raptors vs killing them (bolas cost $25)
{
  const g = setup('raptor', { level: 3 }), { p } = g;
  const tot = (i) => { let t = p.mountXp[i]; for (let l = 1; l < p.mountLv[i]; l++) t += Math.round(60 * Math.pow(l, 1.4)); return t; };
  const m0 = tot(0), money0 = p.money; let n = 0;
  for (let t = 0; t < 600; ) {
    const e = g.wild('raptor')[0]; if (!e) { g.wait(1); t += 1; continue; }
    g.bring(e, 0, 6, { hpFrac: 0.25, held: 3 }); g.act('tame'); g.wait(6.1); t += 6.1 + 8; n++;   // +8 s allowed for wearing it down
  }
  note(`re-taming raptors for 10 min (14 s each): ${n} tames, Strider total xp +${tot(0) - m0} -> level ${p.mountLv[0]}, rider level ${p.level}, money change ${p.money - money0} (plus $25 a bolas = -$${n * 25})`);
  note(`killing ${n} raptors instead would give ${n * KINDS.raptor.xp} mount xp`);
}
process.exit(0);
