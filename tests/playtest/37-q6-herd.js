// Quest 6's held herd, the pen step across reloads, night arrivals at the den / camp, the driven pack across a reload,
// where quest things stand relative to scenery, and how often "Help the herd" hangs at the gate.
import { createSim, bot, clone, STEP, idle, PEN, BRANCHES } from './30-lib.js';
import { NPCS, QUESTS, PLACES_OF_NOTE } from '../../src/data/story.js';
import { PLACES, TOWN } from '../../src/data/items.js';

const log = (...a) => console.log(...a);
const toQ = (choices, until, opts) => { const g = bot(createSim(), choices, opts); g.finish({ until }); return g; };

{ log('--- A. "Help the herd": how often does Mara hang in the leave phase at the gate? (rider parked, 300 s, 24 starts)');
  let hung = 0, n = 0; const where = new Set();
  for (let k = 0; k < 24; k++) {
    const sim = createSim(), s = sim.state, p = s.player; p.x = -60 + k * 7; p.z = -30 + (k % 5) * 11; sim.posse.join('mara'); sim.command({ type: 'order', id: 'herd' });
    const m = s.mates[0]; let leaveT = 0;
    for (let t = 0; t < 300; t += STEP) { sim.step(idle); leaveT = m.task?.phase === 'leave' ? leaveT + STEP : 0; }
    n++; if (leaveT > 60) { hung++; where.add(`${m.x.toFixed(6)},${m.z.toFixed(6)} d=${Math.hypot(m.x, m.z - 8)}`); }
  }
  log(`  hung ${hung}/${n}; Mara stands at ${[...where].slice(0, 3).join(' ; ')}  (target 0,8 with stop distance 2)`);
}

{ log('--- B. AFK income when the hang is worked around by re-issuing the order (rider parked at the notice board, no other input)');
  const sim = createSim(), s = sim.state, p = s.player; p.x = 12; p.z = -25; sim.posse.join('mara'); sim.command({ type: 'order', id: 'herd' });
  const m = s.mates[0]; let leaveT = 0, reissued = 0;
  for (let t = 0; t < 20 * 60; t += STEP) {
    sim.step(idle); leaveT = m.task?.phase === 'leave' ? leaveT + STEP : 0;
    if (s.order !== 'herd' || leaveT > 5) { sim.command({ type: 'order', id: 'herd' }); reissued++; leaveT = 0; }
    if (!s.job) { const i = s.board.findIndex(j => j.type === 'herd'); if (i >= 0) sim.command({ type: 'takeJob', i }); }
  }
  log(`  20 min: money 50 -> ${p.money}, level 1 -> ${p.level}, longhorns penned ${s.herd.total}, herd jobs done ${s.jobsDone}, standing ${s.story.standing}, order re-issued ${reissued}x`);
}

{ log('--- C. quest 6: the released herd and predators');
  const g = toQ({}, 'q6/4'), { sim, s, p } = g;
  const h0 = s.animals.filter(a => a.herd === 0);
  log(`  at the pen step: herd 0 held ${h0.filter(a => a.held).length}, still flagged safe ${h0.filter(a => a.safe).length} of ${h0.length}`);
  const a = h0.find(k => !k.penned), r = s.enemies.find(e => e.kind === 'raptor' && !e.outpost && !e.dead);
  p.x = a.x + 80; p.z = a.z;   // rider well away
  let bites = 0; const hp0 = a.hp;
  for (let t = 0; t < 30; t += STEP) { r.x = a.x + 2; r.z = a.z; r.home = { x: a.x, z: a.z }; const ev = g.step(); bites += ev.filter(e => e.type === 'bite').length; }
  log(`  a raptor parked on a released herd-0 longhorn for 30 s: bites ${bites}, hp ${hp0} -> ${a.hp.toFixed(0)}, raptor state ${r.state}`);
  const o = s.animals.find(k => k.herd === 1 && !k.penned);
  let bites2 = 0; for (let t = 0; t < 30 && !o.dead; t += STEP) { r.x = o.x + 2; r.z = o.z; r.home = { x: o.x, z: o.z }; p.x = o.x + 80; p.z = o.z; const ev = g.step(); bites2 += ev.filter(e => e.type === 'bite').length; }
  log(`  the same raptor on a herd-1 longhorn: bites ${bites2}, dead ${o.dead}`);
}

{ log('--- D. quest 6 pen step ("3 of Mara\'s herd") across reloads: progress is not saved');
  const g = toQ({}, 'q6/4'); let sim = g.sim, h = g;
  const reload = () => { const b = createSim(); b.restore(clone(sim.snapshot())); sim = b; h = bot(b, {}); };
  const state = () => `count ${sim.state.story.count}/3, herd 0: penned ${sim.state.animals.filter(a => a.herd === 0 && a.penned).length} loose ${sim.state.animals.filter(a => a.herd === 0 && !a.penned && !a.dead).length}, pen holds ${sim.state.animals.filter(a => a.penned).length}`;
  for (let k = 0; k < 2; k++) for (let i = 0; i < 8 && sim.state.story.count < 2; i++) h.penOne(0);
  log(`  penned two: ${state()}`); reload(); log(`  reload:     ${state()}`);
  for (let i = 0; i < 8 && sim.state.story.count < 2; i++) h.penOne(0);
  log(`  two more:   ${state()}`); reload(); log(`  reload:     ${state()}  step ${h.stepOf()}`);
  let tries = 0; for (; tries < 6 && h.stepOf() === 'q6/4'; tries++) if (!h.penOne(0)) h.wait(5);
  log(`  then penning every herd-0 longhorn left: ${state()}  step ${h.stepOf()}  ${h.stepOf() === 'q6/4' ? 'STUCK: only 2 of Mara\'s herd exist outside the pen, 3 are wanted' : ''}`);
  // way out: pen other herds until the pen (8) overflows and sells a herd-0 animal back to the range
  let extra = 0; for (; extra < 12 && h.stepOf() === 'q6/4'; extra++) { h.penOne(sim.state.animals.some(a => a.herd === 0 && !a.penned && !a.dead) ? 0 : 1); }
  log(`  way out: ${extra} more pennings (other herds, until the pen sells Mara's own back to the range): step ${h.stepOf()}`);
}

