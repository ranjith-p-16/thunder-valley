// Long soak: 7 seeds x 25 simulated minutes of random actions, commands and reloads from late-game states.
import { lateGame, check, note, clone, createSim, sane, STEP, QUESTS, heightAt } from './50-lib.js';
import { PLACES } from '../../src/data/items.js';
import { rng } from '../../src/sim/terrain.js';

const MIN = +process.argv[2] || 25;
const ACTIONS = ['tame', 'swap', 'melee', 'ability', 'order', 'holler', 'lasso', 'dodge', 'dismount', 'throw:bolas', 'throw:trap', 'throw:dynamite', 'weapon0', 'weapon1', 'weapon2', 'weapon3', 'quickZ', 'quickX', 'reload', 'throw:nope', 'weapon9', 42, null];
const SPOTS = [[0, -10], [-16, -6], [17, -6], [-20, -24], [12, -25], [0, 20], [0, 34], [-215, -70], [205, -35], [185, 20], [120, -90], [-140, 60], [40, 170], [-70, -170], [85, 55], [0, -44], [0, 27], [284, 284], [-285, 0]];

function insideScenery(sim) {
  const s = sim.state, out = [];
  const test = (who, b, r) => {
    for (const pl of PLACES) if (Math.abs(b.x - pl.x) < pl.w / 2 - 0.2 && Math.abs(b.z - pl.z) < pl.d / 2 - 0.2 && pl.d > 1) out.push(`${who} inside ${pl.id}`);
    for (const o of s.obstacles.trees) if (Math.abs(o.x - b.x) < 3 && Math.hypot(o.x - b.x, o.z - b.z) < o.r * 0.5) out.push(`${who} inside a tree`);
  };
  test('rider', s.player, 1.2);
  for (const m of s.mates) test(`mate ${m.id}`, m);
  for (const e of s.enemies) if (!e.dead && !e.gone) test(`enemy ${e.kind}`, e);
  for (const a of s.animals) if (!a.dead) test('longhorn', a);
  return out;
}

