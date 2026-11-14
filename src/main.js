// Wires the parts together: input -> rules -> drawing, sound, display and saves.
import { createSim, STEP, NO_INPUT } from './sim/sim.js';
import { createView } from './render/view.js';
import { createHud } from './ui/hud.js';
import { createScreens } from './ui/screens.js';
import { createDialogue } from './ui/dialogue.js';
import { createInput } from './input/input.js';
import { createAudio } from './audio/audio.js';
import { loadSave, writeSave, clearSave, exportSave, importSave } from './save/save.js';
import { DAY } from './data/content.js';
import { loadSettings, saveSettings, pickQuality } from './settings.js';

const settings = loadSettings();
const QUALITY = pickQuality(settings);
const AUTOSAVE_EVERY = 30, SAVE_ON = new Set(['capture', 'penned', 'levelup', 'jobdone', 'coin', 'death', 'questdone', 'stepdone', 'tamed']);
const SCREEN_KEYS = { KeyM: 'map', KeyJ: 'journal', Tab: 'rider', KeyI: 'bag', KeyU: 'town', KeyF: 'place' };
const $ = (id) => document.getElementById(id);

const sim = createSim();
const { state } = sim;
const view = createView($('game'), sim, QUALITY, settings);
const hud = createHud(sim, settings);
const audio = createAudio(settings.volume);

let started = false, paused = false, acc = 0, saveT = 0, time = 0, aim = null;
let skipUnloadSave = false, lockLostAt = -1e9, confirmNewUntil = 0, confirmTimer = 0;
const running = () => started && !paused && !screens.isOpen() && !talk.isOpen();

// The browser took the mouse back (it swallows Esc while the pointer is locked): show the pause menu.
const input = createInput($('game'), { settings, onLockLost: () => { if (running()) { lockLostAt = performance.now(); showMenu(true); } } });
// Menus pause the game; closing one hands the mouse back and drops any keys pressed meanwhile.
const screens = createScreens(sim, { dispatch: (events) => dispatch(events), onClose: () => { syncActive(); input.flush(); input.lockPointer(); } });
// Conversations pause the game the same way.
const talk = createDialogue(sim, { dispatch: (events) => dispatch(events), onClose: () => { syncActive(); input.flush(); input.lockPointer(); } });
// Input only listens while the game is actually running. Call after every change to started / paused / open screen.
function syncActive() { input.setActive(running()); }

// The rules restore a save taken while thrown at the stables, alive, so saving then is allowed (and stops a reload dodging the loss).
function save() {
  writeSave(sim.snapshot());
}
function dispatch(events) {
  view.onEvents(events);
  audio.onEvents(events);
  hud.onEvents(events);
  if (events.some(e => SAVE_ON.has(e.type))) save();
}
// True when a save loads cleanly. Tried on a throwaway copy of the rules so a bad file can never damage the running game.
function usable(saved) {
  if (!saved || typeof saved !== 'object') return false;
  try { return createSim().restore(saved) === true; } catch { return false; }
}

