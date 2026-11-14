// Balance tables computed from the data, using the sim's own stat helpers.   /opt/homebrew/bin/node tests/playtest/100-balance-tables.js
import { createSim } from '../../src/sim/sim.js';
import { KINDS, MOUNTS, STAGES, MELEE, SPIT, CHARGE, SWEEP, STOMP, RIDER, TOWN_LEVELS, TAX_LAWS, TOWN_RULE, DAY, NATURE, BEATS } from '../../src/data/content.js';
import { WEAPONS, GRADE_POWER, UPGRADE, GEAR, SKILLS, LOOT, RESOURCES, JOBS, MOUNT_PRICE, PEN_PAY, THROWN } from '../../src/data/items.js';
import { MOVES, HATCH, TRADER, GIANT, FAVOURS } from '../../src/data/frontier.js';

if (process.env.PROPOSED) (await import('./105-proposed.js')).apply();   // PROPOSED=1: the same tables with the proposed numbers
const f = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');
const pad = (s, n) => String(s).padEnd(n);
const section = (t) => console.log(`\n==== ${t} ====`);

// sustained gun dps from the sim's own numbers: one magazine then a reload
function gun(id, { level = 1, grade = 0, gs = 0 } = {}) {
  const sim = createSim(), p = sim.state.player;
  p.level = level; p.skills.gunslinger = gs; p.weapons[id] = grade; p.weapon = id; sim.economy.recalc();
  const w = WEAPONS[id], st = sim.st, mag = sim.magazine(id), fire = w.fireCd * st.fireCd, rel = w.reload * st.reload;
  const perShot = sim.damage(id) * w.pellets * (1 + st.crit), cycle = (mag - 1) * fire + Math.max(rel, fire);
  return { dps: perShot * mag / cycle, perShot, cycle, mag, burst: perShot * mag, burstT: (mag - 1) * fire };
}
const ttk = (hp, g) => { // time to deal hp, counting the reload gaps
  const full = Math.floor(hp / g.burst), rest = hp - full * g.burst;
  if (rest <= 1e-9) return full * g.cycle - (g.cycle - g.burstT);
  const shots = Math.ceil(rest / g.perShot);
  return full * g.cycle + (shots - 1) * (g.burstT / Math.max(1, g.mag - 1) || 0);
};

section('1a. Gun sustained DPS (level 1) by grade, without / with full gunslinger');
for (const id in WEAPONS) {
  const row = [0, 1, 2].map(gr => `${f(gun(id, { grade: gr }).dps)} / ${f(gun(id, { grade: gr, gs: 10 }).dps)}`);
  console.log(pad(id, 9), row.map(r => pad(r, 16)).join(''), ` per-shot ${f(gun(id).perShot)}  cycle ${f(gun(id).cycle, 2)}s`);
}
console.log('level multiplier 1.06^(L-1):', [1, 5, 8, 10, 12, 15, 20, 25, 31].map(l => `L${l} x${f(Math.pow(RIDER.dmgPerLevel, l - 1), 2)}`).join('  '));

const TARGETS = { raptor: 60, crest: 110, cinder: 140, dilo: 150, plate: 260, hauler: 520, rustler: 90, 'bounty raptor': 180,
  'giant raptor': 300, 'giant cinder': 700, 'giant dilo': 750, kettle: 420, pell: 500, hester: 700, rex: 900, blackthorn: 1300 };
const BOSS = ['giant raptor', 'giant cinder', 'giant dilo', 'kettle', 'pell', 'hester', 'rex', 'blackthorn'];
const SETUPS = [
  ['L1 Common', { level: 1, grade: 0 }], ['L6 Common', { level: 6, grade: 0 }], ['L10 Sturdy', { level: 10, grade: 1 }],
  ['L14 Fine', { level: 14, grade: 2 }], ['L14 Fine+GS10', { level: 14, grade: 2, gs: 10 }], ['L20 Fine+GS10', { level: 20, grade: 2, gs: 10 }],
];
for (const [label, o] of SETUPS) {
  section(`1b. TTK seconds, ${label} (solo, every shot lands)`);
  console.log(pad('', 15) + Object.keys(WEAPONS).map(w => pad(w, 10)).join(''));
  for (const t in TARGETS) {
    const cells = Object.keys(WEAPONS).map(w => { const v = ttk(TARGETS[t], gun(w, o)); return pad(f(v) + (BOSS.includes(t) ? (v < 3 ? ' !FAST' : v > 90 ? ' !SLOW' : '') : ''), 10); });
    console.log(pad(t, 15) + cells.join(''));
  }
}