function soak(seed, start) {
  let g = lateGame(seed, { level: 12 }), sim = g.sim; const r = rng(seed * 7919 + 1);
  if (start === 'hold' || start === 'standing') {
    const s = sim.state; s.town.owned = false; Object.assign(s.town, { owned: false }); s.story.quest = 11; s.story.step = start === 'hold' ? 2 : 0; s.story.standing = start === 'hold' ? 80 : 20; s.story.done = QUESTS.slice(0, 11).map(q => q.id); sim.story.enter();
  }
  const problems = new Map(), add = (p) => problems.set(p, (problems.get(p) || 0) + 1);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const junk = () => pick([0, 1, 2, 3, 4, 5, 6, -1, 2.5, '1', null, undefined, NaN, 1e9]);
  const randomCmd = () => {
    const k = Math.floor(r() * 26);
    if (k === 0) return { type: 'talk' }; if (k === 1) return { type: 'say', i: junk() }; if (k === 2) return { type: 'leave' };
    if (k === 3) return { type: 'order', id: pick(['follow', 'hold', 'attack', 'herd', 'x', null]) };
    if (k === 4) return { type: 'string', i: junk() }; if (k === 5) return { type: 'mount', i: junk() };
    if (k === 6) return { type: 'townUpgrade' }; if (k === 7) return { type: 'townSupply' }; if (k === 8) return { type: 'townPay' };
    if (k === 9) return { type: 'buy', kind: 'thrown', id: pick(['bolas', 'trap', 'dynamite', 'x']) };
    if (k === 10) return { type: 'buy', kind: 'tonic', id: pick(['jerky', 'tonic', 'brew', 'steady', 'salve', 'herb']) };
    if (k === 11) return { type: 'buy', kind: pick(['weapon', 'gear']), id: pick(['rifle', 'shotgun', 'bow', 'duster', 'vest', 'pack', 'war', 'light', 'charm', 'spurs']) };
    if (k === 12) return { type: 'buy', kind: 'mount', i: junk() };
    if (k === 13) return { type: 'sell', id: pick(['hide', 'meat', 'claws', 'x']) };
    if (k === 14) return { type: 'upgrade', kind: pick(['weapon', 'gear']), id: pick(['revolver', 'rifle', 'duster', 'pack']) };
    if (k === 15) return { type: 'equip', id: pick(['duster', 'vest', 'pack', 'war', 'light', 'charm', 'spurs']) };
    if (k === 16) return { type: 'skill', tree: pick(['gunslinger', 'wrangler', 'marshal', 'x']) };
    if (k === 17) return { type: 'quick', slot: pick(['z', 'x', 'q']), id: pick(['jerky', 'tonic', 'brew', 'steady', 'salve', 'herb']) };
    if (k === 18) return { type: 'rest' }; if (k === 19) return { type: 'takeJob', i: junk() }; if (k === 20) return { type: 'dropJob' }; if (k === 21) return { type: 'turnIn' };
    if (k === 22) return pick([null, 5, 'x', {}, { type: 5 }, { type: 'nope' }]);
    return { type: 'talk' };
  };
  let inp = {}, until = 0, steps = Math.round(MIN * 60 / STEP), reloads = 0, raids = 0, wasRaid = false, deaths = 0, wasDead = false, tames = 0, maxEnemies = 0, maxLoot = 0, err = null;
  try {
    for (let i = 0; i < steps; i++) {
      const s = sim.state, p = s.player;
      if (i >= until) {
        until = i + 20 + Math.floor(r() * 200);
        const a = r() * 6.28, near = s.enemies.filter(e => !e.dead && !e.gone).sort((x, y) => Math.hypot(x.x - p.x, x.z - p.z) - Math.hypot(y.x - p.x, y.z - p.z))[0];
        const fire = r() < 0.5; let aim = null;
        if (fire && near && r() < 0.8) { const oy = heightAt(p.x, p.z) + 4, dx = near.x - p.x, dy = heightAt(near.x, near.z) + 1.6 - oy, dz = near.z - p.z, len = Math.hypot(dx, dy, dz) || 1; aim = { ox: p.x, oy, oz: p.z, dx: dx / len, dy: dy / len, dz: dz / len, yaw: Math.atan2(dx, dz) }; }
        if (r() < 0.03) aim = pick([{ ox: NaN }, 'x', { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 }, { ox: 1e308, oy: 0, oz: 0, dx: 1, dy: 0, dz: 0 }]);
        inp = { mx: r() < 0.2 ? 0 : Math.cos(a), mz: r() < 0.2 ? 0 : Math.sin(a), sprint: r() < 0.5, fire, aim };
        if (near && r() < 0.3) { inp.mx = near.x - p.x; inp.mz = near.z - p.z; }
      }
      const actions = r() < 0.06 ? [pick(ACTIONS)] : [];
      if (r() < 0.002) actions.push('tame', 'swap', 'ability', 'melee', 'dismount');
      const ev = sim.step({ ...inp, actions });
      for (const e of ev) { if (e.type === 'tamed') tames++; }
      if (r() < 0.01) sim.command(randomCmd());
      if (s.dialogue && r() < 0.05) sim.command({ type: 'say', i: Math.floor(r() * 3) });
      if (r() < 0.0015) { const [x, z] = pick(SPOTS); p.x = x + (r() - 0.5) * 6; p.z = z + (r() - 0.5) * 6; }
      if (r() < 0.0004 && s.town.owned && !s.town.raid) s.town.raidIn = Math.min(s.town.raidIn, 3);
      if (r() < 0.0005) { p.money += 500; p.thrown.bolas = 5; p.thrown.trap = 3; }
      // set up a tame now and then so taming is exercised for real
      if (r() < 0.0006) { const w = s.enemies.find(e => sim.tameable(e)); if (w) { w.x = p.x + 4; w.z = p.z; w.hp = w.maxHp * 0.2; w.heldT = 8; sim.step({ actions: ['tame'] }); } }
      if (!!s.town.raid && !wasRaid) raids++; wasRaid = !!s.town.raid;
      if (p.dead && !wasDead) deaths++; wasDead = p.dead;
      maxEnemies = Math.max(maxEnemies, s.enemies.length); maxLoot = Math.max(maxLoot, s.loot.length);
      if (i % 20 === 0) { for (const b of sane(sim)) add(b); if (i % 200 === 0) for (const b of insideScenery(sim)) add(b); }
      if (r() < 1 / (150 * 60)) {
        const save = clone(sim.snapshot()), again = createSim(seed + reloads + 1);
        if (!again.restore(save)) { add('restore refused its own save'); continue; }
        const b = sane(again); for (const x of b) add(`after reload: ${x}`);
        const a = again.state, c = sim.state;
        if (a.player.money !== c.player.money || a.player.level !== c.player.level || JSON.stringify(a.player.mountLv) !== JSON.stringify(c.player.mountLv) || a.town.treasury !== Math.round(c.town.treasury) || a.mates.length !== c.mates.length || a.story.quest !== c.story.quest || a.town.owned !== c.town.owned || a.town.level !== c.town.level)
          add(`reload changed state: money ${c.player.money}->${a.player.money} lvl ${c.player.level}->${a.player.level} mates ${c.mates.length}->${a.mates.length} treasury ${c.town.treasury}->${a.town.treasury} owned ${c.town.owned}->${a.town.owned}`);
        sim = again; reloads++; wasRaid = false;
      }
    }
  } catch (e) { err = e; }
  const s = sim.state;
  return { seed, start, err, problems, reloads, raids, deaths, tames, maxEnemies, maxLoot, end: `level ${s.player.level}, $${s.player.money}, mounts lv ${s.player.mountLv.join('/')}, string ${JSON.stringify(s.player.string)}, town L${s.town.level} $${s.town.treasury} raids won ${s.town.raidsWon} lost ${s.town.raidsLost}, step ${QUESTS[s.story.quest]?.id ?? 'end'}/${s.story.step}` };
}

const plans = [[11, 'late'], [12, 'late'], [13, 'late'], [14, 'late'], [15, 'late'], [16, 'hold'], [17, 'standing']];
for (const [seed, start] of plans) {
  const r = soak(seed, start);
  check(`soak seed ${seed} (${start}) ${MIN} min: no exception`, !r.err, r.err ? `${r.err.stack.split('\n').slice(0, 3).join(' | ')}` : '');
  check(`soak seed ${seed}: no invariant broken`, r.problems.size === 0, [...r.problems].slice(0, 8).map(([k, n]) => `${k} x${n}`).join(' ; '));
  note(`seed ${seed}: reloads ${r.reloads}, raids ${r.raids}, thrown ${r.deaths}x, tames ${r.tames}, most enemies ${r.maxEnemies}, most loot ${r.maxLoot}; ${r.end}`);
}
process.exit(0);
