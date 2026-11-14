// Frontier rules: weather, second moves, the hatchery, Silas the trader, roaming giants and favours.
import { MOUNTS, DAY, STRING_MAX } from '../data/content.js';
import { THROWN, TONICS, TONIC_MAX, TOWN } from '../data/items.js';
import { heightAt, rng } from './terrain.js';
import { WEATHER, WEATHER_LASTS, MOVES, MOVE_FROM, HATCH, TRADER, GIANT, FAVOURS, FAVOUR_MAX, DISCOVER, LANDMARKS, CACHES, AMBUSH, GOALS } from '../data/frontier.js';
import { WATER_Y } from '../data/content.js';

const angleDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const TAMEABLE = MOUNTS.map((m, i) => (m.wild ? i : -1)).filter(i => i >= 0);

export function createFrontier({ state, player, rand, emit, toast, gainXp, mountGainXp, makeGiant, spawnEnemy, storyDone, enemies, damageEnemy, economy, herding, inTown, atPeace, stageOf, natureMul, mountOf, addStanding }) {
  const zeros = () => MOUNTS.map(() => 0);
  const fresh = () => ({ weather: 'clear', weatherT: 240, thunderT: 30, hatch: null, favours: [], done: [], traderDay: -1, traderEgg: -1, traderFeed: 0, bredDay: -1, giantDay: GIANT.first, giant: null,
    found: [], taken: [], cacheDay: 0, goal: 0, tally: {}, ambushT: AMBUSH.first, tickT: 0 });
  const f = fresh();
  state.frontier = f;
  Object.assign(player, { eggs: zeros(), blood: zeros(), moveCd: 0, guardT: 0 });
  const day = () => Math.floor(DAY.start + state.clock / DAY.length);
  const pay = (cost) => { if (player.money < cost) { toast('Not enough money'); return false; } player.money -= cost; emit({ type: 'coin' }); return true; };

  // ---- caches: the same spots every game, worked out once from the lie of the land ----
  const cacheSpots = [];
  {
    const r = rng(4242);
    for (let tries = 0; cacheSpots.length < CACHES.count && tries < 4000; tries++) {
      const x = (r() - 0.5) * 520, z = (r() - 0.5) * 520;
      if (Math.hypot(x - TOWN.x, z - TOWN.z) < CACHES.clear || heightAt(x, z) < WATER_Y + 0.6 || cacheSpots.some(c => Math.hypot(c.x - x, c.z - z) < 55)) continue;
      cacheSpots.push({ id: `cache${cacheSpots.length}`, x, z });
    }
  }
  const setCaches = () => { state.caches = cacheSpots.filter(c => !f.taken.includes(c.id)); };
  setCaches();
  const bumpTally = (key, n = 1) => { f.tally[key] = (f.tally[key] || 0) + n; };
  function openCache(c) {
    f.taken.push(c.id);
    setCaches();
    bumpTally('cache');
    const money = Math.round(CACHES.money[0] + rand() * (CACHES.money[1] - CACHES.money[0]));
    player.money += money;
    let extra = '';
    const roll = rand();
    if (roll < CACHES.egg) { const i = TAMEABLE[Math.floor(rand() * TAMEABLE.length)]; if (giveEgg(i)) extra = ` and a ${MOUNTS[i].name} egg`; }
    else if (roll < 0.45) { const id = ['bolas', 'bait', 'dynamite', 'trap'][Math.floor(rand() * 4)]; if (player.thrown[id] < THROWN[id].max) { player.thrown[id]++; extra = ` and ${THROWN[id].name.toLowerCase()}`; } }
    else if (roll < 0.8) { const id = ['jerky', 'tonic', 'brew'][Math.floor(rand() * 3)]; if (player.tonics[id] < TONIC_MAX) { player.tonics[id]++; extra = ` and ${TONICS[id].name.toLowerCase()}`; } }
    emit({ type: 'coin' });
    toast(`Supply cache: $${money}${extra}`);
  }

  // ---- goals ----
  const goalNow = () => GOALS[f.goal] || null;
  function goalCount(g) {
    const k = g.need;
    return Math.min(k.n, k.type === 'tally' ? f.tally[k.key] || 0 : k.type === 'level' ? player.level : k.type === 'found' ? f.found.length : k.type === 'favours' ? f.done.length
      : k.type === 'grown' ? (player.mountLv.some((lv, i) => player.mounts[i] && lv >= MOVE_FROM) ? 1 : 0) : player.string.length);
  }
  function checkGoal() {
    for (let g = goalNow(); g && goalCount(g) >= g.need.n; g = goalNow()) {
      f.goal++;
      const r = g.reward, bits = [];
      if (r.money) { player.money += r.money; bits.push(`$${r.money}`); }
      if (r.thrown) { player.thrown[r.thrown[0]] = Math.min(THROWN[r.thrown[0]].max, player.thrown[r.thrown[0]] + r.thrown[1]); bits.push(`${r.thrown[1]} ${THROWN[r.thrown[0]].name.toLowerCase()}`); }
      if (r.tonic) { player.tonics[r.tonic[0]] = Math.min(TONIC_MAX, player.tonics[r.tonic[0]] + r.tonic[1]); bits.push(`${r.tonic[1]} ${TONICS[r.tonic[0]].name.toLowerCase()}`); }
      emit({ type: 'questdone', title: g.text });
      toast(`Goal reached: ${bits.join(' and ')}`);
    }
  }
  const goalStatus = () => { const g = goalNow(); return g ? { text: g.text, n: goalCount(g), of: g.need.n, at: f.goal + 1, total: GOALS.length } : null; };

  // ---- discovery and ambush ----
  function lookAbout() {
    for (const m of LANDMARKS) {
      if (f.found.includes(m.id) || Math.hypot(m.x - player.x, m.z - player.z) > m.r) continue;
      f.found.push(m.id);
      gainXp(DISCOVER.xp);
      emit({ type: 'order' });
      toast(`Discovered: ${m.name} (${f.found.length} of ${LANDMARKS.length})`);
    }
    for (const c of state.caches) if (!player.dead && Math.hypot(c.x - player.x, c.z - player.z) < CACHES.reach) { openCache(c); break; }
    // ambush packs that lost the rider melt back into the brush
    for (const e of enemies) if (e.tag === 'ambush' && !e.dead && Math.hypot(e.x - player.x, e.z - player.z) > AMBUSH.lose) e.gone = true;
  }
  function ambush() {
    f.ambushT = AMBUSH.every[0] + rand() * (AMBUSH.every[1] - AMBUSH.every[0]);
    const gang = storyDone('q6') && rand() < 0.5, kind = gang ? 'rustler' : 'raptor';
    const n = AMBUSH.size[0] + Math.floor(rand() * (AMBUSH.size[1] - AMBUSH.size[0] + 1));
    const cx = player.x + Math.sin(player.yaw) * AMBUSH.ahead, cz = player.z + Math.cos(player.yaw) * AMBUSH.ahead;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, e = spawnEnemy(kind, cx + Math.cos(a) * 7, cz + Math.sin(a) * 7, null, { tag: 'ambush' });
      Object.assign(e, { state: 'chase', provokedT: 20 });
    }
    emit({ type: 'windup', x: cx, z: cz });
    toast(gang ? 'Ambush! Rustlers ride out of the brush ahead' : 'Ambush! Raptors break cover ahead');
  }

  // ---- weather ----
  const weather = () => WEATHER[f.weather] || WEATHER.clear;
  function nextWeather() {
    const ids = Object.keys(WEATHER).filter(id => id === 'clear' || id !== f.weather);
    let r = rand() * ids.reduce((a, id) => a + WEATHER[id].weight, 0), pick = 'clear';
    for (const id of ids) { r -= WEATHER[id].weight; if (r <= 0) { pick = id; break; } }
    // bad weather is always followed by a clear spell
    if (f.weather !== 'clear') pick = 'clear';
    const was = f.weather;
    f.weather = pick;
    f.weatherT = WEATHER_LASTS[0] + rand() * (WEATHER_LASTS[1] - WEATHER_LASTS[0]) * (pick === 'clear' ? 2 : 1);
    if (pick !== was) { emit({ type: 'weather', kind: pick }); toast(WEATHER[pick].says || 'The weather clears'); }
  }

  // ---- the second move ----
  const moveOf = (i = player.mount) => MOVES[i];
  const moveReady = (i = player.mount) => player.mountLv[i] >= MOVE_FROM;
  const bloodK = (i = player.mount) => 1 + (player.blood[i] || 0) * HATCH.bloodDmg;
  const hurtK = () => (player.onFoot ? 1 : (player.guardT > 0 ? MOVES[5].hurt : 1) * (1 - (player.blood[player.mount] || 0) * HATCH.bloodHurt));
  function move() {
    if (player.dead || player.moveCd > 0) return;
    if (player.onFoot) return toast('Mount up first');
    const m = moveOf(), mount = mountOf();
    if (!moveReady()) return toast(`${m.name} comes when your ${mount.name} is Grown (level ${MOVE_FROM})`);
    const fights = m.kind === 'strike' || m.kind === 'cone';
    if (fights && atPeace()) return toast('No fighting in town');
    const power = (e) => m.dmg * stageOf().k * bloodK() * natureMul(mount.nature, e.def.nature);
    const ahead = (e, reach, arc) => !e.dead && !e.gone && e.def.ai !== 'pest' && Math.hypot(e.x - player.x, e.z - player.z) < reach + e.def.radius
      && Math.abs(angleDiff(player.yaw, Math.atan2(e.x - player.x, e.z - player.z))) < arc;
    if (m.kind === 'strike') {
      let best = null, bestD = Infinity;
      for (const e of enemies) { const d = Math.hypot(e.x - player.x, e.z - player.z); if (ahead(e, m.range, 0.7) && d < bestD) { best = e; bestD = d; } }
      if (!best) return toast(`Nothing in reach for ${m.name}`);
      if (m.hold && best !== state.rex) best.heldT = Math.max(best.heldT, m.hold);
      damageEnemy(best, power(best));
    } else if (m.kind === 'cone') {
      let n = 0;
      for (const e of enemies) {
        if (!ahead(e, m.radius, m.arc)) continue;
        n++;
        if (m.hold && e !== state.rex) e.heldT = Math.max(e.heldT, m.hold);
        damageEnemy(e, power(e));
        if (m.scare && !e.dead && e !== state.rex) { e.state = 'scared'; e.scaredT = m.scare; }
      }
      if (!n) return toast(`Nothing in reach for ${m.name}`);
    } else if (m.kind === 'guard') player.guardT = m.time;
    else {
      herding.calm(m.radius);
      player.hp = Math.min(player.maxHp, player.hp + m.heal);
    }
    emit({ type: 'move', name: m.name, kind: m.kind });
    player.moveCd = m.cd * economy.st.abilityCd;
  }

  // ---- hatchery ----
  function hatched(i) {
    emit({ type: 'tamed', kind: MOUNTS[i].wild });
    gainXp(HATCH.xp);
    if (!player.mounts[i]) {
      player.mounts[i] = true;
      player.journal[i] = 2;
      const room = player.string.length < STRING_MAX;
      if (room) player.string.push(i);
      toast(`The egg hatches: a ${MOUNTS[i].name} of your own${room ? ', and it joins your string' : '. It waits at the stables'}`);
    } else if (player.blood[i] < HATCH.bloodMax) {
      player.blood[i]++;
      toast(`The egg hatches: your ${MOUNTS[i].name} line grows stronger (bloodline ${player.blood[i]} of ${HATCH.bloodMax})`);
    } else { mountGainXp(i, HATCH.spareXp); toast(`The egg hatches: your ${MOUNTS[i].name} learns from the young one`); }
    bump('hatch');
  }
  const giveEgg = (i) => { if (player.eggs[i] >= HATCH.eggMax) return false; player.eggs[i]++; return true; };

  // ---- Silas ----
  const traderHere = () => day() % TRADER.every === TRADER.every - 1;
  function traderArrives() {
    f.traderDay = day();
    f.traderEgg = TAMEABLE[Math.floor(rand() * TAMEABLE.length)];
    f.traderFeed = TRADER.feedStock;
    emit({ type: 'order' });
    toast('Silas the trader has pulled his wagon up by the general store');
  }

  // ---- giants ----
  const giantAlive = () => (f.giant ? enemies.find(e => e.id === f.giant.id && !e.dead) : null);
  function spawnGiant(kind, x, z, name, hp) {
    const e = makeGiant(kind, x, z, name);
    if (hp > 0) e.hp = Math.min(hp, e.maxHp);
    f.giant = { id: e.id, kind, name };
    return e;
  }
  function giantAppears() {
    const a = rand() * Math.PI * 2, r = GIANT.near + rand() * (GIANT.far - GIANT.near);
    const kind = GIANT.kinds[Math.floor(rand() * GIANT.kinds.length)], name = GIANT.names[Math.floor(rand() * GIANT.names.length)];
    const e = spawnGiant(kind, TOWN.x + Math.sin(a) * r, TOWN.z + Math.cos(a) * r, name, 0);
    const where = COMPASS[Math.round(((Math.atan2(e.x - TOWN.x, e.z - TOWN.z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
    emit({ type: 'order' });
    toast(`Word in town: ${name}, a giant ${MOUNTS.find(m => m.wild === kind)?.name.toLowerCase() || kind}, has been seen ${where} of Dustfork`);
  }
  const giantMark = () => { const e = giantAlive(); return e ? { x: e.x, z: e.z, name: f.giant.name } : null; };

  // ---- favours ----
  const favourDef = (id) => FAVOURS.find(k => k.id === id);
  const target = (d) => (d.need.type === 'tame' ? 1 : d.need.n);
  const progress = (fav) => {
    const d = favourDef(fav.id);
    return Math.min(target(d), d.need.type === 'give' ? player.res[d.need.res] : d.need.type === 'tame' ? (player.mounts[d.need.i] ? 1 : 0) : fav.n);
  };
  function bump(type, kind) {
    for (const fav of f.favours) {
      const d = favourDef(fav.id);
      if (d.need.type !== type || (type === 'kill' && d.need.kind !== kind) || fav.n >= d.need.n) continue;
      fav.n++;
      if (fav.n >= d.need.n) { emit({ type: 'order' }); toast(`Favour ready to hand in at the notice board: ${d.title}`); }
    }
  }
  function onKill(e, by) {
    if (by === 'tower') return;
    bump('kill', e.kind);
    if (by === 'rider' || by === 'trap') bumpTally(e.kind);
    if (e.alpha) bumpTally('alpha');
    if (e.tag !== 'giant') return;
    bumpTally('giant');
    bump('giant');
    player.money += GIANT.money;
    f.giantDay = day() + GIANT.every[0] + Math.floor(rand() * (GIANT.every[1] - GIANT.every[0] + 1));
    const i = MOUNTS.findIndex(m => m.wild === e.kind);
    const egg = i >= 0 && rand() < GIANT.egg && giveEgg(i);
    emit({ type: 'questdone' });
    toast(`${e.name} is down: $${GIANT.money} from the town${egg ? `, and a ${MOUNTS[i].name} egg in the nest` : ''}`);
    f.giant = null;
  }
  const onPenned = () => { bump('pen'); bumpTally('pen'); };
  const onJobDone = () => bumpTally('job');
  const onStagger = () => bumpTally('stagger');
  // a second animal of a kind you already ride sometimes leaves you an egg
  function onTamed(i, repeat) { bumpTally('tame'); if (repeat && rand() < HATCH.repeatEgg && giveEgg(i)) toast(`You find a ${MOUNTS[i].name} egg where it nested: hatch it at the stables`); }

  function update(dt) {
    player.moveCd = Math.max(0, player.moveCd - dt);
    player.guardT = Math.max(0, player.guardT - dt);
    f.weatherT -= dt;
    if (f.weatherT <= 0) nextWeather();
    if (f.weather === 'rain') { f.thunderT -= dt; if (f.thunderT <= 0) { f.thunderT = 18 + rand() * 30; emit({ type: 'thunder' }); } }
    if (f.hatch) { f.hatch.t -= dt; if (f.hatch.t <= 0) { const i = f.hatch.i; f.hatch = null; hatched(i); } }
    if (traderHere() && f.traderDay !== day()) traderArrives();
    if (f.giant && !giantAlive()) f.giant = null;   // gone some other way: another will come
    if (!f.giant && day() >= f.giantDay && !state.siege) giantAppears();
    // caches come back every few days
    if (day() >= f.cacheDay + CACHES.refill) { f.cacheDay = day(); if (f.taken.length) { f.taken = []; setCaches(); } }
    f.tickT -= dt;
    if (f.tickT <= 0) { f.tickT = 0.25; lookAbout(); checkGoal(); }
    // far from town, on the move, with nothing already on your heels: sometimes a pack is waiting
    const out = Math.hypot(player.x - TOWN.x, player.z - TOWN.z) > AMBUSH.away;
    if (out && !player.dead && !state.siege && player.moving > 0.3) {
      f.ambushT -= dt;
      if (f.ambushT <= 0 && !enemies.some(e => !e.dead && e.state === 'chase')) ambush();
    }
  }
  // a night's rest: the egg keeps warming and the weather moves on
  function skip(seconds) { if (f.hatch) f.hatch.t -= seconds; f.weatherT -= seconds; }

  function command(cmd) {
    if (!inTown()) return toast('You need to be in town for that');
    const i = cmd.i, isMount = Number.isInteger(i) && i >= 0 && i < MOUNTS.length;
    if (cmd.type === 'hatch') {
      if (!isMount || !player.eggs[i]) return;
      if (f.hatch) return toast('The hatchery is already warming an egg');
      if (!pay(economy.price(HATCH.price))) return;
      player.eggs[i]--;
      f.hatch = { i, t: HATCH.time };
      toast(`The ${MOUNTS[i].name} egg goes under the lamps: it hatches in half a day`);
    } else if (cmd.type === 'breed') {
      if (!isMount || !player.mounts[i] || !MOUNTS[i].wild) return;
      if (player.mountLv[i] < MOVE_FROM) return toast(`Your ${MOUNTS[i].name} must be Grown (level ${MOVE_FROM}) to breed`);
      if (f.bredDay === day()) return toast('One clutch a day: come back tomorrow');
      if (player.eggs[i] >= HATCH.eggMax) return toast('You cannot keep more eggs of that kind');
      if (player.res.meat < HATCH.breedMeat) return toast(`Needs ${HATCH.breedMeat} meat for feed`);
      if (!pay(economy.price(HATCH.breedPrice))) return;
      player.res.meat -= HATCH.breedMeat;
      f.bredDay = day();
      player.eggs[i]++;
      toast(`Your ${MOUNTS[i].name} lays: one egg for the hatchery`);
    } else if (cmd.type === 'trader') {
      if (!traderHere()) return toast('Silas has moved on');
      if (cmd.buy === 'egg') {
        if (f.traderEgg < 0) return toast('Silas has no egg left this visit');
        if (player.eggs[f.traderEgg] >= HATCH.eggMax) return toast('You cannot keep more eggs of that kind');
        if (!pay(economy.price(TRADER.egg))) return;
        player.eggs[f.traderEgg]++;
        toast(`A ${MOUNTS[f.traderEgg].name} egg: hatch it at the stables`);
        f.traderEgg = -1;
      } else if (cmd.buy === 'feed') {
        if (f.traderFeed < 1) return toast('Silas is out of growth feed');
        if (!pay(economy.price(TRADER.feed))) return;
        f.traderFeed--;
        mountGainXp(player.mount, TRADER.feedXp);
        toast(`Your ${mountOf().name} wolfs the feed down`);
      } else if (cmd.buy === 'claws') {
        const n = player.res.claws;
        if (!n) return;
        player.money += n * economy.sellPrice('claws') * TRADER.clawsMul;
        player.res.claws = 0;
        emit({ type: 'coin' });
      }
    } else if (cmd.type === 'favour') {
      const d = typeof cmd.id === 'string' ? favourDef(cmd.id) : null, at = f.favours.findIndex(k => k.id === cmd.id);
      if (!d) return;
      if (cmd.act === 'take') {
        if (at >= 0 || f.done.includes(d.id)) return;
        if (f.favours.length >= FAVOUR_MAX) return toast(`You can carry ${FAVOUR_MAX} favours at a time`);
        f.favours.push({ id: d.id, n: 0 });
        emit({ type: 'order' });
        toast(`${d.who} is counting on you: ${d.title}`);
      } else if (cmd.act === 'drop') { if (at >= 0) f.favours.splice(at, 1); }
      else if (cmd.act === 'done') {
        if (at < 0 || progress(f.favours[at]) < target(d)) return;
        if (d.need.type === 'give') player.res[d.need.res] -= d.need.n;
        f.favours.splice(at, 1);
        f.done.push(d.id);
        const r = d.reward;
        player.money += r.money || 0;
        if (r.xp) gainXp(r.xp);
        if (r.standing) addStanding(r.standing);
        if (r.thrown) player.thrown[r.thrown[0]] = Math.min(THROWN[r.thrown[0]].max, player.thrown[r.thrown[0]] + r.thrown[1]);
        emit({ type: 'questdone', title: d.title });
        toast(`${d.who} thanks you: $${r.money}${r.thrown ? ` and ${r.thrown[1]} ${THROWN[r.thrown[0]].name.toLowerCase()}` : ''}`);
      }
    }
  }

  function snapshot() {
    const g = giantAlive();
    return JSON.parse(JSON.stringify({
      weather: f.weather, weatherT: f.weatherT, hatch: f.hatch, favours: f.favours, done: f.done, traderDay: f.traderDay, traderEgg: f.traderEgg,
      traderFeed: f.traderFeed, bredDay: f.bredDay, giantDay: f.giantDay, eggs: player.eggs, blood: player.blood,
      giant: g ? { kind: g.kind, x: g.x, z: g.z, hp: g.hp, name: f.giant.name } : null,
      found: f.found, taken: f.taken, cacheDay: f.cacheDay, goal: f.goal, tally: f.tally, ambushT: f.ambushT,
    }));
  }
  // Every field is checked: a save can come from anywhere.
  function restore(save) {
    const s = save && typeof save === 'object' && !Array.isArray(save) ? save : {};
    const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d), int = (v, lo, hi, d) => Math.round(num(v, lo, hi, d));
    const arr = (v) => (Array.isArray(v) ? v : []);
    const mountI = (v) => Number.isInteger(v) && v >= 0 && v < MOUNTS.length;
    Object.assign(f, fresh(), {
      weather: typeof s.weather === 'string' && Object.hasOwn(WEATHER, s.weather) ? s.weather : 'clear', weatherT: num(s.weatherT, 0, 2000, 240),
      hatch: s.hatch && mountI(s.hatch.i) ? { i: s.hatch.i, t: num(s.hatch.t, 0, HATCH.time, HATCH.time) } : null,
      done: [...new Set(arr(s.done).filter(id => typeof id === 'string' && favourDef(id)))],
      traderDay: int(s.traderDay, -1, 1e6, -1), traderEgg: TAMEABLE.includes(s.traderEgg) ? s.traderEgg : -1, traderFeed: int(s.traderFeed, 0, TRADER.feedStock, 0),
      bredDay: int(s.bredDay, -1, 1e6, -1), giantDay: int(s.giantDay, 0, 1e6, day() + 1),
      found: [...new Set(arr(s.found).filter(id => LANDMARKS.some(m => m.id === id)))], taken: [...new Set(arr(s.taken).filter(id => cacheSpots.some(c => c.id === id)))],
      cacheDay: int(s.cacheDay, 0, 1e6, day()), goal: int(s.goal, 0, GOALS.length, 0), ambushT: num(s.ambushT, 0, AMBUSH.every[1], AMBUSH.first),
    });
    f.tally = {};
    if (s.tally && typeof s.tally === 'object') for (const k of Object.keys(s.tally).slice(0, 40)) if (/^\w{1,16}$/.test(k)) f.tally[k] = int(s.tally[k], 0, 1e6, 0);
    setCaches();
    for (const k of arr(s.favours).slice(0, FAVOUR_MAX)) {
      const d = k && typeof k.id === 'string' ? favourDef(k.id) : null;
      if (d && !f.done.includes(d.id) && !f.favours.some(a => a.id === d.id)) f.favours.push({ id: d.id, n: int(k.n, 0, d.need.n || 1, 0) });
    }
    player.eggs = MOUNTS.map((m, i) => (m.wild ? int(arr(s.eggs)[i], 0, HATCH.eggMax, 0) : 0));
    player.blood = MOUNTS.map((_, i) => int(arr(s.blood)[i], 0, HATCH.bloodMax, 0));
    Object.assign(player, { moveCd: 0, guardT: 0 });
    const g = s.giant;
    if (g && typeof g === 'object' && GIANT.kinds.includes(g.kind) && Number.isFinite(g.x) && Number.isFinite(g.z)) {
      spawnGiant(g.kind, num(g.x, -400, 400, 0), num(g.z, -400, 400, 0), GIANT.names.includes(g.name) ? g.name : GIANT.names[0], num(g.hp, 1, 1e6, 0));
    }
  }

  return { update, skip, command, move, moveOf, moveReady, bloodK, hurtK, weather, traderHere, giantMark, progress, target, onKill, onPenned, onTamed, onJobDone, onStagger, goalStatus, snapshot, restore };
}
