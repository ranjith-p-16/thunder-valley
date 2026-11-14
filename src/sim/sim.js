// The game rules. Nothing in here draws, plays sound or reads the keyboard: it takes an input
// object each step and reports what happened as events. The same code can later run on a server.
import { WORLD, heightAt, rng, clamp, lerpAngle, angleDiff } from './terrain.js';
import { createObstacles } from './obstacles.js';
import { createHerding } from './herd.js';
import { createEconomy, newInventory } from './economy.js';
import { createJobs } from './jobs.js';
import { createStory } from './story.js';
import { createPosse } from './posse.js';
import { createTown } from './town.js';
import { createFrontier } from './frontier.js';
import { BAIT, HATCH, GIANT, ALPHA, STAGGER } from '../data/frontier.js';
import { QUESTS, NPCS, MATES, ORDERS, DIALOGUES } from '../data/story.js';
import {
  KINDS, MOUNTS, BLOOD_MOON, BEATS, NATURE, STAGES, MOUNT_MAX_LEVEL, TAME, STRING_MAX, MELEE, SWAP_CD, RESPAWN, LUNGE, SPIT, CHARGE, SWEEP, STOMP, CALL, WILD, DASH, RALLY, ROAR, RIDER, DODGE, OUTPOST_DEFS, REX_HOME, CAPTURE, ROAMERS, ROAMER_CLEAR, HERD_SPOTS, HERD, DAY,
  LEASH, PEN,
} from '../data/content.js';
import {
  WEAPONS, WEAPON_ORDER, GRADE_POWER, THROWN, TONICS, TONIC_MAX, GEAR, SKILLS, RESOURCES, LOOT, PEN_PAY, PEN_HOLDS, TOWN, PLACES,
  PLACE_REACH, FOOT, JOBS, BOARD_SIZE,
} from '../data/items.js';

export const STEP = 1 / 60;
export const SAVE_VERSION = 5;
export const NO_INPUT = { mx: 0, mz: 0, sprint: false, fire: false, aim: null, actions: [] };
const MATE_PEN_PAY = 5;
const GUNSHOT_HEARD = 45, LOOT_REACH = 3.5, LOOT_LASTS = 120, SHOT_SAMPLES = 4, TOWN_TOAST_EVERY = 3;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

