// Balance sanity: income per simulated hour by activity, time to a rifle, time to level 5, lethality at level 1.
// usage: node 07-balance.js [income|lethal|all] [minutes=30]
import { createSim, STEP, inp, toward, dist, aimAt, run, note, steer, PEN, TOWN, HERD } from './lib.js';
import { HERD_SPOTS } from '../../src/data/content.js';
import { angleDiff } from '../../src/sim/terrain.js';

const which = process.argv[2] || 'all', MIN = +(process.argv[3] || 30);

// ---------- a per-step bot toolkit ----------
function makeBot(sim) {
  const s = sim.state, p = s.player; let lastD = Infinity, tick = 0, side = 1, sideT = 0, goalKey = '';
  const nav = (x, z, sprint = true) => {
    const S = steer(p, { x, z }), dx = S.x - p.x, dz = S.z - p.z, d = Math.hypot(dx, dz) || 1, key = `${Math.round(x)},${Math.round(z)}`;
    if (key !== goalKey) { goalKey = key; lastD = Infinity; sideT = 0; }
    if (++tick % 30 === 0) { const g = Math.hypot(x - p.x, z - p.z); if (lastD - g < 0.4 && sideT <= 0) { side = -side; sideT = 1; } lastD = g; }
    sideT -= STEP;
    return sideT > 0 ? { mx: -dz / d * side + dx / d * 0.3, mz: dx / d * side + dz / d * 0.3, sprint } : { mx: dx, mz: dz, sprint };
  };
  const threats = (r = 14) => s.enemies.filter(e => !e.dead && dist(e, p) < r + e.def.radius);
  // kite: keep `keep` away from everything that bites, shoot the closest thing (or the given target)
  const fight = (target, { keep = 11, kite = true } = {}) => {
    const th = threats(keep), near = th.sort((a, b) => dist(a, p) - dist(b, p))[0], aimT = near || target, o = { fire: !!aimT && dist(aimT, p) < 70, aim: aimT ? aimAt(p, aimT, aimT.def.radius) : null };
    if (kite && th.length) { let ax = 0, az = 0; for (const e of th) { const d = dist(e, p) || 1; ax += (p.x - e.x) / d; az += (p.z - e.z) / d; } Object.assign(o, { mx: ax, mz: az, sprint: dist(near, p) < near.def.range + 3 }); }
    else if (target && dist(target, p) > 22) Object.assign(o, nav(target.x, target.z, dist(target, p) > 40));
    if (p.hp < p.maxHp * 0.4 && p.tonics.tonic > 0) o.actions = ['quickZ'];
    return o;
  };
  return { nav, fight, threats };
}
function track(sim, minutes, stepFn) {
  const s = sim.state, p = s.player, t = { deaths: 0, kills: 0, penned: 0, jobs: 0, rifleAt: null, lvl5At: null, earned: 0 };
  let spent = 0, lastMoney = p.money;
  const n = Math.round(minutes * 60 / STEP);
  for (let i = 0; i < n; i++) {
    const ev = sim.step(inp(stepFn(i) || {}));
    for (const e of ev) { if (e.type === 'death') t.deaths++; if (e.type === 'kill') t.kills++; if (e.type === 'penned') t.penned++; if (e.type === 'jobdone') t.jobs++; }
    if (p.money > lastMoney) t.earned += p.money - lastMoney; lastMoney = p.money;
    if (t.rifleAt === null && t.earned + 50 >= 500) t.rifleAt = i * STEP;
    if (t.lvl5At === null && p.level >= 5) t.lvl5At = i * STEP;
  }
  t.perHour = Math.round(t.earned / minutes * 60);
  return t;
}
const fmt = (t) => `earned $${t.earned} => $${t.perHour}/sim-hour; $500 for a rifle after ${t.rifleAt === null ? 'never' : (t.rifleAt / 60).toFixed(1) + ' min'}; level 5 after ${t.lvl5At === null ? 'never' : (t.lvl5At / 60).toFixed(1) + ' min'}; deaths ${t.deaths}, kills ${t.kills}, penned ${t.penned}, jobs ${t.jobs}`;

