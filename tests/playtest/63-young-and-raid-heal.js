// (a) Does the Young stage make the first fights harder than before? Level-1 rider with human-like aim v a pack and a camp.
// (b) What a fall during a raid does to the raiders.
import { mk, lateGame, note, STEP } from './50-lib.js';

function fight(seed, lv, what, duty) {
  const g = mk(seed), { s, p } = g; p.mountLv[0] = lv;
  let foes;
  if (what === 'camp') { const o = s.outposts[0]; p.x = o.x - 45; p.z = o.z; foes = s.enemies.filter(e => e.outpost === o); }
  else { g.open(0, -120); for (const e of s.enemies) if (Math.hypot(e.x - p.x, e.z - p.z) < 80) { e.x += 150; e.home = { x: e.x, z: e.z }; }
    foes = g.wild('raptor').slice(0, what); foes.forEach((e, i) => { g.bring(e, Math.cos(i * 2) * 32, Math.sin(i * 2) * 32); e.state = 'chase'; e.cd = 0; e.provokedT = 60; }); }
  let t = 0, k = 0, minHp = 1;
  while (!p.dead && foes.some(e => !e.dead) && t < 180) {
    const tg = foes.filter(e => !e.dead).sort((x, y) => g.dist(x) - g.dist(y))[0], d = g.dist(tg);
    k++; const fire = (k % 30) < 30 * duty;   // holds the trigger only part of the time: stands in for missed shots
    g.step({ fire, aim: g.aimAt(tg), mx: d < 14 ? p.x - tg.x : d > 30 ? tg.x - p.x : 0, mz: d < 14 ? p.z - tg.z : d > 30 ? tg.z - p.z : 0, sprint: d < 10, actions: d < 5 ? ['melee'] : [] }); t += STEP; minHp = Math.min(minHp, p.hp / p.maxHp);
  }
  return { won: !p.dead, hp: minHp, t };
}
for (const [what, duty] of [[3, 0.2], [4, 0.2], [4, 0.3], [6, 0.3], [6, 0.4], [6, 0.5], ['camp', 0.2], ['camp', 0.3]]) {
  const res = {};
  for (const [name, lv] of [['Young', 1], ['Grown', 10]]) {
    const rs = [1].map(sd => fight(sd, lv, what, duty));
    res[name] = `${name} (${lv === 1 ? 'now' : 'as before'}): won ${rs.filter(r => r.won).length}/1, lowest health in the fight ${(100 * rs.reduce((a, r) => a + r.hp, 0) / rs.length).toFixed(0)}%`;
  }
  note(`level-1 rider, revolver + melee, trigger held ${duty * 100}% of the time, v ${what === 'camp' ? 'Red Mesa camp (4 guards)' : `${what} raptors`}: ${res.Young} | ${res.Grown}`);
}
{
  const g = lateGame(2, { level: 10, mates: [] }), { s, p, sim } = g; s.town.level = 3; p.x = 0; p.z = -10; sim.town.startRaid(); g.wait(8);
  const rs = s.enemies.filter(e => e.tag === 'raid'); for (const e of rs) e.hp = 10;
  p.hp = 0.1; let t = 0; while (!p.dead && t < 30) { g.step(); t += STEP; }
  let towerHits = 0, thuds = 0; for (let i = 0; i < 180; i++) for (const ev of g.step()) { if (ev.type === 'hit') towerHits++; if (ev.type === 'thud') thuds++; }
  note(`raid, 9 raiders worn to 10 hp, rider thrown: 3 s later the raiders have ${rs.filter(e => !e.dead).map(e => Math.round(e.hp)).join('/')} hp, states ${[...new Set(rs.filter(e => !e.dead).map(e => e.state))].join()}; tower shots that hurt ${towerHits}, that bounced off ${thuds}`);
}
process.exit(0);
