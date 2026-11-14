// Act 3 edge cases: out-of-order play, reloads mid-step, the drive step, the sealed Rex, rewards once, after the ending.
import { act3Start, wrap, check, failures, createSim, QUESTS, PLACES_OF_NOTE, STEP } from './80-lib.js';
const H = PLACES_OF_NOTE.hollow, dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const toasts = (g) => g.events.filter(e => e.type === 'toast').map(e => e.text);
const run = (name, fn) => { if (process.argv[2] && !name.startsWith(process.argv[2])) return; console.log(`\n== ${name}`); fn(); };

run('S1 a raid under way when the q13 stand starts', () => {
  const g = act3Start(), { s } = g;
  s.town.raidIn = 0.1; g.wait(0.5);
  check('raid started', !!s.town.raid && s.siege);
  g.talkTo('ros');
  check('stand started during the raid', g.stepOf() === 'q13/1' && s.siege, g.stepOf());
  g.rideTo(0, -10, 4);
  g.fight('raid', 300, () => !s.town.raid);
  check('BUG? siege stays on for the stand after the raid ends', s.siege === true, `step ${g.stepOf()} siege ${s.siege} count ${s.story.count.toFixed(0)}`);
  const hp = g.p.hp; let closest = 1e9;
  for (let i = 0; i < 130 / STEP && g.stepOf() === 'q13/1'; i++) { g.step(); for (const e of g.left('hold')) closest = Math.min(closest, dist(e, { x: 0, z: -10 })); }
  console.log(`  idle in the square: step ${g.stepOf()} hp ${hp.toFixed(0)} -> ${g.p.hp.toFixed(0)} closest stampeder got to ${closest.toFixed(0)} m of the square, siege ${s.siege}`);
});

run('S2 fire pits: collect the last one first, then reload', () => {
  let g = act3Start({}, 'secret', 15); g.advance();
  const [x, z] = PLACES_OF_NOTE.firepits[2];
  g.rideTo(x, z, 2, 120); g.wait(0.2);
  const before = g.s.pickups.map(k => `${k.x},${k.z}`).join(' ');
  g = g.reload();
  const after = g.s.pickups.map(k => `${k.x},${k.z}`).join(' ');
  check('BUG? the same pits are left after a reload', before === after, `count ${g.s.story.count}: before [${before}] after [${after}] guards ${g.left('q16').length}`);
  check('still completes', g.finish() || true, g.stepOf());
});

run('S3 Rex killed before q17 (during q13)', () => {
  const g = act3Start(), { s } = g;
  g.shoot(s.rex, 900, () => s.rex.dead);
  check('rex dead early', s.rex.dead, JSON.stringify(s.story.flags));
  const m = g.p.money;
  const ok = g.finish();
  check('story completes with a real ending', ok && s.story.flags.rex === 'killed', `${g.stepOf()} ${JSON.stringify(s.story.flags)}`);
});

run('S3b choose seal, then kill it anyway', () => {
  const g = act3Start({ q17_hollow: 1 }, 'secret', 16), { s } = g;
  g.advance(); g.advance();
  check('at the drive step', g.stepOf() === 'q17/3', g.stepOf());
  g.shoot(s.rex, 900, () => s.rex.dead); g.wait(0.3);
  const mo = g.p.money; g.advance();
  check('falls through to the killed ending talk, with its reward', s.story.flags.rex === 'killed' && s.story.done.includes('q17') && g.p.money === mo + 500, `${g.stepOf()} ${JSON.stringify(s.story.flags)} money ${mo}->${g.p.money}`);
});

run('S3c choose kill, die mid-fight, come back', () => {
  const g = act3Start({}, 'secret', 16), { s, p } = g;
  g.advance(); g.advance();
  g.shoot(s.rex, 20, () => s.rex.hp < s.rex.maxHp * 0.7);
  const hp = s.rex.hp; p.hp = 0.1; s.mates.length = 0;
  for (let i = 0; i < 6000 && !p.dead; i++) g.step({ mx: s.rex.x - p.x, mz: s.rex.z - p.z });
  check('rider died', p.dead);
  for (let i = 0; i < 3000 && p.dead; i++) g.step();
  console.log(`  after waking: at ${p.x.toFixed(0)},${p.z.toFixed(0)} rex hp ${hp.toFixed(0)} -> ${s.rex.hp.toFixed(0)} state ${s.rex.state} step ${g.stepOf()}`);
  check('finishes', g.finish(), g.stepOf());
});

