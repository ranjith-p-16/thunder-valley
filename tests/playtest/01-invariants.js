// Long mixed "monkey" sessions with invariants asserted every step (solid-overlap checks every 3rd step).
// usage: node 01-invariants.js [minutes=25] [seeds=1,2,3]
import { createSim, STEP, inp, toward, dist, aimAt, makeChecker, rng, PEN, TOWN } from './lib.js';

const minutes = +(process.argv[2] || 25), seeds = (process.argv[3] || '1,2,3').split(',').map(Number);
const SHOP = [
  ['weapon', 'rifle'], ['weapon', 'shotgun'], ['weapon', 'bow'], ['thrown', 'dynamite'], ['thrown', 'bolas'], ['thrown', 'trap'],
  ['tonic', 'jerky'], ['tonic', 'tonic'], ['tonic', 'brew'], ['tonic', 'steady'], ['tonic', 'salve'], ['tonic', 'herb'],
  ['gear', 'duster'], ['gear', 'vest'], ['gear', 'poncho'], ['gear', 'light'], ['gear', 'pack'], ['gear', 'war'], ['gear', 'charm'], ['gear', 'spurs'], ['gear', 'horn'],
];
const ACTS = ['lasso', 'holler', 'ability', 'dodge', 'reload', 'dismount', 'quickZ', 'quickX', 'weapon0', 'weapon1', 'weapon2', 'weapon3', 'throw:dynamite', 'throw:bolas', 'throw:trap'];

function session(seed, rich) {
  const sim = createSim(seed), s = sim.state, p = s.player, R = rng(seed * 7919 + (rich ? 1 : 0)), chk = makeChecker(sim, `seed ${seed}${rich ? ' rich' : ''}`);
  if (rich) { p.money = 60000; p.skillPoints = 30; }
  const pick = (a) => a[Math.floor(R() * a.length)];
  let mode = 'roam', modeT = 0, goal = { x: 0, z: -60 }, deaths = 0;
  const stats = { kills: 0, penned: 0, jobs: 0, cmds: 0, saves: 0 };
  const steps = Math.round(minutes * 60 / STEP);
  for (let i = 0; i < steps; i++) {
    modeT -= STEP;
    if (modeT <= 0) {
      mode = pick(['roam', 'fight', 'fight', 'herd', 'herd', 'town', 'job', 'rex', 'camp']); modeT = 15 + R() * 45;
      goal = { x: (R() - 0.5) * 600, z: (R() - 0.5) * 600 };
    }
    const o = inp(); let target = null;
    if (mode === 'fight' || mode === 'rex' || mode === 'camp') {
      const pool = s.enemies.filter(e => !e.dead && (mode === 'rex' ? e === s.rex : mode === 'camp' ? e.outpost : true));
      target = pool.sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (target) {
        const d = dist(target, p);
        if (d > 14) Object.assign(o, toward(p, target.x, target.z)); else if (d < 8) Object.assign(o, { mx: p.x - target.x, mz: p.z - target.z });
        o.fire = d < 60; o.aim = aimAt(p, target);
      } else Object.assign(o, toward(p, goal.x, goal.z));
    } else if (mode === 'herd') {
      if (s.herd.roped) {
        const outside = { x: PEN.x, z: PEN.z - PEN.r - 12 };
        const g = (p.z > PEN.z - PEN.r - 14 && Math.abs(p.x - PEN.x) < 5) ? { x: PEN.x, z: PEN.z + 6 } : outside;
        Object.assign(o, toward(p, g.x, g.z));
      } else {
        const a = s.animals.filter(a => !a.dead && !a.penned).sort((a, b) => dist(a, p) - dist(b, p))[0];
        if (a) { Object.assign(o, toward(p, a.x, a.z)); if (dist(a, p) < 20 && R() < 0.05) o.actions.push('lasso'); }
      }
    } else if (mode === 'town' || mode === 'job') {
      const want = mode === 'job' && s.job ? (s.job.type === 'supply' ? (s.job.carrying ? TOWN : s.job) : s.job.type === 'bounty' ? s.job : TOWN) : { x: TOWN.x + 5, z: TOWN.z - 5 };
      if (dist(p, want) > 4) Object.assign(o, toward(p, want.x, want.z));
      if (sim.inTown() && R() < 0.02) {
        stats.cmds++;
        const k = Math.floor(R() * 12), [kind, id] = pick(SHOP);
        if (k < 3) sim.command({ type: 'buy', kind, id });
        else if (k === 3) sim.command({ type: 'sell', id: pick(['hide', 'meat', 'claws']) });
        else if (k === 4) sim.command({ type: 'upgrade', kind: kind === 'weapon' ? 'weapon' : 'gear', id });
        else if (k === 5) sim.command({ type: 'equip', id });
        else if (k === 6) sim.command({ type: 'skill', tree: pick(['gunslinger', 'wrangler', 'marshal']) });
        else if (k === 7) sim.command({ type: 'takeJob', i: Math.floor(R() * 3) });
        else if (k === 8) sim.command({ type: R() < 0.3 ? 'dropJob' : 'turnIn' });
        else if (k === 9) sim.command({ type: 'rest' });
        else if (k === 10) { sim.command({ type: 'buy', kind: 'mount', i: 1 }); sim.command({ type: 'mount', i: Math.floor(R() * 3) }); }
        else sim.command({ type: 'quick', slot: pick(['z', 'x']), id: pick(['jerky', 'tonic', 'brew', 'steady', 'salve', 'herb']) });
        chk.check(false);
      }
    } else Object.assign(o, toward(p, goal.x, goal.z));
    o.sprint = R() < 0.7;
    if (R() < 0.01) o.actions.push(pick(ACTS));
    if (R() < 0.002 && !o.aim) o.fire = true;
    // occasional save -> JSON -> restore into the same sim (awkward moments included)
    if (R() < 0.0002) { const save = JSON.parse(JSON.stringify(sim.snapshot())); if (!sim.restore(save)) console.log('RESTORE REFUSED'); stats.saves++; chk.check(false); }
    let ev;
    try { ev = sim.step(o); } catch (err) { console.log(`CRASH seed ${seed} step ${i} mode ${mode}: ${err.stack}`); break; }
    for (const e of ev) { if (e.type === 'death') deaths++; if (e.type === 'kill') stats.kills++; if (e.type === 'penned') stats.penned++; if (e.type === 'jobdone') stats.jobs++; }
    chk.check(i % 3 === 0);
  }
  const c = sim.herding.counts();
  console.log(`seed ${seed}${rich ? ' rich' : ''}: ${minutes} min, deaths ${deaths}, kills ${stats.kills}, penned ${stats.penned} (in pen ${c.penned}, lost ${c.lost}), jobsDone ${stats.jobs}, cmds ${stats.cmds}, restores ${stats.saves}, level ${p.level}, $${p.money}, won ${s.won}`);
  return chk.summary().size;
}
let bad = 0;
for (const seed of seeds) { bad += session(seed, false); bad += session(seed, true); }
console.log(bad ? `\n${bad} invariant kinds violated` : '\nall invariants held');
