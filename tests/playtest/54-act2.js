// Act 2: every branch, and save/restore at every step then play on to the end.
import { createSim, STEP, QUESTS, heightAt, check, note, clone, sane, idle } from './50-lib.js';

export function bot(sim, choices = {}, { level = 25 } = {}) {
  const s = sim.state, p = s.player;
  if (level) { p.level = Math.max(p.level, level); sim.economy.recalc(); p.hp = p.maxHp; }
  const step = (inp = {}) => sim.step({ ...idle, ...inp });
  const wait = (sec) => { for (let i = 0; i < sec / STEP; i++) step(); };
  const rideTo = (x, z, stop = 3, max = 90) => {
    let lastX = p.x, lastZ = p.z, side = 0, sideT = 0, turn = 1;
    for (let i = 0; i < max / STEP && Math.hypot(p.x - x, p.z - z) > stop && !s.dialogue; i++) {
      const dx = x - p.x, dz = z - p.z;
      if (sideT > 0) { sideT -= STEP; step({ mx: -dz * side + dx * 0.3, mz: dx * side + dz * 0.3, sprint: true }); continue; }
      step({ mx: dx, mz: dz, sprint: true });
      if (i % 30 === 29) { if (Math.hypot(p.x - lastX, p.z - lastZ) < 1.5) { side = turn; turn = -turn; sideT = 0.9; } lastX = p.x; lastZ = p.z; }
    }
    return Math.hypot(p.x - x, p.z - z) <= stop + 1;
  };
  const answer = () => { for (let n = 0; s.dialogue && n < 12; n++) sim.command({ type: 'say', i: choices[s.dialogue.id] ?? 0 }); };
  const talkTo = (id) => { const who = sim.story.whereIs(id); if (!who) return false; rideTo(who.x, who.z, 5); sim.command({ type: 'talk' }); const open = !!s.dialogue; answer(); return open; };
  const aimAt = (t) => {
    const oy = heightAt(p.x, p.z) + 4, dx = t.x - p.x, dy = heightAt(t.x, t.z) + 1.6 - oy, dz = t.z - p.z, len = Math.hypot(dx, dy, dz);
    return { ox: p.x, oy, oz: p.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: Math.atan2(dx, dz) };
  };
  const left = (tag) => s.enemies.filter(e => e.tag.startsWith(tag) && !e.dead && !e.gone);
  const fight = (tag, max = 150, done = () => !left(tag).length) => {
    let dry = 0, close = 20;
    for (let i = 0; i < max / STEP && !done(); i++) {
      const t = left(tag).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (!t) { step(); continue; }
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      const ev = step(d > close ? { mx: t.x - p.x, mz: t.z - p.z, sprint: true } : { fire: true, aim: aimAt(t) });
      if (ev.some(e => e.type === 'hit')) { dry = 0; close = 20; } else if (d <= close && ++dry > 200) { dry = 0; close = Math.max(5, close - 5); }
    }
    return done();
  };
  const stepOf = () => `${QUESTS[s.story.quest]?.id ?? 'end'}/${s.story.step}`;
  const cur = () => QUESTS[s.story.quest]?.steps[s.story.step] || null;
  function advance() {
    const st = cur();
    if (!st) return;
    if (s.dialogue) return answer();
    if (st.type === 'talk') { if (!talkTo(st.npc)) wait(0.5); }
    else if (st.type === 'clear') { const t = left(st.tag)[0]; if (t) { rideTo(t.x, t.z, 26, 60); fight(st.tag, 120); } wait(0.2); }
    else if (st.type === 'goto') { rideTo(st.x, st.z, Math.max(2, st.r - 6)); step(); answer(); }
    else if (st.type === 'standing') wait(1);
    else if (st.type === 'hold') { rideTo(st.x, st.z, 4); const k = stepOf(); fight('hold', 60, () => stepOf() !== k); }
  }
  function finish({ onStep = null, maxTries = 60 } = {}) {
    let last = null, tries = 0;
    while (cur() && tries < maxTries) {
      const key = stepOf();
      if (key !== last) { last = key; tries = 0; if (onStep && onStep(key) === false) return key; }
      advance(); tries++;
    }
    return cur() ? `STALLED at ${stepOf()}` : 'end';
  }
  return { sim, s, p, step, wait, rideTo, talkTo, answer, fight, left, stepOf, cur, advance, finish, aimAt };
}

export function startAct2(seed = 99, standing = 40, mara = true) {
  const sim = createSim(seed), s = sim.state;
  s.story.quest = 6; s.story.step = 0; s.story.standing = standing; s.story.done = QUESTS.slice(0, 6).map(q => q.id);
  if (mara) { sim.posse.join('mara', true); s.npcs.find(n => n.id === 'mara').hidden = true; }
  sim.story.enter();
  return sim;
}

