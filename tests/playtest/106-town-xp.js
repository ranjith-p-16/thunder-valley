// Tax laws over 30 days, with and without raids being won; experience needed for skill points.   /opt/homebrew/bin/node tests/playtest/106-town-xp.js
import { createSim } from '../../src/sim/sim.js';
import { DAY, TAX_LAWS, TOWN_RULE } from '../../src/data/content.js';
const raidsPerDay = DAY.length / ((TOWN_RULE.raidEvery[0] + TOWN_RULE.raidEvery[1]) / 2);
function days(law, raids, highMorale = TAX_LAWS.high.morale, winMorale = TOWN_RULE.win.morale) {
  const was = TAX_LAWS.high.morale; TAX_LAWS.high.morale = highMorale;
  const sim = createSim(), s = sim.state, t = s.town;
  sim.town.claim(); t.level = 4; t.law = law; t.raidIn = 1e9;
  let acc = 0; const start = t.treasury;
  for (let d = 0; d < 30; d++) {
    t.supplies = 100;
    acc += raids ? raidsPerDay : 0;
    while (acc >= 1) { acc--; t.morale = Math.min(100, t.morale + winMorale); }   // a raid beaten off
    s.clock += DAY.length; sim.step();
  }
  const tax = t.treasury - start; TAX_LAWS.high.morale = was;
  return `${law} $${String(tax).padEnd(6)} morale ends ${t.morale.toFixed(0).padEnd(4)}`;
}
console.log(`town level 4, 30 days of tax (raids won at ${raidsPerDay.toFixed(2)} a day give +${TOWN_RULE.win.morale} morale each)`);
for (const raids of [true, false]) console.log(`  raids ${raids ? 'won ' : 'none'}: ` + ['low', 'fair', 'high'].map(l => days(l, raids)).join('   '));
for (const m of [-8, -12]) {
  console.log(`  with TAX_LAWS.high.morale -4 -> ${m}:`);
  for (const raids of [true, false]) console.log(`  raids ${raids ? 'won ' : 'none'}: ` + ['low', 'fair', 'high'].map(l => days(l, raids, m)).join('   '));
}
const cum = (exp, to) => { let c = 0; for (let l = 1; l < to; l++) c += Math.round(100 * Math.pow(l, exp)); return c; };
console.log('rider xp to reach a level, by the exponent in xpNeeded (src/sim/sim.js: 100 * level^1.5):');
for (const e of [1.5, 1.3, 1.2, 1.1]) console.log(`  ^${e}: L11 (10 pts) ${cum(e, 11)}   L16 ${cum(e, 16)}   L21 (20 pts) ${cum(e, 21)}   L31 (30 pts) ${cum(e, 31)}`);