export function createSim(seed = 99) {
  const rand = rng(seed);
  const obstacles = createObstacles();
  let events = [];
  const emit = (e) => events.push(e);
  const toast = (text) => emit({ type: 'toast', text });

  const player = {
    mount: 0, x: 0, z: -4, ox: 0, oz: -4, yaw: 0, oyaw: 0, hp: RIDER.hp, maxHp: RIDER.hp, stamina: 100,
    level: 1, xp: 0, reloadT: 0, fireCd: 0, hurtT: 99, dead: false, deadT: 0, moving: 0,
    abilityCd: 0, dashT: 0, dodgeT: 0, dodgeCd: 0, dodgeX: 0, dodgeZ: 1,
    onFoot: false, steed: { x: 0, z: 0, ox: 0, oz: 0, yaw: 0, coming: false, stuckT: 0, sd: 0 },
    ...newInventory(),
  };
  const mountOf = () => MOUNTS[player.mount];
  // ---- natures, mount levels and growth ----
  const natureMul = (attacker, defender) => (!attacker || !defender ? 1 : BEATS[attacker] === defender ? NATURE.strong : BEATS[defender] === attacker ? NATURE.weak : 1);
  const stageOf = (i = player.mount) => STAGES[player.mountLv[i] >= STAGES[2].from ? 2 : player.mountLv[i] >= STAGES[1].from ? 1 : 0];
  const mountXpNeeded = (i = player.mount) => Math.round(60 * Math.pow(player.mountLv[i], 1.4));
  const bloodK = (i = player.mount) => 1 + (player.blood?.[i] || 0) * HATCH.bloodDmg;   // a stronger bloodline from the hatchery
  const meleeDamage = (i = player.mount) => MOUNTS[i].melee * stageOf(i).k * (1 + 0.04 * (player.mountLv[i] - 1)) * bloodK(i);
  function mountGainXp(i, n) {
    if (player.mountLv[i] >= MOUNT_MAX_LEVEL) return;
    player.mountXp[i] += n;
    while (player.mountLv[i] < MOUNT_MAX_LEVEL && player.mountXp[i] >= mountXpNeeded(i)) {
      player.mountXp[i] -= mountXpNeeded(i);
      const before = stageOf(i);
      player.mountLv[i]++;
      emit({ type: 'levelup' });
      toast(stageOf(i) !== before ? `Your ${MOUNTS[i].name} is now ${stageOf(i).name}!` : `${MOUNTS[i].name} reached level ${player.mountLv[i]}`);
    }
  }
  const tameable = (e) => !e.dead && !e.gone && !e.bounty && !e.tag && !e.outpost && e !== state.rex && MOUNTS.some(m => m.wild === e.kind);
  const xpNeeded = () => Math.round(100 * Math.pow(player.level, 1.5));
  const inTown = (b = player) => Math.hypot(b.x - TOWN.x, b.z - TOWN.z) < TOWN.r;
  const atPeace = (b = player) => inTown(b) && !state.siege;   // true where no fighting is allowed

  const outposts = OUTPOST_DEFS.map(def => ({ ...def, progress: 0, captured: false }));
  const enemies = [];
  let nextId = 0;
  let townToastAt = -Infinity;
  // provokedT: seconds a wounded animal keeps coming whatever the distance. stuckT/sx/sz/sideT/side/trying: working free of scenery.
  function makeEnemy(id, kind, x, z, yaw, outpost = null, extra = {}) {
    const def = KINDS[kind], maxHp = def.hp * (extra.hpMul || 1);
    const e = {
      id, kind, def, outpost, home: { x, z }, x, z, ox: x, oz: z, yaw, oyaw: 0,
      hp: maxHp, maxHp, state: 'wander', tx: x, tz: z, wanderT: 0, cd: 0, attackT: 0, flashT: 0, scaredT: 0, heldT: 0, moving: 0,
      dead: false, deadT: 0, prey: null, bounty: !!extra.bounty, name: extra.name || '', tag: extra.tag || '', gone: false,
      provokedT: 0, stuckT: 0, sx: x, sz: z, sideT: 0, side: 1, trying: false,
      windT: 0, lungeT: 0, lungeCd: 2, lx: 0, lz: 0, lungeHit: false,
    };
    enemies.push(e);
    return e;
  }
  const spawnEnemy = (kind, x, z, outpost = null, extra = {}) => makeEnemy(`${kind}${nextId++}`, kind, x, z, rand() * 6.28, outpost, extra);
  for (const o of outposts) for (let i = 0; i < o.guards; i++) {
    const a = (i / o.guards) * 6.28;
    spawnEnemy('raptor', o.x + Math.cos(a) * 9, o.z + Math.sin(a) * 9, o);
  }
  for (let i = 0; i < ROAMERS; i++) {
    let x, z;
    // wild packs start well clear of the town, the ranch, the grazing herds, the Rex and the camps
    do { x = (rand() - 0.5) * 480; z = (rand() - 0.5) * 480; } while (
      Math.hypot(x, z) < ROAMER_CLEAR.town || HERD_SPOTS.some(h => Math.hypot(x - h.x, z - h.z) < ROAMER_CLEAR.herd)
      || Math.hypot(x - REX_HOME.x, z - REX_HOME.z) < ROAMER_CLEAR.rex || OUTPOST_DEFS.some(o => Math.hypot(x - o.x, z - o.z) < ROAMER_CLEAR.camp)
      || WILD.some(w => Math.hypot(x - w[1], z - w[2]) < ROAMER_CLEAR.wild));
    const lead = i % ALPHA.every === ALPHA.every - 1, e = spawnEnemy('raptor', x, z, null, lead ? { name: ALPHA.name, hpMul: ALPHA.hp } : {});
    if (lead) { e.alpha = true; e.def = { ...e.def, dmg: e.def.dmg * ALPHA.dmg, xp: e.def.xp * ALPHA.xp }; }
  }
  for (const [kind, x, z, n, spread] of WILD) for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + rand(), r = spread * (0.3 + rand() * 0.7);
    spawnEnemy(kind, x + Math.cos(a) * r, z + Math.sin(a) * r);
  }
  const rex = spawnEnemy('rex', REX_HOME.x, REX_HOME.z);
  const baseEnemies = enemies.length;

  const bullets = Array.from({ length: 64 }, () => ({ x: 0, y: 0, z: 0, ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0, life: 0, dmg: 0, pierce: 0, skip: null, silent: false }));
  const state = { clock: 0, won: false, hint: '', player, enemies, bullets, outposts, rex, obstacles, loot: [], thrown: [], traps: [] };
  const herding = createHerding({ player, enemies, rand, obstacles, gainXp, emit, stats: () => economy.st, onPenned });
  state.animals = herding.animals;
  state.herd = herding.state;
  const economy = createEconomy({ player, state, emit, toast, inTown, herding });
  const { st } = economy;
  const jobs = createJobs({ state, player, rand, emit, toast, gainXp, economy, spawnEnemy, inTown, onDone: () => { story.onJobDone(); frontier.onJobDone(); } });
  // True when nothing solid stands between two points (checked at saddle height): trees and rocks give cover.
  const clearLine = (x1, z1, x2, z2) => {
    const d = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(d / 1.2);
    for (let i = 1; i < n; i++) { const k = i / n, x = x1 + (x2 - x1) * k, z = z1 + (z2 - z1) * k; if (obstacles.blocksShot(x, heightAt(x, z) + 2.2, z)) return false; }
    return true;
  };
  const posse = createPosse({ state, player, emit, toast, enemies, herding, obstacles, damageEnemy, clearLine, atPeace, spare: (e) => e.id === player.tame?.id || (tameable(e) && e.heldT > 0) });
  const story = createStory({ state, player, rand, emit, toast, gainXp, spawnEnemy, enemies, herding, economy, posse, town: () => town });
  // an outsized animal for the frontier's giant sightings
  const makeGiant = (kind, x, z, name) => {
    const e = spawnEnemy(kind, x, z, null, { tag: 'giant', name, hpMul: GIANT.hp });
    e.def = { ...e.def, dmg: e.def.dmg * GIANT.dmg, xp: e.def.xp * GIANT.xp, aggro: Math.max(e.def.aggro, 40) };
    return e;
  };
  const frontier = createFrontier({ state, player, rand, emit, toast, gainXp, mountGainXp, makeGiant, spawnEnemy, storyDone: (id) => state.story.done.includes(id), enemies, damageEnemy, economy, herding, inTown, atPeace, stageOf, natureMul, mountOf,
    addStanding: (n) => story.addStanding(n) });
  const town = createTown({ state, player, rand, emit, toast, gainXp, spawnEnemy, enemies, damageEnemy, economy, inTown });
  player.blindT = 0;
  economy.recalc();
  jobs.refresh();
  story.enter();

  const dayPhase = () => (DAY.start + state.clock / DAY.length) % 1;
  const isNight = () => { const d = dayPhase(); return d < 0.22 || d > 0.8; };
  // the night that starts on every fifth evening is a blood moon
  const bloodMoon = () => { if (!isNight()) return false; const t = DAY.start + state.clock / DAY.length, night = Math.floor(t + 0.2); return night > 0 && night % BLOOD_MOON.every === 0; };
  const weaponDef = () => WEAPONS[player.weapon];
  const magazine = (id = player.weapon) => WEAPONS[id].magazine + st.magazine;
  const damage = (id = player.weapon) => WEAPONS[id].dmg * GRADE_POWER[player.weapons[id]] * Math.pow(RIDER.dmgPerLevel, player.level - 1)
    * st.dmg * (player.buffs.steady > 0 ? TONICS.steady.dmg : 1);

  function gainXp(n) {
    player.xp += Math.round(n * st.xp);
    if (!player.onFoot) mountGainXp(player.mount, Math.round(n));   // the mount you ride learns alongside you
    while (player.xp >= xpNeeded()) {
      player.xp -= xpNeeded();
      player.level++;
      player.skillPoints++;
      economy.recalc();
      player.hp = player.maxHp;
      emit({ type: 'levelup', level: player.level });
      toast(`Level ${player.level}! Skill point earned`);
    }
  }
  function onPenned(animal, byMate) {
    story.onPenned(animal);
    frontier.onPenned();
    // a longhorn a posse mate brought in still counts for quests and jobs, but pays only a token sum
    const pay = byMate ? MATE_PEN_PAY : PEN_PAY + st.penPay;
    player.money += pay;
    toast(`Longhorn penned: $${pay}`);
    herding.sellOldest(PEN_HOLDS);
    jobs.onPenned();
  }
  function hurtPlayer(n, nature) {
    if (player.dead || player.dodgeT > 0) return;
    // a mounted rider is hit through the mount: its armour, its growth stage and how its nature stands against the attacker's
    const ride = player.onFoot ? 1 : mountOf().armor * stageOf().hurt * natureMul(nature, mountOf().nature);
    player.hp -= n * st.armor * ride * frontier.hurtK() * (player.buffs.salve > 0 ? TONICS.salve.armor : 1);
    if (player.tame && player.tame.t > 0.3) { player.tame.t = 0; toast('Hit! The taming starts over'); }   // a hit breaks the calm
    player.hurtT = 0;
    emit({ type: 'hurt' });
    if (player.hp <= 0) {
      player.hp = 0;
      player.dead = true;
      player.deadT = 0;
      const lost = Math.round(player.money * st.deathLoss);
      player.money -= lost;
      jobs.onDeath();
      player.tame = null;
      emit({ type: 'death' });
      const how = player.onFoot ? 'Knocked down…' : 'Thrown from the saddle…';
      toast(lost ? `${how} lost $${lost}` : how);
    }
  }
  function dropLoot(e) {
    const table = LOOT[e.kind], items = {};
    for (const id of ['hide', 'meat', 'claws']) {
      const p = table[id] + (table[id] < 1 ? st.loot : 0), n = Math.floor(p) + (rand() < p % 1 ? 1 : 0);
      if (n) items[id] = n * (e.bounty || e.alpha ? 2 : 1) * (state.bloodMoon ? BLOOD_MOON.loot : 1);
    }
    const money = Math.round(table.money[0] + rand() * (table.money[1] - table.money[0])) * (e.bounty ? 2 : 1) * (state.bloodMoon ? BLOOD_MOON.loot : 1);
    if (money || Object.keys(items).length) state.loot.push({ id: `loot${nextId++}`, x: e.x, z: e.z, items, money, t: LOOT_LASTS });
  }
  // Returns whether the animal was hurt. One that has given up and is heading home cannot be: it is out of the fight.
  const rexSealed = () => state.story?.flags.rexhome === true;   // driven back into the hollow: out of the fight for good
  function damageEnemy(e, amount, by = 'rider') {
    if (e.dead) return false;
    if (e === state.rex && rexSealed()) return false;
    if (e.state === 'return') { emit({ type: 'thud', x: e.x, y: heightAt(e.x, e.z) + e.def.radius, z: e.z }); return false; }
    // a held, tameable animal is not killed outright by the hit that wears it down: it is left just alive, ready to tame.
    // Once it is that low, another hit does kill it.
    if (e.windT > 0 && by === 'rider') {
      e.windT = 0; e.lungeCd = Math.max(e.lungeCd, 3); amount *= STAGGER.dmg;
      if (e !== state.rex) e.heldT = Math.max(e.heldT, STAGGER.hold);
      emit({ type: 'stagger', x: e.x, z: e.z });
      frontier.onStagger();
    }
    e.hp = tameable(e) && e.heldT > 0 && e.hp > e.maxHp * TAME.health ? Math.max(1, e.hp - amount) : e.hp - amount;
    e.flashT = 0.12;
    e.provokedT = LEASH.provoked;
    emit({ type: 'hit', x: e.x, z: e.z, mine: by === 'rider' });
    if (e.state !== 'chase' && e.state !== 'scared') e.state = 'chase';
    if (e.hp <= 0) {
      e.dead = true;
      e.deadT = 0;
      emit({ type: 'kill', kind: e.kind, x: e.x, z: e.z, mine: by === 'rider' });
      if (by !== 'tower') { gainXp(e.def.xp * (e.bounty ? JOBS.bounty.xpMul : 1)); dropLoot(e); }
      if (st.ammoBack && player.reloadT <= 0) player.ammo[player.weapon] = Math.min(magazine(), player.ammo[player.weapon] + st.ammoBack);
      jobs.onKill(e);
      frontier.onKill(e, by);
      if (e === rex) {
        state.story.flags.rexdead = true;
        if (state.story.flags.rex !== 'sealed' || !state.story.flags.rexhome) state.story.flags.rex = 'killed';   // however it happened, the Alpha was killed
        player.mounts[2] = true;
        toast('Alpha Rex defeated! A Tyrant waits at the stables');
      }
    }
    return true;
  }

  // `pursuing` moves (chase, hunt, return, flee) are watched for jams: a jammed animal sidles round what is in its way.
  function moveToward(e, tx, tz, speed, dt, pursuing = false) {
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    let ux = dx / d, uz = dz / d, step = Math.min(d, speed * dt);
    if (pursuing) {
      e.trying = true;
      if (e.sideT > 0) {
        const fx = -uz * e.side + ux * 0.2, fz = ux * e.side + uz * 0.2, fl = Math.hypot(fx, fz);
        ux = fx / fl; uz = fz / fl; step = speed * dt;
      }
    }
    e.yaw = lerpAngle(e.yaw, Math.atan2(ux, uz), 1 - Math.exp(-8 * dt));
    e.x += ux * step;
    e.z += uz * step;
    e.moving = speed / e.def.speed;
  }

  function updateEnemies(dt) {
    const blood = bloodMoon();
    if (blood !== state.bloodMoon) { state.bloodMoon = blood; if (blood) { emit({ type: 'order' }); toast('A blood moon rises: predators are bold tonight, and drop twice the loot'); } }
    const aggroK = (isNight() ? DAY.nightAggro : 1) * (blood ? BLOOD_MOON.aggro : 1) * frontier.weather().aggro, safe = atPeace();
    for (let i = enemies.length - 1; i >= baseEnemies; i--) {
      const e = enemies[i];
      if (e.gone || (e.dead && e.deadT > 6)) enemies.splice(i, 1);
    }
    for (const e of enemies) {
      e.ox = e.x; e.oz = e.z; e.oyaw = e.yaw;
      e.flashT = Math.max(0, e.flashT - dt);
      e.trying = false;
      if (e.dead) {
        e.deadT += dt;
        if (!e.outpost && e !== rex && !e.bounty && e.deadT > RESPAWN) {
          Object.assign(e, { dead: false, tamed: false, hp: e.maxHp, x: e.home.x, z: e.home.z, ox: e.home.x, oz: e.home.z, state: 'wander', prey: null,
            heldT: 0, scaredT: 0, provokedT: 0, cd: 0, sideT: 0, baited: false });
        }
        continue;
      }
      const dist = Math.hypot(player.x - e.x, player.z - e.z);
      if (dist < 45 && !e.tag) {
        const sp = MOUNTS.findIndex(m => m.wild === e.kind);
        if (sp >= 0 && !player.journal[sp]) { player.journal[sp] = 1; emit({ type: 'pickup' }); toast(`Field journal: ${MOUNTS[sp].name} spotted`); if (!player.taught) { player.taught = true; toast('It can be tamed: wear it down, hold it with bolas (6), then press T'); } }
      }
      const homeDist = Math.hypot(e.home.x - e.x, e.home.z - e.z);
      const aggro = e.def.aggro * aggroK;
      e.moving = 0;
      e.cd -= dt;
      e.lungeCd -= dt;
      if (e.state !== 'chase') e.windT = e.lungeT = 0;
      e.attackT = Math.max(0, e.attackT - dt * 3);
      e.provokedT = Math.max(0, e.provokedT - dt);
      if (e.heldT > 0) { e.heldT -= dt; continue; }   // caught in bolas or a trap
      // animals will not come into town
      const townD = Math.hypot(e.x - TOWN.x, e.z - TOWN.z);
      if (e.def.ai === 'pest') {
        // compies only run. One scare is enough: a spooked compy bolts straight out of town and is gone for good
        if (!player.dead && dist < 10) e.scaredT = 1;
        if (e.scaredT > 0) moveToward(e, e.x + (e.x - TOWN.x) * 4 + 0.01, e.z + (e.z - TOWN.z) * 4, e.def.speed * 2.2, dt);
        else {
          e.wanderT -= dt;
          if (e.wanderT <= 0) { e.wanderT = 1 + rand() * 3; const a = rand() * 6.28, r = rand() * 6; e.tx = e.home.x + Math.cos(a) * r; e.tz = e.home.z + Math.sin(a) * r; }
          if (Math.hypot(e.tx - e.x, e.tz - e.z) > 1) moveToward(e, e.tx, e.tz, e.def.speed * 0.4, dt);
        }
        if (e.scaredT > 0 && townD > TOWN.r + 1) { e.gone = true; emit({ type: 'pickup' }); }   // gone at the town's edge, before the first trees can trap it
        continue;
      }
      if (townD < TOWN.r + 3 && !state.siege) {
        e.x = TOWN.x + ((e.x - TOWN.x) / townD) * (TOWN.r + 3);
        e.z = TOWN.z + ((e.z - TOWN.z) / townD) * (TOWN.r + 3);
        if (e.state === 'chase' || e.state === 'hunt') e.state = 'return';
      }
      if (e.state === 'wander') {
        const prey = herding.nearestPrey(e.x, e.z, 24);
        if (!player.dead && !safe && dist < aggro && !(e === rex && rexSealed())) e.state = 'chase';
        else if (prey && e.def.preyDmg && !(e === rex && rexSealed())) { e.state = 'hunt'; e.prey = prey; }
        else {
          e.wanderT -= dt;
          if (e.wanderT <= 0) {
            e.wanderT = 3 + rand() * 5;
            const a = rand() * 6.28, r = rand() * 14;
            e.tx = e.home.x + Math.cos(a) * r;
            e.tz = e.home.z + Math.sin(a) * r;
          }
          if (Math.hypot(e.tx - e.x, e.tz - e.z) > 1) moveToward(e, e.tx, e.tz, e.def.speed * 0.3, dt);
        }
      } else if (e.state === 'hunt') {
        const p = e.prey, pd = p ? Math.hypot(p.x - e.x, p.z - e.z) : 0;
        if (!p || p.dead || p.penned || pd > 45 || homeDist > LEASH.home) { e.state = 'return'; e.prey = null; }
        else if (pd > e.def.range) moveToward(e, p.x, p.z, e.def.speed * 1.35, dt, true);   // hunters outrun a fleeing longhorn
        else {
          e.yaw = lerpAngle(e.yaw, Math.atan2(p.x - e.x, p.z - e.z), 1 - Math.exp(-8 * dt));
          if (e.cd <= 0) { e.cd = 1.5; e.attackT = 1; emit({ type: 'bite', x: e.x, z: e.z }); herding.hurt(p, e.def.preyDmg); }
        }
      } else if (e.state === 'chase' && e === rex && rexSealed()) { e.state = 'return'; }
      else if (e.state === 'chase') {
        // a wounded animal does not give up because the rider is far off, and follows a little further from home
        const angry = e.provokedT > 0, siege = e.tag === 'raid' || e.tag === 'hold';
        if (siege && (player.dead || Math.hypot(player.x - TOWN.x, player.z - TOWN.z) > TOWN.r + 12)) {
          if (townD > 8) moveToward(e, TOWN.x, TOWN.z, e.def.speed, dt, true);
        } else if (player.dead || safe || (!angry && dist > aggro * LEASH.giveUp) || homeDist > (angry ? LEASH.provokedHome : LEASH.home) * (e.tag || e === rex ? LEASH.boss : 1)) e.state = 'return';
        else if (e.windT > 0) {
          // crouched for the spring: it turns with you until it goes
          e.yaw = lerpAngle(e.yaw, Math.atan2(player.x - e.x, player.z - e.z), 1 - Math.exp(-10 * dt));
          e.windT -= dt;
          if (e.windT <= 0) { e.lungeT = LUNGE.time; e.lx = (player.x - e.x) / (dist || 1); e.lz = (player.z - e.z) / (dist || 1); e.attackT = 1; }
        } else if (e.lungeT > 0) {
          // in the air: a straight line, set when it left the ground
          e.lungeT -= dt;
          moveToward(e, e.x + e.lx * 20, e.z + e.lz * 20, LUNGE.speed, dt, true);
          if (!e.lungeHit && Math.hypot(player.x - e.x, player.z - e.z) < e.def.range + 0.8) {
            e.lungeHit = true; e.lungeT = 0; e.cd = e.def.bite;
            emit({ type: 'bite', x: e.x, z: e.z });
            hurtPlayer(e.def.dmg * LUNGE.dmg, e.def.nature);
          }
        } else if (e.def.lunge && e.lungeCd <= 0 && dist > LUNGE.near + e.def.radius && dist < LUNGE.far + e.def.radius && clearLine(e.x, e.z, player.x, player.z)) {
          e.windT = LUNGE.wind; e.lungeHit = false;
          e.lungeCd = LUNGE.cd[0] + rand() * (LUNGE.cd[1] - LUNGE.cd[0]);
          emit({ type: 'windup', x: e.x, z: e.z });
        }
        else if (e.def.lunge && e.def.radius < 2.5 && e.cd > 0.45 && dist < 10) {
          const ang = Math.atan2(e.x - player.x, e.z - player.z) + 0.5 * e.side;
          moveToward(e, player.x + Math.sin(ang) * 10, player.z + Math.cos(ang) * 10, e.def.speed * 0.8, dt, true);
        }
        else if (dist > e.def.range || ((e.def.ai === 'spitter' || e.def.ai === 'gunner') && dist > 4 && !clearLine(e.x, e.z, player.x, player.z))) moveToward(e, player.x, player.z, e.def.speed, dt, true);
        else {
          e.yaw = lerpAngle(e.yaw, Math.atan2(player.x - e.x, player.z - e.z), 1 - Math.exp(-8 * dt));
          if (e.cd <= 0) {
            e.cd = e.def.bite;
            e.attackT = 1;
            if (e.def.ai === 'spitter' || e.def.ai === 'gunner') {
              // shots from range can miss, more often when the rider is moving fast
              emit({ type: e.def.ai === 'spitter' ? 'spit' : 'gunfire', x1: e.x, z1: e.z, x2: player.x, z2: player.z });
              if (rand() < 0.8 - 0.5 * player.moving && player.dodgeT <= 0) {
                hurtPlayer(e.def.dmg, e.def.nature);
                if (e.def.blind && !player.dead) { player.blindT = e.def.blind; toast('Spit in your eyes!'); }
              }
            } else { emit({ type: 'bite', x: e.x, z: e.z }); hurtPlayer(e.def.dmg, e.def.nature); }
          }
        }
      } else if (e.state === 'scared') {
        e.scaredT -= dt;
        moveToward(e, e.x * 2 - player.x, e.z * 2 - player.z, e.def.speed * 1.2, dt, true);
        if (e.scaredT <= 0) e.state = e.tag === 'raid' || e.tag === 'hold' ? 'chase' : 'return';
      } else {
        moveToward(e, e.home.x, e.home.z, e.def.speed, dt, true);
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3 * dt);
        if (homeDist < 4) e.state = 'wander';
      }
    }
    // keep packs from stacking on one spot
    for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i], b = enemies[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = (a.def.radius + b.def.radius) * 0.8;
      if (d < min && d > 0.001) {
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.z -= (dz / d) * push;
        b.x += (dx / d) * push; b.z += (dz / d) * push;
      }
    }
    for (const e of enemies) {
      if (e.dead) continue;
      obstacles.resolve(e, e.def.radius * 0.6);
      // wedged between a tree and a rock: after a second of getting nowhere, sidle round it, the other way each time
      if (e.sideT > 0) e.sideT -= dt;
      if (!e.trying) { e.stuckT = 0; e.sx = e.x; e.sz = e.z; continue; }
      e.stuckT += dt;
      if (e.stuckT >= LEASH.stuckT) {
        if (e.sideT <= 0 && Math.hypot(e.x - e.sx, e.z - e.sz) < LEASH.stuckMove) { e.side = -e.side; e.sideT = LEASH.sideT; }
        e.stuckT = 0; e.sx = e.x; e.sz = e.z;
      }
    }
  }

  // Distance along the aim ray to the first dino or patch of ground, so shots land where the crosshair points.
  function aimDistance(a, max = 170) {
    let best = max;
    for (const e of enemies) {
      if (e.dead) continue;
      const r = e.def.radius * 1.15;
      const tx = e.x - a.ox, ty = heightAt(e.x, e.z) + e.def.radius - a.oy, tz = e.z - a.oz;
      const along = tx * a.dx + ty * a.dy + tz * a.dz, miss2 = tx * tx + ty * ty + tz * tz - along * along;
      if (along > 6 && miss2 < r * r) best = Math.min(best, along - Math.sqrt(r * r - miss2));
    }
    for (let t = 8; t < best; t += 2) {
      if (a.oy + a.dy * t < heightAt(a.ox + a.dx * t, a.oz + a.dz * t)) { best = t; break; }
    }
    return best;
  }
  const muzzle = () => ({
    x: player.x + Math.sin(player.yaw) * 1.4, y: heightAt(player.x, player.z) + (player.onFoot ? FOOT.muzzle : mountOf().muzzle), z: player.z + Math.cos(player.yaw) * 1.4,
  });
  // with no aim ray (a scripted rider) aim level along the facing
  const aimRay = (aim, m) => aim || { ox: m.x, oy: m.y, oz: m.z, dx: Math.sin(player.yaw), dy: 0, dz: Math.cos(player.yaw), yaw: player.yaw };

  function fire(aim) {
    const def = weaponDef(), m = muzzle(), a = aimRay(aim, m), t = aimDistance(a);
    let dx = a.ox + a.dx * t - m.x, dy = a.oy + a.dy * t - m.y, dz = a.oz + a.dz * t - m.z;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-6) { dx /= len; dy /= len; dz /= len; } else { dx = Math.sin(player.yaw); dy = 0; dz = Math.cos(player.yaw); }
    const crit = rand() < st.crit ? 2 : 1;
    for (let i = 0; i < def.pellets; i++) {
      const b = bullets.find(b => b.life <= 0);
      if (!b) break;
      const sx = dx + (rand() - 0.5) * 2 * def.spread, sy = dy + (rand() - 0.5) * def.spread, sz = dz + (rand() - 0.5) * 2 * def.spread, sl = Math.hypot(sx, sy, sz) || 1;
      Object.assign(b, { x: m.x, y: m.y, z: m.z, ox: m.x, oy: m.y, oz: m.z, life: def.life * st.range, dmg: damage() * crit, pierce: st.pierce, skip: null, silent: !!def.silent,
        vx: (sx / sl) * def.speed, vy: (sy / sl) * def.speed, vz: (sz / sl) * def.speed });
    }
    player.ammo[player.weapon]--;
    emit({ type: 'shot', weapon: player.weapon });
    // a gunshot carries: animals that were minding their own business come looking
    if (!def.silent && !atPeace()) for (const e of enemies) {
      if (!e.dead && e.state === 'wander' && e.def.aggro > 0 && !(e === rex && rexSealed()) && Math.hypot(e.x - player.x, e.z - player.z) < GUNSHOT_HEARD) e.state = 'chase';
    }
    if (player.ammo[player.weapon] === 0) startReload();
  }
  function startReload() {
    if (player.reloadT > 0 || player.ammo[player.weapon] >= magazine()) return;
    player.reloadT = weaponDef().reload * st.reload;
    emit({ type: 'reload' });
  }
  function setWeapon(id) {
    if (typeof id !== 'string' || !Object.hasOwn(WEAPONS, id) || id === player.weapon) return;
    if (!Object.hasOwn(player.weapons, id)) return toast(`You do not own a ${WEAPONS[id].name.toLowerCase()}`);
    player.weapon = id;
    player.reloadT = 0;
    // swapping never shortens the wait for the next shot
    player.fireCd = Math.max(player.fireCd, 0.25);
    emit({ type: 'swap' });
    if (player.ammo[id] === 0) startReload();
  }
  // A shot is tested along the whole of this step's flight, so a fast bullet cannot skip over a tree or an animal.
  function updateBullets(dt) {
    for (const b of bullets) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.ox = b.x; b.oy = b.y; b.oz = b.z;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      const sx = b.x - b.ox, sy = b.y - b.oy, sz = b.z - b.oz, len2 = sx * sx + sy * sy + sz * sz;
      // how far along the step (0..1) the ground or scenery stops it; 2 = not at all
      let block = 2, bx = b.x, by = b.y, bz = b.z;
      for (let k = 1; k <= SHOT_SAMPLES; k++) {
        const t = k / SHOT_SAMPLES, x = b.ox + sx * t, y = b.oy + sy * t, z = b.oz + sz * t;
        if (y < heightAt(x, z) || obstacles.blocksShot(x, y, z)) { block = t; bx = x; by = y; bz = z; break; }
      }
      // the first animal the flight passes through before that
      let target = null, reach = block;
      for (const e of enemies) {
        if (e.dead || e === b.skip) continue;
        const r = e.def.radius, R = r * 1.15, cx = e.x - b.ox, cy = heightAt(e.x, e.z) + r - b.oy, cz = e.z - b.oz;
        const t = len2 > 0 ? clamp((cx * sx + cy * sy + cz * sz) / len2, 0, 1) : 0;
        const mx = cx - sx * t, my = cy - sy * t, mz = cz - sz * t, d2 = mx * mx + my * my + mz * mz;
        if (d2 >= R * R) continue;
        const enter = len2 > 0 ? Math.max(0, t - Math.sqrt((R * R - d2) / len2)) : 0;
        if (enter <= reach) { target = e; reach = enter; }
      }
      if (target) {
        if (damageEnemy(target, b.dmg) && b.pierce > 0) { b.pierce--; b.skip = target; } else b.life = 0;
      } else if (block <= 1) {
        emit({ type: 'thud', x: bx, y: by, z: bz });
        b.life = 0;
      }
    }
  }

  // ---- thrown items ----
  // The town is peaceful ground: no shooting and no throwing. Says so, but not on every step the trigger is held.
  function noShooting() {
    if (state.clock - townToastAt < TOWN_TOAST_EVERY) return;
    townToastAt = state.clock;
    toast('No shooting in town');
  }
  function throwItem(id, aim) {
    if (player.dead || !Object.hasOwn(THROWN, id)) return;
    if (atPeace()) return noShooting();
    const def = THROWN[id];
    if (!player.thrown[id]) return toast(`No ${def.name.toLowerCase()} left`);
    if (id === 'bait') {
      // the nearest wild animal comes to it and stands feeding
      let best = null, bestD = BAIT.reach;
      for (const e of enemies) { const d = Math.hypot(e.x - player.x, e.z - player.z); if (tameable(e) && d < bestD) { best = e; bestD = d; } }
      if (!best) return toast('No wild animal close enough to take the bait');
      Object.assign(best, { heldT: Math.max(best.heldT, BAIT.hold), baited: true, state: 'wander', provokedT: 0 });
      player.thrown.bait--;
      emit({ type: 'pickup' });
      return toast(`It comes to the bait and feeds: wear it down to ${Math.round(BAIT.health * 100)}% and tame it (T)`);
    }
    if (id === 'dynamite') {
      const m = muzzle(), a = aimRay(aim, m);
      let tx = a.ox + a.dx * aimDistance(a, 120), tz = a.oz + a.dz * aimDistance(a, 120);
      const d = Math.hypot(tx - player.x, tz - player.z);
      if (d > def.range) { tx = player.x + ((tx - player.x) / d) * def.range; tz = player.z + ((tz - player.z) / d) * def.range; }
      state.thrown.push({ id: `stick${nextId++}`, sx: player.x, sz: player.z, tx, tz, x: player.x, z: player.z, t: 0 });
    } else if (id === 'bolas') {
      let best = null, bestD = def.range;
      for (const e of enemies) {
        const d = Math.hypot(e.x - player.x, e.z - player.z);
        if (!e.dead && e !== rex && d < bestD && Math.abs(angleDiff(aim ? aim.yaw : player.yaw, Math.atan2(e.x - player.x, e.z - player.z))) < 0.45) { best = e; bestD = d; }
      }
      if (!best) return toast('No animal in front of you to tangle');
      best.heldT = def.hold * st.thrown;
      emit({ type: 'hit', x: best.x, z: best.z });
    } else {
      if (state.traps.length >= def.max) state.traps.shift();
      state.traps.push({ id: `trap${nextId++}`, x: player.x, z: player.z });
    }
    player.thrown[id]--;
    emit({ type: 'throw', id });
  }
  function updateThrown(dt) {
    const dyn = THROWN.dynamite, trap = THROWN.trap;
    for (let i = state.thrown.length - 1; i >= 0; i--) {
      const s = state.thrown[i];
      s.t += dt;
      const k = Math.min(1, s.t / dyn.flight);
      s.x = s.sx + (s.tx - s.sx) * k;
      s.z = s.sz + (s.tz - s.sz) * k;
      if (s.t < dyn.fuse) continue;
      state.thrown.splice(i, 1);
      emit({ type: 'boom', x: s.x, z: s.z, r: dyn.radius });
      for (const e of enemies) {
        const d = Math.hypot(e.x - s.x, e.z - s.z);
        if (!e.dead && d < dyn.radius + e.def.radius) damageEnemy(e, dyn.dmg * st.thrown * (1 - 0.5 * Math.min(1, d / dyn.radius)));
      }
      for (const a of state.animals) if (!a.dead && !a.penned && Math.hypot(a.x - s.x, a.z - s.z) < 30) Object.assign(a, { panicT: 2.5, px: s.x, pz: s.z });
    }
    for (let i = state.traps.length - 1; i >= 0; i--) {
      const t = state.traps[i], e = enemies.find(e => !e.dead && Math.hypot(e.x - t.x, e.z - t.z) < trap.radius + e.def.radius * 0.5);
      if (!e) continue;
      state.traps.splice(i, 1);
      e.heldT = e === rex ? 1 : trap.hold * st.thrown;
      emit({ type: 'snap', x: t.x, z: t.z });
      damageEnemy(e, trap.dmg * st.thrown, 'trap');
    }
  }
  function updateLoot(dt) {
    for (let i = state.loot.length - 1; i >= 0; i--) {
      const l = state.loot[i];
      l.t -= dt;
      if (l.t <= 0) { state.loot.splice(i, 1); continue; }
      if (player.dead || Math.hypot(l.x - player.x, l.z - player.z) > LOOT_REACH) continue;
      const got = [];
      if (l.money) { player.money += l.money; got.push(`$${l.money}`); l.money = 0; }
      for (const id in l.items) {
        const n = economy.addRes(id, l.items[id]);
        l.items[id] -= n;
        if (n) got.push(`${n} ${id}`);
        if (!l.items[id]) delete l.items[id];
      }
      if (Object.keys(l.items).length) { if (!l.told) { l.told = true; toast('Saddle bags are full'); } }
      else state.loot.splice(i, 1);
      if (got.length) { emit({ type: 'pickup' }); toast(`+ ${got.join(', ')}`); }
    }
  }

  // Strider dashes to cut off strays, Bulwark calls the herd to follow, Tyrant stampedes the herd and routs predators.
  function useAbility() {
    if (player.dead || player.abilityCd > 0) return;
    if (player.onFoot) return toast('Mount up first');
    const { name, cd } = mountOf().ability;
    if (atPeace() && ['Spit', 'Charge', 'Sweep', 'Stomp'].includes(name)) return noShooting();
    const hitFor = (e, dmg) => damageEnemy(e, dmg * stageOf().k * bloodK() * natureMul(mountOf().nature, e.def.nature));
    if (name === 'Spit') {
      let best = null, bestD = SPIT.range;
      for (const e of enemies) {
        const d = Math.hypot(e.x - player.x, e.z - player.z);
        if (!e.dead && !e.gone && e.def.ai !== 'pest' && d < bestD && Math.abs(angleDiff(player.yaw, Math.atan2(e.x - player.x, e.z - player.z))) < 0.7) { best = e; bestD = d; }
      }
      if (!best) return toast('Nothing ahead to spit at');
      emit({ type: 'spit', x1: player.x, z1: player.z, x2: best.x, z2: best.z });
      if (best !== rex) best.heldT = Math.max(best.heldT, SPIT.hold);
      hitFor(best, SPIT.dmg);
    } else if (name === 'Charge') { player.dashT = CHARGE.time; player.charging = true; player.chargeId = (player.chargeId || 0) + 1; }
    else if (name === 'Sweep' || name === 'Stomp') {
      const hit = name === 'Stomp' ? STOMP : SWEEP;
      for (const e of enemies) {
        if (e.dead || e.gone || e.def.ai === 'pest' || Math.hypot(e.x - player.x, e.z - player.z) > hit.radius + e.def.radius) continue;
        if (e !== rex) e.heldT = Math.max(e.heldT, hit.hold);
        hitFor(e, hit.dmg);
      }
    } else if (name === 'Call') {
      if (!herding.rally(CALL.radius, CALL.time * st.follow)) return toast('No longhorns close enough to call');
    } else if (name === 'Dash') player.dashT = DASH.time;
    else if (name === 'Rally') {
      if (!herding.rally(RALLY.radius, RALLY.time * st.follow)) return toast('No longhorns close enough to rally');
    } else {
      herding.stampede(ROAR.herd);
      for (const e of enemies) {
        if (!e.dead && e !== rex && Math.hypot(e.x - player.x, e.z - player.z) < ROAR.predators) { e.state = 'scared'; e.scaredT = ROAR.time; }
      }
    }
    emit({ type: 'ability', name });
    player.abilityCd = cd * st.abilityCd;
  }
  // V: the mount's own attack, on everything close in front. Natures count here.
  function melee() {
    if (player.dead || player.onFoot || player.meleeCd > 0 || atPeace()) return;
    if (player.stamina < MELEE.stamina) return toast('Too winded to strike');
    player.meleeCd = MELEE.cd;
    player.stamina -= MELEE.stamina;
    let strong = 0;
    for (const e of enemies) {
      const d = Math.hypot(e.x - player.x, e.z - player.z);
      if (e.dead || e.gone || d > MELEE.reach + e.def.radius || Math.abs(angleDiff(player.yaw, Math.atan2(e.x - player.x, e.z - player.z))) > MELEE.arc) continue;
      const k = natureMul(mountOf().nature, e.def.nature);
      strong = k > 1 ? 1 : k < 1 && !strong ? -1 : strong;
      damageEnemy(e, meleeDamage() * k);
    }
    emit({ type: 'melee', strong });
  }
  // T: begin taming a worn-down, held animal close by. The bar fills while you stay near and unhurt.
  const tameAt = (e) => (e.baited ? BAIT.health : TAME.health);   // an animal that took bait gives in sooner
  const tameReady = (e) => tameable(e) && e.heldT > 0 && e.hp <= e.maxHp * tameAt(e);
  function tame() {
    if (player.dead || player.tame) return;
    if (atPeace()) return toast('Not from inside town: ride out to it');
    // the animal that is ready wins over one that merely happens to be nearer
    let best = null, bestD = TAME.reach, ready = null, readyD = TAME.reach;
    for (const e of enemies) {
      const d = Math.hypot(e.x - player.x, e.z - player.z);
      if (!tameable(e)) continue;
      if (d < bestD) { best = e; bestD = d; }
      if (tameReady(e) && d < readyD) { ready = e; readyD = d; }
    }
    if (!best) return toast('No animal close by that can be tamed');
    if (!ready) return toast(best.hp > best.maxHp * tameAt(best) ? (best.baited ? 'Wear it down to 60% of its health first' : 'Wear it down to a third of its health first') : 'Hold it still with bolas (6) or a trap (7) first');
    player.tame = { id: ready.id, t: 0 };
    emit({ type: 'lasso' });
  }
  function updateTame(dt) {
    const tm = player.tame;
    if (!tm) return;
    const e = enemies.find(k => k.id === tm.id);
    if (!e || !tameable(e) || player.dead || Math.hypot(e.x - player.x, e.z - player.z) > TAME.reach + 2) { player.tame = null; return toast('The taming is broken off'); }
    e.heldT = Math.max(e.heldT, 0.5);   // it stays put while you work
    tm.t += dt;
    if (tm.t < TAME.time) return;
    player.tame = null;
    const i = MOUNTS.findIndex(m => m.wild === e.kind);
    Object.assign(e, { dead: true, deadT: 0, tamed: true, heldT: 0 });
    emit({ type: 'tamed', kind: e.kind });
    if (!player.mounts[i]) {
      player.mounts[i] = true;
      player.journal[i] = 2;
      const room = player.string.length < STRING_MAX;
      if (room) player.string.push(i);
      toast(`${MOUNTS[i].name} tamed! ${room ? 'It joins your string: B to ride it' : 'It waits at the stables'}`);
      gainXp(TAME.xp);
    } else { mountGainXp(i, TAME.repeatXp); toast(`Another ${MOUNTS[i].name}: yours learns from it`); frontier.onTamed(i, true); }
  }
  // B: change to the next dinosaur in your string.
  function swapMount() {
    if (player.dead || player.onFoot) return;
    if (player.string.length < 2) return toast('No other dinosaur in your string');
    if (player.swapCd > 0) return toast(`Next swap in ${Math.ceil(player.swapCd)}s`);
    if (player.hurtT < 5) return toast('Not while you are under attack');
    const at = player.string.indexOf(player.mount), was = player.mount;
    player.mount = player.string[(at + 1) % player.string.length];
    economy.recalc();
    if (economy.bagUsed() > Math.floor(st.bag)) {
      const name = mountOf().name;
      player.mount = was; economy.recalc();
      return toast(`The ${name} cannot carry all this: sell or store some first`);
    }
    Object.assign(player, { swapCd: SWAP_CD, dashT: 0, charging: false, abilityCd: Math.max(player.abilityCd, 2) });
    economy.recalc();
    emit({ type: 'mount' });
    toast(`Riding the ${mountOf().name}`);
  }
  function dodge(mx, mz) {
    if (player.dead || player.dodgeCd > 0) return;
    if (player.stamina < DODGE.cost) return toast('Too winded to dodge');
    const len = Math.hypot(mx, mz);
    // with no direction held, hop backwards
    player.dodgeX = len ? mx / len : -Math.sin(player.yaw);
    player.dodgeZ = len ? mz / len : -Math.cos(player.yaw);
    player.dodgeT = DODGE.time;
    player.dodgeCd = DODGE.cd;
    player.stamina -= DODGE.cost;
    emit({ type: 'dodge' });
  }
  // H: step down, climb back up, or whistle the mount over when it is far away.
  function dismount() {
    if (player.dead) return;
    const s = player.steed;
    if (!player.onFoot) {
      Object.assign(s, { x: player.x, z: player.z, ox: player.x, oz: player.z, yaw: player.yaw, coming: false, stuckT: 0 });
      player.onFoot = true;
      player.dashT = 0;
      // step off to the side so rider and mount do not overlap, but never through the fence or a wall:
      // try one side, then the other, else stand where the mount is
      const inPen = (b) => Math.hypot(b.x - PEN.x, b.z - PEN.z) < PEN.r;
      const throughWall = (b) => {
        for (let k = 1; k <= 6; k++) {
          const x = s.x + (b.x - s.x) * (k / 6), z = s.z + (b.z - s.z) * (k / 6);
          if (PLACES.some(p => Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2)) return true;
        }
        return false;
      };
      for (const side of [1, -1]) {
        const b = { x: s.x + Math.cos(s.yaw) * 2.2 * side, z: s.z - Math.sin(s.yaw) * 2.2 * side };
        obstacles.resolve(b, FOOT.radius);
        if (inPen(b) !== inPen(s) || throughWall(b) || Math.hypot(b.x - s.x, b.z - s.z) > 3) continue;
        player.x = b.x; player.z = b.z;
        break;
      }
      emit({ type: 'mount' });
    } else if (Math.hypot(s.x - player.x, s.z - player.z) < FOOT.reach) {
      player.onFoot = false;
      player.x = s.x; player.z = s.z;
      player.ox = s.x; player.oz = s.z;
      s.coming = false;
      emit({ type: 'mount' });
    } else { s.coming = true; s.stuckT = 0; s.sd = Math.hypot(s.x - player.x, s.z - player.z); emit({ type: 'holler' }); toast('You whistle for your mount'); }
  }

  function updatePlayer(dt, input) {
    player.ox = player.x; player.oz = player.z; player.oyaw = player.yaw;
    const s = player.steed;
    s.ox = s.x; s.oz = s.z;
    if (player.dead) {
      player.deadT += dt;
      player.moving = 0;
      if (player.deadT > 3) {
        Object.assign(player, { dead: false, hp: player.maxHp, stamina: 100, reloadT: 0, fireCd: 0, dashT: 0, dodgeT: 0, onFoot: false,
          x: PLACES[2].door.x, z: PLACES[2].door.z + 3 });
        s.coming = false;
        player.ammo[player.weapon] = magazine();
        player.ox = player.x; player.oz = player.z;
        emit({ type: 'respawn' });
      }
      return;
    }
    for (const a of input.actions) {
      if (typeof a !== 'string') continue;
      if (a === 'ability') useAbility();
      else if (a === 'holler') {
        const n = events.length;
        herding.holler();
        if (events.slice(n).some(e => e.type === 'holler')) story.onHoller();
      } else if (a === 'order') posse.cycleOrder();
      else if (a === 'lasso') herding.lasso();
      else if (a === 'reload') startReload();
      else if (a === 'dodge') dodge(input.mx, input.mz);
      else if (a === 'dismount') dismount();
      else if (a === 'melee') melee();
      else if (a === 'move') frontier.move();
      else if (a === 'tame') tame();
      else if (a === 'swap') swapMount();
      else if (a === 'quickZ') economy.useTonic(player.quick.z);
      else if (a === 'quickX') economy.useTonic(player.quick.x);
      else if (a.startsWith('weapon')) setWeapon(WEAPON_ORDER[+a.slice(6)]);
      else if (a.startsWith('throw:')) throwItem(a.slice(6), input.aim);
    }
    economy.updateBuffs(dt);
    const mount = mountOf(), going = frontier.weather().pace, walk = (player.onFoot ? FOOT.speed : mount.speed * st.speed * stageOf().pace) * going, run = (player.onFoot ? FOOT.sprint : mount.sprint * st.speed * stageOf().pace) * going;
    let mx = input.mx, mz = input.mz, len = Math.hypot(mx, mz);
    const sprint = input.sprint && len > 0 && player.stamina > 1;
    const drain = player.buffs.brew > 0 ? 0 : RIDER.staminaSprint * st.sprintCost;
    player.stamina = clamp(player.stamina + (sprint ? -drain : RIDER.staminaRegen * st.staminaRegen) * dt, 0, 100);
    player.moving = 0;
    player.abilityCd = Math.max(0, player.abilityCd - dt);
    player.dashT -= dt;
    player.dodgeT -= dt;
    player.dodgeCd -= dt;
    const dashing = player.dashT > 0, dodging = player.dodgeT > 0;
    if (dodging) { mx = player.dodgeX; mz = player.dodgeZ; len = 1; }
    else if (dashing && len === 0) { mx = Math.sin(player.yaw); mz = Math.cos(player.yaw); len = 1; }
    if (len > 0) {
      const speed = dodging ? (player.onFoot ? DODGE.speed * 0.6 : DODGE.speed) : dashing ? (player.charging ? CHARGE.speed : DASH.speed) : sprint ? run : walk;
      player.x += (mx / len) * speed * dt;
      player.z += (mz / len) * speed * dt;
      player.moving = Math.min(1, speed / run);
    }
    obstacles.resolve(player, player.onFoot ? FOOT.radius : RIDER.radius);
    // the rider turns to aim, or to face the way they are heading; a dodge is a hop, not a turn
    const aimYaw = input.aim ? input.aim.yaw : player.yaw;
    if (input.fire) player.yaw = lerpAngle(player.yaw, aimYaw, 1 - Math.exp(-10 * dt));
    else if (len > 0 && !dodging) player.yaw = lerpAngle(player.yaw, Math.atan2(mx, mz), 1 - Math.exp(-10 * dt));
    player.meleeCd = Math.max(0, (player.meleeCd || 0) - dt);
    player.swapCd = Math.max(0, (player.swapCd || 0) - dt);
    updateTame(dt);
    // a Cinderjaw's charge runs down whatever it reaches
    if (player.charging) {
      if (player.dashT <= 0 || player.onFoot) player.charging = false;
      else for (const e of enemies) {
        if (e.dead || e.gone || e.def.ai === 'pest' || e.rammed === player.chargeId || Math.hypot(e.x - player.x, e.z - player.z) > CHARGE.reach + e.def.radius) continue;
        e.rammed = player.chargeId;   // once per charge
        damageEnemy(e, CHARGE.dmg * stageOf().k * natureMul(mountOf().nature, e.def.nature));
      }
    }
    player.fireCd -= dt;
    if (input.fire && atPeace()) noShooting();
    if (player.reloadT > 0) {
      player.reloadT -= dt;
      if (player.reloadT <= 0) { player.ammo[player.weapon] = magazine(); emit({ type: 'reloaded' }); }
    } else if (input.fire && player.ammo[player.weapon] <= 0) startReload();   // an empty gun never just sits there
    else if (input.fire && player.fireCd <= 0 && !atPeace()) {
      player.fireCd = weaponDef().fireCd * st.fireCd;
      fire(input.aim);
    }
    player.hurtT += dt;
    if (player.hurtT > RIDER.regenDelay || inTown()) player.hp = Math.min(player.maxHp, player.hp + RIDER.regen * st.regen * (atPeace() ? 4 : 1) * dt);
    // a whistled mount runs to the rider; if scenery keeps it away for a few seconds it finds its own way round
    if (player.onFoot && s.coming) {
      const d = Math.hypot(player.x - s.x, player.z - s.z);
      if (d < 4) s.coming = false;
      else {
        s.yaw = Math.atan2(player.x - s.x, player.z - s.z);
        s.x += ((player.x - s.x) / d) * 26 * dt;
        s.z += ((player.z - s.z) / d) * 26 * dt;
        obstacles.resolve(s, RIDER.radius);
        s.stuckT += dt;
        if (s.stuckT >= 3) {
          const now = Math.hypot(player.x - s.x, player.z - s.z);
          if (s.sd - now < 1) {
            const inPen = (b) => Math.hypot(b.x - PEN.x, b.z - PEN.z) < PEN.r;
            s.x = player.x - Math.sin(player.yaw) * 3; s.z = player.z - Math.cos(player.yaw) * 3;
            obstacles.resolve(s, RIDER.radius);
            if (inPen(s) !== inPen(player) || Math.hypot(player.x - s.x, player.z - s.z) >= 4) { s.x = player.x; s.z = player.z; }
            s.ox = s.x; s.oz = s.z;
            s.coming = false;
          }
          s.stuckT = 0; s.sd = now;
        }
      }
    }
  }

  // The town place whose door the rider is standing at, if any.
  function nearPlace() {
    if (player.dead) return null;
    return PLACES.find(p => Math.hypot(player.x - p.door.x, player.z - p.door.z) < PLACE_REACH) || null;
  }

  function updateOutposts(dt) {
    let hint = '';
    for (const o of outposts) {
      const inside = !player.dead && Math.hypot(player.x - o.x, player.z - o.z) < CAPTURE.r;
      const guards = enemies.filter(e => e.outpost === o && !e.dead).length;
      if (o.captured) {
        if (inside) player.hp = Math.min(player.maxHp, player.hp + 12 * dt);
      } else if (inside && guards === 0) {
        o.progress += dt / CAPTURE.time;
        hint = `Capturing ${o.name}… ${Math.floor(o.progress * 100)}%`;
        if (o.progress >= 1) {
          o.captured = true;
          gainXp(CAPTURE.xp);
          emit({ type: 'capture', name: o.name });
          toast(`${o.name} is yours!`);
        }
      } else {
        o.progress = Math.max(0, o.progress - dt / 10);
        if (inside) hint = `${o.name}: ${guards} guard${guards > 1 ? 's' : ''} left`;
      }
    }
    const place = nearPlace(), who = story.canTalk(!!place);
    // taming: progress while it runs, and a prompt when an animal close by is ready for it
    if (player.tame) hint = `Taming… ${Math.floor((player.tame.t / TAME.time) * 100)}% · stay close and do not get hit`;
    else if (!hint && !player.dead) {
      const ready = enemies.find(e => tameReady(e) && Math.hypot(e.x - player.x, e.z - player.z) < TAME.reach);
      if (ready) hint = `T: tame the ${MOUNTS.find(m => m.wild === ready.kind).name}`;
    }
    if (who) hint = `F: Talk to ${who}`;
    else if (place) hint = `F: ${place.name}`;
    else if (!hint && player.onFoot) hint = 'H: mount up, or whistle if your mount is far';
    state.hint = hint || herding.hint();
    if (!state.won && outposts.every(o => o.captured) && (rex.dead || rexSealed())) {
      state.won = true;
      toast('Thunder Valley is secured!');
    }
  }

  // Advances the rules by one fixed step and returns the events it produced.
  // Input comes from outside the rules, so nothing about its shape is assumed.
  function readInput(raw) {
    const i = raw && typeof raw === 'object' ? raw : NO_INPUT, a = i.aim;
    const aimOk = a && typeof a === 'object' && [a.ox, a.oy, a.oz, a.dx, a.dy, a.dz].every(fin) && Math.hypot(a.dx, a.dy, a.dz) > 1e-6;
    return {
      mx: fin(i.mx) ? i.mx : 0, mz: fin(i.mz) ? i.mz : 0, sprint: !!i.sprint, fire: !!i.fire,
      aim: aimOk ? (fin(a.yaw) ? a : { ...a, yaw: Math.atan2(a.dx, a.dz) }) : null, actions: Array.isArray(i.actions) ? i.actions : [],
    };
  }
  function step(input = NO_INPUT, dt = STEP) {
    events = [];
    for (let i = 0; i < MOUNTS.length; i++) if (player.mounts[i]) player.journal[i] = 2;
    state.clock += dt;
    updatePlayer(dt, readInput(input));
    player.blindT = Math.max(0, player.blindT - dt);
    updateEnemies(dt);
    posse.update(dt);
    updateBullets(dt);
    updateThrown(dt);
    herding.update(dt);
    updateLoot(dt);
    jobs.update(dt);
    story.update(dt);
    town.update(dt);
    frontier.update(dt);
    updateOutposts(dt);
    return events;
  }
  // Menu and shop actions happen between steps. Returns the events they produced.
  function command(cmd) {
    events = [];
    if (!cmd || typeof cmd !== 'object') return events;
    const before = state.clock;
    if (cmd.type === 'talk') story.interact(!!nearPlace());
    else if (cmd.type === 'leave') story.leave();
    else if (cmd.type === 'say') story.choose(cmd.i);
    else if (cmd.type === 'order') { if (ORDERS.some(o => o.id === cmd.id) && state.mates.length) posse.setOrder(cmd.id); }
    else if (['townUpgrade', 'townSupply', 'townPay', 'townLaw'].includes(cmd.type)) town.command(cmd);
    else if (['hatch', 'breed', 'trader', 'favour'].includes(cmd.type)) frontier.command(cmd);
    else if (['takeJob', 'dropJob', 'turnIn'].includes(cmd.type)) jobs.command(cmd); else economy.command(cmd);
    // a night's rest moves the clock: a timed job loses that time and the board shows the new day's offers
    if (state.clock > before) { jobs.skip(state.clock - before); town.skip(state.clock - before); frontier.skip(state.clock - before); }
    return events;
  }

  // ---- save and load: the whole game as one plain object ----
  const OWNED = ['money', 'res', 'weapons', 'weapon', 'ammo', 'thrown', 'tonics', 'quick', 'gear', 'equipped', 'skills', 'skillPoints', 'mounts', 'mountLv', 'mountXp', 'string', 'journal'];
  function snapshot() {
    const p = player, copy = (v) => JSON.parse(JSON.stringify(v));
    const target = state.job?.type === 'bounty' ? enemies.find(e => e.id === state.job.target && !e.dead) : null;
    return {
      version: SAVE_VERSION, clock: state.clock, won: state.won, rand: rand.state, nextId,
      player: {
        mount: p.mount, x: p.onFoot ? p.steed.x : p.x, z: p.onFoot ? p.steed.z : p.z, yaw: p.yaw, hp: p.hp, dead: p.dead, level: p.level, xp: p.xp,
        stamina: p.stamina, abilityCd: Math.max(0, p.abilityCd), buffs: copy(p.buffs), ...copy(Object.fromEntries(OWNED.map(k => [k, p[k]]))),
      },
      outposts: outposts.map(o => ({ captured: o.captured, progress: o.progress })),
      enemies: enemies.slice(0, baseEnemies).map(e => ({ x: e.x, z: e.z, hp: e.hp, dead: e.dead, deadT: e.deadT })),
      animals: state.animals.map(a => ({ x: a.x, z: a.z, hp: a.hp, penned: a.penned, pennedAt: a.pennedAt, dead: a.dead, deadT: a.deadT })),
      herdTotal: state.herd.total, hollerCd: Math.max(0, state.herd.hollerCd),
      job: jobs.clean(state.job, true), board: state.board.map(j => jobs.clean(j)).filter(Boolean), boardDay: state.boardDay, jobsDone: state.jobsDone,
      bounty: target ? { id: target.id, x: target.x, z: target.z, hp: target.hp, yaw: target.yaw } : null,
      loot: state.loot.map(l => ({ id: l.id, x: l.x, z: l.z, items: { ...l.items }, money: l.money, t: l.t, told: !!l.told })),
      traps: state.traps.map(t => ({ id: t.id, x: t.x, z: t.z })),
      thrown: state.thrown.map(t => ({ id: t.id, sx: t.sx, sz: t.sz, tx: t.tx, tz: t.tz, x: t.x, z: t.z, t: t.t })),
      story: story.snapshot(), posse: posse.snapshot(), town: town.snapshot(), frontier: frontier.snapshot(),
    };
  }

  // Reads a save into a clean copy without touching the game. A save can be a file from anywhere, so every field is
  // checked: structure that cannot be made sense of throws (the save is refused), stray values fall back to defaults,
  // ids are matched against the item tables and unknown keys are dropped.
  function readSave(save) {
    const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const need = (ok) => { if (!ok) throw new Error('bad save'); };
    const num = (v, lo, hi, d) => (fin(v) ? clamp(v, lo, hi) : d);
    const int = (v, lo, hi, d) => (fin(v) ? clamp(Math.round(v), lo, hi) : d);
    const pos = (v) => { need(fin(v)); return clamp(v, -WORLD.half, WORLD.half); };
    const own = (o, k) => isObj(o) && typeof k === 'string' && Object.hasOwn(o, k);
    const get = (o, k) => (own(o, k) ? o[k] : undefined);
    const keys = (o) => (isObj(o) ? Object.keys(o) : []);
    const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
    const idOf = (v, d) => (typeof v === 'string' ? v : '').replace(/\W/g, '').slice(0, 24) || d;

    need(isObj(save) && save.version === SAVE_VERSION);
    need(fin(save.clock) && save.clock >= 0 && fin(save.rand) && Number.isInteger(save.nextId) && save.nextId >= 0);
    need(isObj(save.player));
    need(Array.isArray(save.enemies) && save.enemies.length === baseEnemies);
    need(Array.isArray(save.animals) && save.animals.length === state.animals.length);
    need(Array.isArray(save.outposts) && save.outposts.length === outposts.length);

    const sp = save.player, inv = newInventory();
    need(fin(sp.yaw));
    const weapons = { revolver: 0 }, gear = {}, maxGrade = GRADE_POWER.length - 1;
    for (const id of keys(sp.weapons)) if (Object.hasOwn(WEAPONS, id)) weapons[id] = int(sp.weapons[id], 0, maxGrade, 0);
    for (const id of keys(sp.gear)) if (Object.hasOwn(GEAR, id)) gear[id] = int(sp.gear[id], 0, maxGrade, 0);
    const pick = (table, fn) => Object.fromEntries(Object.keys(table).map(k => [k, fn(k)]));
    const mounts = MOUNTS.map((_, i) => i === 0 || (Array.isArray(sp.mounts) && sp.mounts[i] === true));
    const quick = (slot) => { const id = get(sp.quick, slot); return own(TONICS, id) ? id : inv.quick[slot]; };
    const pl = {
      mount: Number.isInteger(sp.mount) && sp.mount >= 0 && sp.mount < MOUNTS.length && mounts[sp.mount] ? sp.mount : 0,
      x: pos(sp.x), z: pos(sp.z), yaw: sp.yaw, hp: num(sp.hp, 0, 1e6, 0), down: sp.dead === true || !(sp.hp > 0),
      level: int(sp.level, 1, 200, 1), xp: num(sp.xp, 0, 1e9, 0), stamina: num(sp.stamina, 0, 100, 100), abilityCd: num(sp.abilityCd, 0, 600, 0),
      money: int(sp.money, 0, 1e9, 0), skillPoints: int(sp.skillPoints, 0, 999, 0),
      res: pick(inv.res, id => int(get(sp.res, id), 0, 9999, 0)),
      weapons, weapon: own(weapons, sp.weapon) ? sp.weapon : 'revolver',
      ammo: pick(weapons, id => int(get(sp.ammo, id), 0, 99, 0)),
      thrown: pick(inv.thrown, id => int(get(sp.thrown, id), 0, THROWN[id].max, 0)),
      tonics: pick(inv.tonics, id => int(get(sp.tonics, id), 0, TONIC_MAX, 0)),
      quick: { z: quick('z'), x: quick('x') },
      gear, equipped: pick(inv.equipped, slot => { const id = get(sp.equipped, slot); return own(GEAR, id) && GEAR[id].slot === slot && own(gear, id) ? id : null; }),
      skills: pick(inv.skills, tree => int(get(sp.skills, tree), 0, SKILLS[tree].list.length, 0)),
      mounts, buffs: pick(inv.buffs, k => num(get(sp.buffs, k), 0, 600, 0)),
      mountLv: MOUNTS.map((_, i) => int(Array.isArray(sp.mountLv) ? sp.mountLv[i] : 1, 1, MOUNT_MAX_LEVEL, 1)),
      mountXp: MOUNTS.map((_, i) => num(Array.isArray(sp.mountXp) ? sp.mountXp[i] : 0, 0, 1e7, 0)),
      journal: MOUNTS.map((_, i) => (mounts[i] ? 2 : int(Array.isArray(sp.journal) ? sp.journal[i] : 0, 0, 1, 0))),
    };

    const body = (b) => { need(isObj(b)); return { x: pos(b.x), z: pos(b.z), hp: num(b.hp, 0, 1e9, 0), dead: b.dead === true, deadT: num(b.deadT, 0, 1e9, 0) }; };
    const job = jobs.clean(save.job, true);
    let bounty = null;
    if (job?.type === 'bounty') {
      // the live target comes back exactly as it was; a bounty without one cannot be finished, so the save is refused
      const b = save.bounty;
      need(isObj(b));
      bounty = { id: idOf(b.id, ''), x: pos(b.x), z: pos(b.z), hp: num(b.hp, 0, 1e9, 0), yaw: num(b.yaw, -1e6, 1e6, 0) };
      need(bounty.id && !enemies.slice(0, baseEnemies).some(e => e.id === bounty.id));
      job.target = bounty.id;
    }
    // the story: where the player is in the quests, the choices made and who rides with them
    const ss = isObj(save.story) ? save.story : {}, flags = {};
    for (const k of keys(ss.flags).slice(0, 60)) if (/^\w{1,24}$/.test(k)) flags[k] = typeof ss.flags[k] === 'string' ? ss.flags[k].replace(/\W/g, '').slice(0, 24) : ss.flags[k] === true;
    const quest = int(ss.quest, 0, QUESTS.length, 0);
    const said = {};
    for (const k of keys(ss.said).slice(0, 40)) if (own(DIALOGUES, k) && Number.isInteger(ss.said[k]) && ss.said[k] >= 0 && ss.said[k] < 8) said[k] = ss.said[k];
    const storySave = {
      count: int(ss.count, 0, 99, 0), said, taken: list(ss.taken, 50).filter(k => typeof k === 'string' && /^[-\d.,]{1,40}$/.test(k)),
      quest, step: int(ss.step, 0, QUESTS[quest] ? QUESTS[quest].steps.length - 1 : 0, 0), flags, standing: int(ss.standing, 0, 100, 0),
      done: list(ss.done, QUESTS.length).filter(id => QUESTS.some(q => q.id === id)),
      npcs: list(ss.npcs, NPCS.length).filter(n => isObj(n) && NPCS.some(k => k.id === n.id)).map(n => ({ id: n.id, hidden: n.hidden === true })),
    };
    const sq = isObj(save.posse) ? save.posse : {};
    const posseSave = {
      order: ORDERS.some(o => o.id === sq.order) ? sq.order : 'follow',
      mates: list(sq.mates, 4).filter(m => isObj(m) && own(MATES, m.id) && fin(m.x) && fin(m.z)).map(m => ({ id: m.id, x: pos(m.x), z: pos(m.z) })),
    };
    return {
      story: storySave, posse: posseSave,
      clock: save.clock, won: save.won === true, rand: save.rand | 0, nextId: save.nextId, player: pl,
      outposts: save.outposts.map(o => { need(isObj(o)); return { captured: o.captured === true, progress: o.captured === true ? 1 : num(o.progress, 0, 1, 0) }; }),
      enemies: save.enemies.map(body),
      animals: save.animals.map(a => ({ ...body(a), penned: a.penned === true && a.dead !== true, pennedAt: int(a.pennedAt, 0, 1e9, 0) })),
      herdTotal: int(save.herdTotal, 0, 1e9, 0), hollerCd: num(save.hollerCd, 0, 60, 0),
      job, bounty, board: list(save.board, 16).map(j => jobs.clean(j)).filter(Boolean).slice(0, BOARD_SIZE),
      boardDay: int(save.boardDay, -1, 1e9, -1), jobsDone: int(save.jobsDone, 0, 1e9, 0),
      loot: list(save.loot, 64).filter(l => isObj(l) && fin(l.x) && fin(l.z)).map((l, i) => {
        const items = {};
        for (const id in RESOURCES) { const n = int(get(l.items, id), 0, 99, 0); if (n) items[id] = n; }
        return { id: idOf(l.id, `loot${i}`), x: pos(l.x), z: pos(l.z), items, money: int(l.money, 0, 1e6, 0), t: num(l.t, 0, LOOT_LASTS, LOOT_LASTS), told: l.told === true };
      }).filter(l => l.money || Object.keys(l.items).length),
      traps: list(save.traps, THROWN.trap.max).filter(t => isObj(t) && fin(t.x) && fin(t.z)).map((t, i) => ({ id: idOf(t.id, `trap${i}`), x: pos(t.x), z: pos(t.z) })),
      thrown: list(save.thrown, 16).filter(t => isObj(t) && [t.sx, t.sz, t.tx, t.tz, t.x, t.z, t.t].every(fin)).map((t, i) => ({
        id: idOf(t.id, `stick${i}`), sx: pos(t.sx), sz: pos(t.sz), tx: pos(t.tx), tz: pos(t.tz), x: pos(t.x), z: pos(t.z), t: clamp(t.t, 0, THROWN.dynamite.fuse),
      })),
    };
  }

  // Loads a save. Returns false, leaving the game exactly as it was, if the save is malformed or from another version.
  function restore(save) {
    let c;
    try { c = readSave(save); } catch { return false; }

    // from here on nothing can fail: every value was checked above
    state.clock = c.clock;
    state.won = c.won;
    state.hint = '';
    rand.state = c.rand;
    nextId = c.nextId;
    townToastAt = -Infinity;
    const { down, ...owned } = c.player;
    // the string: tamed dinosaurs only, no repeats, always including the one being ridden
    const str = [...new Set((Array.isArray(save.player.string) ? save.player.string : []).filter(i => Number.isInteger(i) && owned.mounts[i]))].slice(0, STRING_MAX);
    if (!str.includes(owned.mount)) { if (str.length >= STRING_MAX) str.pop(); str.push(owned.mount); }
    owned.string = str;
    Object.assign(player, { tame: null, charging: false, meleeCd: 0, swapCd: 0 });
    Object.assign(player, owned, {
      ox: owned.x, oz: owned.z, oyaw: owned.yaw, dead: false, deadT: 0, onFoot: false, moving: 0,
      reloadT: 0, fireCd: 0, hurtT: 99, dashT: 0, dodgeT: 0, dodgeCd: 0,
    });
    economy.recalc();
    // a rider saved at the moment of death wakes at the stables, as after any other fall
    if (down) Object.assign(player, { hp: player.maxHp, stamina: 100, x: PLACES[2].door.x, z: PLACES[2].door.z + 3, ox: PLACES[2].door.x, oz: PLACES[2].door.z + 3 });
    Object.assign(player.steed, { x: player.x, z: player.z, ox: player.x, oz: player.z, yaw: player.yaw, coming: false, stuckT: 0, sd: 0 });
    for (const id in player.ammo) player.ammo[id] = Math.min(player.ammo[id], magazine(id));
    for (const id in player.res) player.res[id] -= Math.min(player.res[id], Math.max(0, economy.bagUsed() - Math.floor(st.bag)));
    if (player.ammo[player.weapon] <= 0) player.reloadT = weaponDef().reload * st.reload;
    for (const b of bullets) { b.life = 0; b.skip = null; }

    c.outposts.forEach((o, i) => Object.assign(outposts[i], o));
    enemies.length = baseEnemies;
    c.enemies.forEach((v, i) => {
      const e = enemies[i], hp = Math.min(v.hp, e.maxHp);
      Object.assign(e, v, {
        hp: !v.dead && hp <= 0 ? e.maxHp : hp, ox: v.x, oz: v.z, state: 'wander', prey: null, tx: v.x, tz: v.z, wanderT: 0, moving: 0, gone: false,
        cd: 0, attackT: 0, flashT: 0, scaredT: 0, heldT: 0, provokedT: 0, stuckT: 0, sx: v.x, sz: v.z, sideT: 0, trying: false,
      });
    });
    c.animals.forEach((v, i) => {
      const hp = Math.min(v.hp, HERD.hp);
      Object.assign(state.animals[i], v, {
        hp: !v.dead && hp <= 0 ? HERD.hp : hp, ox: v.x, oz: v.z, vx: 0, vz: 0, panicT: 0, followT: 0, grazeT: 0, gx: v.x, gz: v.z, moving: 0,
      });
    });
    Object.assign(state, { loot: c.loot, thrown: c.thrown, traps: c.traps, job: c.job, board: c.board, boardDay: c.boardDay, jobsDone: c.jobsDone });
    Object.assign(state.herd, { roped: null, total: c.herdTotal, hollerCd: c.hollerCd });
    if (c.bounty) {
      const b = c.bounty, t = makeEnemy(b.id, 'raptor', b.x, b.z, b.yaw, null, { bounty: true, name: c.job.name, hpMul: JOBS.bounty.hp });
      t.home = { x: c.job.x, z: c.job.z };
      t.hp = b.hp > 0 ? Math.min(b.hp, t.maxHp) : t.maxHp;
    }
    for (const a of state.animals) Object.assign(a, { held: null, safe: false, leader: null });
    player.blindT = 0;
    state.restedAt = undefined;
    town.restore(typeof save.town === 'object' && save.town ? save.town : null);   // before the story, which may switch the siege on
    posse.restore(c.posse);
    state.order = c.posse.order;
    story.restore(c.story);   // puts back whatever the current quest step needs in the world
    frontier.restore(save.frontier);
    economy.recalc();
    return true;
  }

  return { state, step, command, snapshot, restore, herding, economy, jobs, story, posse, town, frontier, st, bloodMoon, rexSealed, natureMul, stageOf, mountXpNeeded, meleeDamage, tameable, xpNeeded, damage, magazine, dayPhase, isNight, muzzle, mountOf, inTown, nearPlace };
}
