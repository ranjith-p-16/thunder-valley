// Out-of-order and hostile use of talk / say / order / shop, and save-reload tricks around conversations.
import { createSim, bot, clone, STEP, QUESTS } from './30-lib.js';

const log = (...a) => console.log(...a);
const tryCmd = (sim, cmd) => { try { sim.command(cmd); return 'ok'; } catch (e) { return `THROW ${e.message}`; } };

{ log('--- A. bad say / talk / order');
  const g = bot(createSim()), { sim, s, p } = g;
  const bads = [-1, 99, 1.5, NaN, Infinity, '0', 'length', '__proto__', 'constructor', null, undefined, {}, [], [0], true];
  for (const i of bads) { const r = tryCmd(sim, { type: 'say', i }); if (r !== 'ok' || s.dialogue) log('  say with no dialogue', String(i), r, s.dialogue); }
  for (const c of [null, 5, 'talk', { type: 'order' }, { type: 'order', id: 'herd' }, { type: 'order', id: '__proto__' }, { type: 'say' }, { type: 'talk', i: 3 }, { type: {} }]) { const r = tryCmd(sim, c); if (r !== 'ok') log('  cmd', JSON.stringify(c), r); }
  log('  order with no mates ->', s.order, '(expected follow)');
  g.rideTo(-15, -2.5, 5); sim.command({ type: 'talk' });
  log('  dialogue', s.dialogue?.id);
  for (const i of bads) { const before = s.dialogue?.id; const r = tryCmd(sim, { type: 'say', i }); if (r !== 'ok') log('  say', String(i), r); else if (s.dialogue?.id !== before) { log(`  say ${JSON.stringify(i)} (${typeof i}) advanced ${before} -> ${s.dialogue?.id}`); } }
  sim.command({ type: 'talk' }); log('  talk during dialogue keeps node:', s.dialogue?.id);
  // walk away mid-conversation with steps continuing
  for (let i = 0; i < 600; i++) g.step({ mx: 1, mz: 0, sprint: true });
  log('  walked away, dialogue still', s.dialogue?.id, 'at', p.x.toFixed(0), p.z.toFixed(0), 'step', g.stepOf());
  g.answer(); log('  answered from afar -> step', g.stepOf(), '(a talk started beside Ros is finished 200 m away: accepted, UI pauses)');
}

{ log('--- B. collector: no money, shop during dialogue, reload mid-conversation');
  for (const pick of [0, 1, 2]) {
    const g = bot(createSim(), {}), { sim, s, p } = g;
    g.finish({ until: 'q3/1' });
    const who = sim.story.whereIs('collector'); g.rideTo(who.x, who.z, 5);
    if (pick === 0) {
      p.money = 49; sim.command({ type: 'talk' }); sim.command({ type: 'say', i: 0 });
      log(`  $49 and "Pay": node ${s.dialogue?.id}, flags ${JSON.stringify(s.story.flags)} money ${p.money} (expected: refused, still q3_collector)`);
      p.money = 60; sim.command({ type: 'buy', kind: 'tonic', id: 'jerky' }); sim.command({ type: 'rest' });
      log(`  shop + rest while the collector is talking: money ${p.money}, dialogue ${s.dialogue?.id}, clock ${s.clock.toFixed(0)}`);
      sim.command({ type: 'say', i: 0 }); log(`  then "Pay" with $${p.money}: node ${s.dialogue?.id}`);
      p.money = 500; s.dialogue || sim.command({ type: 'talk' });
    } else sim.command({ type: 'talk' });
    let standing0 = s.story.standing, money0 = p.money;
    // pick the reply, then "reload the page" (main.js saves on beforeunload and on the 'coin' event) before the last node is answered
    for (let n = 0; n < 12; n++) {
      if (!s.dialogue) sim.command({ type: 'talk' });
      sim.command({ type: 'say', i: pick });
      const save = clone(sim.snapshot());
      if (!sim.restore(save)) { log('  restore failed'); break; }
      const who2 = sim.story.whereIs('collector');
      if (!who2) { log('  collector gone after reload: SOFT-LOCK?'); break; }
      p.x = who2.x + 3; p.z = who2.z;
    }
    log(`  reply ${pick} x12 with a reload after each: standing ${standing0} -> ${s.story.standing}, money ${money0} -> ${p.money}, step ${g.stepOf()}, flags ${JSON.stringify(s.story.flags)}`);
  }
}