// ---- menu ----
const note = (text) => { $('menuNote').textContent = text || ''; $('menuNote').style.display = text ? 'block' : 'none'; };
function resetNewButton() {
  clearTimeout(confirmTimer);
  confirmNewUntil = 0;
  $('btnNew').textContent = 'New game';
}
function showMenu(show, message = '') {
  paused = show && started;
  syncActive();
  $('overlay').style.display = show ? 'flex' : 'none';
  resetNewButton();
  if (show) {
    // before a game starts, Continue and Export are only offered for a stored save that really loads
    const stored = started ? null : loadSave(), storedOk = started || usable(stored);
    $('btnContinue').textContent = started ? 'Resume' : 'Continue';
    $('btnContinue').style.display = storedOk ? '' : 'none';
    $('btnExport').style.display = storedOk ? '' : 'none';
    note(message || (stored && !storedOk ? 'The save stored in this browser cannot be loaded (it is damaged or from another version). Starting a new game will replace it.' : ''));
    input.unlockPointer();
  }
}
function resumeGame() {
  showMenu(false);
  input.flush();
  input.lockPointer();
}
// Starts play, from a save when one is given. A save that will not load leaves the menu up and the stored save untouched.
function begin(saved) {
  if (saved) {
    let ok = false;
    try { ok = usable(saved) && sim.restore(saved) === true; } catch { ok = false; }
    if (!ok) { showMenu(true, 'That save could not be loaded. Nothing was changed.'); return false; }
  }
  started = true;
  audio.start();
  resumeGame();
  return true;
}
$('btnContinue').addEventListener('click', () => (started ? resumeGame() : begin(loadSave())));
$('btnNew').addEventListener('click', () => {
  // anything that would be erased has to be confirmed with a second click
  if ((started || loadSave()) && performance.now() > confirmNewUntil) {
    confirmNewUntil = performance.now() + 4000;
    $('btnNew').textContent = 'Erase save and start? Click again';
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(resetNewButton, 4000);
    return;
  }
  clearSave();
  if (!started) return begin(null);
  // a running game starts over from a clean page; do not let the page save the old game on its way out
  skipUnloadSave = true;
  location.reload();
});
$('btnExport').addEventListener('click', () => exportSave(started ? sim.snapshot() : loadSave()));
$('fileImport').addEventListener('change', async (e) => {
  const saved = await importSave(e.target.files[0]);
  e.target.value = '';
  if (!saved || typeof saved !== 'object') return note('That file is not a Thunder Valley save.');
  if (!started) return begin(saved);
  // mid-game: check the file first, then swap it in and reload without saving the running game over it
  if (!usable(saved)) return note('That save could not be loaded. Your current game is unchanged.');
  if (!confirm('Replace the game you are playing with the imported save?')) return;
  if (!writeSave(saved)) return note('The save could not be stored in this browser.');
  skipUnloadSave = true;
  location.reload();
});
addEventListener('keydown', (e) => {
  if (!started || e.metaKey || e.ctrlKey || e.altKey) return;   // browser shortcuts (reload, close tab…) pass through
  if (e.code === 'Tab' && !paused) e.preventDefault();          // Tab opens the rider screen; never let it move browser focus, even when held
  if (e.repeat) return;
  const mute = () => hud.toast(audio.toggleMute() ? 'Sound off' : 'Sound on');
  if (/^F\d+$/.test(e.code)) return;   // function keys stay the browser's
  if (talk.isOpen()) { e.preventDefault(); if (e.code === 'KeyN') mute(); else talk.key(e.code); return; }
  if (screens.isOpen()) {
    const name = SCREEN_KEYS[e.code];
    // the same key, Escape or F closes; another screen key switches
    if (e.code === 'Escape' || e.code === 'KeyF' || name === screens.current()) { e.preventDefault(); screens.close(); }
    else if (name) { e.preventDefault(); screens.open(name); }
    else if (e.code === 'KeyN') mute();
    return;
  }
  if (e.code === 'KeyN') return void mute();
  if (e.code === 'KeyP' || e.code === 'Escape') {
    // some browsers deliver the Escape that released the mouse as a key press too: do not let it undo the pause it caused
    if (paused && e.code === 'Escape' && performance.now() - lockLostAt < 400) return;
    return paused ? resumeGame() : showMenu(true);
  }
  if (SCREEN_KEYS[e.code] && !paused) {
    e.preventDefault();
    // F beside a character starts a conversation; otherwise it uses the building at hand
    if (e.code === 'KeyF') { dispatch(sim.command({ type: 'talk' })); if (state.dialogue) return; }
    if (screens.open(SCREEN_KEYS[e.code])) { syncActive(); input.unlockPointer(); save(); }
    else if (e.code === 'KeyF') hud.toast('Nothing to use here');
  }
});
// ---- settings: applied as they change, kept between visits ----
function applySettings() {
  document.documentElement.style.setProperty('--ui', settings.textSize);
  audio.setVolume(settings.volume);
}
{
  const fields = { setQuality: 'quality', setSens: 'sensitivity', setInvert: 'invertY', setShake: 'shake', setText: 'textSize', setVol: 'volume', setPalette: 'palette' };
  for (const id in fields) {
    const el = $(id), key = fields[id];
    if (el.type === 'checkbox') el.checked = settings[key]; else el.value = String(settings[key]);
    el.addEventListener('input', () => {
      settings[key] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' && key !== 'quality' && key !== 'palette' ? +el.value : el.type === 'range' ? +el.value : el.value;
      saveSettings(settings);
      applySettings();
      if (key === 'quality') $('setNote').textContent = 'Graphics quality changes the next time the page loads.';
    });
  }
  $('btnSettings').addEventListener('click', () => { const box = $('settings'); box.hidden = !box.hidden; $('btnSettings').setAttribute('aria-expanded', String(!box.hidden)); });
  applySettings();
}
addEventListener('beforeunload', () => { if (started && !skipUnloadSave) save(); });
showMenu(true);

