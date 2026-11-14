// Roar during a raid (tester 88): raiders come back healed and cannot be hurt until they stand on the bell.
import { lateGame, note, STEP } from './50-lib.js';
import { TOWN } from '../../src/data/items.js';
const g = lateGame(99, { mates: [] }), t = g.s.town, p = g.p; p.x = 0; p.z = -10; p.mounts[2] = true; p.string = [0, 2]; g.cmd({ type: 'mount', i: 2 });
g.sim.town.startRaid();
const rs = g.s.enemies.filter(e => e.tag === 'raid');
for (let i = 0; i < 40 / STEP && rs.filter(e => g.dist(e) < 40).length < 5; i++) g.step();
for (const e of rs) e.hp = e.maxHp * 0.2;
p.abilityCd = 0; g.step({ actions: ['ability'] });
let immuneInTown = 0, shotsBlocked = 0, bell0 = t.raid.bell, hits = 0;
for (let i = 0; i < 40 / STEP && t.raid; i++) {
  const e = rs.filter(x => !x.dead).sort((a, b) => g.dist(a) - g.dist(b))[0]; if (!e) break;
  const ev = g.step({ fire: true, aim: g.aimAt(e) });
  if (rs.some(x => !x.dead && x.state === 'return' && Math.hypot(x.x - TOWN.x, x.z - TOWN.z) < TOWN.r)) immuneInTown++;
  shotsBlocked += ev.filter(x => x.type === 'thud').length; hits += ev.filter(x => x.type === 'hit').length;
  if (i % 300 === 0) console.log((i * STEP).toFixed(0) + 's', rs.map(x => x.dead ? 'dead' : `${x.state}:${(x.hp / x.maxHp * 100).toFixed(0)}%@${Math.hypot(x.x - TOWN.x, x.z - TOWN.z).toFixed(0)}`).join(' '), 'bell', t.raid?.bell.toFixed(1));
}
note(`after Roar: ${immuneInTown} steps (${(immuneInTown * STEP).toFixed(1)} s) with an unhittable raider inside town; ${shotsBlocked} shots bounced, ${hits} hit; bell ${bell0.toFixed(1)} -> ${t.raid ? t.raid.bell.toFixed(1) : 'raid over'}`);