{ log('--- E. quest 6 start: what hold() does to longhorns the rider already penned, and to a herd job');
  const g = toQ({}, 'q6/0'), { sim, s, p } = g;
  for (let i = 0; i < 3; i++) g.penOne(0);
  p.x = 12; p.z = -25; const i = s.board.findIndex(j => j.type === 'herd'); if (i >= 0) sim.command({ type: 'takeJob', i });
  const before = s.animals.filter(a => a.penned).length, b0 = s.animals.filter(a => a.penned && a.herd === 0).length;
  g.talkTo('mara');
  log(`  pen before talking to Mara: ${before} (${b0} of herd 0); after: ${s.animals.filter(a => a.penned).length}; herd 0 held at camp ${s.animals.filter(a => a.held).length}; job ${s.job ? `${s.job.type} ${s.job.done}/${s.job.count}` : 'none'}; loose not held ${s.animals.filter(a => !a.penned && !a.held && !a.dead).length}`);
}

{ log('--- F. arriving at night: the pack / the rustlers come out past the conversation ring');
  for (const [q, tag, spot, ring] of [[3, 'den', PLACES_OF_NOTE.den, 42], [5, 'q6', PLACES_OF_NOTE.rustlers, 55]]) {
    const g = toQ({}, `q${q + 1}/1`), { sim, s, p } = g;
    s.clock = Math.ceil(s.clock / 1440) * 1440 + 0.6 * 1440;   // deep night
    p.x = spot.x - ring - 8; p.z = spot.z; if (s.mates[0]) { s.mates[0].x = p.x - 4; s.mates[0].z = p.z; }
    let killed = 0, t = 0;
    for (; t < 90 && !s.dialogue; t += STEP) {
      const e = s.enemies.filter(k => k.tag.startsWith(tag) && !k.dead).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (!e) break;
      const ev = g.step(Math.hypot(e.x - p.x, e.z - p.z) < 60 ? { fire: true, aim: g.aimAt(e) } : {});
      killed += ev.filter(k => k.type === 'kill').length;
    }
    const n0 = s.enemies.filter(k => k.tag.startsWith(tag) && !k.dead).length;
    g.wait(7);
    g.rideTo(spot.x, spot.z, ring - 5); g.step(); const dlg = s.dialogue?.id; g.answer(); g.step();
    log(`  ${tag}: night ${sim.isNight()}, standing ${ring + 8} m out the rider killed ${killed} before any conversation (${n0} left); then rode in: conversation ${dlg}, step ${g.stepOf()}, fresh ${tag} animals now ${s.enemies.filter(k => k.tag.startsWith(tag) && !k.dead).length}`);
  }
}

{ log('--- G. "Drive them onto the gang": the pack after a reload');
  const g = toQ(BRANCHES['refused/driven/secret/stampeded'], 'q4/5'), { sim, s } = g;
  const mesa = PLACES_OF_NOTE.mesaCamp, extra = () => s.enemies.filter(e => !e.outpost && !e.dead && Math.hypot(e.home.x - mesa.x - 14, e.home.z - mesa.z - 6) < 10).length;
  const n = extra(); const b = createSim(); b.restore(clone(sim.snapshot()));
  log(`  raptors re-homed beside Red Mesa camp: ${n}; after save + load: ${b.state.enemies.filter(e => !e.outpost && !e.dead && Math.hypot(e.home.x - mesa.x - 14, e.home.z - mesa.z - 6) < 10).length}`);
}

{ log('--- H. where quest things stand: characters, herbs, goto spots vs trees, rocks, buildings, fence');
  const sim = createSim(), obs = [...sim.state.obstacles.trees.map(o => ({ ...o, t: 'tree' })), ...sim.state.obstacles.rocks.map(o => ({ ...o, t: 'rock' }))];
  const gap = (x, z) => obs.map(o => ({ o, g: Math.hypot(o.x - x, o.z - z) - o.r })).sort((a, b) => a.g - b.g)[0];
  const pts = [...NPCS.map(n => [`npc ${n.id}`, n.x, n.z, 8]), ...QUESTS.flatMap(q => q.steps.flatMap(st => (st.enter || []).flatMap(a => a.pickups ? a.pickups.points.map(([x, z], i) => [`herb ${i}`, x, z, 3.5]) : [])))];
  for (const [name, x, z, reach] of pts) {
    const { o, g } = gap(x, z), box = PLACES.find(b => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2);
    // can a mounted rider (radius 1.2) get within reach? walk in from 8 directions
    let ok = 0; for (let k = 0; k < 8; k++) { const body = { x: x + Math.cos(k * 0.785) * 20, z: z + Math.sin(k * 0.785) * 20 }; for (let i = 0; i < 400; i++) { const d = Math.hypot(x - body.x, z - body.z); if (d < reach) { ok++; break; } body.x += (x - body.x) / d * 0.2; body.z += (z - body.z) / d * 0.2; sim.state.obstacles.resolve(body, 1.2); } }
    log(`  ${name} at ${x},${z}: nearest ${o.t} surface ${g.toFixed(1)} m${g < 0 ? '  INSIDE IT' : ''}${box ? `  INSIDE ${box.id}` : ''}; reachable riding straight in from ${ok}/8 directions`);
  }
}