section('1c. Seconds for each attacker to kill a rider (120 hp level 1; 210 hp level 10), by mount and stage. Gunners at 80% hit (standing still)');
const natureMul = (a, d) => (!a || !d ? 1 : BEATS[a] === d ? NATURE.strong : BEATS[d] === a ? NATURE.weak : 1);
const ATT = { raptor: [KINDS.raptor, 1], cinder: [KINDS.cinder, 1], 'giant cinder': [KINDS.cinder, GIANT.dmg], 'giant dilo': [KINDS.dilo, GIANT.dmg], 'giant raptor': [KINDS.raptor, GIANT.dmg],
  pell: [KINDS.pell, 1], hester: [KINDS.hester, 1], kettle: [KINDS.kettle, 1], 'kettle x2': [KINDS.kettle, 2], rex: [KINDS.rex, 1], blackthorn: [KINDS.blackthorn, 1] };
for (const [hpLabel, hp] of [['120hp (L1)', 120], ['210hp (L10)', 210], ['300hp (L10 + Fine duster + Tough..Iron)', 210 + 45 + 60]]) {
  console.log(`-- rider ${hpLabel}`);
  console.log(pad('', 14) + MOUNTS.map(m => pad(m.name.slice(0, 9), 16)).join(''));
  for (const a in ATT) {
    const [k, mul] = ATT[a], hit = k.ai ? 0.8 : 1;
    const cells = MOUNTS.map(m => STAGES.map(s => f(hp / (k.dmg * mul * hit / k.bite * m.armor * s.hurt * natureMul(k.nature, m.nature)), 0)).join('/'));
    console.log(pad(a, 14) + cells.map(c => pad(c, 16)).join(''));
  }
}

section('2. Mount strikes, abilities and second moves: damage per second of cooldown (Grown, level 10; Elder level 20)');
const stageK = (lv) => (lv >= 20 ? 1.15 : lv >= 10 ? 1 : 0.85);
const AB = { Spit: SPIT.dmg, Charge: CHARGE.dmg, Sweep: SWEEP.dmg, Stomp: STOMP.dmg };
console.log(pad('mount', 13) + pad('V dps L1/L10/L20', 22) + pad('ability dmg/cd=dps', 24) + pad('move dmg/cd=dps', 22) + 'total melee dps L10 | L20   (revolver L10 Sturdy = ' + f(gun('revolver', { level: 10, grade: 1 }).dps) + ', L20 Fine GS10 = ' + f(gun('revolver', { level: 20, grade: 2, gs: 10 }).dps) + ')');
MOUNTS.forEach((m, i) => {
  const v = (lv) => m.melee * stageK(lv) * (1 + 0.04 * (lv - 1)) / MELEE.cd;
  const ab = AB[m.ability.name] || 0, mv = MOVES[i].dmg || 0;
  const tot = (lv) => v(lv) + stageK(lv) * (ab / m.ability.cd + mv / MOVES[i].cd);
  console.log(pad(m.name, 13) + pad(`${f(v(1))}/${f(v(10))}/${f(v(20))}`, 22) + pad(ab ? `${m.ability.name} ${ab}/${m.ability.cd}=${f(ab / m.ability.cd)}` : `${m.ability.name} (utility)`, 24)
    + pad(mv ? `${MOVES[i].name} ${mv}/${MOVES[i].cd}=${f(mv / MOVES[i].cd)}` : `${MOVES[i].name} (utility)`, 22) + `${f(tot(10))} | ${f(tot(20))}`);
});
console.log(`V strike stamina: ${MELEE.stamina} per ${MELEE.cd}s = ${f(MELEE.stamina / MELEE.cd)}/s against regen ${RIDER.staminaRegen}/s -> sustainable forever when not sprinting`);
console.log(`Brace: ${MOVES[5].time}s of x${MOVES[5].hurt} per ${MOVES[5].cd}s = ${f(100 * (1 - (1 - MOVES[5].time / MOVES[5].cd * (1 - MOVES[5].hurt))), 0)}% average reduction. Soothe: ${MOVES[6].heal} hp / ${MOVES[6].cd}s = ${f(MOVES[6].heal / MOVES[6].cd)} hp/s (rider regen ${RIDER.regen}/s after ${RIDER.regenDelay}s unhurt)`);
console.log(`Dynamite: ${THROWN.dynamite.dmg} for $${THROWN.dynamite.price} (5 carried = ${5 * THROWN.dynamite.dmg} burst, x1.3 with Powder monkey = ${5 * 150 * 1.3})`);

