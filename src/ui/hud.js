// The on-screen display: bars, ammunition, money, the current job, minimap and messages.
import { WORLD } from '../sim/terrain.js';
import { PEN, GATE, NATURES } from '../data/content.js';
import { WEAPONS, THROWN, TONICS, TOWN, SKILLS, PLACES } from '../data/items.js';
import { ORDERS } from '../data/story.js';
import { WEATHER } from '../data/frontier.js';

const $ = (id) => document.getElementById(id);
const TOAST_SHOWS = 1600, TOAST_QUEUE = 5;
// Anything from the game state that goes into innerHTML passes through here: a save file is outside text.
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// A whole number between 0 and max, whatever the state holds.
const count = (v, max = 24) => Math.max(0, Math.min(max, Math.floor(Number(v)) || 0));

const PALETTES = {
  default: { own: '#2fb5a0', foe: '#c23b2e', animal: '#ffb3b3', boss: '#ff8a3d' },
  // told apart by lightness as well as hue, for red-green colour blindness
  contrast: { own: '#4aa3ff', foe: '#ffb000', animal: '#ffffff', boss: '#ff5fd2' },
};
export function createHud(sim, settings = {}) {
  const { state } = sim, { player } = state;
  const pal = () => PALETTES[settings.palette] || PALETTES.default;
  const mm = $('minimap').getContext('2d');
  let flashTimer, toastTimer, sayTimer, hitTimer, showing = null, lastBelt = null, lastObj = null;
  const waiting = [];

  // Messages take turns, so a level-up is not wiped out by the payout that came with it.
  function nextToast() {
    showing = waiting.length ? waiting.shift() : null;
    if (showing === null) { $('toast').style.opacity = 0; return; }
    $('toast').textContent = showing;
    $('toast').style.opacity = 1;
    toastTimer = setTimeout(nextToast, TOAST_SHOWS);
  }
  function toast(text) {
    text = String(text ?? '');
    if (!text || text === showing || waiting.includes(text)) return;
    if (waiting.length >= TOAST_QUEUE) waiting.shift();
    waiting.push(text);
    if (showing === null) { clearTimeout(toastTimer); nextToast(); }
  }
  function onEvents(events) {
    for (const ev of events) {
      if (ev.type === 'toast') toast(ev.text);
      else if (ev.type === 'stagger') { const c = $('cross'); c.className = 'hud kill'; clearTimeout(hitTimer); hitTimer = setTimeout(() => { c.className = 'hud'; }, 300); }
      else if ((ev.type === 'hit' || ev.type === 'kill') && ev.mine !== false) {
        // the crosshair kicks when a shot lands, and turns red on a kill
        const c = $('cross');
        if (ev.type === 'hit' && c.classList.contains('kill')) continue;   // a kill is not downgraded by the next hit
        c.className = `hud ${ev.type}`;
        clearTimeout(hitTimer);
        hitTimer = setTimeout(() => { c.className = 'hud'; }, ev.type === 'kill' ? 260 : 110);
      }
      else if (ev.type === 'say') {
        // what a posse mate calls out: a line at the bottom, like a subtitle
        $('say').textContent = `${ev.who}: ${ev.text}`;
        $('say').style.opacity = 1;
        clearTimeout(sayTimer);
        sayTimer = setTimeout(() => { $('say').style.opacity = 0; }, 3500);
      }
      else if (ev.type === 'hurt') {
        $('flash').style.opacity = 1;
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => { $('flash').style.opacity = 0; }, 150);
      }
    }
  }
  // A skill point is only worth announcing while some tree still has a skill to learn.
  const canLearn = () => Object.keys(SKILLS).some(id => count(player.skills?.[id], 99) < SKILLS[id].list.length);
  const magazine = () => { try { return count(sim.magazine()); } catch { return 0; } };

  function update(lookYaw) {
    const mount = sim.mountOf(), b = player.buffs || {};
    $('hpFill').style.width = `${(player.hp / player.maxHp) * 100}%`;
    $('stFill').style.width = `${player.stamina}%`;
    $('xpFill').style.width = `${(player.xp / sim.xpNeeded()) * 100}%`;
    const lv = count(player.mountLv?.[player.mount], 99);
    $('lvl').textContent = `${player.onFoot ? 'On foot' : `${mount.name} (${NATURES[mount.nature] ?? '?'}) ${sim.stageOf().name} ${lv}`}  ·  Rider level ${player.level}  ·  ${Math.ceil(player.hp)} / ${player.maxHp} HP`;
    const cd = (t) => (t > 0 ? `(${Math.ceil(t)}s)` : '(ready)');
    $('ability').textContent = `${player.onFoot ? 'H: mount up' : `Space: ${mount.ability.name} ${cd(player.abilityCd)}${sim.frontier?.moveReady() ? `  ·  Y: ${sim.frontier.moveOf().name} ${cd(player.moveCd)}` : ''}`}  ·  E: Holler ${cd(state.herd?.hollerCd)}`;
    const ammo = count(player.ammo?.[player.weapon]), mag = magazine();
    $('ammo').textContent = `${WEAPONS[player.weapon]?.name ?? 'No weapon'}  ${player.reloadT > 0 ? 'reloading…' : '●'.repeat(ammo) + '○'.repeat(Math.max(0, mag - ammo))}`;
    const q = (key, id) => `${key}: ${esc(TONICS[id]?.name ?? 'nothing')} x${count(player.tonics?.[id], 99)}`;
    const buffs = [b.steady > 0 && `Steady hand ${Math.ceil(b.steady)}s`, b.salve > 0 && `Thick hide ${Math.ceil(b.salve)}s`, b.brew > 0 && `Stamina brew ${Math.ceil(b.brew)}s`].filter(Boolean);
    const pts = count(player.skillPoints, 999);
    const posse = (state.mates || []).length ? `<br>G: Posse · ${esc(ORDERS.find(o => o.id === state.order)?.label ?? '')}` : '';
    const belt = `<b>$${esc(player.money)}</b> · Standing ${count(state.story?.standing, 100)}${pts && canLearn() ? ` · <b class="pts">${pts} skill point${pts > 1 ? 's' : ''} (Tab)</b>` : ''}<br>${q('Z', player.quick?.z)} · ${q('X', player.quick?.x)}<br>`
      + Object.keys(THROWN).map(id => `${THROWN[id].key}: ${THROWN[id].name} x${count(player.thrown?.[id], 99)}`).join(' · ')
      + posse + (buffs.length ? `<br><span class="buff">${buffs.join(' · ')}</span>` : '');
    // the DOM is only touched when the text really changed
    if (belt !== lastBelt) $('belt').innerHTML = lastBelt = belt;
    const hours = sim.dayPhase() * 24;
    $('clock').textContent = `${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.floor((hours % 1) * 6) * 10).padStart(2, '0')}${sim.isNight() ? ' · night' : ''}${state.frontier && state.frontier.weather !== 'clear' ? ` · ${WEATHER[state.frontier.weather]?.name.toLowerCase() ?? ''}` : ''}`;

    const job = sim.jobs.status();
    const quest = sim.story?.status();
    const raid = sim.town?.status();
    const goal = sim.frontier?.goalStatus();
    const obj = (raid ? `<b class="alarm">${esc(raid.title)}</b><br>${esc(raid.line)}<br>` : '') + (quest ? `<b>${esc(quest.title)}</b><br>${esc(quest.line)}<br>` : '')
      + (job ? `<b>${esc(job.title)}</b><br>${esc(job.line)}` : quest ? '<span class="dim">Paid work is on the notice board</span>' : '<b>No job</b><br>Visit the notice board in Dustfork')
      + (goal ? `<br><b class="goal">Goal ${goal.at}/${goal.total}</b><br>${esc(goal.text)}${goal.of > 1 ? ` · ${goal.n}/${goal.of}` : ''}` : '');
    // spit in the eyes: the whole view blurs until it clears
    $('game').style.filter = player.blindT > 0 ? `blur(${Math.min(7, player.blindT * 4).toFixed(1)}px)` : '';
    if (obj !== lastObj) $('obj').innerHTML = lastObj = obj;
    $('hint').textContent = state.hint;
    $('hint').style.display = state.hint ? 'block' : 'none';

    const S = 160, at = (v) => (v / WORLD.half * 0.5 + 0.5) * S;
    mm.clearRect(0, 0, S, S);
    mm.strokeStyle = '#fff';
    mm.lineWidth = 1.5;
    // the pen is drawn as a ring with its gate left open (the map's z axis points up)
    mm.beginPath(); mm.arc(at(PEN.x), S - at(PEN.z), 4, -GATE.angle + GATE.half, -GATE.angle - GATE.half + Math.PI * 2); mm.stroke();
    mm.fillStyle = 'rgba(255,255,255,.25)';
    mm.beginPath(); mm.arc(at(TOWN.x), S - at(TOWN.z), TOWN.r / WORLD.half * S / 2, 0, 6.28); mm.fill();
    // the four town places as small marks
    mm.fillStyle = '#e9dcb8';
    for (const p of PLACES) mm.fillRect(at(p.x) - 1.5, S - at(p.z) - 1.5, 3, 3);
    for (const a of state.animals) {
      if (a.dead) continue;
      mm.fillStyle = '#ffd84d';
      mm.fillRect(at(a.x) - 1.5, S - at(a.z) - 1.5, 3, 3);
    }
    mm.fillStyle = '#d9a35a';
    for (const c of state.caches || []) mm.fillRect(at(c.x) - 1.5, S - at(c.z) - 1.5, 3, 3);   // supply caches
    for (const o of state.outposts) { mm.fillStyle = o.captured ? pal().own : pal().foe; mm.fillRect(at(o.x) - 4, S - at(o.z) - 4, 8, 8); }
    for (const e of state.enemies) {
      if (e.dead) continue;
      const boss = e === state.rex || e.tag === 'giant';
      mm.fillStyle = boss ? pal().boss : pal().animal;
      mm.beginPath(); mm.arc(at(e.x), S - at(e.z), boss ? 4 : 1.8, 0, 6.28); mm.fill();
    }
    // the gold ring shows where to go: the job's place, or the notice board when there is no job
    for (const m of state.mates || []) { mm.fillStyle = '#9fe8a0'; mm.beginPath(); mm.arc(at(m.x), S - at(m.z), 2.5, 0, 6.28); mm.fill(); }
    if (quest?.mark) { mm.strokeStyle = '#ffd84d'; mm.lineWidth = 2; mm.beginPath(); mm.arc(at(quest.mark.x), S - at(quest.mark.z), 6, 0, 6.28); mm.stroke(); }
    const mark = job ? job.mark : quest ? null : PLACES.find(p => p.id === 'board');
    if (mark) { mm.strokeStyle = '#ffd84d'; mm.lineWidth = 2; mm.beginPath(); mm.arc(at(mark.x), S - at(mark.z), job ? 6 : 4.5, 0, 6.28); mm.stroke(); }
    mm.save();
    mm.translate(at(player.x), S - at(player.z));
    mm.rotate(-lookYaw + Math.PI);
    mm.fillStyle = '#7df9ff';
    mm.beginPath(); mm.moveTo(0, 7); mm.lineTo(-4.5, -5); mm.lineTo(4.5, -5); mm.closePath(); mm.fill();
    mm.restore();
  }
  return { update, onEvents, toast };
}
