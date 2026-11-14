// Why does a town-level-2 raid take a perfect shot 48 s? Trace the raiders the defender cannot hit; then handicapped-aim runs.
import { lateGame, note, STEP, heightAt } from './50-lib.js';
import { defender } from './59-raid-balance.js';
const seed = +process.argv[2] || 1;
{
  const g = lateGame(seed, { level: 10, mates: [] }), { s, p, sim } = g; s.town.level = 2; p.x = 0; p.z = -10; g.wait(1); sim.town.startRaid();
  const act = defender(g, 'raid'); let t = 0, hurtBy = 0, last = p.hp;
  while (s.town.raid && t < 300) {
    const inp = act(); g.step(inp); t += STEP;
    if (Math.round(t * 60) % 300 === 0) console.log(`t=${t.toFixed(0)} rider ${p.x.toFixed(0)},${p.z.toFixed(0)} hp ${p.hp.toFixed(0)} firing ${!!inp.fire} bell ${s.town.raid?.bell.toFixed(0)} raiders ${s.enemies.filter(e => e.tag === 'raid' && !e.dead && !e.gone).map(e => `${e.kind}:${e.state}:${Math.hypot(e.x - p.x, e.z - p.z).toFixed(0)}m@${e.x.toFixed(0)},${e.z.toFixed(0)}:hp${e.hp.toFixed(0)}:town${Math.hypot(e.x, e.z + 10) < 36}`).join(' ')}`);
  }
  console.log('ended', t.toFixed(0), 'won', s.town.raidsWon);
}
// A raider at the store corner (seed 4): he shoots the rider, can the rider's real bullets reach him?
{
  const g = lateGame(4, { level: 10, mates: [] }), { s, p, sim } = g; s.town.level = 2; sim.town.startRaid();
  const rs = s.enemies.filter(e => e.tag === 'raid'); rs.slice(1).forEach(e => { e.gone = true; });
  const e = rs[0]; e.kind === 'rustler' || console.log('not a rustler'); e.x = 20; e.z = -11; p.x = 7; p.z = -1; e.heldT = 0; e.cd = 0; e.hp = 90; s.town.raid.left = 1e6; s.town.raid.bell = 1e6;
  let shots = 0, hits = 0, thuds = 0, hurt = 0, moved = 0;
  for (let i = 0; i < 20 * 60; i++) {
    const ex = e.x, ez = e.z; e.hp = 90; p.x = 7; p.z = -1; const hp = p.hp;
    const dx = e.x - p.x, dz = e.z - p.z, oy = heightAt(p.x, p.z) + 4, dy = heightAt(e.x, e.z) + 1.6 - oy, len = Math.hypot(dx, dy, dz);
    for (const ev of g.step({ fire: true, aim: { ox: p.x, oy, oz: p.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: Math.atan2(dx, dz) } })) { if (ev.type === 'shot') shots++; if (ev.type === 'hit') hits++; if (ev.type === 'thud') thuds++; if (ev.type === 'hurt') hurt++; }
    p.hp = p.maxHp; moved = Math.max(moved, Math.hypot(e.x - 20, e.z + 11));
  }
  note(`rider at 7,-1 and a raid rustler beside the store corner (started at 20,-11, drifted up to ${moved.toFixed(1)} m, now ${e.x.toFixed(1)},${e.z.toFixed(1)}): rider fired ${shots}, hit ${hits}, stopped by the wall ${thuds}; the rustler hit the rider ${hurt} times in 20 s`);
}
