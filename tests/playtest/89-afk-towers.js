// AFK raids (tester 89): with watchtowers (level 3+) a raid is won with the rider nowhere near; who gets what?
import { lateGame, note, STEP } from './50-lib.js';
for (const [lv, where, safety] of [[2, [250, 250], 50], [3, [250, 250], 50], [3, [250, 250], 30], [4, [250, 250], 50], [5, [250, 250], 50], [5, [250, 250], 30], [3, [0, -10], 50]]) {
  const g = lateGame(99, { mates: [], level: 1 }), { s, p } = g, t = s.town; t.level = lv; t.safety = safety; p.x = where[0]; p.z = where[1];
  const xp0 = p.xp, l0 = p.level, tr = t.treasury; g.sim.town.startRaid(); const n = s.enemies.filter(e => e.tag === 'raid').length;
  let i = 0; for (; i < 400 / STEP && t.raid; i++) g.step();
  note(`level ${lv} safety ${safety}, rider idle at ${where}: ${n} raiders, raid ${t.raidsWon ? 'WON' : t.raidsLost ? 'lost' : 'open'} in ${(i * STEP).toFixed(0)} s, treasury ${tr}->${t.treasury}, rider level ${l0}->${p.level} (xp ${xp0}->${p.xp}), loot piles ${s.loot.length}, rider hp ${p.hp.toFixed(0)}/${p.maxHp} dead ${p.dead}`);
}
