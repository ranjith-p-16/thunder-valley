// Money, shops, gear, skills and tonics. Everything the rider owns is plain data on `player`.
import { RIDER, MOUNTS, STRING_MAX, DAY } from '../data/content.js';
import {
  WEAPONS, THROWN, TONICS, TONIC_MAX, GEAR, SKILLS, BASE_STATS, GRADE_POWER, UPGRADE, RESOURCES, REST_PRICE, MOUNT_PRICE,
} from '../data/items.js';

export function newInventory() {
  return {
    money: 50, res: { hide: 0, meat: 0, claws: 0 },
    weapons: { revolver: 0 }, weapon: 'revolver', ammo: { revolver: WEAPONS.revolver.magazine },
    thrown: { dynamite: 0, bolas: 2, bait: 0, trap: 0 },   // two bolas to start: enough to try taming
    tonics: { jerky: 2, tonic: 1, brew: 0, steady: 0, salve: 0, herb: 0 }, quick: { z: 'tonic', x: 'jerky' },
    gear: {}, equipped: { outfit: null, saddle: null, trinket: null },
    skills: { gunslinger: 0, wrangler: 0, marshal: 0 }, skillPoints: 0,
    mounts: MOUNTS.map((_, i) => i === 0), mountLv: MOUNTS.map(() => 1), mountXp: MOUNTS.map(() => 0),
    string: [0], journal: MOUNTS.map((_, i) => (i === 0 ? 2 : 0)),   // journal: 0 unknown, 1 spotted, 2 tamed
    buffs: { jerky: 0, brew: 0, steady: 0, salve: 0 },
  };
}

