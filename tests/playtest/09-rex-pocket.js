// Minimal repro: the Alpha Rex wedges between a tree and a rock and can be shot dead by a rider standing still.
import { createSim, inp, dist, aimAt, run, note } from './lib.js';

const sim = createSim(1), s = sim.state, p = s.player, rex = s.rex;
for (const x of s.enemies) if (x !== rex) { x.heldT = 1e9; x.x = 285; x.z = 285 - s.enemies.indexOf(x) * 4; }
p.x = -151; p.z = -212.3;                 // 91 from the Rex's home (-70,-170), inside its 110 leash
rex.x = -120; rex.z = -180; rex.state = 'chase';
let hurt = 0;
run(sim, 30, () => ({}), (ev) => { for (const x of ev) if (x.type === 'hurt') hurt++; });
const d0 = dist(rex, p), x0 = rex.x, z0 = rex.z;
run(sim, 10);
note(hurt === 0 && rex.state === 'chase' && Math.hypot(rex.x - x0, rex.z - z0) < 0.01 ? 'BUG' : 'PASS',
  `Rex chasing a rider who stands at (-151,-212): after 30 s it is at (${rex.x.toFixed(1)},${rex.z.toFixed(1)}), ${d0.toFixed(1)} away (reach 7.5), state '${rex.state}', moved ${Math.hypot(rex.x - x0, rex.z - z0).toFixed(3)} in the next 10 s, bites landed ${hurt}`);
const near = [...s.obstacles.trees.map(t => ({ ...t, k: 'tree' })), ...s.obstacles.rocks.map(t => ({ ...t, k: 'rock' }))].filter(t => Math.hypot(t.x - rex.x, t.z - rex.z) < t.r + 2.76 + 0.2);
note('INFO', `touching: ${near.map(t => `${t.k} (${t.x.toFixed(1)},${t.z.toFixed(1)}) r ${t.r.toFixed(2)}`).join(', ')}`);
const t = run(sim, 120, () => ({ fire: true, aim: aimAt(p, rex, 4.6) }), (ev) => { for (const x of ev) if (x.type === 'hurt') hurt++; return !rex.dead; });
note(rex.dead && hurt === 0 ? 'BUG' : 'PASS', `holding fire with the starting revolver from that spot: Rex ${rex.dead ? 'dead' : 'alive'} in ${t.toFixed(0)} s, rider hit ${hurt} times, level ${p.level}, Tyrant unlocked ${p.mounts[2]}`);