section('3a. Loot value per kill at store prices (expected), and per 100 hp');
for (const k in LOOT) {
  const t = LOOT[k], v = t.hide * 15 + t.meat * 6 + t.claws * 20 + (t.money[0] + t.money[1]) / 2, items = t.hide + t.meat + t.claws;
  console.log(pad(k, 11), `$${pad(f(v), 7)} xp ${pad(KINDS[k].xp, 5)} hp ${pad(KINDS[k].hp, 5)} $/100hp ${pad(f(v / KINDS[k].hp * 100), 6)} xp/100hp ${pad(f(KINDS[k].xp / KINDS[k].hp * 100), 6)} bag slots ${f(items)}  (claws at Silas: +$${f(t.claws * 20)})`);
}
section('3b. Price list');
const sum = (a) => a.reduce((x, y) => x + y, 0);
const weapons = sum(Object.values(WEAPONS).map(w => w.price)), wUp = 4 * (UPGRADE[0].money + UPGRADE[1].money);
const gear = sum(Object.values(GEAR).map(g => g.price)), gUp = 9 * (UPGRADE[0].money + UPGRADE[1].money);
const bestGear = 300 + 350 + 400 + 3 * 800;
console.log(`weapons $${weapons}; all weapon upgrades $${wUp} + ${4 * 17} claws; all 9 gear $${gear}; all gear upgrades $${gUp} (+${3 * 17} claws, ${6 * 17} hide)`);
console.log(`one item per slot bought and brought to Fine: $${bestGear}; Bulwark $${MOUNT_PRICE[1]}; Silas egg $${TRADER.egg} + hatch $${HATCH.price}; breed $${HATCH.breedPrice}+hatch = $${HATCH.breedPrice + HATCH.price} per bloodline step; feed $${TRADER.feed} for ${TRADER.feedXp} mount xp`);
console.log(`"sensible kit" (4 weapons Fine, 3 gear Fine) = $${weapons + wUp + bestGear}; "everything in the shops" (all gear Fine, Bulwark) = $${weapons + wUp + gear + gUp + MOUNT_PRICE[1]}`);
console.log(`town levels from treasury: ${TOWN_LEVELS.slice(1).map(l => '$' + l.cost).join(', ')} = $${sum(TOWN_LEVELS.slice(1).map(l => l.cost))} in all`);
section('3c. Town tax per in-game day (24 real minutes) and per real hour');
for (let lv = 1; lv <= 5; lv++) {
  const laws = lv >= 4 ? Object.keys(TAX_LAWS) : ['fair'];
  console.log(`level ${lv}: ` + laws.map(l => `${l} $${TOWN_RULE.tax * lv * TAX_LAWS[l].tax}/day ($${f(TOWN_RULE.tax * lv * TAX_LAWS[l].tax * 3600 / DAY.length, 0)}/h; x1.2 at morale 70+)`).join('   '));
}
const raidEvery = (TOWN_RULE.raidEvery[0] + TOWN_RULE.raidEvery[1]) / 2;
console.log(`raid win: $${TOWN_RULE.win.treasury} to treasury every ~${raidEvery}s = $${f(TOWN_RULE.win.treasury * 3600 / raidEvery, 0)}/h, ${TOWN_RULE.win.xp} xp each = ${f(TOWN_RULE.win.xp * 3600 / raidEvery, 0)} xp/h before kills`);
let days = 0; const path = [];
for (let lv = 1; lv <= 4; lv++) {
  const perDay = TOWN_RULE.tax * lv * (lv >= 4 ? 1.5 : 1) + TOWN_RULE.win.treasury * DAY.length / raidEvery, d = TOWN_LEVELS[lv].cost / perDay;
  days += d; path.push(`L${lv + 1}: ${f(d)} days (${f(d * 24 / 60)} h)`);
}
console.log(`treasury alone (tax + every raid won, high tax at L4, nothing paid in, start $200 ignored): ${path.join(', ')}; total ${f(days)} days = ${f(days * 24 / 60)} real hours`);
console.log(`favours: $${sum(FAVOURS.map(x => x.reward.money))} and ${sum(FAVOURS.map(x => x.reward.xp))} xp, once each. Job pay mean: ${Object.entries(JOBS).map(([k, j]) => `${k} $${(j.pay[0] + j.pay[1]) / 2}/${j.xp}xp`).join(', ')}. Pen pay $${PEN_PAY} (+10, +15 skills). Giant $${GIANT.money} every ${GIANT.every.join('-')} days.`);

