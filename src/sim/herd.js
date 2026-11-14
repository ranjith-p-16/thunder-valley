// Herding rules: longhorns flock, shy away from the rider and from predators, and are safe once inside the ranch pen.
import { lerpAngle } from './terrain.js';
import { PEN, HERD_SPOTS, HERD } from '../data/content.js';

export function createHerding({ player, enemies, rand, obstacles, gainXp, emit, stats, onPenned }) {
  const animals = [];
  HERD_SPOTS.forEach((spot, herd) => {
    for (let i = 0; i < HERD.size; i++) {
      const ang = (i / HERD.size) * 6.28, x = spot.x + Math.cos(ang) * 6, z = spot.z + Math.sin(ang) * 6;
      animals.push({ id: `longhorn${animals.length}`, herd, x, z, ox: x, oz: z, vx: 0, vz: 0, yaw: rand() * 6.28, oyaw: 0, hp: HERD.hp,
        penned: false, pennedAt: 0, dead: false, deadT: 0, moving: 0, panicT: 0, px: 0, pz: 0, followT: 0, grazeT: 0, gx: x, gz: z });
    }
  });

  const s = { roped: null, hollerCd: 0, total: 0 };
  // inside this distance of the pen centre an animal counts as penned; the fence keeps a body 0.3 further in than this
  const PEN_IN = PEN.r - HERD.radius - 0.2;
  const free = (a) => !a.dead && !a.penned;
  const counts = () => ({ penned: animals.filter(a => a.penned).length, lost: animals.filter(a => a.dead).length, total: s.total });
  const toast = (text) => emit({ type: 'toast', text });

  // Sends every loose longhorn within `radius` running straight away from the rider.
  function stampede(radius) {
    emit({ type: 'wave', x: player.x, z: player.z, r: radius });
    for (const a of animals) {
      if (free(a) && a !== s.roped && Math.hypot(a.x - player.x, a.z - player.z) < radius) Object.assign(a, { panicT: 2.5, followT: 0, px: player.x, pz: player.z });
    }
  }
  function holler() {
    if (player.dead) return;
    if (s.hollerCd > 0) return toast(`Holler ready in ${Math.ceil(s.hollerCd)}s`);
    s.hollerCd = HERD.hollerCd * stats().hollerCd;
    emit({ type: 'holler' });
    stampede(HERD.hollerR * stats().hollerR);
  }
  // Loose longhorns within `radius` trail the rider for `seconds`. Returns how many answered.
  function rally(radius, seconds) {
    let n = 0;
    for (const a of animals) {
      if (free(a) && !a.held && Math.hypot(a.x - player.x, a.z - player.z) < radius) { a.followT = seconds; a.panicT = 0; a.leader = null; n++; }
    }
    return n;
  }
  function lasso() {
    if (player.dead) return;
    if (s.roped) { s.roped = null; return; }
    let best = null, bestD = HERD.ropeR * stats().rope;
    for (const a of animals) {
      const d = Math.hypot(a.x - player.x, a.z - player.z);
      if (free(a) && !a.held && d < bestD) { best = a; bestD = d; }
    }
    if (best) { s.roped = best; emit({ type: 'lasso' }); } else toast('No longhorn in rope range');
  }
  function nearestPrey(x, z, range) {
    let best = null;
    for (const a of animals) {
      const d = Math.hypot(a.x - x, a.z - z);
      if (free(a) && !a.safe && d < range) { best = a; range = d; }
    }
    return best;
  }
  function hurt(a, dmg) {
    if (!free(a) || a.safe) return;
    a.hp -= dmg;
    if (a.hp <= 0) {
      a.dead = true;
      a.deadT = 0;
      if (s.roped === a) s.roped = null;
      emit({ type: 'lost' });
      toast('Predators took a longhorn');
    }
  }
  // Calming herb: loose longhorns nearby stop running.
  function calm(radius) {
    let n = 0;
    for (const a of animals) {
      if (free(a) && Math.hypot(a.x - player.x, a.z - player.z) < radius) { a.panicT = 0; a.vx = a.vz = 0; n++; }
    }
    return n;
  }
  // The pen holds a limited number; the longest-held animal is sold on and a wild one takes its place on the range.
  function sellOldest(holds) {
    const penned = animals.filter(a => a.penned);
    if (penned.length <= holds) return;
    const a = penned.reduce((m, b) => (b.pennedAt < m.pennedAt ? b : m)), spot = HERD_SPOTS[a.herd];
    const ang = rand() * 6.28;
    Object.assign(a, { penned: false, x: spot.x + Math.cos(ang) * 6, z: spot.z + Math.sin(ang) * 6, vx: 0, vz: 0, hp: HERD.hp, grazeT: 0, followT: 0, panicT: 0 });
    a.ox = a.x; a.oz = a.z;
  }
  // A longhorn lost to predators is replaced by a wild one at its herd's home after a while.
  function respawn(a) {
    const spot = HERD_SPOTS[a.herd], ang = rand() * 6.28;
    Object.assign(a, { dead: false, deadT: 0, penned: false, x: spot.x + Math.cos(ang) * 6, z: spot.z + Math.sin(ang) * 6, vx: 0, vz: 0,
      hp: HERD.hp, grazeT: 0, followT: 0, panicT: 0, moving: 0, leader: null, held: null, safe: false });
    a.ox = a.x; a.oz = a.z; a.gx = a.x; a.gz = a.z;
  }
  // Quests: gather a whole herd at a spot and keep it there, safe from predators, until release() sets it running.
  function hold(herd, x, z) {
    animals.filter(a => a.herd === herd).forEach((a, i, list) => {
      const ang = (i / list.length) * 6.28;
      Object.assign(a, { dead: false, deadT: 0, penned: false, hp: HERD.hp, x: x + Math.cos(ang) * 5, z: z + Math.sin(ang) * 5, vx: 0, vz: 0,
        followT: 0, panicT: 0, grazeT: 0, leader: null, held: { x, z }, safe: true });
      a.ox = a.x; a.oz = a.z;
      if (s.roped === a) s.roped = null;
    });
  }
  function release(herd) {
    for (const a of animals) if (a.herd === herd && a.held) Object.assign(a, { held: null, followT: 0, leader: null, panicT: 2.5, px: player.x, pz: player.z });
  }
  function hint() {
    if (s.roped) return 'Longhorn roped: lead it through the gate · Q to let go';
    if (animals.some(a => free(a) && a.followT > 0 && !a.leader)) return 'The herd is following you: lead it through the gate';
    if (animals.some(a => free(a) && !a.held && !a.leader && Math.hypot(a.x - player.x, a.z - player.z) < 34)) return 'Ride behind the herd to push it to the ranch gate · E holler · Q lasso';
    return '';
  }

  function update(dt) {
    s.hollerCd = Math.max(0, s.hollerCd - dt);
    if (player.dead) s.roped = null;

    const cent = HERD_SPOTS.map(() => ({ x: 0, z: 0, n: 0 }));
    for (const a of animals) if (free(a)) { const c = cent[a.herd]; c.x += a.x; c.z += a.z; c.n++; }

    for (const a of animals) {
      a.ox = a.x; a.oz = a.z; a.oyaw = a.yaw;
      if (a.dead) {
        a.deadT += dt;
        a.moving = 0;
        if (a.deadT >= HERD.respawn) respawn(a);
        continue;
      }
      let dx = 0, dz = 0, speed = 0;   // wanted direction and speed
      const graze = (cx, cz, spread) => {
        a.grazeT -= dt;
        if (a.grazeT <= 0) {
          a.grazeT = 2 + rand() * 5;
          const ang = rand() * 6.28, r = rand() * spread;
          a.gx = cx + Math.cos(ang) * r;
          a.gz = cz + Math.sin(ang) * r;
        }
        if (Math.hypot(a.gx - a.x, a.gz - a.z) > 1.5) { dx = a.gx - a.x; dz = a.gz - a.z; speed = 1.4; }
      };
      const separate = () => {
        for (const b of animals) {
          if (b === a || !free(b)) continue;
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          if (d < 4 && d > 0.01) { const k = (1 - d / 4) * 1.2; dx += ((a.x - b.x) / d) * k; dz += ((a.z - b.z) / d) * k; speed = Math.max(speed, 1.4); }
        }
      };
      if (a.penned) graze(PEN.x, PEN.z, PEN.r - 4);
      else if (a.held) graze(a.held.x, a.held.z, 6);   // kept at a camp by a quest until it is set loose
      else if (a === s.roped || a.followT > 0) {
        // a roped animal follows the rider; a rallied one follows whoever called it (the rider or a posse mate)
        const lead = a === s.roped ? player : (a.leader || player);
        a.followT -= dt;
        if (player.dead && lead === player) a.followT = 0;
        if (a.followT <= 0) a.leader = null;
        const d = Math.hypot(lead.x - a.x, lead.z - a.z);
        if (d > HERD.ropeSlack) { dx = (lead.x - a.x) / d; dz = (lead.z - a.z) / d; speed = Math.min(HERD.run + 4, (d - HERD.ropeSlack) * 3); }
        // pulled hard but going nowhere: wedged on a tree or rock, so cut sideways for a moment
        a.jamT = speed > 3 && (a.pace ?? 9) < 1 ? (a.jamT || 0) + dt : 0;
        if (a.jamT > 1) { a.jamT = 0; a.sideT = 0.9; a.side = -(a.side || 1); }
        if (a.sideT > 0) { a.sideT -= dt; const sx = -dz * a.side + dx * 0.3, sz = dx * a.side + dz * 0.3; dx = sx; dz = sz; }
        if (a !== s.roped) separate();
      } else {
        let fear = 0;
        const flee = (fx, fz, radius, weight) => {
          const d = Math.hypot(a.x - fx, a.z - fz);
          if (d >= radius || d < 0.01) return;
          const k = 1 - d / radius;
          dx += ((a.x - fx) / d) * k * weight;
          dz += ((a.z - fz) / d) * k * weight;
          fear = Math.max(fear, k);
        };
        if (!player.dead) flee(player.x, player.z, HERD.pressure, 1);
        for (const e of enemies) if (!e.dead) flee(e.x, e.z, 15, 1.5);
        if (a.panicT > 0) {
          a.panicT -= dt;
          const d = Math.hypot(a.x - a.px, a.z - a.pz) || 1;
          dx += ((a.x - a.px) / d) * 1.5;
          dz += ((a.z - a.pz) / d) * 1.5;
          fear = 2;
        }
        // frightened animals bunch up on the herd; calm ones drift back to graze around the herd's home
        const c = cent[a.herd], spot = HERD_SPOTS[a.herd], cx = c.n ? c.x / c.n : spot.x, cz = c.n ? c.z / c.n : spot.z;
        if (fear > 0) {
          const cd = Math.hypot(cx - a.x, cz - a.z);
          if (cd > 7) { const pull = cd > 20 ? 1 : 0.5; dx += ((cx - a.x) / cd) * pull; dz += ((cz - a.z) / cd) * pull; }
          speed = fear > 1 ? HERD.panic : HERD.walk + (HERD.run - HERD.walk) * Math.min(1, fear * 1.6);
        } else graze(spot.x, spot.z, 9);
        separate();
      }
      const len = Math.hypot(dx, dz) || 1, ease = 1 - Math.exp(-4 * dt);
      a.vx += ((dx / len) * speed - a.vx) * ease;
      a.vz += ((dz / len) * speed - a.vz) * ease;
      a.x += a.vx * dt;
      a.z += a.vz * dt;
      obstacles.resolve(a, HERD.radius);
      a.pace = Math.hypot(a.x - a.ox, a.z - a.oz) / dt;   // how fast it really moved this step, after scenery pushed back
      const sp = Math.hypot(a.vx, a.vz);
      a.moving = Math.min(1, sp / HERD.run);
      if (sp > 0.3) a.yaw = lerpAngle(a.yaw, Math.atan2(a.vx, a.vz), 1 - Math.exp(-6 * dt));

      if (!a.penned && Math.hypot(a.x - PEN.x, a.z - PEN.z) < PEN_IN) {
        a.penned = true;
        a.grazeT = 0;
        a.followT = 0;
        a.panicT = 0;
        if (s.roped === a) s.roped = null;
        a.pennedAt = ++s.total;
        const byMate = !!a.leader;
        a.safe = false; a.leader = null; a.held = null;
        if (!byMate) gainXp(HERD.xp);
        emit({ type: 'penned' });
        onPenned(a, byMate);
      } else if (a.penned) {
        // penned animals never wander back out through the gate
        const penD = Math.hypot(a.x - PEN.x, a.z - PEN.z), max = PEN_IN;
        if (penD > max) { a.x = PEN.x + ((a.x - PEN.x) / penD) * max; a.z = PEN.z + ((a.z - PEN.z) / penD) * max; }
      }
      a.hp = Math.min(HERD.hp, a.hp + 4 * dt);
    }
  }

  return { animals, state: s, update, holler, stampede, rally, lasso, nearestPrey, hurt, hint, counts, calm, sellOldest, free, hold, release };
}
