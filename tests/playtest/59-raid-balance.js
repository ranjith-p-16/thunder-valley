// Raid and stand-in-the-square lethality with a competent bot, with and without the posse; stuck raiders.
import { lateGame, note, check, STEP, createSim, QUESTS, heightAt, sane } from './50-lib.js';
import { bot } from './54-act2.js';

// A competent defender: shoots the nearest raider it has a clear shot at, drinks a tonic when low, steps aside when nothing is in view.
export function defender(g, tag, { strafe = false } = {}) {
  const { sim, s, p } = g;
  const clear = (e) => {
    const m = sim.muzzle(), ty = heightAt(e.x, e.z) + 1.6, d = Math.hypot(e.x - m.x, e.z - m.z), n = Math.ceil(d / 0.5);
    for (let k = 1; k < n; k++) { const f = k / n, x = m.x + (e.x - m.x) * f, z = m.z + (e.z - m.z) * f, y = m.y + (ty - m.y) * f; if (y < heightAt(x, z) || s.obstacles.blocksShot(x, y, z)) return false; }
    return true;
  };
  const aimAt = (t) => { const oy = heightAt(p.x, p.z) + 4, dx = t.x - p.x, dy = heightAt(t.x, t.z) + 1.6 - oy, dz = t.z - p.z, len = Math.hypot(dx, dy, dz); return { ox: p.x, oy, oz: p.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: Math.atan2(dx, dz) }; };
  let ang = 0;
  return () => {
    if (p.dead) return {};
    const live = s.enemies.filter(e => e.tag.startsWith(tag) && !e.dead && !e.gone).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const actions = [];
    if (p.hp < p.maxHp * 0.4 && p.tonics.tonic > 0) actions.push('quickZ');
    const t = live.find(e => Math.hypot(e.x - p.x, e.z - p.z) < 60 && e.state !== 'return' && clear(e));
    const home = Math.hypot(p.x, p.z + 10);
    let mx = 0, mz = 0;
    if (strafe) { ang += STEP * 0.8; mx = Math.cos(ang) * 10 - p.x; mz = -10 + Math.sin(ang) * 10 - p.z; }
    else if (home > 12) { mx = -p.x; mz = -10 - p.z; }                        // come back to the middle of the square after a fall
    else if (!t && live[0]) { mx = -(live[0].z - p.z); mz = live[0].x - p.x; }   // nothing in view: step sideways
    return t ? { fire: true, aim: aimAt(t), mx, mz, actions } : { mx, mz, actions };
  };
}