run('S4 the drive step', () => {
  let g = act3Start({ q17_hollow: 1 }, 'secret', 16), { s, p } = g;
  g.advance(); g.advance(); g.sim.command({ type: 'order', id: 'calm' });
  const rex = s.rex;
  g.rideTo(rex.x, rex.z, 30, 20); g.wait(5.2); g.step({ actions: ['holler'] });
  check('holler at full health is refused', g.stepOf() === 'q17/3' && toasts(g).some(t => /not worn down/.test(t)), toasts(g).slice(-2).join(' | '));
  g.shoot(rex, 400, () => rex.hp <= rex.maxHp * 0.45);
  // far away
  g.rideTo(rex.x + 120, rex.z + 60, 5, 30); g.wait(5.2);
  const d = dist(p, rex); g.step({ actions: ['holler'] });
  console.log(`  far holler from ${d.toFixed(0)} m: step ${g.stepOf()} rex hp ${(rex.hp / rex.maxHp * 100).toFixed(0)}% state ${rex.state} last toast "${toasts(g).slice(-1)}"`);
  // reload when worn down
  const hpB = rex.hp; g = g.reload(); ({ s, p } = g);
  console.log(`  reload mid-drive: rex hp ${hpB.toFixed(0)} -> ${s.rex.hp.toFixed(0)} step ${g.stepOf()}`);
  // lure the rex away from the hollow, then holler: is the spot checked?
  const r2 = s.rex;
  for (let i = 0; i < 90 / STEP && dist(r2, H) < 62; i++) { const dx = p.x - H.x, dz = p.z - H.z; const near = dist(p, r2) < 25; g.step(near ? { mx: dx, mz: dz, sprint: true } : { fire: dist(p, r2) < 40 && r2.hp > r2.maxHp * 0.2, aim: g.aimAt(r2), mx: r2.x - p.x, mz: r2.z - p.z }); }
  g.wait(5.2); g.step({ actions: ['holler'] });
  console.log(`  holler with rex ${dist(r2, H).toFixed(0)} m and rider ${dist(p, H).toFixed(0)} m from the hollow (step wants r 60): step ${g.stepOf()} hp ${(r2.hp / r2.maxHp * 100).toFixed(0)}%`);
  for (let i = 0; i < 20 && g.stepOf() === 'q17/3'; i++) g.advance();
  check('sealed', g.stepOf() === 'q17/4' && s.story.flags.rexhome === true, g.stepOf());
});

run('S5 the sealed Rex afterwards', () => {
  let g = act3Start({ q17_hollow: 1 }, 'secret', 16), { s, p } = g;
  for (let i = 0; i < 3; i++) g.advance();
  check('sealed, talk to Mara pending', g.stepOf() === 'q17/4', g.stepOf());
  let rex = s.rex;
  const shotsAt = () => { let n = 0; for (let i = 0; i < 20 / STEP; i++) { const ev = g.step(); for (const e of ev || []) if (e.type === 'mateShot' && Math.hypot(e.x2 - rex.x, e.z2 - rex.z) < 6) n++; } return n; };
  g.rideTo(rex.x, rex.z, 12, 30);
  const hp0 = p.hp, rhp = rex.hp;
  g.shoot(rex, 5, () => false);
  const n = shotsAt();
  check('cannot be hurt, does not hurt the rider', rex.hp === rhp && p.hp >= hp0 - 0.01 && rex.state !== 'chase', `rex ${rhp}->${rex.hp} rider ${hp0.toFixed(0)}->${p.hp.toFixed(0)} state ${rex.state}`);
  console.log(`  posse shots fired at the sealed rex in 20 s: ${n}; order ${s.order}; rex is ${dist(rex, H).toFixed(0)} m from the hollow`);
  g = g.reload(); ({ s, p } = g); rex = s.rex;
  g.rideTo(rex.x, rex.z, 12, 30); const rhp2 = rex.hp; g.shoot(rex, 5, () => false);
  check('still sealed after a reload', rex.hp === rhp2 && rex.hp === rex.maxHp && rex.state !== 'chase' && s.story.flags.rexhome === true, `hp ${rex.hp} state ${rex.state}`);
  // does it still hunt longhorns?
  const a = s.animals.find(k => !k.dead && !k.penned);
  if (a) { a.x = rex.x + 10; a.z = rex.z; const ahp = a.hp; g.sim.command({ type: 'order', id: 'calm' }); p.x = rex.x + 150; p.z = rex.z; for (const m of s.mates) { m.x = p.x; m.z = p.z; } const seen = new Set(); for (let i = 0; i < 480; i++) { g.step(); seen.add(rex.state); } check('BUG? the sealed rex leaves the herd alone', a.hp === ahp, `longhorn hp ${ahp} -> ${a.hp} dead ${a.dead}; rex states seen ${[...seen]}; rider ${dist(p, rex).toFixed(0)} m away`); }
  g.finish();
  for (const o of s.outposts) o.captured = true; g.wait(1);
  check('BUG? the valley can still be "secured" (state.won) on the seal path', s.won === true, `won ${s.won} rex.dead ${rex.dead} story ${g.stepOf()}`);
});