// ---------- activity bots ----------
function ropeStep(sim, bot, st = null) {
  const s = sim.state, p = s.player;
  if (s.herd.roped) {
    // lead it to a point south of the gate first, wait for it to line up, then walk in (it cuts corners otherwise)
    const a = s.herd.roped, lined = Math.abs(a.x - PEN.x) < 9 && a.z < PEN.z - PEN.r + 1 && dist(a, p) < 14;
    if (st) st.lead = (st.lead && dist(a, PEN) > 4) ? st.lead : false;
    if (lined || dist(p, PEN) < PEN.r) return bot.nav(PEN.x, PEN.z + 6, false);
    const W = { x: PEN.x, z: PEN.z - PEN.r - 14 };
    return dist(p, W) < 1.5 ? {} : bot.nav(W.x, W.z, dist(p, W) > 25);
  }
  const a = s.animals.filter(a => !a.dead && !a.penned).sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (!a) return {};
  const o = bot.nav(a.x, a.z, true);
  if (dist(a, p) < 24) o.actions = ['lasso'];
  return o;
}
const APPROACH = { x: PEN.x, z: PEN.z - PEN.r - 12 }, INSIDE = { x: PEN.x, z: PEN.z + 2 };
function driveStep(sim, bot, herd) {
  const s = sim.state, p = s.player, free = s.animals.filter(a => a.herd === herd && !a.dead && !a.penned);
  if (!free.length) return null;
  const C = { x: free.reduce((t, a) => t + a.x, 0) / free.length, z: free.reduce((t, a) => t + a.z, 0) / free.length };
  const lined = (b) => Math.abs(b.x - PEN.x) < 6 && b.z > APPROACH.z - 4;
  const far = free.reduce((m, a) => (dist(a, C) > dist(m, C) ? a : m)), stray = dist(far, C) > 10, focus = stray ? far : C;
  const T = lined(focus) ? INSIDE : APPROACH, fd = dist(focus, T) || 1, off = stray ? 7 : 9;
  const P = { x: focus.x + (focus.x - T.x) / fd * off, z: focus.z + (focus.z - T.z) / fd * off };
  const ab = Math.atan2(p.z - C.z, p.x - C.x), ap = Math.atan2(P.z - C.z, P.x - C.x), diff = angleDiff(ab, ap), R = Math.max(18, dist(P, C));
  const W = Math.abs(diff) > 0.4 && dist(p, C) < 40 ? { x: C.x + Math.cos(ab + Math.sign(diff) * 0.5) * R, z: C.z + Math.sin(ab + Math.sign(diff) * 0.5) * R } : P;
  if (dist(p, W) < 0.5) return {};
  return bot.nav(W.x, W.z, dist(p, W) > 12);
}
function huntStep(sim, bot, st) {
  const s = sim.state, p = s.player;
  if (st.selling || sim.economy.bagUsed() >= Math.floor(sim.st.bag) || (p.hp < 40 && !bot.threats(30).length)) {
    st.selling = true;
    if (!sim.inTown()) return bot.nav(TOWN.x, TOWN.z + 10);
    for (const id of ['hide', 'meat', 'claws']) sim.command({ type: 'sell', id });
    if (p.hp >= p.maxHp - 1) st.selling = false;
    return {};
  }
  if (bot.threats(16).length) return bot.fight(bot.threats(16)[0]);
  const loot = s.loot.filter(l => dist(l, p) < 50).sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (loot) return bot.nav(loot.x, loot.z);
  const e = s.enemies.filter(e => !e.dead && !e.outpost && e !== s.rex).sort((a, b) => dist(a, p) - dist(b, p))[0];
  return e ? bot.fight(e) : {};
}
function jobStep(sim, bot, st, policy) {
  const s = sim.state, p = s.player, job = s.job;
  if (!job) {
    if (dist(p, TOWN) > 20) return bot.nav(TOWN.x, TOWN.z);
    for (const id of ['hide', 'meat', 'claws']) if (policy !== 'any' || id !== 'hide') sim.command({ type: 'sell', id });
    if (policy === 'supplyReroll') { let k = 0; while (!s.board.some(j => j.type === 'supply') && k++ < 200) { sim.command({ type: 'takeJob', i: 0 }); sim.command({ type: 'dropJob' }); } st.rerolls = (st.rerolls || 0) + k; sim.command({ type: 'takeJob', i: s.board.findIndex(j => j.type === 'supply') }); }
    else if (policy === 'best') sim.command({ type: 'takeJob', i: s.board.reduce((bi, j, k) => (j.pay > s.board[bi].pay ? k : bi), 0) });
    else sim.command({ type: 'takeJob', i: 0 });
    return {};
  }
  if (job.type === 'supply') return job.carrying ? bot.nav(TOWN.x, TOWN.z) : bot.nav(job.x, job.z);
  if (job.type === 'bounty') { const t = s.enemies.find(e => e.id === job.target); return t ? bot.fight(t) : {}; }
  if (job.type === 'hunt') {
    if (p.res.hide >= job.count) { if (!sim.inTown()) return bot.nav(TOWN.x, TOWN.z); sim.command({ type: 'turnIn' }); return {}; }
    if (bot.threats(16).length) return bot.fight(bot.threats(16)[0]);
    const loot = s.loot.filter(l => dist(l, p) < 50 && l.items.hide)[0];
    if (loot) return bot.nav(loot.x, loot.z);
    const e = s.enemies.filter(e => !e.dead && !e.outpost && e !== s.rex).sort((a, b) => dist(a, p) - dist(b, p))[0];
    return e ? bot.fight(e) : {};
  }
  return ropeStep(sim, bot);
}