// ---- loop: rules advance in fixed steps, drawing happens as often as the screen allows ----
function stepOnce(inp) {
  dispatch(sim.step(inp));
  saveT += STEP;
  if (saveT >= AUTOSAVE_EVERY) { saveT = 0; save(); }
}
function draw(dt, alpha) {
  time += dt;
  aim = view.render(dt, alpha, input.look, time);
  hud.update(input.look.yaw);
  const p = state.player, live = running();
  // nothing moves while paused or in a menu, so no hoofbeats, herd rumble or fight drums then
  audio.frame(dt, {
    speed01: live && !p.dead ? p.moving : 0,
    herdRun: live ? state.animals.reduce((n, a) => n + (!a.dead && a.moving > 0.5 && Math.hypot(a.x - p.x, a.z - p.z) < 60 ? 1 : 0), 0) : 0,
    danger: live && state.enemies.some(e => !e.dead && e.state === 'chase'),
    night: sim.isNight(),
  });
}
let last = performance.now(), slowT = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (QUALITY === 'high' && settings.quality === 'auto' && !document.hidden && running() && dt < 0.1) {
    slowT = dt > 1 / 27 ? slowT + dt : Math.max(0, slowT - dt * 2);
    if (slowT > 6) { slowT = -1e9; if (view.degrade()) hud.toast('Frame rate is low: glow and sharpness turned down. Graphics can be set in the menu'); }
  }
  // the rules can start a conversation on their own (arriving somewhere): show it and stop the clock
  if (started && !paused && !screens.isOpen() && talk.sync()) { syncActive(); input.unlockPointer(); }
  const live = running();
  if (live) {
    input.frame(dt);
    acc += dt;
    while (acc >= STEP) { stepOnce(input.read(aim)); acc -= STEP; }
  }
  draw(dt, live ? acc / STEP : 1);
}
view.renderer.setAnimationLoop(frame);

// Debug handle for scripted checks: stop the loop, then drive the rules one fixed step at a time.
window.game = {
  sim, state, view, input, audio, screens, talk,
  stop: () => view.renderer.setAnimationLoop(null),
  resume: () => { last = performance.now(); view.renderer.setAnimationLoop(frame); },
  begin: () => begin(null),
  step: (inp = {}) => { stepOnce({ ...NO_INPUT, aim, ...inp }); },
  draw: () => draw(STEP, 1),
  look: (yaw, pitch = input.look.pitch) => { input.look.yaw = yaw; input.look.pitch = pitch; },
  setTime: (phase) => { state.clock = ((phase - DAY.start + 1) % 1) * DAY.length; },
  save, snapshot: sim.snapshot,
};
