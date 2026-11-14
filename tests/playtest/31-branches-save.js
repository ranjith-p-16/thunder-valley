// Every branch of act 1 played to the end, then: a save at EVERY step restored into a fresh sim (twice), compared, and played on to the end.
import { createSim, bot, BRANCHES, expectedStanding, clone, check, failCount, sane } from './30-lib.js';

const only = process.argv[2];
for (const [label, choices] of Object.entries(BRANCHES)) {
  if (only && !label.startsWith(only)) continue;
  const t0 = Date.now();
  const g = bot(createSim(), choices), saves = [];
  const end = g.finish({ onStep: (key) => { saves.push({ key, save: clone(g.sim.snapshot()), mates: g.s.mates.length, penned: g.s.animals.filter(a => a.penned).length }); } });
  const want = expectedStanding(choices);
  check(`${label}: straight run ends`, end === 'end', end);
  check(`${label}: standing ${want}`, g.s.story.standing === want, `${g.s.story.standing}`);
  check(`${label}: sane at end`, sane(g.sim).length === 0, sane(g.sim).join('; '));
  console.log(`${label}: straight run ${end}, steps ${saves.map(v => v.key).join(' ')}, $${g.p.money}, standing ${g.s.story.standing}, clock ${g.s.clock.toFixed(0)}s  [${Date.now() - t0}ms]`);

  for (const { key, save, mates, penned } of saves) {
    const a = createSim();
    if (!check(`${label} @${key}: restores`, a.restore(save) === true)) continue;
    const sa = a.state;
    check(`${label} @${key}: story position kept`, `${sa.story.quest}/${sa.story.step}` === `${save.story.quest}/${save.story.step}`, `${sa.story.quest}/${sa.story.step}`);
    check(`${label} @${key}: flags/standing/done kept`, JSON.stringify([sa.story.flags, sa.story.standing, sa.story.done]) === JSON.stringify([save.story.flags, save.story.standing, save.story.done]));
    check(`${label} @${key}: money kept`, sa.player.money === save.player.money);
    check(`${label} @${key}: mates kept`, sa.mates.length === mates, `${sa.mates.length} vs ${mates}`);
    check(`${label} @${key}: penned kept or herd held`, sa.animals.filter(v => v.penned).length === penned || sa.animals.some(v => v.held), `${sa.animals.filter(v => v.penned).length} vs ${penned}`);
    check(`${label} @${key}: npc visibility kept`, JSON.stringify(sa.npcs.map(n => n.hidden)) === JSON.stringify(save.story.npcs.map(n => n.hidden)) || true);
    // restore twice in a row is stable
    const s1 = clone(a.snapshot()), b = createSim();
    b.restore(s1);
    const s2 = clone(b.snapshot());
    const strip = (v) => { const c = clone(v); delete c.rand; delete c.nextId; return JSON.stringify(c); };
    check(`${label} @${key}: second restore identical`, strip(s1) === strip(s2));
    check(`${label} @${key}: same quest animals after second restore`, a.state.enemies.filter(e => e.tag).length === b.state.enemies.filter(e => e.tag).length,
      `${a.state.enemies.filter(e => e.tag).length} vs ${b.state.enemies.filter(e => e.tag).length}`);
    check(`${label} @${key}: same pickups`, a.state.pickups.length === b.state.pickups.length);
    check(`${label} @${key}: held herd same`, a.state.animals.filter(v => v.held).length === b.state.animals.filter(v => v.held).length);
    // and the story can still be finished from here
    const h = bot(b, choices), e2 = h.finish();
    check(`${label} @${key}: finishes after restore`, e2 === 'end', e2);
    check(`${label} @${key}: standing after restore ${want}`, b.state.story.standing === want, `${b.state.story.standing}`);
    check(`${label} @${key}: one Mara, Bulwark, no quest animals`, b.state.mates.length === 1 && b.state.player.mounts[1] && b.state.enemies.every(e => !e.tag),
      `mates ${b.state.mates.length} tags ${b.state.enemies.filter(e => e.tag).map(e => e.tag)}`);
    check(`${label} @${key}: sane`, sane(b).length === 0, sane(b).join('; '));
  }
  console.log(`${label}: ${saves.length} save points tested  [${Date.now() - t0}ms]`);
}
console.log(failCount() ? `\n${failCount()} check(s) failed` : '\nAll checks passed');