if (which === 'all' || which === 'income') {
  for (const seed of [1, 2]) {
    let sim = createSim(seed), bot = makeBot(sim);
    note('BAL', `seed ${seed} herding, rope one at a time, ${MIN} min: ${fmt(track(sim, MIN, () => ropeStep(sim, bot)))}; lost longhorns ${sim.herding.counts().lost}`);
    sim = createSim(seed); bot = makeBot(sim); let herd = 0;
    note('BAL', `seed ${seed} herding, loose drive (no rope/holler/ability), ${MIN} min: ${fmt(track(sim, MIN, () => { for (let k = 0; k < 3; k++) { const o = driveStep(sim, bot, herd); if (o) return o; herd = (herd + 1) % 3; } return {}; }))}; lost longhorns ${sim.herding.counts().lost}`);
    sim = createSim(seed); bot = makeBot(sim); const hs = {};
    note('BAL', `seed ${seed} hunting roamers + selling loot, ${MIN} min: ${fmt(track(sim, MIN, () => huntStep(sim, bot, hs)))}`);
    for (const policy of ['any', 'best', 'supplyReroll']) {
      sim = createSim(seed); bot = makeBot(sim); const js = {};
      const t = track(sim, MIN, () => jobStep(sim, bot, js, policy));
      note('BAL', `seed ${seed} jobs (${policy === 'any' ? 'always the first offer' : policy === 'best' ? 'best-paying offer' : 'reroll board until a supply run'}), ${MIN} min: ${fmt(t)}${js.rerolls ? `, rerolls ${js.rerolls}` : ''}; level ${sim.state.player.level}`);
    }
  }
}

