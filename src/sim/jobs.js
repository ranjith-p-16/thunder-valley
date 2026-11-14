// The notice board: three offers at a time, one job active at a time.
import { JOBS, BOARD_SIZE, TOWN, RESOURCES } from '../data/items.js';
import { DAY } from '../data/content.js';
import { WORLD } from './terrain.js';

const PICKUPS = [
  { name: 'the mesa road', x: 150, z: 20 }, { name: 'the west trail', x: -170, z: -20 },
  { name: 'the north ford', x: -20, z: 200 }, { name: 'the south bend', x: 60, z: -200 },
];

export function createJobs({ state, player, rand, emit, toast, gainXp, economy, spawnEnemy, inTown, onDone }) {
  const between = ([lo, hi]) => Math.round(lo + rand() * (hi - lo));
  const day = () => Math.floor(DAY.start + state.clock / DAY.length);
  state.board = [];
  state.job = null;
  state.boardDay = -1;
  state.jobsDone = 0;

  const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').slice(0, max);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const int = (v, lo, hi, d = lo) => (fin(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
  // Rebuilds a job or board entry from the fields it is allowed to have, always in the same order. Saves come from
  // files, so nothing in one is trusted. Returns null for anything that is not a job.
  function clean(raw, active = false) {
    if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string' || !Object.hasOwn(JOBS, raw.type)) return null;
    const type = raw.type, def = JOBS[type];
    const job = { type, title: def.title, text: str(raw.text, 160), pay: int(raw.pay, 0, 100000), xp: int(raw.xp, 0, 100000),
      left: fin(raw.left) ? Math.max(0, Math.min(3600, raw.left)) : 0, done: int(raw.done, 0, 99) };
    const place = () => fin(raw.x) && fin(raw.z) && Math.abs(raw.x) <= WORLD.half && Math.abs(raw.z) <= WORLD.half;
    if (type === 'bounty') {
      if (!place()) return null;
      Object.assign(job, { name: str(raw.name, 40), x: raw.x, z: raw.z });
      if (active) job.target = str(raw.target, 24).replace(/\W/g, '');
    } else if (type === 'herd' || type === 'hunt') job.count = int(raw.count, 1, 99);
    else {
      if (!place()) return null;
      Object.assign(job, { x: raw.x, z: raw.z, place: str(raw.place, 40), carrying: active && raw.carrying === true });
    }
    return job;
  }

  function offer() {
    let type = ['bounty', 'herd', 'hunt', 'supply'][Math.floor(rand() * 4)], count = 0;
    if (type === 'herd') {
      // never ask for more longhorns than are loose on the range
      count = between(JOBS.herd.count);
      if (state.animals.filter(a => !a.dead && !a.penned).length < count) type = 'hunt';
    }
    const def = JOBS[type];
    const job = { type, title: def.title, pay: Math.round(between(def.pay) / 10) * 10, xp: def.xp, left: 0, done: 0 };
    if (type === 'bounty') {
      const homes = state.enemies.filter(e => !e.outpost && e.kind === 'raptor' && !e.bounty), h = homes[Math.floor(rand() * homes.length)].home;
      Object.assign(job, { name: def.names[Math.floor(rand() * def.names.length)], x: h.x, z: h.z });
      job.text = `Bring down ${job.name}, a raptor pack leader`;
    } else if (type === 'herd') {
      Object.assign(job, { count, left: def.time });
      job.text = `Pen ${job.count} longhorns within ${def.time / 60} minutes`;
    } else if (type === 'hunt') {
      job.count = between(def.count);
      job.text = `Bring ${job.count} hides to the notice board`;
    } else {
      const p = PICKUPS[Math.floor(rand() * PICKUPS.length)];
      Object.assign(job, { x: p.x, z: p.z, place: p.name, carrying: false, left: def.time });
      job.text = `Fetch a crate from ${p.name} within ${def.time / 60} minutes`;
    }
    return job;
  }
  // Tops the board up; a new day replaces every offer.
  function refresh() {
    if (day() !== state.boardDay) { state.boardDay = day(); state.board = []; }
    while (state.board.length < BOARD_SIZE) state.board.push(offer());
    if (state.board.length > BOARD_SIZE) state.board.length = BOARD_SIZE;
  }

  function finish(paid) {
    const job = state.job;
    state.job = null;
    if (!paid) { emit({ type: 'lost' }); return toast(`${job.title} failed`); }
    const pay = Math.round(job.pay * economy.st.jobPay);
    player.money += pay;
    state.jobsDone++;
    gainXp(job.xp);
    emit({ type: 'jobdone' });
    onDone?.();
    toast(`${job.title} done: $${pay}`);
  }

  function command(cmd) {
    if (!inTown()) return toast('You need to be in town for that');
    if (cmd.type === 'takeJob') {
      const job = Number.isInteger(cmd.i) && cmd.i >= 0 && cmd.i < state.board.length ? state.board[cmd.i] : null;
      if (!job) return;
      if (state.job) return toast('Finish or drop your current job first');
      state.board.splice(cmd.i, 1);
      state.job = job;
      if (job.type === 'bounty') job.target = spawnEnemy('raptor', job.x, job.z, null, { bounty: true, name: job.name, hpMul: JOBS.bounty.hp }).id;
      emit({ type: 'coin' });
      toast(`${job.title} taken`);
    } else if (cmd.type === 'dropJob' && state.job) {
      const job = state.job, def = JOBS[job.type];
      const t = state.enemies.find(e => e.id === job.target);
      if (t) t.gone = true;
      state.job = null;
      // the same offer goes back on the board (in place of the one that filled its gap), so dropping never rerolls it
      delete job.target;
      job.done = 0;
      job.left = def.time || 0;
      if (job.type === 'supply') job.carrying = false;
      state.board.length = Math.min(state.board.length, BOARD_SIZE - 1);
      state.board.unshift(job);
      toast('Job dropped');
    } else if (cmd.type === 'turnIn' && state.job?.type === 'hunt') {
      if (player.res.hide < state.job.count) return toast(`You have ${player.res.hide} of ${state.job.count} hides`);
      player.res.hide -= state.job.count;
      finish(true);
    }
    refresh();
  }

  // Time that passes without being played (a night's rest) still counts against a timed job.
  function skip(seconds) {
    const job = state.job;
    if (job && (job.type === 'herd' || job.type === 'supply') && seconds > 0) {
      job.left -= seconds;
      if (job.left <= 0) finish(false);
    }
    refresh();
  }

  function update(dt) {
    refresh();
    const job = state.job;
    if (!job) return;
    if (job.type === 'herd' || job.type === 'supply') {
      job.left -= dt;
      if (job.left <= 0) return finish(false);
    }
    if (job.type === 'supply' && !player.dead) {
      if (!job.carrying && Math.hypot(player.x - job.x, player.z - job.z) < 6) { job.carrying = true; emit({ type: 'coin' }); toast('Crate loaded: take it to town'); }
      else if (job.carrying && Math.hypot(player.x - TOWN.x, player.z - TOWN.z) < TOWN.r - 8) finish(true);
    }
  }
  function onKill(e) { if (state.job?.type === 'bounty' && e.id === state.job.target) finish(true); }
  function onPenned() { if (state.job?.type === 'herd' && ++state.job.done >= state.job.count) finish(true); }
  function onDeath() { if (state.job?.type === 'supply' && state.job.carrying) { state.job.carrying = false; toast('The crate is back where you found it'); } }

  // One line for the display, and where the map should point.
  function status() {
    const job = state.job;
    if (!job) return null;
    const time = job.left > 0 ? ` · ${Math.floor(job.left / 60)}:${String(Math.floor(job.left % 60)).padStart(2, '0')}` : '';
    let line = job.text, mark = null;
    if (job.type === 'bounty') { const t = state.enemies.find(e => e.id === job.target); if (t) mark = { x: t.x, z: t.z }; }
    else if (job.type === 'herd') line = `Pen longhorns ${job.done}/${job.count}`;
    else if (job.type === 'hunt') { line = `${RESOURCES.hide.name}s ${Math.min(player.res.hide, job.count)}/${job.count}: turn in at the notice board`; }
    else { line = job.carrying ? 'Take the crate to town' : `Fetch the crate from ${job.place}`; mark = job.carrying ? { x: TOWN.x, z: TOWN.z } : { x: job.x, z: job.z }; }
    return { title: job.title, line: line + time, mark };
  }

  return { command, update, onKill, onPenned, onDeath, status, refresh, skip, clean };
}
