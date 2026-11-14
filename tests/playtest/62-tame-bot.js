// Can a competent rider actually tame each kind where it lives? Level 3 and 8, with and without Mara. Nothing is teleported
// except the rider's starting point 75 m from the animals. Also: the damage window for small animals at higher rider levels.
import { mk, note, check, STEP, heightAt } from './50-lib.js';
import { MOUNTS, KINDS, TAME } from '../../src/data/content.js';

const ZONES = { dilo: [-215, -70], cinder: [205, -35], plate: [185, 20] };

function attempt(kind, level, mara, seed, { limit = 240, order = null } = {}) {
  const g = mk(seed, { level }), { sim, s, p } = g;
  p.thrown.bolas = 5; p.thrown.trap = 3; p.tonics.tonic = 2;
  if (mara) { sim.posse.join('mara', true); if (order) sim.command({ type: 'order', id: order }); }
  const cand = () => s.enemies.filter(e => e.kind === kind && sim.tameable(e));
  let zone = ZONES[kind];
  if (!zone) { const r = cand().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0]; zone = [r.home.x, r.home.z]; }
  const d0 = Math.hypot(zone[0], zone[1]); p.x = zone[0] * (1 - 75 / d0); p.z = zone[1] * (1 - 75 / d0); s.obstacles.resolve(p, 1.2);
  for (const m of s.mates) { m.x = p.x - 3; m.z = p.z - 3; }
  const dist = (e) => Math.hypot(e.x - p.x, e.z - p.z);
  const aimAt = (t) => { const oy = heightAt(p.x, p.z) + 4, dx = t.x - p.x, dy = heightAt(t.x, t.z) + 1.6 - oy, dz = t.z - p.z, len = Math.hypot(dx, dy, dz); return { ox: p.x, oy, oz: p.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: Math.atan2(dx, dz) }; };
  let mateHits = 0, T = null, t = 0, deaths = 0, was = false, resets = 0, refused = 0, killedByMate = 0, overkill = 0, bolas0 = p.thrown.bolas, lastT = 0, why = 'time', phase = 'go';
  const shot = sim.damage(), mel = () => sim.meleeDamage() * sim.natureMul(MOUNTS[p.mount].nature, KINDS[kind].nature);
  const out = (ok) => ({ ok, t, deaths, resets, refused, mateHits, killedByMate, overkill, bolas: bolas0 - p.thrown.bolas, why: ok ? 'tamed' : why, hp: p.hp / p.maxHp });
  while (t < limit) {
    if (p.dead) { g.step(); t += STEP; if (!was) deaths++; was = true; T = null; continue; }
    if (was) { was = false; why = 'thrown'; return out(false); }   // one life per attempt
    if (!T || T.dead || !sim.tameable(T)) {
      if (T && T.dead && !T.tamed) { if (T._mate) killedByMate++; else overkill++; }
      T = cand().filter(e => !e.dead).sort((a, b) => dist(a) - dist(b))[0]; phase = 'go';
      if (!T) { g.step(); t += STEP; continue; }
    }
    const inp = { actions: [] };
    if (p.hp < p.maxHp * 0.35 && p.tonics.tonic) inp.actions.push('quickZ');
    const others = s.enemies.filter(e => e !== T && !e.dead && !e.gone && (e.state === 'chase') && dist(e) < 60).sort((a, b) => dist(a) - dist(b));
    const dT = dist(T), hpBefore = T.hp;
    if (p.tame) {                                            // taming: stand still, shoot anything else that comes
      if (p.tame.t < lastT - 0.5) resets++; lastT = p.tame.t;
      if (others[0]) Object.assign(inp, { fire: true, aim: aimAt(others[0]) });
    } else if (others[0]) {                                  // clear the rest of the pack first, backing off
      const o = others[0], d = dist(o);
      Object.assign(inp, { fire: true, aim: aimAt(o), mx: d < 9 ? p.x - o.x : 0, mz: d < 9 ? p.z - o.z : 0, sprint: d < 9 });
    } else if (dT > 28) Object.assign(inp, { mx: T.x - p.x, mz: T.z - p.z, sprint: true });
    else if (T.hp > T.maxHp * TAME.health) {                 // wear it down without killing it
      if (T.hp - shot > 0.5) { Object.assign(inp, { fire: p.fireCd <= 0 && !s.bullets.some(b => b.life > 0), aim: aimAt(T), mx: dT < 9 ? p.x - T.x : 0, mz: dT < 9 ? p.z - T.z : 0 }); T._mine = true; }
      else if (T.hp - mel() > 0.5) { if (dT > 4) Object.assign(inp, { mx: T.x - p.x, mz: T.z - p.z, sprint: true }); else { p.yaw = Math.atan2(T.x - p.x, T.z - p.z); inp.actions.push('melee'); T._mine = true; } }
      else { why = `no attack fits the window (hp ${T.hp.toFixed(0)}, shot ${shot.toFixed(0)}, melee ${mel().toFixed(0)})`; return out(false); }
    } else if (T.heldT <= 0.3) {                             // hold it
      if (!p.thrown.bolas) { why = 'out of bolas'; return out(false); }
      if (dT > 12) Object.assign(inp, { mx: T.x - p.x, mz: T.z - p.z, sprint: true });
      else { p.yaw = Math.atan2(T.x - p.x, T.z - p.z); inp.actions.push('throw:bolas'); }
    } else if (dT > 7) Object.assign(inp, { mx: T.x - p.x, mz: T.z - p.z, sprint: true });
    else { inp.actions.push('tame'); lastT = 0; }
    const tx = T.x, tz = T.z, hpT = T.hp; const ev = g.step(inp); t += STEP;
    if (ev.some(e => e.type === 'mateShot' && Math.hypot(e.x2 - tx, e.z2 - tz) < 0.5)) { mateHits++; if (T.dead) T._mate = true; }
    if (inp.actions.includes('tame') && !p.tame && ev.some(e => e.type === 'toast' && /Wear it down/.test(e.text))) refused++;
    if (ev.some(e => e.type === 'tamed')) return out(true);
  }
  return out(false);
}