if (process.argv[1].endsWith('59-raid-balance.js')) {
const row = (label, runs) => {
  const won = runs.filter(r => r.won).length, d = runs.reduce((a, r) => a + r.deaths, 0), t = runs.reduce((a, r) => a + r.t, 0) / runs.length, hp = runs.reduce((a, r) => a + r.minHp, 0) / runs.length;
  note(`${label}: won ${won}/${runs.length}, thrown ${d}x in all, mean ${t.toFixed(0)} s, mean lowest health ${(hp * 100).toFixed(0)}%, mate shots ${runs.reduce((a, r) => a + r.mateShots, 0)}, stuck-outside raiders at the end ${runs.reduce((a, r) => a + r.outside, 0)}`);
};

function raid(seed, { level, mates, townLevel = 1, strafe = false, gear = false }) {
  const g = lateGame(seed, { level, mates }), { s, p, sim } = g; s.town.level = townLevel; p.x = 0; p.z = -10; p.tonics.tonic = 2; p.money = 1000;
  if (gear) { p.skills.gunslinger = 5; p.skills.marshal = 4; sim.economy.recalc(); p.hp = p.maxHp; }
  for (const m of s.mates) { m.x = 3; m.z = -14; }
  g.wait(1); sim.town.startRaid();
  const act = defender(g, 'raid', { strafe }); let t = 0, deaths = 0, was = false, minHp = 1, mateShots = 0, outside = 0;
  while (s.town.raid && t < 300) {
    for (const e of g.step(act())) if (e.type === 'mateShot') mateShots++;
    t += STEP; if (p.dead && !was) deaths++; was = p.dead; minHp = Math.min(minHp, p.hp / p.maxHp);
    if (s.town.raid && s.town.raid.left < 1) outside = s.enemies.filter(e => e.tag === 'raid' && !e.dead && !e.gone && Math.hypot(e.x, e.z + 10) > 36).length;
  }
  return { won: s.town.raidsWon === 1, deaths, t, minHp, mateShots: townLevel >= 3 ? 0 : mateShots, outside, bad: sane(sim) };
}

const seeds = [1, 2, 3, 4, 5, 6];
note('--- raids: level-10 rider, common revolver, 2 tonics, town level 1 (5 raiders) ---');
row('alone, standing in the square', seeds.map(sd => raid(sd, { level: 10, mates: [] })));
row('with Mara, Tobe and June', seeds.map(sd => raid(sd, { level: 10, mates: ['mara', 'tobe', 'june'] })));
row('alone, circling in the square (harder to hit)', seeds.map(sd => raid(sd, { level: 10, mates: [], strafe: true })));
row('alone, with 9 skill points spent (gunslinger 5, marshal 4)', seeds.map(sd => raid(sd, { level: 10, mates: [], gear: true })));
note('--- town level 2 (7 raiders) and 3 (9 raiders + towers) ---');
row('level 10 alone, town level 2', seeds.map(sd => raid(sd, { level: 10, mates: [], townLevel: 2 })));
row('level 10 with posse, town level 2', seeds.map(sd => raid(sd, { level: 10, mates: ['mara', 'tobe', 'june'], townLevel: 2 })));
row('level 10 alone, town level 3 (towers)', seeds.map(sd => raid(sd, { level: 10, mates: [], townLevel: 3 })));
row('level 14 alone, town level 3 (towers)', seeds.map(sd => raid(sd, { level: 14, mates: [], townLevel: 3 })));
row('level 6 alone, town level 1', seeds.map(sd => raid(sd, { level: 6, mates: [] })));
row('level 8 alone, town level 1', seeds.map(sd => raid(sd, { level: 8, mates: [] })));

// the stand in the square (q12)
function stand(seed, { level, mates, strafe = false }) {
  const sim = createSim(seed), s = sim.state; s.story.quest = 11; s.story.step = 2; s.story.standing = 80;
  for (const id of mates) sim.posse.join(id, true); sim.story.enter();
  const b = bot(sim, {}, { level: 0 }); b.p.level = level; sim.economy.recalc(); b.p.hp = b.p.maxHp; b.p.x = 0; b.p.z = -10; b.p.tonics.tonic = 2;
  const g = { sim, s, p: b.p }; const act = defender(g, 'hold', { strafe }); let t = 0, deaths = 0, was = false, minHp = 1, mateShots = 0;
  while (b.stepOf() === 'q12/2' && t < 1200) { for (const e of b.step(act())) if (e.type === 'mateShot') mateShots++; t += STEP; if (b.p.dead && !was) deaths++; was = b.p.dead; minHp = Math.min(minHp, b.p.hp / b.p.maxHp); }
  return { won: b.stepOf() !== 'q12/2', deaths, t, minHp, mateShots, outside: 0 };
}
note('--- the stand in the square (180 s, 3 rustlers every 40 s) ---');
for (const level of [6, 8, 10, 12]) row(`level ${level} alone`, seeds.map(sd => stand(sd, { level, mates: [] })));
row('level 8 with posse', seeds.map(sd => stand(sd, { level: 8, mates: ['mara', 'tobe', 'june'] })));
row('level 8 alone, circling', seeds.map(sd => stand(sd, { level: 8, mates: [], strafe: true })));

// raiders stuck outside, or a raid nobody can end: track every raider over 40 raids with a passive rider in the square
{
  let never = 0, total = 0, far = 0, longest = 0;
  for (let sd = 1; sd <= 40; sd++) {
    const g = lateGame(sd, { level: 60, mates: [] }), { s, p, sim } = g; p.x = 0; p.z = -10; s.town.level = 3; sim.town.startRaid();
    const rs = s.enemies.filter(e => e.tag === 'raid'); const reached = new Set(); let t = 0;
    while (s.town.raid && t < 260) { g.step(); t += STEP; p.hp = p.maxHp; for (const e of rs) if (Math.hypot(e.x - p.x, e.z - p.z) <= e.def.range + 1) reached.add(e); }
    total += rs.length; never += rs.filter(e => !reached.has(e) && !e.dead).length; longest = Math.max(longest, t);
    far += rs.filter(e => !e.dead && Math.hypot(e.x, e.z + 10) > 70).length;
  }
  check('over 40 raids every raider gets within its own range of a rider waiting in the square', never === 0, `${never} of ${total} never did; ${far} ended more than 70 m out; longest raid ${longest.toFixed(0)} s`);
}
// 4 h idle: which raids are "won" with nobody there?
{
  const g = lateGame(3, { mates: [] }), t = g.s.town; g.p.x = 250; g.p.z = -250; let was = false, n = 0, log = [];
  for (let i = 0; i < 4 * 3600 * 60; i++) {
    g.step();
    if (was && !t.raid) { n++; }
    if (t.raid && t.raid.left < 0.05) log.push(`raid ${n + 1} timed out with bell ${t.raid.bell.toFixed(0)}: raiders ${g.s.enemies.filter(e => e.tag === 'raid' && !e.dead && !e.gone).map(e => `${e.kind}:${e.state}@${e.x.toFixed(0)},${e.z.toFixed(0)}`).join(' ')}`);
    was = !!t.raid;
  }
  note(`4 h with the rider parked 350 m away: raids won ${t.raidsWon}, lost ${t.raidsLost}. ${log.join(' | ')}`);
}
process.exit(0);
}
