// Posse mates: riders the computer controls. Each seat is driven by simple orders so a real player can take it later.
import { lerpAngle } from './terrain.js';
import { MATES, ORDERS } from '../data/story.js';
import { PEN, HERD } from '../data/content.js';
import { TOWN } from '../data/items.js';

const HERD_REST = 90;   // seconds a mate needs between herding runs
const RADIUS = 1.4, CATCH_UP = 95, HERD_REACH = 130, LEAD_SPEED = 8.5, EPS = 1e-3;
// the walk from the open range into the pen: stand south of the gate, go in, go deep, come back out
const GATE_PATH = [{ x: 0, z: 8 }, { x: 0, z: PEN.z - 4 }, { x: 0, z: PEN.z + 7 }];
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const CALL = { rustler: 'Riders', dilo: 'Spitter', rex: 'The Rex', raptor: 'Raptors' };

export function createPosse({ state, player, emit, toast, enemies, herding, obstacles, damageEnemy, clearLine, atPeace, spare }) {
  const mates = state.mates = [];
  state.order = 'follow';
  state.herdRest = 0;
  const say = (m, text) => { emit({ type: 'say', who: m.name, text }); m.sayCd = 6; };

  function join(id, quiet = false) {
    if (mates.some(m => m.id === id)) return;
    const def = MATES[id], x = player.x + 4, z = player.z - 3;
    mates.push({ id, name: def.name, mount: def.mount, def, x, z, ox: x, oz: z, yaw: 0, oyaw: 0, moving: 0, fireCd: 0, sayCd: 0, task: null, stuckT: 0, lastFar: 0 });
    if (quiet) return;
    toast(`${def.name} joins your posse`);
    emit({ type: 'levelup' });
  }
  // G steps through the four orders.
  function cycleOrder() {
    if (!mates.length) return toast('You ride alone for now');
    const i = (ORDERS.findIndex(o => o.id === state.order) + 1) % ORDERS.length;
    setOrder(ORDERS[i].id);
  }
  function setOrder(id) {
    // herding is hard riding: after a run the mount needs a breather before the next
    if (id === 'herd' && state.herdRest > 0) { toast(`${mates[0]?.name ?? 'Your mate'}'s mount needs ${Math.ceil(state.herdRest)}s more rest before herding again`); id = 'follow'; }
    applyOrder(id);
  }
  function applyOrder(id) {
    state.order = id;
    for (const m of mates) {
      m.task = null;
      for (const a of herding.animals) if (a.leader === m) { a.leader = null; a.followT = 0; }
    }
    emit({ type: 'order' });
    toast(`Posse: ${ORDERS.find(o => o.id === id).label}`);
  }

  // Rides toward a point and reports true once within `stop` of it.
  function moveTo(m, x, z, speed, stop, dt) {
    const dx = x - m.x, dz = z - m.z, d = Math.hypot(dx, dz);
    if (d <= stop + EPS) return true;
    m.yaw = lerpAngle(m.yaw, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
    const stepLen = Math.min(d - stop, speed * dt);
    m.x += (dx / d) * stepLen;
    m.z += (dz / d) * stepLen;
    m.moving = Math.min(1, speed / 15);
    return d - stepLen <= stop + EPS;
  }
  function shoot(m, e, dt) {
    m.yaw = lerpAngle(m.yaw, Math.atan2(e.x - m.x, e.z - m.z), 1 - Math.exp(-10 * dt));
    if (m.fireCd > 0) return;
    m.fireCd = m.def.fireCd;
    emit({ type: 'mateShot', x1: m.x, z1: m.z, x2: e.x, z2: e.z });
    damageEnemy(e, m.def.dmg, 'mate');
  }
  const nearestEnemy = (x, z, range, pick = () => true) => {
    let best = null;
    for (const e of enemies) {
      const d = Math.hypot(e.x - x, e.z - z);
      if (!e.dead && !e.gone && e.def.ai !== 'pest' && !spare(e) && d < range && pick(e)) { best = e; range = d; }
    }
    return best;
  };
  const hostile = (e) => e.state === 'chase' || e.state === 'hunt';
  const inTown = (b) => Math.hypot(b.x - TOWN.x, b.z - TOWN.z) < TOWN.r;
  const behindRider = (m, back) => { m.x = player.x - Math.sin(player.yaw) * back; m.z = player.z - Math.cos(player.yaw) * back; obstacles.resolve(m, RADIUS); m.ox = m.x; m.oz = m.z; m.stuckT = 0; };

  function follow(m, i, dt) {
    // ride behind and to one side of the player
    const side = i % 2 ? -1 : 1, back = 6 + Math.floor(i / 2) * 5;
    const gx = player.x - Math.sin(player.yaw) * back + Math.cos(player.yaw) * 5 * side, gz = player.z - Math.cos(player.yaw) * back - Math.sin(player.yaw) * 5 * side;
    const d = Math.hypot(gx - m.x, gz - m.z);
    moveTo(m, gx, gz, d > 22 ? 24 : m.def.speed, 2.5, dt);
    // a fence or wall in the way: after a few seconds of getting no closer, cut round to the rider
    m.stuckT = d > 9 && d > m.lastFar - 0.02 ? m.stuckT + dt : 0;
    m.lastFar = d;
    if (m.stuckT > 3) behindRider(m, 6);
  }
  // Returns true while the mate is busy with the target. No shooting in town, by her or at a rider who is in it.
  function fight(m, target, dt) {
    if (!target || atPeace(m) || atPeace(player)) return false;
    const d = Math.hypot(target.x - m.x, target.z - m.z);
    if (d > m.def.range || !clearLine(m.x, m.z, target.x, target.z)) moveTo(m, target.x, target.z, m.def.speed, 5, dt);
    else shoot(m, target, dt);
    return true;
  }

  // "Help the herd": ride to loose longhorns, call them, lead them through the gate once, then fall back in.
  function herd(m, dt) {
    const loose = herding.animals.filter(a => !a.dead && !a.penned && !a.held);
    const t = m.task || (m.task = { phase: 'gather', leg: 0, time: 0 });
    t.time += dt;
    const mine = loose.filter(a => a.leader === m);
    if (t.phase === 'gather') {
      let best = null, bestD = HERD_REACH;
      for (const a of loose) { const d = Math.hypot(a.x - m.x, a.z - m.z); if (d < bestD) { best = a; bestD = d; } }
      if (!best) { say(m, 'No loose longhorns in reach.'); return 'done'; }
      if (moveTo(m, best.x, best.z, m.def.speed, 9, dt)) {
        let n = 0;
        for (const a of loose) if (a !== herding.state.roped && Math.hypot(a.x - m.x, a.z - m.z) < 32) { a.leader = m; a.followT = 60; a.panicT = 0; n++; }
        emit({ type: 'ability', name: 'Rally' });
        say(m, `Got ${n}. Bringing them in.`);
        Object.assign(t, { phase: 'lead', leg: 0, time: 0 });
      } else if (t.time > 60) { say(m, 'Cannot get to them.'); return 'done'; }
    } else if (t.phase === 'lead') {
      if (!mine.length) { say(m, t.leg >= 2 ? 'They\'re in. Back with you.' : 'Lost them.'); Object.assign(t, { phase: 'leave', time: 0 }); return; }
      for (const a of mine) a.followT = 10;
      // do not outrun the animals: wait when the nearest follower falls behind
      const lag = Math.min(...mine.map(a => Math.hypot(a.x - m.x, a.z - m.z)));
      const p = GATE_PATH[t.leg];
      if (lag < HERD.ropeSlack + 9 && moveTo(m, p.x, p.z, LEAD_SPEED, 1.5, dt) && t.leg < GATE_PATH.length - 1) t.leg++;
      if (t.time > 150) { for (const a of mine) { a.leader = null; a.followT = 0; } say(m, 'They will not come. Leaving them.'); return 'done'; }
    } else if (moveTo(m, GATE_PATH[0].x, GATE_PATH[0].z, m.def.speed, 2, dt) || t.time > 20) return 'done';   // out of the pen: one delivery per order
  }

  function update(dt) {
    state.herdRest = Math.max(0, state.herdRest - dt);
    mates.forEach((m, i) => {
      m.ox = m.x; m.oz = m.z; m.oyaw = m.yaw;
      m.moving = 0;
      m.fireCd -= dt;
      m.sayCd -= dt;
      const far = Math.hypot(player.x - m.x, player.z - m.z);
      // a mate the story wants to talk to comes back to the rider whatever she was told
      if (state.callMate === m.id && state.order !== 'follow') applyOrder('follow');
      const order = player.dead ? 'follow' : state.order;
      if (order === 'follow' && far > CATCH_UP) behindRider(m, 10);   // left far behind: rejoin just behind the rider
      if (order === 'hold') {
        const e = nearestEnemy(m.x, m.z, m.def.range, hostile);
        if (e && !atPeace(m) && !atPeace(player) && clearLine(m.x, m.z, e.x, e.z)) shoot(m, e, dt);
      } else if (order === 'attack') {
        // whatever is on the rider, else the nearest animal to the rider
        const e = nearestEnemy(player.x, player.z, 45, hostile) || nearestEnemy(player.x, player.z, 40);
        if (!fight(m, e, dt)) follow(m, i, dt);
      } else if (order === 'calm') follow(m, i, dt);   // ride along, guns holstered: for taming
      else if (order === 'herd') {
        if (herd(m, dt) === 'done') { state.herdRest = HERD_REST; applyOrder('follow'); }
      } else {
        const e = nearestEnemy(m.x, m.z, m.def.range + 4, hostile);
        if (!(e && far < 40 && fight(m, e, dt))) follow(m, i, dt);
      }
      for (const o of mates) {
        if (o === m) continue;
        const dx = m.x - o.x, dz = m.z - o.z, d = Math.hypot(dx, dz);
        if (d < 4.5 && d > 0.01) { m.x += (dx / d) * (4.5 - d) * 0.5; m.z += (dz / d) * (4.5 - d) * 0.5; }
      }
      for (const n of state.npcs || []) {
        if (n.hidden) continue;
        const dx = m.x - n.x, dz = m.z - n.z, d = Math.hypot(dx, dz);
        if (d < 4 && d > 0.01) { m.x = n.x + (dx / d) * 4; m.z = n.z + (dz / d) * 4; }
      }
      obstacles.resolve(m, RADIUS);
      // call out danger the rider may not have seen
      if (m.sayCd <= 0 && !player.dead && mates.every(o => o.sayCd <= 0 || o === m)) {
        const e = nearestEnemy(player.x, player.z, 45, (k) => k.state === 'chase');
        if (e) say(m, `${CALL[e.kind] || 'Trouble'} to the ${COMPASS[Math.round(Math.atan2(e.x - player.x, e.z - player.z) / (Math.PI / 4) + 8) % 8]}!`);
      }
    });
  }

  const snapshot = () => ({ order: state.order, mates: mates.map(m => ({ id: m.id, x: m.x, z: m.z })) });
  function restore(save) {
    mates.length = 0;
    state.order = 'follow';
    for (const s of save?.mates || []) {
      join(s.id, true);
      const m = mates[mates.length - 1];
      Object.assign(m, { x: s.x, z: s.z, ox: s.x, oz: s.z });
    }
  }
  return { join, cycleOrder, setOrder, update, snapshot, restore };
}
