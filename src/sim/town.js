// Ruling Dustfork: once the town is yours it has a treasury, stores, safety and morale, it can be levelled up,
// and raiders come for it from time to time.
import { DAY, TOWN_LEVELS, TAX_LAWS, TOWN_RULE as R } from '../data/content.js';
import { TOWN } from '../data/items.js';
import { QUESTS } from '../data/story.js';

const clamp100 = (v) => Math.max(0, Math.min(100, v));

export function createTown({ state, player, rand, emit, toast, gainXp, spawnEnemy, enemies, damageEnemy, economy, inTown }) {
  const fresh = () => ({ owned: false, level: 1, ...R.start, day: 0, law: 'fair', raidIn: R.firstRaid, warned: false, raid: null, towerT: 0, raidsWon: 0, raidsLost: 0 });
  const town = state.town = fresh();
  const dayNow = () => Math.floor(DAY.start + state.clock / DAY.length);
  const raiders = () => enemies.filter(e => e.tag === 'raid' && !e.dead && !e.gone);

  // The story hands the town over.
  function claim() {
    Object.assign(town, fresh(), { owned: true, day: dayNow(), supplies: town.supplies });   // stores gathered before the takeover carry over
    emit({ type: 'capture', name: 'Dustfork' });
    toast('Dustfork is yours! Press U for the town ledger');
    economy.recalc();
  }
  function addSupplies(n) { town.supplies = clamp100(town.supplies + n); }

  function startRaid() {
    const n = R.raiders + town.level * R.raidersPerLevel + (town.safety < 40 ? 2 : 0);
    beginRaid(R.bell * (town.level >= 5 ? 2 : 1), n);
    emit({ type: 'death' });
    toast('Raiders are riding in! Kill them before they bring the bell down');
  }
  function beginRaid(bell, n) {
    town.raid = { bell };
    town.warned = false;
    state.siege = true;
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.28, d = TOWN.r + 22 + rand() * 10;
      const e = spawnEnemy(i % 3 === 2 ? 'raptor' : 'rustler', TOWN.x + Math.cos(a) * d, TOWN.z + Math.sin(a) * d, null, { tag: 'raid' });
      // raiders ride straight for the town and do not give up
      Object.assign(e, { home: { x: TOWN.x, z: TOWN.z }, state: 'chase', provokedT: 1e6 });
    }
  }
  function endRaid(won) {
    for (const e of enemies) if (e.tag === 'raid') e.gone = true;
    town.raid = null;
    // a stand in the square that the story is running goes on after the raid is over
    state.siege = QUESTS[state.story?.quest]?.steps[state.story.step]?.type === 'hold';
    town.raidIn = R.raidEvery[0] + rand() * (R.raidEvery[1] - R.raidEvery[0]);
    if (won) {
      town.raidsWon++;
      town.treasury += R.win.treasury;
      town.safety = clamp100(town.safety + R.win.safety);
      town.morale = clamp100(town.morale + R.win.morale);
      if (Math.hypot(player.x - TOWN.x, player.z - TOWN.z) < TOWN.r + 40) gainXp(R.win.xp);   // only a rider who was there earns it
      emit({ type: 'questdone' });
      toast(`The raid is beaten off: $${R.win.treasury} to the treasury`);
    } else {
      town.raidsLost++;
      const lost = Math.round(town.treasury * R.lose.treasury);
      town.treasury -= lost;
      town.supplies = clamp100(town.supplies - R.lose.supplies);
      town.safety = clamp100(town.safety - R.lose.safety);
      town.morale = clamp100(town.morale - R.lose.morale);
      emit({ type: 'lost' });
      toast(`The raiders looted the town: $${lost} and stores lost`);
    }
  }

  function update(dt) {
    if (!town.owned) return;
    // once a day: taxes come in, stores go down, safety slips, morale drifts toward the middle
    const today = dayNow();
    if (today !== town.day) {
      town.day = today;
      const law = TAX_LAWS[town.law] || TAX_LAWS.fair;
      const tax = taxPerDay();
      town.treasury += tax;
      town.supplies = clamp100(town.supplies - R.supplyUse);
      town.safety = clamp100(town.safety - R.safetyDrift);
      town.morale = clamp100(town.morale + (town.supplies < 25 ? -6 : Math.sign(50 - town.morale) * 2) + law.morale);
      toast(`A new day in Dustfork: $${Math.round(tax)} in taxes`);
    }
    if (town.raid) {
      const live = raiders(), rd = town.raid;
      // every raider loose inside the town wears the bell down
      rd.bell -= live.filter(e => inTown(e)).length * R.bellHurt * dt;
      // level 3: the watchtowers pick off whoever is nearest the square
      town.towerT -= dt;
      if (town.level >= 3 && town.towerT <= 0) {
        town.towerT = 1;
        const t = live.filter(e => Math.hypot(e.x - TOWN.x, e.z - TOWN.z) < R.towerReach).sort((a, b) => Math.hypot(a.x - TOWN.x, a.z - TOWN.z) - Math.hypot(b.x - TOWN.x, b.z - TOWN.z))[0];
        if (t) {
          // the shot comes from whichever tower stands nearest the raider
          const [ox, oz] = R.towers.reduce((m, k) => (Math.hypot(TOWN.x + k[0] - t.x, TOWN.z + k[1] - t.z) < Math.hypot(TOWN.x + m[0] - t.x, TOWN.z + m[1] - t.z) ? k : m));
          emit({ type: 'mateShot', x1: TOWN.x + ox, z1: TOWN.z + oz, x2: t.x, z2: t.z, high: 9 });
          damageEnemy(t, R.towerDmg, 'tower');
        }
      }
      if (rd.bell <= 0) endRaid(false);
      else if (!live.length) endRaid(true);   // there is no waiting a raid out: it ends when the raiders are dead or the bell is down
      return;
    }
    if (state.siege) return;   // the story is holding a fight in town: no raid on top of it
    town.raidIn -= dt;
    if (town.raidIn <= R.warning && !town.warned) { town.warned = true; emit({ type: 'order' }); toast(`The town bell rings: raiders will reach Dustfork in ${town.raidIn > 90 ? 'two minutes' : 'about a minute'}`); }
    if (town.raidIn <= 0) startRaid();
  }

  // Ledger actions from the town screen.
  function command(cmd) {
    if (!town.owned) return toast('Dustfork is not yours yet');
    if (!inTown()) return toast('You need to be in town for that');
    if (cmd.type === 'townUpgrade') {
      const next = TOWN_LEVELS[town.level];
      if (!next) return;
      if (town.raid) return toast('Not during a raid');
      if (town.supplies < next.supplies) return toast(`The stores must be at ${next.supplies} or more`);
      if (town.treasury < next.cost) return toast(`The treasury needs $${next.cost}`);
      town.treasury -= next.cost;
      town.level++;
      town.morale = clamp100(town.morale + 10);
      emit({ type: 'questdone' });
      toast(`Dustfork is now a level ${town.level} town`);
    } else if (cmd.type === 'townSupply') {
      // only what the stores have room for is taken, meat first
      let room = Math.floor((100 - town.supplies) / 1), added = 0;
      if (!(player.res.meat + player.res.hide)) return toast('You have no meat or hides to give');
      if (room < 1) return toast('The stores are full');
      const meat = Math.min(player.res.meat, Math.floor(room / R.meat));
      player.res.meat -= meat; added += meat * R.meat; room -= meat * R.meat;
      const hide = Math.min(player.res.hide, Math.floor(room / R.hide));
      player.res.hide -= hide; added += hide * R.hide;
      if (!added) return toast('The stores are full');
      addSupplies(added);
      town.morale = clamp100(town.morale + added / 8);   // the same thanks however the gift is split up
      emit({ type: 'coin' });
      toast(`Stores +${added}`);
    } else if (cmd.type === 'townLaw') {
      if (town.level < 4) return toast('The tax law needs a town hall: level 4');
      if (typeof cmd.tax !== 'string' || !Object.hasOwn(TAX_LAWS, cmd.tax)) return;
      town.law = cmd.tax;
      emit({ type: 'order' });
      toast(`The law is now: ${TAX_LAWS[cmd.tax].name}`);
    } else if (cmd.type === 'townPay') {
      const n = Math.min(player.money, 100);
      if (!n) return toast('You have no money to pay in');
      player.money -= n;
      town.treasury += n;
      emit({ type: 'coin' });
      toast(`$${n} paid into the treasury`);
    }
    economy.recalc();
  }

  // A line for the display while a raid is coming or under way.
  function status() {
    const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    if (town.raid) return { title: 'Raid on Dustfork', line: `Kill the raiders · bell ${Math.max(0, Math.round((town.raid.bell / (R.bell * (town.level >= 5 ? 2 : 1))) * 100))}% · ${raiders().length} raiders`, mark: { x: TOWN.x, z: TOWN.z } };
    if (town.owned && town.warned) return { title: 'Raid coming', line: `Raiders reach Dustfork in ${clock(Math.max(0, town.raidIn))}`, mark: { x: TOWN.x, z: TOWN.z } };
    return null;
  }

  // Time skipped by sleeping still counts toward the next raid.
  function skip(seconds) { if (town.owned && !town.raid) town.raidIn = Math.min(town.raidIn, Math.max(R.warning / 2, town.raidIn - seconds)); }
  // what a day's taxes bring in right now, under the current law and morale
  function taxPerDay() {
    const law = TAX_LAWS[town.law] || TAX_LAWS.fair;
    return Math.round(R.tax * town.level * law.tax * (town.morale >= 70 ? 1.2 : town.morale < 30 ? 0.6 : 1));
  }
  const snapshot = () => { const { raid, ...rest } = town; return { ...rest, raiding: raid ? { bell: raid.bell, n: raiders().length } : null }; };
  // A raid in progress comes back as it was: the same bell, as many raiders as were still alive.
  function restore(save) {
    Object.assign(town, fresh());
    state.siege = false;
    if (save && Number.isFinite(save.supplies)) town.supplies = Math.max(0, Math.min(100, save.supplies));
    if (!save || save.owned !== true) return;
    const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
    Object.assign(town, {
      owned: true, level: Math.round(num(save.level, 1, TOWN_LEVELS.length, 1)), treasury: Math.round(num(save.treasury, 0, 1e9, 0)),
      supplies: num(save.supplies, 0, 100, 50), safety: num(save.safety, 0, 100, 50), morale: num(save.morale, 0, 100, 50),
      day: Math.round(num(save.day, 0, 1e9, dayNow())), raidIn: num(save.raidIn, 0, 1e5, R.firstRaid), warned: save.warned === true, law: Object.hasOwn(TAX_LAWS, save.law) ? save.law : 'fair',
      raidsWon: Math.round(num(save.raidsWon, 0, 1e6, 0)), raidsLost: Math.round(num(save.raidsLost, 0, 1e6, 0)),
    });
    const rd = save.raiding;
    if (rd && typeof rd === 'object' && Number.isFinite(rd.bell) && rd.bell > 0) beginRaid(Math.min(R.bell * 2, rd.bell), Math.round(num(rd.n, 1, 20, 3)));
  }

  return { update, command, claim, addSupplies, status, startRaid, skip, snapshot, restore, taxPerDay };
}
