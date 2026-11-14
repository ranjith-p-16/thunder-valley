// Runs the quests in data/story.js: tracks the current step, plays conversations and applies their choices.
import { NPCS, DIALOGUES, QUESTS, STANDING, PLACES_OF_NOTE } from '../data/story.js';
import { TONIC_MAX } from '../data/items.js';
import { MOUNTS, PEN } from '../data/content.js';

const TALK_REACH = 8, MATE_REACH = 16, PICKUP_REACH = 3.5;
const GATE = { x: PEN.x, z: PEN.z - PEN.r };

export function createStory({ state, player, rand, emit, toast, gainXp, spawnEnemy, enemies, herding, economy, posse, town }) {
  // said: replies already given in the current step's conversation (so a reload cannot give them twice).
  // spawned: quest animals already put into the world for the current quest.
  const fresh = () => ({ quest: 0, step: 0, flags: {}, standing: 0, done: [], count: 0, said: {}, spawned: [], taken: [] });
  const story = state.story = fresh();
  state.npcs = NPCS.map(n => ({ ...n, hidden: !!n.hidden }));
  state.pickups = [];
  state.dialogue = null;   // { id, forStep } while a conversation is on screen
  state.callMate = null;   // the posse mate the current step wants to talk to, if any
  let pickupId = 0;

  const quest = () => QUESTS[story.quest] || null;
  // 'flag' is true when set at all; 'flag=value' compares
  const test = (cond) => { const [k, v] = cond.split('='); return v === undefined ? !!story.flags[k] : story.flags[k] === v; };
  const wanted = (s) => (!s.if || test(s.if)) && (!s.unless || !test(s.unless));
  const step = () => quest()?.steps[story.step] || null;
  const tagged = (tag) => enemies.filter(e => e.tag && e.tag.startsWith(tag));
  // Where a character is: Mara rides with the posse once she has joined.
  function whereIs(id) {
    const mate = state.mates.find(m => m.id === id);
    if (mate) return mate;
    const npc = state.npcs.find(n => n.id === id);
    return npc && !npc.hidden ? npc : null;
  }
  // a posse mate rides a few lengths off, so talking to one works from further away
  const reach = (who) => (state.mates.includes(who) ? MATE_REACH : TALK_REACH);

  function addStanding(n) {
    const before = story.standing;
    story.standing = Math.max(0, Math.min(STANDING.max, story.standing + n));
    if (story.standing !== before) emit({ type: 'standing', value: story.standing });
    for (const [mark, text] of STANDING.marks) if (before < mark && story.standing >= mark) toast(`Standing ${mark}: ${text}`);
    economy.recalc();
  }
  // The pack driven off the den lives beside the gang's camp from then on.
  function packAtMesa() {
    const m = PLACES_OF_NOTE.mesaCamp;
    for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28; spawnEnemy('raptor', m.x + 14 + Math.cos(a) * 8, m.z + 6 + Math.sin(a) * 8); }
  }

  function run(actions = []) {
    for (const a of actions) {
      if (a.spawn) {
        const s = a.spawn;
        // spawning is repeat-safe: a tag is only ever spawned once per quest, even if its animals are already dead
        if ((s.onlyIf && !test(s.onlyIf)) || story.spawned.includes(s.tag)) continue;
        story.spawned.push(s.tag);
        for (let i = 0; i < s.n; i++) {
          const ang = (i / s.n) * 6.28 + rand(), r = s.spread * (0.4 + rand() * 0.6);
          spawnEnemy(s.kind, s.x + Math.cos(ang) * r, s.z + Math.sin(ang) * r, null, { tag: s.tag, hpMul: s.hpMul, name: s.name });
        }
      } else if (a.remove) { for (const e of tagged(a.remove)) e.gone = true; }
      else if (a.relocate) {
        for (const e of tagged(a.relocate.tag)) {
          if (e.dead) { e.gone = true; continue; }
          const ang = rand() * 6.28;
          e.home = { x: a.relocate.x + Math.cos(ang) * 8, z: a.relocate.z + Math.sin(ang) * 8 };
          e.state = 'return';
          e.tag = '';   // they are ordinary wild raptors from here on
        }
      } else if (a.trample) {
        for (const e of tagged(a.trample)) if (!e.dead) { e.hp = Math.min(e.hp, e.maxHp * 0.35); e.heldT = 6; e.flashT = 0.3; }
      } else if (a.give) {
        const g = a.give;
        if (g.money) { player.money = Math.max(0, player.money + g.money); emit({ type: 'coin' }); }
        if (g.xp) gainXp(g.xp);
        if (g.standing) addStanding(g.standing);
        for (const id in g.res || {}) economy.addRes(id, g.res[id]);
        for (const id in g.tonic || {}) player.tonics[id] = Math.min(TONIC_MAX, player.tonics[id] + g.tonic[id]);
        if (g.mount !== undefined && !player.mounts[g.mount]) { player.mounts[g.mount] = true; toast(`The ${MOUNTS[g.mount].name} waits for you at the stables`); }
      } else if (a.set) Object.assign(story.flags, a.set);
      else if (a.mate) posse.join(a.mate);
      else if (a.npc) Object.assign(state.npcs.find(n => n.id === a.npc.id), a.npc);
      else if (a.pickups) {
        if (!state.pickups.some(p => p.tag === a.pickups.tag)) for (const [x, z] of a.pickups.points) state.pickups.push({ id: `pick${pickupId++}`, tag: a.pickups.tag, x, z });
      } else if (a.holdHerd) herding.hold(a.holdHerd.herd, a.holdHerd.x, a.holdHerd.z);
      else if (a.freeHerd !== undefined) herding.release(a.freeHerd);
      else if (a.town) { if (a.town.owned) town().claim(); }
      else if (a.supplies) town().addSupplies(a.supplies);
      else if (a.say) emit({ type: 'say', who: a.say.who, text: a.say.text });
      else if (a.toast) toast(a.toast);
    }
  }

  // Begins the current step, skipping any whose condition is not met. Ends the quest when steps run out.
  function enter() {
    const q = quest();
    if (!q) return;
    while (story.step < q.steps.length && !wanted(q.steps[story.step])) story.step++;
    if (story.step >= q.steps.length) {
      story.done.push(q.id);
      story.quest++;
      story.step = 0;
      story.spawned = [];
      emit({ type: 'questdone', title: q.title });
      toast(`Quest complete: ${q.title}`);
      return enter();
    }
    story.count = 0;
    story.taken = [];
    story.said = {};
    story.waveT = 0;
    state.siege = q.steps[story.step].type === 'hold' || !!state.town?.raid;   // a fight for the square (or a raid under way): the town's peace is off
    run(q.steps[story.step].enter);
  }
  function complete() {
    const s = step(), q = quest();
    if (!s) return;
    run(s.then);
    story.step++;
    emit({ type: 'stepdone' });
    enter();
    if (quest() === q && step()) toast(step().text);   // say what comes next, unless the quest just ended
  }

  // ---- conversations ----
  function open(id, forStep) {
    // lines already answered in this step are not asked again: a reload resumes after the last reply given
    for (let n = 0; forStep && n < 12; n++) {
      const node = DIALOGUES[id], i = story.said[id];
      if (i === undefined) break;
      const next = (node.choices || [{ next: node.next }])[i]?.next;
      if (!next) { complete(); return; }
      id = next;
    }
    state.dialogue = { id, forStep };
    emit({ type: 'talk' });
  }
  const node = () => state.dialogue && DIALOGUES[state.dialogue.id];
  // The choices on screen, with whether each can be picked. A node without choices offers "Continue".
  function choices() {
    const n = node();
    if (!n) return [];
    return (n.choices || [{ text: 'Continue', next: n.next }]).map(c => ({ ...c, ok: !c.need || player.money >= (c.need.money || 0) }));
  }
  function choose(i) {
    if (!Number.isInteger(i)) return;
    const c = choices()[i];
    if (!c || !c.ok) return;
    const { id, forStep } = state.dialogue;
    if (forStep) story.said[id] = i;
    run(c.do);
    if (c.next) { state.dialogue.id = c.next; emit({ type: 'talk' }); return; }
    state.dialogue = null;
    if (forStep) complete();
  }
  // Walking away from small talk. A quest conversation has to be answered.
  function leave() { if (state.dialogue && !state.dialogue.forStep) state.dialogue = null; }

  const questTalk = () => {
    const s = step(), who = s?.type === 'talk' ? whereIs(s.npc) : null;
    return who && !player.dead && Math.hypot(who.x - player.x, who.z - player.z) < reach(who) ? { who, s } : null;
  };
  const chatter = () => (player.dead ? null : state.npcs.find(n => !n.hidden && n.idle && Math.hypot(n.x - player.x, n.z - player.z) < TALK_REACH));
  // F beside a character. A quest conversation always wins; small talk gives way to a building at hand.
  function interact(placeAtHand = false) {
    if (state.dialogue || player.dead) return false;
    const q = questTalk();
    if (q) { open(q.s.dialogue, true); return !!state.dialogue; }
    const near = placeAtHand ? null : chatter();
    if (near) { open(near.idle, false); return true; }
    return false;
  }
  const canTalk = (placeAtHand = false) => questTalk()?.who.name || (placeAtHand ? null : chatter()?.name) || null;

  function update(dt = 0) {
    for (let i = state.pickups.length - 1; i >= 0; i--) {
      const p = state.pickups[i];
      if (player.dead || Math.hypot(p.x - player.x, p.z - player.z) > PICKUP_REACH) continue;
      state.pickups.splice(i, 1);
      emit({ type: 'pickup' });
      const s = step();
      if (s?.type === 'collect' && s.tag === p.tag) { story.count++; story.taken.push(`${p.x},${p.z}`); toast(`${story.count} / ${s.count}`); }
    }
    const s = step();
    state.callMate = s?.type === 'talk' && state.mates.some(m => m.id === s.npc) ? s.npc : null;
    if (!s || state.dialogue) return;
    // the world can overtake a step (the Alpha killed before you were asked what to do with it): move on to one that still applies
    if (!wanted(s)) { story.step++; enter(); return; }
    if (s.type === 'standing') { if (story.standing >= s.min) complete(); }
    else if (s.type === 'slay') { if (state.rex.dead) complete(); }
    else if (s.type === 'hold') {
      // waves ride in from the edge of town and come straight for the rider
      story.waveT -= dt;
      if (story.waveT <= 0 && !player.dead && tagged('hold').filter(e => !e.dead && !e.gone).length < (s.wave.most || 6)) {
        story.waveT = s.wave.every;
        for (let i = 0; i < s.wave.n; i++) {
          const a = rand() * 6.28, d = s.r + 24;
          const e = spawnEnemy(s.wave.kind, s.x + Math.cos(a) * d, s.z + Math.sin(a) * d, null, { tag: 'hold' });
          Object.assign(e, { home: { x: s.x, z: s.z }, state: 'chase', provokedT: 1e6 });
        }
      }
      if (player.dead) {
        // thrown: the gang holds the square again and the stand starts over
        if (story.count > 0) toast('The square is lost. Take it back');
        story.count = 0;
        story.waveT = 6;
        for (const e of tagged('hold')) e.gone = true;
      } else if (Math.hypot(s.x - player.x, s.z - player.z) < s.r) story.count += dt;
      if (story.count >= s.time) { for (const e of tagged('hold')) e.gone = true; complete(); }
    }
    else if (s.type === 'clear') { if (!tagged(s.tag).some(e => !e.dead && !e.gone)) complete(); }
    else if (s.type === 'pen' || s.type === 'collect') { if (story.count >= s.count) complete(); }
    else if (s.type === 'goto' && !player.dead && Math.hypot(s.x - player.x, s.z - player.z) < s.r) {
      if (s.dialogue) open(s.dialogue, true); else complete();
    }
  }
  function onPenned(animal) {
    const s = step();
    if (s?.type === 'pen' && (s.herd === undefined || animal.herd === s.herd)) story.count++;
  }
  function onHoller() {
    const s = step();
    if (s?.type === 'holler' && Math.hypot(s.x - player.x, s.z - player.z) < s.r) complete();
    // driving the Alpha: only once it is worn down, and only from close by
    if (s?.type === 'drive') {
      const rex = state.rex, near = Math.hypot(rex.x - player.x, rex.z - player.z) < 45;
      if (rex.dead) return;
      if (rex.hp > rex.maxHp * s.below) return toast('The Alpha is not worn down enough to turn');
      if (!near) return toast('Get closer to the Alpha before you holler');
      if (s.x !== undefined && Math.hypot(rex.x - s.x, rex.z - s.z) > 170) return toast('Draw the Alpha back toward the hollow first');
      // he goes back into the hollow for good: home, calm, and out of the fight
      Object.assign(rex, { state: 'return', provokedT: 0, hp: rex.maxHp });
      story.flags.rexhome = true;
      toast('The Alpha turns for the hollow. The pass comes down behind him');
      complete();
    }
  }
  function onJobDone() { addStanding(STANDING.perJob); }

  // One objective line for the display, and where the map should point.
  function status() {
    const q = quest(), s = step();
    if (!q || !s) return null;
    let line = s.text, mark = null;
    if (s.type === 'talk') { const who = whereIs(s.npc); if (who) mark = { x: who.x, z: who.z }; }
    else if (s.type === 'clear') { const left = tagged(s.tag).filter(e => !e.dead && !e.gone); line += ` (${left.length} left)`; if (left[0]) mark = { x: left[0].x, z: left[0].z }; }
    else if (s.type === 'standing') line += ` · now ${story.standing}`;
    else if (s.type === 'slay' || s.type === 'drive') { const r = state.rex; line += ` · Alpha at ${Math.max(0, Math.round((r.hp / r.maxHp) * 100))}%`; mark = { x: r.x, z: r.z }; }
    else if (s.type === 'hold') { const left = Math.max(0, s.time - story.count); line += ` ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`; mark = { x: s.x, z: s.z };
      if (!player.dead && Math.hypot(s.x - player.x, s.z - player.z) >= s.r) line = 'You have left the square: the clock has stopped. Get back in!'; }
    else if (s.type === 'pen') { line += ` ${story.count}/${s.count}`; mark = GATE; }
    else if (s.type === 'collect') { line += ` ${story.count}/${s.count}`; const p = state.pickups.find(k => k.tag === s.tag); mark = p ? { x: p.x, z: p.z } : s.x !== undefined ? { x: s.x, z: s.z } : null; }
    else mark = { x: s.x, z: s.z };
    return { title: q.title, line, mark };
  }

  const snapshot = () => JSON.parse(JSON.stringify({ quest: story.quest, step: story.step, flags: story.flags, standing: story.standing, done: story.done,
    count: story.count, said: story.said, taken: story.taken, npcs: state.npcs.map(n => ({ id: n.id, hidden: n.hidden })) }));
  // Loading puts the world back as the current step needs it; progress within the step (count, replies given) is kept.
  function restore(save) {
    Object.assign(story, fresh(), save && { quest: save.quest, step: save.step, flags: save.flags, standing: save.standing, done: save.done });
    state.dialogue = null;
    state.pickups = [];
    state.callMate = null;
    state.npcs = NPCS.map(n => ({ ...n, hidden: !!n.hidden }));
    for (const n of save?.npcs || []) { const npc = state.npcs.find(k => k.id === n.id); if (npc) npc.hidden = n.hidden; }
    if (story.flags.den === 'driven') packAtMesa();
    enter();
    if (save) { story.count = step()?.type === 'hold' ? 0 : save.count || 0; story.said = save.said || {}; }
    // herbs already picked stay picked
    const s = step();
    if (s?.type === 'collect') {
      const taken = Array.isArray(save?.taken) ? save.taken.filter(k => typeof k === 'string').slice(0, 50) : null;
      if (taken && taken.length === story.count) { story.taken = taken; state.pickups = state.pickups.filter(p => !taken.includes(`${p.x},${p.z}`)); }
      else state.pickups.splice(0, Math.min(story.count, state.pickups.length));
    }
  }

  return { enter, update, interact, canTalk, node, choices, choose, leave, status, onPenned, onHoller, onJobDone, addStanding, snapshot, restore, whereIs };
}