const seeds = [1, 2, 3, 4, 5, 6];
for (const kind of ['raptor', 'dilo', 'cinder', 'plate']) for (const level of [3, 8]) for (const mara of [false, true]) {
  const rs = seeds.map(sd => attempt(kind, level, mara, sd));
  const ok = rs.filter(r => r.ok);
  const whys = {}; for (const r of rs) if (!r.ok) whys[r.why] = (whys[r.why] || 0) + 1;
  note(`${kind.padEnd(6)} level ${level} ${mara ? 'with Mara' : 'alone    '}: tamed ${ok.length}/${rs.length}` + (ok.length ? `, mean ${(ok.reduce((a, r) => a + r.t, 0) / ok.length).toFixed(0)} s, bolas ${(ok.reduce((a, r) => a + r.bolas, 0) / ok.length).toFixed(1)}, health left ${(100 * ok.reduce((a, r) => a + r.hp, 0) / ok.length).toFixed(0)}%` : '')
    + `; bar restarts ${rs.reduce((a, r) => a + r.resets, 0)}, "wear it down" refusals with a ready animal held ${rs.reduce((a, r) => a + r.refused, 0)}, Mara's shots at the target ${rs.reduce((a, r) => a + r.mateHits, 0)}, targets killed by Mara ${rs.reduce((a, r) => a + r.killedByMate, 0)}, by the rider ${rs.reduce((a, r) => a + r.overkill, 0)}` + (Object.keys(whys).length ? `; failures: ${JSON.stringify(whys)}` : ''));
}
// Mara told to hold or to help the herd: does that keep her from killing the target?
for (const order of ['hold', 'herd']) {
  const rs = seeds.map(sd => attempt('cinder', 8, true, sd, { order }));
  note(`cinder level 8 with Mara on "${order}": tamed ${rs.filter(r => r.ok).length}/${rs.length}, targets killed by Mara ${rs.reduce((a, r) => a + r.killedByMate, 0)}`);
}

// the damage window: which weapons can bring each kind to 30% or less without killing it, by rider level
{
  const g = mk(); const { sim, p } = g; const rows = [];
  for (const kind of ['raptor', 'dilo', 'cinder', 'plate']) {
    const hp = KINDS[kind].hp, win = hp * TAME.health; const bad = { revolver: [], rifle: [], bow: [], shotgun: [] };
    for (let lv = 1; lv <= 25; lv++) {
      p.level = lv;
      for (const w of ['revolver', 'rifle', 'bow']) { p.weapons[w] = 0; p.weapon = w; const d = sim.damage(w); let h = hp; while (h > win) h -= d; if (h <= 0) bad[w].push(lv); }
    }
    const span = (a) => (a.length ? `${a[0]}-${a[a.length - 1]}${a.length !== a[a.length - 1] - a[0] + 1 ? ' (with gaps)' : ''}` : 'never');
    rows.push(`${kind} (${hp} hp, window ${win.toFixed(0)}): revolver alone overkills at rider levels ${span(bad.revolver)}, rifle ${span(bad.rifle)}, bow ${span(bad.bow)}`);
  }
  for (const r of rows) note(r);
}
process.exit(0);
