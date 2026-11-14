// Income and experience per hour from the repeatable sources, with a plain bot on a new game (level 1, Common revolver, Young Strider).
//   /opt/homebrew/bin/node tests/playtest/103-income.js [jobs|haulers|plates|raptors|rest|pen]
import { wrap, createSim, STEP } from './80-lib.js';
import { PLACES } from '../../src/data/items.js';
import { WILD, DAY } from '../../src/data/content.js';

const which = process.argv[2] || 'all', HOUR = 3600;
const door = (id) => PLACES.find(p => p.id === id).door;
const fresh = (seed = 99) => { const sim = createSim(seed), g = wrap(sim, {}); return g; };
const spend = (g) => { const { p, sim } = g; while (p.skillPoints > 0) sim.command({ type: 'skill', tree: p.skills.gunslinger < 10 ? 'gunslinger' : p.skills.marshal < 10 ? 'marshal' : 'wrangler' }); };
const report = (label, g, t0, extra = '') => {
  const { s, p } = g, h = (s.clock - t0) / HOUR, worth = p.money + p.res.hide * 15 + p.res.meat * 6 + p.res.claws * 20;
  console.log(`${label.padEnd(58)} ${h.toFixed(2)} h played: $${worth} (${Math.round((worth - 50) / h)}/h)  rider L${p.level}  mount L${p.mountLv[p.mount]}  ${extra}`);
};
// shoot one animal from range while backing off from it; picks nothing up
function hunt(g, e, max = 60) {
  const { s, p } = g;
  for (let i = 0; i < max / STEP && !e.dead && !p.dead; i++) {
    const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz), k = d < 24 ? -1 : d > 34 ? 1 : 0;
    g.step({ mx: dx / d * k - dz / d * 0.5, mz: dz / d * k + dx / d * 0.5, sprint: d < 12, fire: d < 55, aim: g.aimAt(e) });
  }
  return e.dead;
}
const sweepLoot = (g) => { for (const l of [...g.s.loot]) if (Math.hypot(l.x - g.p.x, l.z - g.p.z) < 80) g.rideTo(l.x, l.z, 2, 15); g.wait(0.1); };
const sellAll = (g) => { g.rideTo(door('store').x, door('store').z, 4, 120); for (const id of ['hide', 'meat', 'claws']) g.sim.command({ type: 'sell', id }); };

// ---- A: the notice board, as fast as it can be worked ----
export function jobs(hours, seed) {
  const g = fresh(seed), { s, p, sim } = g, t0 = s.clock, done = { bounty: 0, supply: 0, hunt: 0, herd: 0 }; let rests = 0, deaths = 0;
  while (s.clock - t0 < hours * HOUR) {
    if (p.dead) { deaths++; g.wait(4); continue; }
    g.rideTo(door('board').x, door('board').z, 4, 120);
    let i = s.board.findIndex(j => j.type === 'supply');
    if (i < 0) i = s.board.findIndex(j => j.type === 'bounty');
    if (i < 0) i = s.board.findIndex(j => j.type === 'hunt' && p.res.hide >= j.count);
    if (i < 0) { sim.command({ type: 'rest' }); rests++; g.wait(0.1); continue; }   // nothing worth taking: sleep, and the board is new
    sim.command({ type: 'takeJob', i });
    const job = s.job; if (!job) { g.wait(1); continue; }
    if (job.type === 'hunt') sim.command({ type: 'turnIn' });
    else if (job.type === 'supply') { g.rideTo(job.x, job.z, 3, 120); g.wait(0.1); g.rideTo(0, -10, 20, 120); g.wait(0.1); }
    else {
      const e = s.enemies.find(k => k.id === job.target);
      g.rideTo(e.x, e.z, 30, 120);
      hunt(g, e, 90); sweepLoot(g);
    }
    if (!s.job) done[job.type]++; else if (s.job === job && job.type !== 'hunt') sim.command({ type: 'dropJob' });
    spend(g);
  }
  sellAll(g);
  report('A. notice board (supply runs, bounties, hunts from spare hides)', g, t0, `jobs ${JSON.stringify(done)} rests ${rests} thrown ${deaths}x standing ${s.story.standing}`);
}