{ log('--- C. rewards twice? every reward conversation, replayed by talk/say spam');
  const g = bot(createSim(), {}), { sim, s, p } = g;
  let last = '';
  g.finish({ onStep: (key) => {
    // at each new step: spam talk + say 0 five times beside every character and see whether standing or money moves without the step moving
    const before = [s.story.standing, p.money, g.stepOf()];
    for (const n of s.npcs) if (!n.hidden) { const [ox, oz] = [p.x, p.z]; p.x = n.x + 2; p.z = n.z + 2;
      const st = g.cur(); if (st.type === 'talk' && st.npc === n.id) { p.x = ox; p.z = oz; continue; }
      for (let i = 0; i < 5; i++) { sim.command({ type: 'talk' }); for (let k = 0; k < 6 && s.dialogue; k++) sim.command({ type: 'say', i: 0 }); }
      p.x = ox; p.z = oz; }
    const after = [s.story.standing, p.money, g.stepOf()];
    if (String(before) !== String(after)) log('  idle chatter changed something at', key, before, '->', after);
    last = key;
  } });
  log('  finished', g.stepOf(), 'standing', s.story.standing, '(45 expected)');
}

{ log('--- D. standing farm by jobs: take/drop, and trivial jobs');
  const g = bot(createSim(), {}), { sim, s, p } = g;
  p.x = 12; p.z = -25;
  const st0 = s.story.standing;
  for (let i = 0; i < 300; i++) { sim.command({ type: 'takeJob', i: i % 3 }); sim.command({ type: 'dropJob' }); }
  log('  300 take/drop: standing', st0, '->', s.story.standing, 'jobsDone', s.jobsDone, 'enemies', s.enemies.length);
  // hunt contracts with bought?? hides: hides cannot be bought, so count how fast standing can come from hunt jobs given a stock of hides
  p.res.hide = 0; let done = 0;
  for (let round = 0; round < 400 && s.story.standing < 100; round++) {
    const i = s.board.findIndex(j => j.type === 'hunt');
    if (i < 0) { sim.command({ type: 'takeJob', i: 0 }); sim.command({ type: 'dropJob' }); sim.command({ type: 'rest' }); p.money += 10; continue; }
    sim.command({ type: 'takeJob', i }); p.res.hide = s.job.count; sim.command({ type: 'turnIn' }); done++;
  }
  log(`  hunt contracts turned in: ${done}, standing ${s.story.standing} (cap 100), capped ok: ${s.story.standing <= 100}`);
  sim.story.addStanding(1e9); sim.story.addStanding(-1e9); log('  addStanding(+1e9) then (-1e9) ->', s.story.standing);
  sim.story.addStanding(NaN); log('  addStanding(NaN) ->', s.story.standing);
}

{ log('--- E. discount at 25 standing, across save/restore');
  const sim = createSim(), s = sim.state;
  const p0 = sim.economy.price(100);
  sim.story.addStanding(24); const p24 = sim.economy.price(100);
  sim.story.addStanding(1); const p25 = sim.economy.price(100);
  const b = createSim(); b.restore(clone(sim.snapshot()));
  log(`  price(100): standing 0 -> ${p0}, 24 -> ${p24}, 25 -> ${p25}, after restore -> ${b.economy.price(100)} (standing ${b.state.story.standing})`);
  sim.story.addStanding(-5); log(`  back to 20 -> ${sim.economy.price(100)}`);
  // a restore of a low-standing save into a sim that had high standing
  const c = createSim(); c.story.addStanding(80); c.restore(clone(createSim().snapshot())); log(`  fresh save loaded over standing-80 game: price ${c.economy.price(100)} standing ${c.state.story.standing}`);
}

{ log('--- F. dying / on foot at talk + goto steps');
  const g = bot(createSim(), {}), { sim, s, p } = g;
  g.finish({ until: 'q4/1' });
  g.step({ actions: ['dismount'] });
  log('  on foot:', p.onFoot);
  p.x = 100; p.z = 100; g.step();
  log('  on foot inside den radius -> dialogue', s.dialogue?.id);
  p.hp = 1; for (let i = 0; i < 1200 && !p.dead; i++) g.step();
  log('  died with the den conversation open:', p.dead, 'dialogue', s.dialogue?.id);
  for (let i = 0; i < 300; i++) g.step();
  log('  respawned at', p.x.toFixed(0), p.z.toFixed(0), 'dialogue still', s.dialogue?.id);
  g.answer(); log('  answered from the stables -> step', g.stepOf(), 'flags', JSON.stringify(s.story.flags));
  log('  rest of act:', g.finish());
}
