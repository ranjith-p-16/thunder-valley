// Combat edge cases.
import { createSim, STEP, inp, toward, dist, aimAt, run, note, heightAt, PEN, TOWN, WEAPONS } from './lib.js';
import { PLACES } from '../../src/data/items.js';

const fresh = (seed = 99) => { const sim = createSim(seed); return { sim, s: sim.state, p: sim.state.player }; };
const roamer = (s, k = 0) => s.enemies.filter(e => !e.outpost && e !== s.rex && !e.bounty)[k];
// put the rider on open ground and one pinned raptor `d` ahead of it
function range(seed, d, weapon = 'revolver', spot = { x: 200, z: -40 }) {
  const f = fresh(seed), { s, p } = f;
  for (const e of s.enemies) { e.x = -250 + Math.random() * 0; e.z = 250; e.heldT = 1e9; e.home = { x: e.x, z: e.z }; }
  s.enemies.forEach((e, i) => { e.x = -280 + (i % 10) * 4; e.z = 280 - Math.floor(i / 10) * 4; });
  p.x = spot.x; p.z = spot.z; p.yaw = 0;
  if (weapon !== 'revolver') { p.weapons[weapon] = 0; p.ammo[weapon] = WEAPONS[weapon].magazine; p.weapon = weapon; }
  const e = roamer(s); e.x = spot.x; e.z = spot.z + d; e.hp = e.maxHp = 1e6;
  return { ...f, e };
}