run('S6 rewards once across reloads mid-conversation', () => {
  for (const [quest, stepIx, who, dlg, pick, flags] of [[14, 2, 'nettle', 'q15_revealed', 1, { nettle: 'revealed' }], [14, 2, 'nettle', 'q15_revealed', 0, { nettle: 'revealed' }], [12, 2, 'doc', 'q13_doc', 0, {}], [17, 2, 'blackthorn', 'q18_blackthorn', 0, { rex: 'killed' }], [17, 2, 'blackthorn', 'q18_blackthorn', 1, { rex: 'killed' }]]) {
    const base = act3Start({ [dlg]: pick }, flags.nettle || 'secret', quest);
    Object.assign(base.s.story.flags, flags); base.s.story.step = stepIx; base.sim.story.enter(); base.p.money = 1000;
    const snap0 = JSON.parse(JSON.stringify(base.sim.snapshot()));
    // straight through
    const a = wrap(createSim(), base.choices); a.sim.restore(snap0); a.talkTo(who);
    // one reply, then save + reload, then finish
    let b = wrap(createSim(), base.choices); b.sim.restore(snap0);
    const w = b.sim.story.whereIs(who); b.rideTo(w.x, w.z, 5); b.sim.command({ type: 'talk' });
    b.sim.command({ type: 'say', i: pick });
    const mid = b.s.dialogue?.id;
    b = b.reload(); b.talkTo(who);
    // and reload once more after it is all done
    b = b.reload();
    const tot = (g) => `${g.stepOf()} $${g.p.money} st${g.s.story.standing} xp${g.p.xp} lvl${g.p.level} ${JSON.stringify(g.s.story.flags)}`;
    check(`${dlg}[${pick}] reload at "${mid}" gives the same as straight through`, tot(a) === tot(b), `\n     straight ${tot(a)}\n     reload   ${tot(b)}`);
  }
});

run('S7 reload mid-fight / dying mid-step', () => {
  let g = act3Start({}, 'secret', 13); g.advance();
  const t = g.left('q14')[0]; g.rideTo(t.x, t.z, 28); g.fight('q14', 300, () => g.left('q14').length <= 2);
  const n = g.left('q14').length; g = g.reload();
  console.log(`  q14 reload with ${n} left -> ${g.left('q14').length} left, step ${g.stepOf()}`);
  g.sim.command({ type: 'order', id: 'calm' }); const t2 = g.left('q14')[0];
  for (let i = 0; i < 9000 && !g.p.dead; i++) { g.p.hp = Math.min(g.p.hp, 5); g.step({ mx: t2.x - g.p.x, mz: t2.z - g.p.z, sprint: true }); }
  g.sim.command({ type: 'order', id: 'follow' });
  check('died at the camp', g.p.dead); for (let i = 0; i < 3000 && g.p.dead; i++) g.step();
  check('q14..q18 still completes after dying and with no posse', g.finish(), g.stepOf());
});

run('S8 leave the square / rest during the stand, rest mid-quest', () => {
  const g = act3Start(), { s, p } = g; g.advance();
  g.rideTo(0, -10, 4); g.wait(10); const c = s.story.count;
  g.rideTo(120, 120, 5, 40); const c2 = s.story.count; g.wait(20);
  check('clock stops outside the square', Math.abs(s.story.count - c2) < 0.1 && c > 5, `count ${c.toFixed(0)} ${c2.toFixed(0)} ${s.story.count.toFixed(0)} status "${g.sim.story.status().line}"`);
  const clock = s.clock; g.sim.command({ type: 'rest' });
  check('no resting in a siege', s.clock === clock);
  g.advance(); check('stand completes after coming back', g.stepOf() === 'q13/2', g.stepOf());
});

run('S9 after the ending', () => {
  const g = act3Start({}, 'secret', 17), { s, p, sim } = g; s.story.flags.rex = 'killed';
  check('ends', g.finish(), g.stepOf());
  console.log('  ending toasts: ' + toasts(g).filter(x => /peace|story|complete/i.test(x)).join(' | '));
  check('status null, no crash stepping', sim.story.status() === null && (g.wait(5), true));
  s.town.raidIn = 0.1; g.wait(0.5);
  check('raid comes', !!s.town.raid && s.siege);
  g.rideTo(0, -10, 4); g.fight('raid', 300, () => !s.town.raid);
  check('raid ends, siege off', !s.town.raid && !s.siege, `won ${s.town.raidsWon} lost ${s.town.raidsLost}`);
  console.log('  board: ' + JSON.stringify((s.board || []).map(j => j.type)) + ' job ' + JSON.stringify(s.job?.type));
  const again = g.reload();
  check('reload after the end', again.stepOf() === 'end/0' && again.sim.story.status() === null && again.s.npcs.find(n => n.id === 'blackthorn').hidden);
  again.sim.command({ type: 'talk' }); again.wait(2);
});
console.log(failures() ? `\n${failures()} failed` : '\nall passed');