// ---- B: farming one of the wild herds that comes back 40 s after it is shot ----
// respawn: act as if a shot animal stayed away this many seconds (the rules bring it back after 40): one that returns sooner is put down again unseen
export function farm(kind, hours, seed, { sell = true, respawn = 40, prices = 1 } = {}) {
  const g = fresh(seed), { s, p, sim } = g, t0 = s.clock, w = WILD.find(k => k[0] === kind); let kills = 0, trips = 0, deaths = 0, n = 0;
  const KINDS_ANY = ['raptor', 'cinder', 'plate', 'crest', 'hauler', 'dilo'], diedAt = new Map(), real = sim.step;
  if (respawn > 40) sim.step = (inp) => { const ev = real(inp); for (const v of ev) if (v.type === 'kill') for (const e of s.enemies) if (e.dead && e.deadT === 0) diedAt.set(e.id, s.clock);
    if (++n % 30 === 0) for (const e of s.enemies) if (!e.dead && diedAt.has(e.id) && s.clock - diedAt.get(e.id) < respawn) { e.dead = true; e.deadT = 0; } return ev; };
  const home = !w ? null : { x: w[1], z: w[2] };
  while (s.clock - t0 < hours * HOUR) {
    if (p.dead) { deaths++; g.wait(4); continue; }
    const pool = s.enemies.filter(e => (kind === 'any' ? KINDS_ANY.includes(e.kind) : e.kind === kind) && !e.dead && !e.gone && !e.outpost && !e.tag);
    // anything already on the rider comes first
    const onMe = s.enemies.filter(e => !e.dead && !e.gone && e.state === 'chase' && Math.hypot(e.x - p.x, e.z - p.z) < 40)[0];
    const e = onMe || pool.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (!e) { if (home) g.rideTo(home.x, home.z, 30, 20); g.wait(1); continue; }
    if (Math.hypot(e.x - p.x, e.z - p.z) > 45) g.rideTo(e.x, e.z, 32, 60);
    if (hunt(g, e, 60)) { kills++; sweepLoot(g); }
    spend(g);
    if (sell && sim.economy.bagUsed() >= Math.floor(sim.st.bag) - 2) { sellAll(g); trips++; }
  }
  if (sell) sellAll(g);
  report(`B. farming ${kind}s (back after ${respawn} s)${sell ? ', selling at the store when the bags fill' : ''}`, g, t0, `kills ${kills} (${Math.round(kills / hours)}/h) trips ${trips} thrown ${deaths}x`);
}

// ---- C: sleeping through the days for the town's taxes and a new notice board ----
function rest() {
  for (const level of [1, 3, 5]) {
    const g = fresh(), { s, p, sim } = g;
    sim.town.claim(); s.town.level = level; s.town.supplies = 100; p.money = 1000; p.x = 0; p.z = -10;
    const t0 = s.clock, tr0 = s.town.treasury, m0 = p.money; let n = 0, raids = 0;
    while (n < 10) { sim.command({ type: 'rest' }); g.wait(0.05); n++; if (s.town.raid) raids++; }
    console.log(`C. town level ${level}: 10 nights at the saloon back to back cost $${m0 - p.money}, took ${(n * 0.05).toFixed(1)} s of play, moved the clock ${((s.clock - t0) / DAY.length).toFixed(1)} days, treasury +$${s.town.treasury - tr0}, raids begun ${raids}, raidIn ${s.town.raidIn.toFixed(0)} s, stores ${s.town.supplies}, morale ${s.town.morale}`);
  }
}

// ---- D: penning longhorns one at a time on the rope ----
async function pen(hours, seed) {
  const { bot } = await import('./30-lib.js');
  const sim = createSim(seed), b = bot(sim, {}, { tough: false }), { s, p } = b, t0 = s.clock; let n = 0, fail = 0;
  while (s.clock - t0 < hours * HOUR && fail < 30) { if (b.penOne()) n++; else { fail++; b.wait(5); } }
  report('D. penning longhorns on the rope, one at a time', { s, p }, t0, `penned ${n} (${Math.round(n / ((s.clock - t0) / HOUR))}/h) misses ${fail}`);
}

if (process.argv[1].endsWith('103-income.js')) {
if (which === 'all' || which === 'jobs') for (const sd of [99, 7]) jobs(1, sd);
if (which === 'all' || which === 'haulers') { farm('hauler', 1, 99); farm('hauler', 3, 99); }
if (which === 'all' || which === 'plates') farm('plate', 1, 99);
if (which === 'all' || which === 'cinders') farm('cinder', 1, 99);
if (which === 'all' || which === 'raptors') farm('raptor', 1, 99);
if (which === 'all' || which === 'any') { farm('any', 2, 99); farm('any', 2, 99, { respawn: 600 }); farm('any', 2, 7, { respawn: 600 }); farm('any', 2, 99, { respawn: 1440 }); }
if (which === 'all' || which === 'rest') rest();
if (which === 'all' || which === 'pen') await pen(1, 99);
}