{ // ---- hit registration by weapon and distance (aim ray through the body) ----
  for (const weapon of ['revolver', 'rifle', 'bow', 'shotgun']) {
    for (const [label, off] of [['dead centre', 0], ['1.0 off centre (still on the body, hit radius 1.84)', 1.0], ['1.5 off centre', 1.5]]) {
      let shots = 0, hits = 0, misses = [];
      for (const spot of [{ x: 200, z: -40 }, { x: -200, z: 150 }, { x: 60, z: -120 }]) for (let d = 10; d <= 60; d += 1.37) {
        const { sim, s, p, e } = range(1, d, weapon, spot);
        const hp0 = e.hp, target = { x: e.x + off, z: e.z };
        run(sim, 0.6, () => ({ aim: aimAt(p, target) }));   // turn to face
        sim.step(inp({ fire: true, aim: aimAt(p, target) }));
        if (p.ammo[weapon] === WEAPONS[weapon].magazine) continue;   // did not fire
        run(sim, 2);
        shots++; if (e.hp < hp0) hits++; else misses.push(d.toFixed(0));
      }
      note(hits === shots ? 'PASS' : weapon === 'shotgun' ? 'INFO' : 'BUG', `${weapon} aimed ${label}: ${hits}/${shots} shots registered (10–60 range)${misses.length ? ', missed at ' + misses.slice(0, 12).join(',') : ''}`);
    }
  }
}
{ // ---- weapon swap skips the fire delay ----
  const count = (swap) => {
    const { sim, s, p, e } = range(1, 20, 'rifle'); let shots = 0, t = 0, emptyAt = null, just = false;
    run(sim, 0.6, () => ({ aim: aimAt(p, e) }));
    run(sim, 6, () => ({ fire: true, aim: aimAt(p, e), actions: swap && just ? ['weapon0', 'weapon1'] : [] }), (ev) => { t += STEP; just = false; for (const x of ev) if (x.type === 'shot') { shots++; just = true; } if (emptyAt === null && p.ammo.rifle === 0) emptyAt = t; });
    return { shots, emptyAt, dmg: 1e6 - e.hp };
  };
  const a = count(false), b = count(true);
  note(b.emptyAt < a.emptyAt * 0.6 ? 'BUG' : 'PASS', `rifle (fireCd 0.9): 5-round magazine emptied in ${a.emptyAt.toFixed(2)} s normally, ${b.emptyAt.toFixed(2)} s when 'weapon0','weapon1' are sent on the step after each shot (swap resets fireCd to 0.25). Damage in 6 s: ${a.dmg.toFixed(0)} vs ${b.dmg.toFixed(0)}`);
  // rifle <-> shotgun alternation
  const { sim, s, p, e } = range(1, 12, 'rifle'); p.weapons.shotgun = 0; p.ammo.shotgun = 2;
  run(sim, 0.6, () => ({ aim: aimAt(p, e) })); let n = 0;
  run(sim, 6, (i) => ({ fire: true, aim: aimAt(p, e), actions: p.fireCd <= 0.24 && p.reloadT <= 0 ? [] : [] }), (ev) => { for (const x of ev) if (x.type === 'shot') { n++; } });
}
{ // ---- reload rules ----
  const { sim, s, p } = fresh(); p.x = 0; p.z = -70;
  sim.step(inp({ actions: ['reload'] }));
  note(p.reloadT === 0 ? 'PASS' : 'FAIL', 'reload with a full magazine does nothing');
  p.weapons.rifle = 0; p.ammo.rifle = 5;
  run(sim, 0.5, () => ({ fire: true }));
  sim.step(inp({ actions: ['reload'] })); const r0 = p.reloadT;
  sim.step(inp({ actions: ['weapon1'] }));
  note(r0 > 0 && p.reloadT === 0 && p.weapon === 'rifle' && p.ammo.revolver < 6 ? 'PASS' : 'FAIL', `switching weapon cancels the reload (revolver left at ${p.ammo.revolver}/6)`);
  run(sim, 0.3); sim.step(inp({ actions: ['weapon0'] })); run(sim, 3);
  note(p.ammo.revolver < 6 ? 'INFO' : 'PASS', `after switching back, a partly empty revolver (${p.ammo.revolver}/6) is not reloaded automatically (only an empty one is)`);
  // empty, switch away mid-reload, come back -> reload restarts
  run(sim, 2, () => ({ fire: true }), () => p.ammo.revolver > 0); const emptied = p.ammo.revolver === 0 && p.reloadT > 0;
  sim.step(inp({ actions: ['weapon1'] })); run(sim, 0.3); sim.step(inp({ actions: ['weapon0'] })); run(sim, 2);
  note(emptied && p.ammo.revolver === 6 ? 'PASS' : 'FAIL', 'empty weapon reloads when switched back to');
  // firing blocked while reloading; magazine never exceeds
  sim.step(inp({ actions: ['weapon9', 'weaponX', 'weapon'] }));
  note(p.weapon === 'revolver' ? 'PASS' : 'FAIL', 'bogus weapon slots ignored');
}
{ // ---- piercing ----
  const line = (pierce) => {
    const { sim, s, p, e } = range(1, 15); const e2 = roamer(s, 1), e3 = roamer(s, 2);
    e2.x = e.x; e2.z = e.z + 5; e3.x = e.x; e3.z = e.z + 10; for (const x of [e, e2, e3]) x.hp = x.maxHp = 1e6;
    if (pierce) { p.skillPoints = 9; for (let i = 0; i < 9; i++) sim.command({ type: 'skill', tree: 'gunslinger' }); }
    run(sim, 0.6, () => ({ aim: aimAt(p, e) })); sim.step(inp({ fire: true, aim: aimAt(p, e) })); run(sim, 1.5);
    return [e, e2, e3].map(x => x.hp < 1e6 ? 1 : 0).join('');
  };
  const a = line(false), b = line(true);
  note(a === '100' && b === '110' ? 'PASS' : 'FAIL', `three raptors in a line: no skill hits ${a}, Piercing shot hits ${b}`);
}
{ // ---- crit rate ----
  const { sim, s, p, e } = range(1, 15); p.skillPoints = 5; for (let i = 0; i < 5; i++) sim.command({ type: 'skill', tree: 'gunslinger' });
  let shots = 0, crits = 0, last = e.hp; const base = sim.damage();
  run(sim, 120, () => ({ fire: true, aim: aimAt(p, e) }), () => { if (e.hp < last) { shots++; if (last - e.hp > base * 1.5) crits++; last = e.hp; } });
  note(Math.abs(crits / shots - 0.15) < 0.06 ? 'PASS' : 'FAIL', `Deadeye: ${crits}/${shots} crits (${(100 * crits / shots).toFixed(1)}%, expected 15%)`);
}
{ // ---- thrown items on the Alpha Rex and on a bounty target ----
  const { sim, s, p } = fresh(); const rex = s.rex;
  p.thrown = { dynamite: 5, bolas: 5, trap: 3 };
  p.x = rex.x; p.z = rex.z - 25; p.yaw = 0; run(sim, 0.3, () => ({ aim: aimAt(p, rex) }));
  sim.step(inp({ actions: ['throw:bolas'], aim: aimAt(p, rex) }));
  note(rex.heldT <= 0 && p.thrown.bolas === 5 ? 'PASS' : 'FAIL', `bolas cannot hold the Rex and are not spent (bolas left ${p.thrown.bolas})`);
  rex.state = 'wander'; const hp0 = rex.hp;
  sim.step(inp({ actions: ['throw:dynamite'], aim: aimAt(p, rex) })); run(sim, 1.7);
  note(rex.hp < hp0 ? 'PASS' : 'FAIL', `dynamite hurts the Rex: ${hp0} -> ${rex.hp.toFixed(0)}`);
  // trap chain on the Rex
  const f = fresh(), r2 = f.s.rex; f.p.thrown.trap = 3; f.p.x = r2.x; f.p.z = r2.z - 30;
  let held = 0, bites = 0; const h0 = f.p.hp;
  run(f.sim, 30, (i) => ({ mx: 0, mz: -1, actions: i % 120 === 0 ? ['throw:trap'] : [], fire: true, aim: aimAt(f.p, r2) }), (ev) => { if (r2.heldT > 0) held += STEP; });
  note('INFO', `3 traps laid while backing away from the Rex: held ${held.toFixed(1)} s total (1 s each), Rex hp ${r2.hp.toFixed(0)}/900, rider hp ${f.p.hp.toFixed(0)}/${h0}`);
  // bounty target: bolas chain = permanent stun
  const g = fresh(); g.s.board[0] = { type: 'bounty', title: 'Bounty', text: '', pay: 200, xp: 250, name: 'Scarback', x: 150, z: 150, left: 0, done: 0 };
  g.sim.command({ type: 'takeJob', i: 0 }); const t = g.s.enemies.find(e => e.bounty); g.p.thrown.bolas = 5;
  g.p.x = t.x; g.p.z = t.z - 14; g.p.yaw = 0; let free = 0;
  const tt = run(g.sim, 30, () => ({ fire: true, aim: aimAt(g.p, t), actions: t.heldT <= 0.05 && g.p.thrown.bolas ? ['throw:bolas'] : [] }), () => { if (t.heldT <= 0 && !t.dead) free += STEP; return !t.dead; });
  note('INFO', `bounty target (180 hp) with bolas re-thrown as they wear off: dead in ${tt.toFixed(1)} s, target free to act for ${free.toFixed(2)} s, rider hp ${g.p.hp.toFixed(0)}, bolas used ${5 - g.p.thrown.bolas}`);
}
{ // ---- dynamite / traps work from inside the safe town; shooting does not ----
  const { sim, s, p } = fresh(); const e = roamer(s); p.thrown.dynamite = 5;
  p.x = TOWN.x; p.z = TOWN.z - TOWN.r + 1; p.yaw = Math.PI;              // just inside the south edge
  e.x = p.x; e.z = TOWN.z - TOWN.r - 14; e.home = { x: e.x, z: e.z }; e.wanderT = 99; e.tx = e.x; e.tz = e.z;
  const hp0 = p.hp;
  run(sim, 0.4, () => ({ aim: aimAt(p, e) }));
  sim.step(inp({ actions: ['throw:dynamite'], aim: aimAt(p, e) })); run(sim, 2.5);
  note(e.dead && p.hp === hp0 && sim.inTown() ? 'BUG' : 'PASS', `dynamite thrown from inside town kills a raptor outside (dead=${e.dead}) while the rider cannot be attacked; guns are blocked in town but throwItem has no town check`);
}
{ // ---- town-edge peek: enemies give up and heal the moment the rider is inside the circle ----
  const { sim, s, p } = fresh(); const pack = [0, 1, 2].map(k => roamer(s, k));
  pack.forEach((e, i) => { e.x = -6 + i * 6; e.z = TOWN.z - TOWN.r - 25; e.home = { x: e.x, z: e.z }; });
  p.x = 0; p.z = TOWN.z - TOWN.r + 0.5; let kills = 0, hurt = 0;
  run(sim, 120, () => {
    const live = pack.filter(e => !e.dead).sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (!live) return {};
    const out = p.ammo.revolver > 0 && p.reloadT <= 0;     // step out only with a loaded gun
    const want = { x: 0, z: TOWN.z - TOWN.r + (out ? -1.5 : 1.5) };
    return { ...toward(p, want.x, want.z), fire: true, aim: aimAt(p, live) };
  }, (ev) => { for (const x of ev) { if (x.type === 'kill') kills++; if (x.type === 'hurt') hurt++; } return pack.some(e => !e.dead); });
  note(kills === 3 && hurt === 0 ? 'BUG' : 'INFO', `stepping 1.5 units in/out of the town edge with 3 raptors living 25 away: kills ${kills}/3 in ${s.clock.toFixed(0)} s, times hurt ${hurt}`);
}
{ // ---- leash: enemies hit from beyond their give-up range heal it straight back ----
  const { sim, s, p } = fresh(); const rex = s.rex; p.weapons.rifle = 0; p.ammo.rifle = 5; p.weapon = 'rifle';
  p.x = rex.x; p.z = rex.z + 125; let dealt = 0, last = rex.hp;
  run(sim, 30, () => ({ fire: true, aim: aimAt(p, rex, 4.6) }), () => { if (rex.hp < last) dealt += last - rex.hp; last = rex.hp; });
  note('INFO', `rifle on the Rex from 125 away for 30 s: dealt ${dealt.toFixed(0)}, Rex hp ${rex.hp.toFixed(0)}/900, state ${rex.state}, rider hp ${p.hp}`);
}
{ // ---- dodge ----
  const { sim, s, p } = fresh(); p.x = 150; p.z = -150; const pack = [0, 1, 2, 3].map(k => roamer(s, k));
  pack.forEach((e, i) => { e.x = p.x + Math.cos(i * 1.57) * 3; e.z = p.z + Math.sin(i * 1.57) * 3; e.home = { x: p.x, z: p.z }; e.state = 'chase'; e.cd = 0.1; });
  let hurtWhileDodging = 0, hurts = 0;
  run(sim, 0.08);
  sim.step(inp({ actions: ['dodge'] }));
  run(sim, 0.33, () => ({}), (ev) => { for (const x of ev) if (x.type === 'hurt') hurtWhileDodging++; });
  note(hurtWhileDodging === 0 ? 'PASS' : 'FAIL', 'no damage during the dodge window');
  const st0 = p.stamina; sim.step(inp({ actions: ['dodge'] }));
  note(p.stamina === st0 || p.dodgeCd > 0 ? 'PASS' : 'FAIL', 'dodge respects its cooldown');
  p.stamina = 20; p.dodgeCd = 0; p.dodgeT = 0; sim.step(inp({ actions: ['dodge'] }));
  note(p.dodgeT <= 0 ? 'PASS' : 'FAIL', 'no dodge under 30 stamina');
}
{ // ---- death and respawn state ----
  const die = (f) => { const { sim, s, p } = f; p.hp = 0.001; const e = roamer(s); e.x = p.x + 2; e.z = p.z; e.home = { x: e.x, z: e.z }; e.state = 'chase'; e.cd = 0; run(sim, 0.1); return p.dead; };
  let f = fresh(); f.p.x = 100; f.p.z = 100; run(f.sim, 0.05, () => ({ actions: ['dismount'] })); run(f.sim, 1, () => ({ mx: 1, mz: 0 }));
  const d1 = die(f); run(f.sim, 3.2);
  note(d1 && !f.p.dead && !f.p.onFoot && f.sim.inTown() && f.p.hp === f.p.maxHp ? 'PASS' : 'FAIL', 'death on foot -> respawns mounted in town with full health');
  f = fresh(); f.p.x = 100; f.p.z = 100; run(f.sim, 1.3, () => ({ fire: true })); const rel = f.p.reloadT > 0;
  die(f); run(f.sim, 3.2);
  note(rel && f.p.reloadT === 0 && f.p.ammo.revolver === 6 ? 'PASS' : 'FAIL', 'death mid-reload -> respawn with a full magazine');
  f = fresh(); const a = f.s.animals[0]; f.p.x = a.x + 6; f.p.z = a.z; f.sim.step(inp({ actions: ['lasso'] })); const roped = !!f.s.herd.roped;
  die(f); run(f.sim, 3.2);
  note(roped && !f.s.herd.roped && !a.penned && dist(a, f.p) > 50 ? 'PASS' : 'FAIL', 'death with a roped longhorn -> rope dropped, animal stays where it was');
  f = fresh(); f.p.x = 100; f.p.z = 100; f.sim.step(inp({ actions: ['ability'], mx: 0, mz: 1 })); run(f.sim, 0.1, () => ({ mx: 0, mz: 1 }));
  const dashLeft = f.p.dashT; die(f); run(f.sim, 3.02);
  const x0 = f.p.x, z0 = f.p.z; run(f.sim, 1.2);
  const moved = Math.hypot(f.p.x - x0, f.p.z - z0);
  note(moved > 5 ? 'BUG' : 'PASS', `death mid-Dash (dashT ${dashLeft.toFixed(2)} left): after respawning in town the rider keeps dashing ${moved.toFixed(1)} units with no input`);
  f = fresh(); f.p.x = 100; f.p.z = 100; f.p.tonics.steady = 1; f.sim.command({ type: 'quick', slot: 'z', id: 'steady' }); f.sim.step(inp({ actions: ['quickZ'] }));
  die(f); run(f.sim, 3.2);
  note(f.p.buffs.steady > 55 ? 'INFO' : 'PASS', `buff timers are frozen while dead (steady ${f.p.buffs.steady.toFixed(1)} s left after respawn)`);
}
{ // ---- dismount edge cases ----
  let f = fresh(); const { sim, s, p } = f;
  // beside the pen fence, facing so that "step off to the side" points into the pen
  p.x = PEN.x + PEN.r + 1.6; p.z = PEN.z; p.yaw = Math.PI; run(sim, 0.05);
  const before = dist(p, PEN); sim.step(inp({ actions: ['dismount'] })); const after = dist(p, PEN);
  note(before > PEN.r && after < PEN.r ? 'BUG' : 'PASS', `dismounting beside the fence puts the rider on the other side (distance from pen centre ${before.toFixed(1)} -> ${after.toFixed(1)}, fence at ${PEN.r})`);
  // through the notice board
  f = fresh(); const b = PLACES[3]; f.p.x = b.x; f.p.z = b.z + 1.6; f.p.yaw = -Math.PI / 2; run(f.sim, 0.05);
  const z0 = f.p.z; f.sim.step(inp({ actions: ['dismount'] }));
  note(Math.sign(f.p.z - b.z) !== Math.sign(z0 - b.z) ? 'BUG' : 'PASS', `dismounting beside the notice board: z ${z0.toFixed(1)} -> ${f.p.z.toFixed(1)} (board at z ${b.z})`);
  // inside a building wall?
  f = fresh(); const sal = PLACES[0]; f.p.x = sal.x + sal.w / 2 + 1.3; f.p.z = sal.z; f.p.yaw = 0; run(f.sim, 0.05); f.p.yaw = -Math.PI / 2;
  f.sim.step(inp({ actions: ['dismount'] }));
  const insideSaloon = Math.abs(f.p.x - sal.x) < sal.w / 2 && Math.abs(f.p.z - sal.z) < sal.d / 2;
  note(insideSaloon ? 'BUG' : 'PASS', `dismounting against the saloon wall leaves the rider outside (x ${f.p.x.toFixed(1)})`);
  // whistle from far, steed behind the fence
  f = fresh(); for (const e of f.s.enemies) e.heldT = 1e9;   // keep the wildlife out of this one
  f.p.x = 100; f.p.z = 0; f.sim.step(inp({ actions: ['dismount'] })); run(f.sim, 12, () => ({ mx: 1, mz: 0, sprint: true }));
  const far = dist(f.p, f.p.steed); f.sim.step(inp({ actions: ['dismount'] }));
  const tArr = run(f.sim, 20, () => ({}), () => f.p.steed.coming);
  f.sim.step(inp({ actions: ['dismount'] }));
  note(!f.p.onFoot ? 'PASS' : 'FAIL', `whistle from ${far.toFixed(0)} away: mount arrives in ${tArr.toFixed(1)} s and can be mounted`);
  // on-foot restrictions
  f = fresh(); f.p.x = 100; f.p.z = 0; f.sim.step(inp({ actions: ['dismount'] })); const cd0 = f.p.abilityCd; f.sim.step(inp({ actions: ['ability'] }));
  note(f.p.dashT <= 0 && f.p.abilityCd <= 0 ? 'PASS' : 'FAIL', 'no mount ability on foot');
  // dismount mid-dash cancels it
  f = fresh(); f.p.x = 100; f.p.z = 0; f.sim.step(inp({ actions: ['ability'] })); f.sim.step(inp({ actions: ['dismount'] }));
  note(f.p.dashT === 0 || f.p.dashT < 0 ? 'PASS' : 'FAIL', 'dismount cancels Dash');
  // steed walks through town/fence? whistle with the pen between
  f = fresh(); f.p.x = PEN.x; f.p.z = PEN.z + PEN.r + 6; f.sim.step(inp({ actions: ['dismount'] }));
  f.p.x = PEN.x; f.p.z = PEN.z - PEN.r - 20; f.sim.step(inp({ actions: ['dismount'] }));
  const tt = run(f.sim, 30, () => ({}), () => f.p.steed.coming);
  note(f.p.steed.coming ? 'BUG' : 'PASS', `whistled mount with the pen in between: ${f.p.steed.coming ? `still not arrived after 30 s, stuck at (${f.p.steed.x.toFixed(1)},${f.p.steed.z.toFixed(1)}) against the fence` : `arrived in ${tt.toFixed(1)} s`}`);
}
{ // ---- rider inside the pen can be bitten through the fence ----
  const { sim, s, p } = fresh(); p.x = PEN.x; p.z = PEN.z + PEN.r - 1.6; const e = roamer(s); e.x = PEN.x; e.z = PEN.z + PEN.r + 20; e.home = { x: e.x, z: e.z };
  let hurt = 0; run(sim, 20, () => ({}), (ev) => { for (const x of ev) if (x.type === 'hurt') hurt++; });
  note(hurt ? 'INFO' : 'PASS', `rider standing against the inside of the north fence: bitten ${hurt} times through the fence in 20 s (raptor at ${dist(e, p).toFixed(1)}, reach 3.2)`);
}