if (which === 'all' || which === 'lethal') {
  const fightAll = (label, setup, opts, limit = 180) => {
    const rows = [];
    for (const seed of [1, 2, 3]) {
      const sim = createSim(seed), s = sim.state, p = s.player, bot = makeBot(sim);
      const foes = setup(sim); let minHp = p.hp, died = false, t = 0;
      t = run(sim, limit, () => { const live = foes.filter(e => !e.dead).sort((a, b) => dist(a, p) - dist(b, p))[0]; return live ? bot.fight(live, opts) : {}; },
        (ev) => { minHp = Math.min(minHp, p.hp); for (const x of ev) if (x.type === 'death') died = true; return !died && foes.some(e => !e.dead); });
      rows.push(`${died ? 'DIED' : foes.every(e => e.dead) ? 'won' : 'timeout'} ${t.toFixed(0)}s minHp ${minHp.toFixed(0)}`);
    }
    note('BAL', `${label}: ${rows.join(' | ')}`);
  };
  const camp = (i) => (sim) => { const o = sim.state.outposts[i], p = sim.state.player; p.x = o.x; p.z = o.z - 45; return sim.state.enemies.filter(e => e.outpost === o); };
  const rexSetup = (d) => (sim) => { const r = sim.state.rex, p = sim.state.player; p.x = r.x; p.z = r.z + d; return [r]; };
  const pack = (n) => (sim) => { const s = sim.state, p = s.player, es = s.enemies.filter(e => !e.outpost && e !== s.rex).slice(0, n); p.x = 200; p.z = -40; es.forEach((e, i) => { e.x = 200 + (i - n / 2) * 4; e.z = -10; e.home = { x: e.x, z: e.z }; }); return es; };
  for (const [name, opts] of [['stand still and shoot', { kite: false }], ['kite (back away at walking pace while shooting)', { kite: true }]]) {
    fightAll(`level-1 rider, revolver, ${name} vs a pack of 3 raptors`, pack(3), opts);
    fightAll(`level-1 rider, revolver, ${name} vs a pack of 6 raptors`, pack(6), opts);
    fightAll(`level-1 rider, revolver, ${name} vs Red Mesa camp (4 guards)`, camp(0), opts);
    fightAll(`level-1 rider, revolver, ${name} vs Fernhollow camp (5 guards)`, camp(1), opts);
    fightAll(`level-1 rider, revolver, ${name} vs Highwatch camp (6 guards)`, camp(2), opts);
    fightAll(`level-1 rider, revolver, ${name} vs the Alpha Rex (start 40 away)`, rexSetup(40), opts, 240);
  }
  // sniping from beyond the give-up range (aggro x 2.2): the target flips chase -> return every step and never closes
  {
    const rows = [];
    for (const [label, weapon, d] of [['revolver from 125', 'revolver', 125], ['revolver from 160', 'revolver', 160], ['rifle from 125', 'rifle', 125]]) {
      const sim = createSim(1), s = sim.state, p = s.player, r = s.rex; p.x = r.x; p.z = r.z + d;
      if (weapon !== 'revolver') { p.weapons[weapon] = 0; p.ammo[weapon] = 5; p.weapon = weapon; }
      let hurt = 0, moved = 0; const x0 = r.x, z0 = r.z;
      const t = run(sim, 300, () => ({ fire: true, aim: aimAt(p, r, 4.6) }), (ev) => { for (const x of ev) if (x.type === 'hurt') hurt++; moved = Math.max(moved, Math.hypot(r.x - x0, r.z - z0)); return !r.dead; });
      rows.push(`${label}: Rex ${r.dead ? 'DEAD' : 'alive ' + r.hp.toFixed(0)} after ${t.toFixed(0)} s, rider hurt ${hurt} times, Rex never moved more than ${moved.toFixed(1)} from home, reward level ${p.level} + Tyrant ${p.mounts[2]}`);
    }
    note(rows.some(r => /DEAD.*hurt 0 times/.test(r)) ? 'BUG' : 'PASS', `leash sniping the Alpha Rex at level 1 – ${rows.join(' ; ')}`);
    const sim = createSim(1), s = sim.state, p = s.player, o = s.outposts[2], g = s.enemies.filter(e => e.outpost === o); p.x = o.x; p.z = o.z - 100;
    let hurt = 0; const t = run(sim, 600, () => { const e = g.filter(e => !e.dead).sort((a, b) => dist(a, p) - dist(b, p))[0]; if (!e) return {}; const d = dist(e, p); return { fire: true, aim: aimAt(p, e), ...(d < 88 ? { mx: p.x - e.x, mz: p.z - e.z } : d > 100 ? { mx: e.x - p.x, mz: e.z - p.z } : {}) }; }, (ev) => { for (const x of ev) if (x.type === 'hurt') hurt++; return g.some(e => !e.dead); });
    note(hurt === 0 && g.every(e => e.dead) ? 'BUG' : 'INFO', `leash sniping Highwatch camp (6 guards) with the revolver from 88–100 away (raptor give-up range 83.6): guards dead ${g.filter(e => e.dead).length}/6 in ${t.toFixed(0)} s, rider hurt ${hurt} times`);
  }
}