export function createEconomy({ player, state, emit, toast, inTown, herding }) {
  const st = { ...BASE_STATS };
  const apply = (def, power) => {
    if (def.add !== undefined) st[def.stat] += def.add * power;
    if (def.mul !== undefined) st[def.stat] *= 1 + (def.mul - 1) * power;
  };
  // Rebuilds the rider's stats from skills and worn gear. Call after anything that changes them.
  function recalc() {
    Object.assign(st, BASE_STATS);
    for (const tree in SKILLS) SKILLS[tree].list.slice(0, player.skills[tree]).forEach(s => apply(s, 1));
    for (const slot in player.equipped) {
      const id = player.equipped[slot];
      if (id) apply(GEAR[id], GRADE_POWER[player.gear[id]]);
    }
    if (MOUNTS[player.mount].bag) st.bag += MOUNTS[player.mount].bag;   // a Hauler carries far more
    if ((state.story?.standing || 0) >= 25) st.buy *= 0.9;
    if (state.town?.owned && state.town.level >= 2) st.buy *= 0.9;   // your own town's shops   // the town gives a known face a better price
    player.maxHp = RIDER.hp + (player.level - 1) * RIDER.hpPerLevel + Math.round(st.maxHp);
    player.hp = Math.min(player.hp, player.maxHp);
  }

  const price = (p) => Math.round(p * st.buy);
  const sellPrice = (id) => Math.round(RESOURCES[id].sell * st.sell);
  const bagUsed = () => Object.values(player.res).reduce((a, b) => a + b, 0);
  // Adds as much of a resource as the saddle bags will hold; returns how many fitted.
  function addRes(id, n) {
    const fit = Math.max(0, Math.min(n, Math.floor(st.bag) - bagUsed()));
    player.res[id] += fit;
    return fit;
  }
  const pay = (cost) => {
    if (player.money < cost) { toast('Not enough money'); return false; }
    player.money -= cost;
    emit({ type: 'coin' });
    return true;
  };
  const matFor = (kind, id) => (kind === 'weapon' || GEAR[id].slot === 'trinket' ? 'claws' : 'hide');
  const has = (table, id) => typeof id === 'string' && Object.hasOwn(table, id);
  const mountIndex = (i) => Number.isInteger(i) && i >= 0 && i < MOUNTS.length;
  // Wears `id` (or nothing) in a slot, unless the saddle bags would then hold more than they can.
  function wear(slot, id) {
    const prev = player.equipped[slot], bag = st.bag;
    player.equipped[slot] = id;
    recalc();
    if (st.bag >= bag || bagUsed() <= Math.floor(st.bag)) return true;
    player.equipped[slot] = prev;
    recalc();
    toast('Your saddle bags are too full to change saddles');
    return false;
  }

  function useTonic(id) {
    if (!has(TONICS, id) || player.dead) return;
    const def = TONICS[id];
    if (!player.tonics[id]) return toast(`No ${def.name.toLowerCase()} left`);
    if ((id === 'tonic' || id === 'jerky') && player.hp >= player.maxHp) return toast('Health is full');
    if (id === 'herb' && !herding.calm(def.radius)) return toast('No herd close enough to calm');
    player.tonics[id]--;
    if (id === 'jerky') player.buffs.jerky = def.over;
    else if (id === 'tonic') player.hp = Math.min(player.maxHp, player.hp + def.heal * st.heal);
    else if (id === 'brew') player.buffs.brew = def.time;
    // only one of the two fighting tonics works at a time
    else if (id === 'steady') { player.buffs.steady = def.time; player.buffs.salve = 0; }
    else if (id === 'salve') { player.buffs.salve = def.time; player.buffs.steady = 0; }
    emit({ type: 'drink', id });
    toast(def.name);
  }
  function updateBuffs(dt) {
    const b = player.buffs;
    if (b.jerky > 0) player.hp = Math.min(player.maxHp, player.hp + (TONICS.jerky.heal * st.heal / TONICS.jerky.over) * dt);
    for (const k in b) b[k] = Math.max(0, b[k] - dt);
  }

  // Shop and menu actions. Returns nothing; reports through events and toasts.
  function command(cmd) {
    if (!cmd || typeof cmd !== 'object') return;
    const needTown = ['buy', 'sell', 'upgrade', 'rest', 'mount', 'string'];
    if (needTown.includes(cmd.type) && !inTown()) return toast('You need to be in town for that');
    if (cmd.type === 'buy') {
      if (cmd.kind === 'weapon') {
        if (!has(WEAPONS, cmd.id) || Object.hasOwn(player.weapons, cmd.id)) return;
        const def = WEAPONS[cmd.id];
        if (!pay(price(def.price))) return;
        player.weapons[cmd.id] = 0;
        player.ammo[cmd.id] = def.magazine + st.magazine;
      } else if (cmd.kind === 'thrown') {
        if (!has(THROWN, cmd.id)) return;
        const def = THROWN[cmd.id];
        if (player.thrown[cmd.id] >= def.max) return toast('You cannot carry more');
        if (pay(price(def.price))) player.thrown[cmd.id]++;
      } else if (cmd.kind === 'tonic') {
        if (!has(TONICS, cmd.id)) return;
        const def = TONICS[cmd.id];
        if (player.tonics[cmd.id] >= TONIC_MAX) return toast('You cannot carry more');
        if (pay(price(def.price))) player.tonics[cmd.id]++;
      } else if (cmd.kind === 'gear') {
        if (!has(GEAR, cmd.id) || Object.hasOwn(player.gear, cmd.id)) return;
        const def = GEAR[cmd.id];
        if (!pay(price(def.price))) return;
        player.gear[cmd.id] = 0;
        wear(def.slot, cmd.id);
      } else if (cmd.kind === 'mount') {
        if (!mountIndex(cmd.i)) return;
        const cost = MOUNT_PRICE[cmd.i];
        if (cost == null || player.mounts[cmd.i] || !pay(price(cost))) return;
        player.mounts[cmd.i] = true;
        const room = player.string.length < STRING_MAX;
        if (room) player.string.push(cmd.i);
        toast(`The ${MOUNTS[cmd.i].name} is yours${room ? ' and joins your string' : ''}`);
      }
    } else if (cmd.type === 'sell') {
      if (!has(RESOURCES, cmd.id)) return;
      const n = player.res[cmd.id] || 0;
      if (!n) return;
      player.money += n * sellPrice(cmd.id);
      player.res[cmd.id] = 0;
      emit({ type: 'coin' });
    } else if (cmd.type === 'upgrade') {
      const owned = cmd.kind === 'weapon' ? player.weapons : player.gear;
      if (!has(cmd.kind === 'weapon' ? WEAPONS : GEAR, cmd.id) || !Object.hasOwn(owned, cmd.id)) return;
      const grade = owned[cmd.id], cost = UPGRADE[grade];
      if (!cost) return;
      const mat = matFor(cmd.kind, cmd.id);
      if (player.res[mat] < cost.mats) return toast(`Needs ${cost.mats} ${RESOURCES[mat].name.toLowerCase()}`);
      if (!pay(price(cost.money))) return;
      player.res[mat] -= cost.mats;
      owned[cmd.id]++;
    } else if (cmd.type === 'equip') {
      if (!has(GEAR, cmd.id) || !Object.hasOwn(player.gear, cmd.id)) return;
      const slot = GEAR[cmd.id].slot;
      wear(slot, player.equipped[slot] === cmd.id ? null : cmd.id);
    } else if (cmd.type === 'skill') {
      if (!has(SKILLS, cmd.tree)) return;
      const tree = SKILLS[cmd.tree];
      if (player.skillPoints < 1 || player.skills[cmd.tree] >= tree.list.length) return;
      player.skillPoints--;
      emit({ type: 'levelup' });
      toast(tree.list[player.skills[cmd.tree]++].name);
    } else if (cmd.type === 'quick') {
      if (!has(TONICS, cmd.id) || (cmd.slot !== 'z' && cmd.slot !== 'x')) return;
      // putting the other slot's item here swaps the two
      const other = cmd.slot === 'z' ? 'x' : 'z';
      if (player.quick[other] === cmd.id) player.quick[other] = player.quick[cmd.slot];
      player.quick[cmd.slot] = cmd.id;
    } else if (cmd.type === 'rest') {
      if (state.siege) return toast('Nobody sleeps while the town is under attack');
      if (state.restedAt !== undefined && state.clock - state.restedAt < DAY.length / 2) return toast('You are not tired yet: you slept not half a day ago');
      if (!pay(price(REST_PRICE))) return;
      player.hp = player.maxHp;
      player.stamina = 100;
      // sleep until seven the next morning
      const phase = (DAY.start + state.clock / DAY.length) % 1, wake = 7 / 24;
      const sleep = (wake - phase + 1) % 1;
      state.clock += (sleep < 1 / 24 ? sleep + 1 : sleep) * DAY.length;   // lying down just before seven means sleeping through to the next morning
      state.restedAt = state.clock;
      toast('You wake rested at seven');
    } else if (cmd.type === 'string') {
      // choose which tamed dinosaurs ride out with you
      if (!mountIndex(cmd.i) || !player.mounts[cmd.i]) return;
      const at = player.string.indexOf(cmd.i);
      if (at >= 0) { if (cmd.i === player.mount) return toast('You are riding that one'); player.string.splice(at, 1); }
      else if (player.string.length >= STRING_MAX) return toast(`Your string holds ${STRING_MAX}`);
      else player.string.push(cmd.i);
    } else if (cmd.type === 'mount') {
      if (!mountIndex(cmd.i) || !player.mounts[cmd.i]) return;
      if (player.onFoot) return toast('Mount up first: press H beside your dinosaur');
      if (state.siege) return toast('Not while the town is under attack');
      if (player.mount !== cmd.i) player.dashT = 0;
      // the mount you ride is always part of the string; the last one added makes room if it is full
      const was = player.mount;
      player.mount = cmd.i; recalc();
      if (bagUsed() > Math.floor(st.bag)) { player.mount = was; recalc(); return toast(`The ${MOUNTS[cmd.i].name} cannot carry all this: sell or store some first`); }
      if (!player.string.includes(cmd.i)) { if (player.string.length >= STRING_MAX) player.string.pop(); player.string.push(cmd.i); }
      emit({ type: 'mount' });
      toast(`Riding the ${MOUNTS[cmd.i].name}`);
    }
    recalc();
  }

  return { st, recalc, command, price, sellPrice, bagUsed, addRes, useTonic, updateBuffs, matFor };
}