if (process.argv[1].endsWith('54-act2.js')) {
  const W = [0, 1], T = [0, 1, 2], P = [0, 1], M = [0, 1, 2];
  // 1. every branch combination
  let n = 0, bad = 0;
  for (const w of W) for (const t of T) for (const pe of P) for (const m of M) {
    const ch = { q7_wagons: w, q8_tobe: t, q9_pell: pe, q12_done: m };
    const sim = startAct2(99, 40), b = bot(sim, ch), r = b.finish();
    const f = b.s.story.flags, okFlags = f.wagons === ['burned', 'taken'][w] && f.tobe === ['duty', 'guilt', 'revenge'][t] && f.pell === ['spared', 'fought'][pe] && f.mayor === ['kept', 'replaced', 'empty'][m];
    const problems = sane(sim);
    const ok = r === 'end' && okFlags && b.s.town.owned && b.s.mates.length === 3 && !b.s.siege && !problems.length && !b.s.enemies.some(e => e.tag && !e.dead && !e.gone);
    n++; if (!ok) { bad++; check(`branch ${JSON.stringify(ch)}`, false, `${r} flags ${JSON.stringify(f)} mates ${b.s.mates.length} siege ${b.s.siege} ${problems.join(';')} tagged left ${b.s.enemies.filter(e => e.tag && !e.dead && !e.gone).map(e => e.tag)}`); }
    if (w === 0 && t === 0 && m === 0) note(`branch pell=${pe}: finished at clock ${(b.s.clock / 60).toFixed(1)} min, standing ${b.s.story.standing}, level ${b.p.level}, npcs visible: ${b.s.npcs.filter(k => !k.hidden).map(k => k.id).join(',')}`);
  }
  check(`all ${n} branch combinations of act 2 play to the end from Standing 40`, bad === 0, `${bad} failed`);

  // 2. save/restore at every step (and mid-conversation), then play on to the end in the restored game
  for (const ch of [{}, { q7_wagons: 1, q8_tobe: 2, q9_pell: 1, q12_done: 1 }, { q8_tobe: 1, q9_pell: 1, q12_done: 2 }]) {
    const sim = startAct2(99, 40), b = bot(sim, ch), saves = [];
    b.finish({ onStep: (key) => { saves.push([key, clone(sim.snapshot())]); } });
    let failed = [];
    for (const [key, save] of saves) {
      const again = createSim(7);
      if (!again.restore(save)) { failed.push(`${key}: refused`); continue; }
      const b2 = bot(again, ch), k2 = b2.stepOf();
      const r = b2.finish(), pr = sane(again);
      if (k2 !== key || r !== 'end' || pr.length || again.state.mates.length !== 3 || !again.state.town.owned || JSON.stringify(again.state.story.flags) !== JSON.stringify(sim.state.story.flags))
        failed.push(`${key}: restored at ${k2}, result ${r}, mates ${again.state.mates.length}, flags ${JSON.stringify(again.state.story.flags)} ${pr.join(';')}`);
    }
    check(`save at each of ${saves.length} steps, restore, play to the end (${JSON.stringify(ch)})`, failed.length === 0, failed.join(' | '));
  }

  // 3. reload during a fight step: enemies come back in full; reload after the fight is won (step done) keeps it done
  {
    const sim = startAct2(), b = bot(sim, { q9_pell: 1 });
    b.finish({ onStep: (k) => k !== 'q9/2' });
    const pell = b.s.enemies.find(e => e.kind === 'pell'); pell.hp = 10;
    const dil = b.s.enemies.filter(e => e.tag === 'q9d'); dil.forEach(e => { e.dead = true; e.deadT = 0; e.hp = 0; });
    const xp0 = b.p.xp;
    const again = createSim(); again.restore(clone(sim.snapshot()));
    const p2 = again.state.enemies.find(e => e.kind === 'pell'), d2 = again.state.enemies.filter(e => e.tag === 'q9d' && !e.dead);
    note(`reload at q9/2 with Pell at 10 hp and both spitters dead: Pell ${p2?.hp} hp, spitters alive ${d2.length} (the fight starts over; kills made before the reload keep their xp and loot: farmable by reloading)`);
  }
  // 4. mid-conversation reload does not pay twice
  {
    const sim = startAct2(), b = bot(sim, {});
    b.finish({ onStep: (k) => k !== 'q7/2' });
    b.rideTo(165, -55, 8); b.step();
    check('wagons conversation open', b.s.dialogue?.id === 'q7_wagons', b.stepOf());
    const st0 = b.s.story.standing; sim.command({ type: 'say', i: 1 });
    const save = clone(sim.snapshot()); const again = createSim(); again.restore(save);
    check('answer given then reload: quest 7 is done once, reward once', again.state.story.done.includes('q7') && again.state.story.standing === st0 + 5 && again.state.town.supplies === 80, `standing ${st0} -> ${again.state.story.standing} stores ${again.state.town.supplies}`);
  }
  // 5. act 2 without Mara in the posse (e.g. a save from a build where she had not joined)
  {
    const sim = startAct2(99, 40, false); sim.state.npcs.find(n => n.id === 'mara').hidden = true;
    const b = bot(sim, {}), r = b.finish({ maxTries: 12 });
    note(`act 2 with Mara neither in the posse nor in town: ${r}`);
    const sim2 = startAct2(99, 40, false); const b2 = bot(sim2, {}), r2 = b2.finish({ maxTries: 12 });
    note(`act 2 with Mara still standing at the ranch gate (not a mate): ${r2}`);
    // a save whose posse block is missing or damaged
    const sim3 = startAct2(); const b3 = bot(sim3, {}); b3.finish({ onStep: (k) => k !== 'q10/0' });
    const save = clone(sim3.snapshot()); delete save.posse; const a = createSim(); const ok = a.restore(save);
    const b4 = bot(a, {}), r4 = b4.finish({ maxTries: 8 });
    check('SOFT-LOCK? a save without its posse block still lets the story go on', ok && r4 === 'end', `restore ${ok}, mates ${a.state.mates.length}, ${r4}`);
  }
  process.exit(0);
}