section('4. XP curves');
const sim = createSim(), p = sim.state.player;
let cum = 0; const rl = {};
for (let l = 1; l <= 31; l++) { p.level = l; rl[l] = cum; cum += sim.xpNeeded(); }
console.log('rider cumulative xp to reach level:', [5, 8, 10, 12, 15, 18, 20, 25, 31].map(l => `L${l} ${rl[l]}`).join('  '));
cum = 0; const ml = {};
for (let l = 1; l <= 30; l++) { p.mountLv[0] = l; ml[l] = cum; cum += sim.mountXpNeeded(0); }
console.log('mount cumulative xp to reach level:', [5, 10, 15, 20, 25, 30].map(l => `L${l} ${ml[l]}`).join('  '));
console.log(`growth feed: $${TRADER.feed} per ${TRADER.feedXp} xp, ${TRADER.feedStock} per visit every ${TRADER.every} days -> Grown from feed alone = ${Math.ceil(ml[10] / TRADER.feedXp)} bags ($${Math.ceil(ml[10] / TRADER.feedXp) * TRADER.feed}, ${Math.ceil(ml[10] / TRADER.feedXp / TRADER.feedStock) * TRADER.every} days)`);

section('5. Skills and gear: marginal effect');
const base = gun('revolver', { level: 10 }).dps;
for (let n = 1; n <= 10; n++) console.log(`gunslinger ${pad(n, 3)} ${pad(SKILLS.gunslinger.list[n - 1].name, 15)} revolver dps x${f(gun('revolver', { level: 10, gs: n }).dps / base, 3)}   rifle x${f(gun('rifle', { level: 10, gs: n }).dps / gun('rifle', { level: 10 }).dps, 3)}  shotgun x${f(gun('shotgun', { level: 10, gs: n }).dps / gun('shotgun', { level: 10 }).dps, 3)}  bow x${f(gun('bow', { level: 10, gs: n }).dps / gun('bow', { level: 10 }).dps, 3)}`);
console.log(`one rider level = x${RIDER.dmgPerLevel} gun damage and +${RIDER.hpPerLevel} hp, for free; Sharp eye = x1.08; a weapon grade = x1.25 for $200+5 claws, x1.2 more for $600+12 claws`);
console.log(`outfits at level 10 (210 hp) Common/Fine: duster +${f(30 / 210 * 100, 0)}%/+${f(45 / 210 * 100, 0)}% effective hp; vest +${f((1 / 0.9 - 1) * 100, 0)}%/+${f((1 / 0.85 - 1) * 100, 0)}%; saddle war +${f((1 / 0.88 - 1) * 100, 0)}%/+${f((1 / 0.82 - 1) * 100, 0)}%`);
console.log(`duster vs vest break-even rider hp: Common ${f(30 / (1 / 0.9 - 1), 0)}, Fine ${f(45 / (1 / 0.85 - 1), 0)} (vest better above that; level 1 rider has 120, +10 per level)`);
