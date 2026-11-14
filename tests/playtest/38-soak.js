// 25 simulated minutes of mixed, partly random play per seed with the story running and Mara in the posse.
// Random actions/commands are injected into every step the story bot takes; invariants are checked throughout; saves are round-tripped.
//   node 38-soak.js [minutes] [seed,seed,...]
import { createSim, bot, clone, STEP, idle, PEN, sane } from './30-lib.js';
import { makeChecker } from './lib.js';
import { GATE } from '../../src/data/content.js';
import { PLACES, TOWN } from '../../src/data/items.js';
import { angleDiff, rng } from '../../src/sim/terrain.js';

const MINUTES = +(process.argv[2] || 25), seeds = (process.argv[3] || '99,7,21').split(',').map(Number);
const digits = new RegExp('[0-9.-]+', 'g');
for (const seed of seeds) {
  const R = rng(seed * 7919 + 1), pick = (a) => a[Math.floor(R() * a.length)];
  let sim = createSim(seed), checker = makeChecker(sim, `seed ${seed}`);
  const problems = new Map(), note = (k, d) => { if (!problems.has(k)) problems.set(k, { n: 0, first: d, at: sim.state.clock }); problems.get(k).n++; };
  let steps = 0, restores = 0, deaths = 0, wasDead = false, cmds = 0, mateJumps = 0;
  const ACTIONS = ['order', 'holler', 'lasso', 'ability', 'dodge', 'dismount', 'reload', 'quickZ', 'quickX', 'weapon0', 'weapon1', 'throw:dynamite', 'throw:bolas', 'throw:trap', 'bogus', 7];
  const COMMANDS = () => [{ type: 'talk' }, { type: 'say', i: Math.floor(R() * 4) - 1 }, { type: 'order', id: pick(['follow', 'hold', 'attack', 'herd', 'x']) },
    { type: 'takeJob', i: Math.floor(R() * 3) }, { type: 'dropJob' }, { type: 'turnIn' }, { type: 'rest' }, { type: 'sell', id: pick(['hide', 'meat', 'claws']) },
    { type: 'buy', kind: pick(['tonic', 'thrown', 'weapon', 'gear']), id: pick(['jerky', 'tonic', 'dynamite', 'bolas', 'trap', 'rifle', 'herb']) }, { type: 'skill', tree: pick(['gunslinger', 'wrangler', 'marshal']) },
    { type: 'mount', i: Math.floor(R() * 3) }];
  const choices = { q3_collector: seed % 3, q4_den: seed % 2, q5_done: seed % 2, q6_camp: (seed >> 1) % 2 };
  function hook(target) {
    const raw = target.step, s = target.state;
    let was = false, lx = 0, lz = 0, first = true;
    target.step = (input, dt) => {
      const inp = { ...idle, ...input };
      if (R() < 0.004) inp.actions = [...inp.actions, pick(ACTIONS)];
      if (R() < 0.002) { try { target.command(pick(COMMANDS())); cmds++; } catch (e) { note('THROW command', e.stack.split('\n').slice(0, 3).join(' | ')); } }
      let ev = [];
      try { ev = raw(inp, dt); } catch (e) { note('THROW step', e.stack.split('\n').slice(0, 3).join(' | ')); }
      steps++;
      if (s.player.dead && !wasDead) deaths++;
      wasDead = s.player.dead;
      if (steps % 20 === 0) { checker.check(steps % 200 === 0); for (const b of sane(target)) note(b.replace(digits, '#'), b); }
      const m = s.mates[0];
      if (m) {
        const inP = Math.hypot(m.x - PEN.x, m.z - PEN.z) < PEN.r, jump = !first && Math.hypot(m.x - lx, m.z - lz) > 3;
        if (jump) mateJumps++;
        if (!first && inP !== was && !jump && Math.abs(angleDiff(Math.atan2(m.z - PEN.z, m.x - PEN.x), GATE.angle)) > GATE.half + 0.12) note('Mara crossed the fence away from the gate', `${m.x.toFixed(1)},${m.z.toFixed(1)}`);
        if (PLACES.some(q => Math.abs(m.x - q.x) < q.w / 2 && Math.abs(m.z - q.z) < q.d / 2)) note('Mara inside a building', `${m.x.toFixed(1)},${m.z.toFixed(1)}`);
        for (const e of ev) if (e.type === 'mateShot' && Math.hypot(m.x - TOWN.x, m.z - TOWN.z) < TOWN.r) note('Mara fired inside town', `${m.x.toFixed(1)},${m.z.toFixed(1)}`);
        was = inP; lx = m.x; lz = m.z; first = false;
      } else first = true;
      for (const a of s.animals) { if (a.penned && a.held) note('penned and held', a.id); if (a.leader && !s.mates.includes(a.leader)) note('leader is not a current mate', a.id); }
      for (const e of ev) if (e.type === 'kill' && e.kind === 'compy') note('compy killed', '');
      return ev;
    };
  }
  hook(sim);
  let g = bot(sim, choices, { tough: false });
  g.p.level = 6; sim.economy.recalc(); g.p.hp = g.p.maxHp; g.p.money = 400;
  const SPOTS = [[0, -10], [12, -25], [-16, -6], [17, -6], [0, 12], [0, 40], [85, 55], [-75, 105], [-105, -55], [100, 130], [185, 105], [-203, 10], [120, -90], [-140, 60], [40, 170], [280, 280], [-285, 0]];
  let storyEnd = null, phase = 0;
  const target = MINUTES * 60 / STEP;
  while (steps < target) {
    const before = steps;
    // a slice of story, then a slice of wandering and fighting, then now and again a reload
    // the bot rides in straight lines: from inside the pen it has to use the gate first
    if (Math.hypot(g.p.x - PEN.x, g.p.z - PEN.z) < PEN.r) { g.rideTo(0, 27, 2, 8); g.rideTo(0, 10, 2, 8); }
    if (g.cur()) { let tries = 0; const k0 = g.stepOf(); while (g.cur() && g.stepOf() === k0 && tries++ < 6 && steps < target) g.advance(); }
    else storyEnd ??= steps * STEP;
    const [x, z] = pick(SPOTS);
    g.rideTo(x + (R() - 0.5) * 20, z + (R() - 0.5) * 20, 4, 25);
    for (let i = 0; i < 300; i++) {
      const e = g.s.enemies.find(k => !k.dead && Math.hypot(k.x - g.p.x, k.z - g.p.z) < 30);
      g.step(e ? { fire: true, aim: g.aimAt(e), mx: R() - 0.5, mz: R() - 0.5 } : { mx: R() - 0.5, mz: R() - 0.5, sprint: R() < 0.5 });
    }
    if (g.s.dialogue && R() < 0.7) g.answer();
    if (++phase % 4 === 0) {
      const save = clone(sim.snapshot()), b = createSim(seed);
      if (!b.restore(save)) note('restore refused its own save', `${g.stepOf()} job ${JSON.stringify(save.job)} bounty ${JSON.stringify(save.bounty)}`);
      else {
        const sb = b.state, sa = sim.state;
        if (sb.mates.length !== sa.mates.length) note('mates changed over reload', `${sa.mates.length} -> ${sb.mates.length}`);
        if (sb.story.standing !== sa.story.standing || sb.player.money !== sa.player.money) note('standing/money changed over reload', '');
        if (sb.animals.filter(a => a.penned).length !== sa.animals.filter(a => a.penned).length && !sb.animals.some(a => a.held)) note('penned count changed over reload', `${sa.animals.filter(a => a.penned).length} -> ${sb.animals.filter(a => a.penned).length} at ${g.stepOf()}`);
        if (sb.order !== sa.order) note('order changed over reload', `${sa.order} -> ${sb.order}`);
        if (JSON.stringify(sb.npcs.map(n => n.hidden)) !== JSON.stringify(sa.npcs.map(n => n.hidden))) note('npc visibility changed over reload', `${g.stepOf()}`);
        sim = b; hook(sim); checker = makeChecker(sim, `seed ${seed}`); g = bot(sim, choices, { tough: false }); restores++;
      }
    }
    if (steps === before) g.step();
  }
  const s = sim.state;
  console.log(`seed ${seed}: ${(steps * STEP / 60).toFixed(1)} min played, story ${g.cur() ? `at ${g.stepOf()}` : `finished (first seen done at ${storyEnd?.toFixed(0)} s)`}, deaths ${deaths}, reloads ${restores}, commands ${cmds}, level ${s.player.level}, $${s.player.money}, standing ${s.story.standing}, enemies ${s.enemies.length}, loot ${s.loot.length}, pickups ${s.pickups.length}, mates ${s.mates.length}, Mara catch-up jumps ${mateJumps}`);
  if (g.cur()) console.log(`   stuck detail: rider ${g.p.x.toFixed(1)},${g.p.z.toFixed(1)} onFoot ${g.p.onFoot} steed ${g.p.steed.x.toFixed(0)},${g.p.steed.z.toFixed(0)} dead ${g.p.dead} dialogue ${s.dialogue?.id} order ${s.order} job ${s.job?.type} roped ${s.herd.roped?.id} mount ${g.p.mount} flags ${JSON.stringify(s.story.flags)} tagged ${s.enemies.filter(e => e.tag).map(e => e.tag + ':' + e.state)}`);
  for (const [k, v] of problems) console.log(`   PROBLEM ${k}  x${v.n}  first @${v.at.toFixed(0)}s: ${v.first}`);
  checker.summary();
}
