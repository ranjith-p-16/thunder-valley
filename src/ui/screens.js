// The paper menus: town shops plus the map, journal, rider and bag screens.
// Every button carries a small command object; the rules decide whether it is allowed.
import { WORLD, heightAt } from '../sim/terrain.js';
import { MOUNTS, PEN, HERD, WATER_Y, NATURES, BEATS, STRING_MAX, TOWN_LEVELS, TOWN_RULE, TAX_LAWS } from '../data/content.js';
import {
  WEAPONS, WEAPON_ORDER, GRADES, GRADE_POWER, UPGRADE, THROWN, TONICS, TONIC_MAX, GEAR, SLOTS, SKILLS, RESOURCES,
  PLACES, TOWN, REST_PRICE, MOUNT_PRICE,
} from '../data/items.js';
import { QUESTS, STANDING, ENDINGS } from '../data/story.js';
import { MOVES, MOVE_FROM, HATCH, TRADER, FAVOURS, FAVOUR_MAX } from '../data/frontier.js';

// How each remembered choice reads in the journal.
const CHOICES = {
  'wagons=burned': 'You burned the gang\'s supply wagons.', 'wagons=taken': 'You drove the gang\'s wagons home to Dustfork.',
  'tobe=duty': 'You called Tobe back to his duty.', 'tobe=guilt': 'You told Tobe he had not slept since he gave up the town.', 'tobe=revenge': 'You told Tobe that Blackthorn owed him.',
  'pell=spared': 'You talked Deacon Pell out of the gang.', 'pell=fought': 'You fought Deacon Pell.',
  'mayor=kept': 'You kept Mayor Pike on.', 'mayor=replaced': 'You made Ros mayor in Pike\'s place.', 'mayor=empty': 'You left the mayor\'s chair empty.',
  'eggs=freed': 'You sent the smugglers\' eggs and hatchlings back to the marsh.', 'eggs=sold': 'You freed the hatchlings and sold the eggs.',
  'fires=stealth': 'You came at the fire pits quietly, along the dry creek.', 'fires=assault': 'You rode straight at the fire pits.',
  'rex=killed': 'You killed the Alpha Rex.', 'rex=sealed': 'You drove the Alpha Rex back and sealed the pass.',
  'blackthorn=jailed': 'You put Cornelius Blackthorn in a Dustfork cell.', 'blackthorn=exiled': 'You sent Cornelius Blackthorn out of the valley.',
  'collector=paid': "You paid the gang's collector his $50.", 'collector=refused': "You refused the gang's collector. The gang remembers.",
  'collector=stalled': 'You told the collector the money was coming.', 'den=destroyed': 'You destroyed the raptor den by the north fence.',
  'den=driven': "You drove the raptor pack onto the gang's camp at Red Mesa.", 'nettle=revealed': 'You told Doc Obi where Old Nettle lives.',
  'nettle=secret': "You kept Old Nettle's home a secret.", 'rustlers=fought': 'You shot it out with the rustlers.',
  'rustlers=stampeded': "You stampeded Mara's herd through the rustlers' camp.",
};
// Pond cells for the map, worked out once from the terrain.
const PONDS = [];
for (let x = -WORLD.half; x <= WORLD.half; x += 8) for (let z = -WORLD.half; z <= WORLD.half; z += 8) if (heightAt(x, z) < WATER_Y) PONDS.push([x, z]);
const FIELD = [['map', 'Map'], ['journal', 'Journal'], ['rider', 'Rider'], ['bag', 'Bag'], ['town', 'Town']];
const ZONES = [['Home pastures', 0, 70], ['Fernhollow woods', -190, 40], ['Red Mesa', 200, -60], ['Highwatch ridge', 30, 235], ['Sinkwater marsh', 40, -240], ['Rex Hollow', -110, -205]];
// Everything that comes from the game state is escaped before it goes into innerHTML: a save file is outside text.
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// label is plain text. `action` in row() is markup built here (buttons or a fixed <i> note); name and note are plain text.
const btn = (label, cmd, off = false) => `<button data-cmd="${esc(JSON.stringify(cmd))}"${off ? ' disabled' : ''}>${esc(label)}</button>`;
const row = (name, note, action) => `<div class="row"><div><b>${esc(name)}</b><span>${esc(note)}</span></div><div class="acts">${action}</div></div>`;
const rounds = (n) => `${n} round${n === 1 ? '' : 's'}`;
const gradeName = (grade) => GRADES[grade] ?? 'Unknown';
// What a piece of gear does at its grade, e.g. Duster · Fine reads "+45 health": the rules scale `add` by the grade's
// power and `mul` by its distance from 1, so the first number in the note is scaled the same way.
function gearNote(g, grade = 0) {
  const power = GRADE_POWER[grade] ?? 1, base = g.add !== undefined ? g.add : Math.abs(g.mul - 1) * 100;
  const now = g.add !== undefined ? Math.round(base * power) : +(base * power).toFixed(1);
  return power === 1 ? g.note : g.note.replace(/\d+(\.\d+)?/, String(now));
}

export function createScreens(sim, { dispatch, onClose }) {
  const el = document.getElementById('panel'), { state } = sim, { player } = state, eco = sim.economy;
  let current = null, place = null;
  const pct = (v) => `${Math.round(v * 100)}%`;
  // Numbers as the rules compute them, so the shop never promises something else.
  const magazine = (id) => { try { const n = sim.magazine(id); return Number.isFinite(n) ? n : WEAPONS[id].magazine; } catch { return WEAPONS[id].magazine; } };
  function damage(id) {
    const w = WEAPONS[id];
    try {
      if (id in player.weapons) { const d = sim.damage(id); if (Number.isFinite(d)) return Math.round(d); }
      // not owned yet: what it would do at Common grade, with the rider's level, skills and tonics as they are now
      const held = player.weapon, k = sim.damage(held) / (WEAPONS[held].dmg * GRADE_POWER[player.weapons[held]]);
      if (Number.isFinite(k)) return Math.round(w.dmg * k);
    } catch { /* fall through to the plain figure */ }
    return Math.round(w.dmg);
  }
  const weaponNote = (id) => { const w = WEAPONS[id]; return `${w.note}. Damage ${damage(id)}${w.pellets > 1 ? ` x ${w.pellets}` : ''}, ${rounds(magazine(id))}`; };

  function upgradeBtn(kind, id, grade) {
    const cost = UPGRADE[grade];
    if (!cost) return '<i>Best grade</i>';
    const mat = eco.matFor(kind, id);
    return btn(`Upgrade $${eco.price(cost.money)} + ${cost.mats} ${mat}`, { type: 'upgrade', kind, id }, player.money < eco.price(cost.money) || player.res[mat] < cost.mats);
  }

  const body = {
    store() {
      let h = '';
      const fr = state.frontier;
      if (sim.frontier.traderHere()) {
        // Silas: one egg a visit, growth feed, and a good price for claws
        h += "<h3>Silas's wagon · here until morning</h3>";
        const egg = fr.traderEgg, cl = player.res.claws;
        h += egg >= 0 ? row(`${MOUNTS[egg].name} egg`, player.mounts[egg] ? 'Hatch it at the stables for a stronger bloodline' : 'Hatch it at the stables for a mount of your own', btn(`Buy $${eco.price(TRADER.egg)}`, { type: 'trader', buy: 'egg' }, player.money < eco.price(TRADER.egg)))
          : row('Egg', 'Sold. He brings another next visit', '<i>Sold</i>');
        h += row(`Growth feed · ${fr.traderFeed} left`, `${TRADER.feedXp} experience for the dinosaur you are riding`, btn(`Buy $${eco.price(TRADER.feed)}`, { type: 'trader', buy: 'feed' }, fr.traderFeed < 1 || player.money < eco.price(TRADER.feed)));
        h += row(`Claws · ${cl}`, `Silas pays $${eco.sellPrice('claws') * TRADER.clawsMul} each, twice the store's price`, btn(`Sell all $${cl * eco.sellPrice('claws') * TRADER.clawsMul}`, { type: 'trader', buy: 'claws' }, !cl));
      } else h += `<p class="key">Silas the trader stops here every third day with eggs, growth feed and a good price for claws.</p>`;
      h += '<h3>Weapons</h3>';
      for (const id of WEAPON_ORDER) {
        const w = WEAPONS[id], grade = player.weapons[id], owned = grade !== undefined;
        h += row(`${w.name}${owned ? ` · ${gradeName(grade)}` : ''}`, weaponNote(id),
          owned ? upgradeBtn('weapon', id, grade) : btn(`Buy $${eco.price(w.price)}`, { type: 'buy', kind: 'weapon', id }, player.money < eco.price(w.price)));
      }
      h += '<h3>Thrown</h3>';
      for (const id in THROWN) {
        const t = THROWN[id];
        h += row(`${t.name} · ${player.thrown[id]}/${t.max}`, `${t.note}. Key ${t.key}`, btn(`Buy $${eco.price(t.price)}`, { type: 'buy', kind: 'thrown', id }, player.money < eco.price(t.price) || player.thrown[id] >= t.max));
      }
      h += '<h3>Food and tonics</h3>';
      for (const id in TONICS) {
        const t = TONICS[id];
        h += row(`${t.name} · ${player.tonics[id]}/${TONIC_MAX}`, t.note, btn(`Buy $${eco.price(t.price)}`, { type: 'buy', kind: 'tonic', id }, player.money < eco.price(t.price) || player.tonics[id] >= TONIC_MAX));
      }
      h += '<h3>Gear</h3>';
      for (const id in GEAR) {
        const g = GEAR[id], grade = player.gear[id], owned = grade !== undefined;
        h += row(`${g.name}${owned ? ` · ${gradeName(grade)}` : ''}`, `${g.slot}: ${gearNote(g, grade)}`,
          owned ? upgradeBtn('gear', id, grade) : btn(`Buy $${eco.price(g.price)}`, { type: 'buy', kind: 'gear', id }, player.money < eco.price(g.price)));
      }
      h += '<h3>Sell</h3>';
      for (const id in RESOURCES) {
        const n = player.res[id];
        h += row(`${RESOURCES[id].name} · ${n}`, `$${eco.sellPrice(id)} each`, btn(`Sell all $${n * eco.sellPrice(id)}`, { type: 'sell', id }, !n));
      }
      return h;
    },
    stables() {
      const str = player.string || [];
      let h = `<h3>Your string · ${str.length} of ${STRING_MAX} ride out with you</h3><p class="key">Press B in the field to change to the next dinosaur in your string. Tame more with T: wear an animal down to a third of its health, hold it with bolas or a trap, then stay close.</p>`;
      MOUNTS.forEach((m, i) => {
        const lv = player.mountLv[i], stage = sim.stageOf(i), nat = NATURES[m.nature], beats = NATURES[BEATS[m.nature]], loses = NATURES[Object.keys(BEATS).find(k => BEATS[k] === m.nature)];
        const note = `${nat}: strong against ${beats}, weak against ${loses}. Speed ${m.speed} / ${m.sprint}, takes ${pct(m.armor)} damage. Ability: ${m.ability.name}. Move: ${MOVES[i].name}${player.mountLv[i] >= MOVE_FROM ? '' : ' (when Grown)'}. Strike ${Math.round(sim.meleeDamage(i))}`;
        let name = m.name, act;
        if (player.mounts[i]) {
          name = `${m.name} · ${stage.name} · level ${lv}${player.blood[i] ? ` · bloodline ${player.blood[i]}` : ''}`;
          act = (i === player.mount ? '<i>Riding</i>' : btn('Ride', { type: 'mount', i }, player.onFoot))
            + (i === player.mount ? '' : btn(str.includes(i) ? 'Leave behind' : 'Add to string', { type: 'string', i }, !str.includes(i) && str.length >= STRING_MAX));
        } else if (MOUNT_PRICE[i] != null) act = btn(`Buy $${eco.price(MOUNT_PRICE[i])}`, { type: 'buy', kind: 'mount', i }, player.money < eco.price(MOUNT_PRICE[i]));
        else act = `<i>${m.wild ? 'Tame one' : 'Not yet yours'}: ${esc(m.zone)}</i>`;
        h += row(name, note, act);
      });
      // the hatchery: eggs become mounts, or a stronger bloodline for one you already ride
      const fr = state.frontier, hatchCost = eco.price(HATCH.price), breedCost = eco.price(HATCH.breedPrice);
      const left = fr.hatch ? Math.ceil(fr.hatch.t / 60) : 0;
      h += '<h3>Hatchery</h3><p class="key">' + (fr.hatch ? `A ${esc(MOUNTS[fr.hatch.i].name)} egg is under the lamps: about ${left} minute${left === 1 ? '' : 's'} to go. A night's rest counts.` : 'The lamps are free. Eggs come from Silas, from giants, from taming a second animal of a kind you ride, and from breeding.') + '</p>';
      MOUNTS.forEach((m, i) => {
        if (!m.wild) return;
        if (player.eggs[i]) h += row(`${m.name} egg · ${player.eggs[i]}`, player.mounts[i] ? (player.blood[i] < HATCH.bloodMax ? `Strengthens your ${m.name} bloodline (${player.blood[i]} of ${HATCH.bloodMax}): harder strikes, tougher hide` : `Your bloodline is at its best: the hatchling teaches your ${m.name} instead`) : `Hatches into a ${m.name} of your own`,
          btn(`Hatch $${hatchCost}`, { type: 'hatch', i }, !!fr.hatch || player.money < hatchCost));
        if (player.mounts[i]) h += row(`Breed your ${m.name}`, `Needs a Grown ${m.name}, ${HATCH.breedMeat} meat for feed. One clutch a day, ${HATCH.eggMax} eggs kept at most`,
          btn(`Breed $${breedCost}`, { type: 'breed', i }, player.mountLv[i] < MOVE_FROM || player.res.meat < HATCH.breedMeat || player.money < breedCost || player.eggs[i] >= HATCH.eggMax));
      });
      return h;
    },
    town() {
      const t = state.town;
      if (!t.owned) {
        return `<h3>Dustfork</h3><p>The Blackthorn gang runs this town. Win the people over (Standing ${esc(state.story.standing)} of 60 needed), break the gang's hold on the valley, and take it.</p>`
          + '<p class="key">Once Dustfork is yours it has a treasury, stores and raids to see off, and it can be levelled up.</p>';
      }
      const bar = (name, v, note) => row(`${name} · ${Math.round(v)} / 100`, note, `<div class="meter"><div style="width:${Math.max(0, Math.min(100, v))}%"></div></div>`);
      const next = TOWN_LEVELS[t.level], raid = sim.town.status();
      let h = `<h3>Dustfork · level ${esc(t.level)} town</h3>` + (raid ? `<p><b>${esc(raid.title)}</b>: ${esc(raid.line)}</p>` : '');
      h += row(`Treasury · $${esc(t.treasury)}`, `Taxes of about $${sim.town.taxPerDay()} a day come in, more when morale is high. Pays for upgrades`, btn(player.money >= 100 ? 'Pay in $100' : `Pay in $${Math.floor(player.money)}`, { type: 'townPay' }, player.money < 1));
      h += bar('Stores', t.supplies, `The town uses ${TOWN_RULE.supplyUse} a day. Below 25, morale falls. You carry ${player.res.meat} meat and ${player.res.hide} hides`)
        .replace('<div class="acts">', `<div class="acts">${btn('Give meat and hides', { type: 'townSupply' }, !(player.res.meat + player.res.hide))}`);
      h += bar('Safety', t.safety, 'Slips a little every day; winning raids raises it. Below 40, raids are bigger');
      h += bar('Morale', t.morale, 'High morale brings in more tax; low morale less');
      h += '<h3>Growing the town</h3>';
      h += next ? row(`Level ${t.level + 1}`, `${next.gives}. Costs $${next.cost} from the treasury, with stores at ${next.supplies} or more`,
        btn('Upgrade', { type: 'townUpgrade' }, t.treasury < next.cost || t.supplies < next.supplies || !!t.raid || !sim.inTown())) : '<p>Dustfork is as large as it can be for now. Higher levels come with the next milestone.</p>';
      if (t.level >= 4) {
        h += '<h3>The law</h3>' + Object.keys(TAX_LAWS).map(id => row(TAX_LAWS[id].name, `Tax x${TAX_LAWS[id].tax}; morale ${TAX_LAWS[id].morale > 0 ? '+' : ''}${TAX_LAWS[id].morale} a day`,
          t.law === id ? '<i>In force</i>' : btn('Enact', { type: 'townLaw', tax: id }, !sim.inTown()))).join('');
      }
      h += `<h3>Record</h3><p>Raids beaten off: ${esc(t.raidsWon)} · Raids lost: ${esc(t.raidsLost)}`
        + (t.raid ? '' : ` · Next raid in about ${Math.max(1, Math.round(t.raidIn / 60))} minutes`) + (sim.inTown() ? '' : '<br><i>Ride into town to use the ledger.</i>') + '</p>';
      return h;
    },
    board() {
      let h = '<h3>Your job</h3>';
      const job = state.job, st = sim.jobs.status();
      if (job) h += row(job.title, `${st.line}. Pays $${Math.round(job.pay * sim.st.jobPay)}`, (job.type === 'hunt' ? btn('Turn in', { type: 'turnIn' }, player.res.hide < job.count) : '') + btn('Drop', { type: 'dropJob' }));
      else h += '<p>No job taken. Pick one below.</p>';
      h += '<h3>Posted today</h3>';
      state.board.forEach((j, i) => { h += row(j.title, `${j.text}. Pays $${Math.round(j.pay * sim.st.jobPay)}`, btn('Take', { type: 'takeJob', i }, !!job)); });
      // favours for the townsfolk: slower than jobs, and they do not time out
      const fr = state.frontier, need = (d) => {
        const k = d.need;
        return k.type === 'give' ? `Bring ${k.n} ${k.res === 'hide' ? 'hides' : k.res}` : k.type === 'kill' ? `Kill ${k.n} ${k.kind === 'cinder' ? 'cinderjaws' : `${k.kind}s`}` : k.type === 'pen' ? `Pen ${k.n} longhorns`
          : k.type === 'tame' ? `Own a ${MOUNTS[k.i].name}` : k.type === 'hatch' ? 'Hatch an egg' : 'Kill a giant';
      };
      const pays = (d) => `Pays $${d.reward.money}${d.reward.standing ? `, standing +${d.reward.standing}` : ''}${d.reward.thrown ? `, ${d.reward.thrown[1]} ${THROWN[d.reward.thrown[0]].name.toLowerCase()}` : ''}`;
      h += `<h3>Favours · ${fr.favours.length} of ${FAVOUR_MAX} taken</h3>`;
      for (const fav of fr.favours) {
        const d = FAVOURS.find(k => k.id === fav.id), n = sim.frontier.progress(fav), t = sim.frontier.target(d);
        h += row(`${d.title} · ${n}/${t}`, `${d.who}: ${need(d)}. ${pays(d)}`, btn('Hand in', { type: 'favour', id: d.id, act: 'done' }, n < t) + btn('Drop', { type: 'favour', id: d.id, act: 'drop' }));
      }
      const open = FAVOURS.filter(d => !fr.done.includes(d.id) && !fr.favours.some(k => k.id === d.id));
      for (const d of open) h += row(d.title, `${d.who}: ${d.text}. ${need(d)}. ${pays(d)}`, btn('Take', { type: 'favour', id: d.id, act: 'take' }, fr.favours.length >= FAVOUR_MAX));
      if (!open.length && !fr.favours.length) h += '<p>Nobody in Dustfork is waiting on you. Every favour is done.</p>';
      return h;
    },
    saloon() {
      return `<h3>Ros Achterberg's saloon</h3><p>${state.town.owned ? '"On the house, boss. Well. The first one."' : state.story.standing >= 25 ? '"There you are. Folk have been asking after you."' : '"Sit down, stranger. Work is on the notice board. Come back when the town knows your name."'}</p>`
        + row('A bed for the night', 'Sleep until seven in the morning with full health', btn(`Rest $${eco.price(REST_PRICE)}`, { type: 'rest' }, player.money < eco.price(REST_PRICE)));
    },
    map() {
      return '<canvas id="bigmap" width="520" height="520"></canvas><p class="key">Blue dot: you · Yellow: longhorns · Red dots: raptors · Black dot: bounty target · Orange: Alpha Rex'
        + ' · Red squares: raptor camps (green once claimed) · Brown squares: town buildings · Brown ring: the ranch pen · Gold ring: your job, or the notice board when you have none · Double gold ring: where the story sends you next · Blue: ponds · Green dots: your posse · Purple dots: gang raiders</p>';
    },
    journal() {
      const st = sim.jobs.status(), herd = sim.herding.counts(), tick = (d) => (d ? '&#10004;' : '&#9675;');
      const story = state.story, quest = sim.story.status();
      let h = '<h3>Story</h3>' + (quest ? `<p><b>${esc(quest.title)}</b>: ${esc(quest.line)}</p>` : `<p>${esc(ENDINGS[`${story.flags.rex}|${story.flags.blackthorn}`] || 'The story so far is done.')}</p><p><i>The story is complete. Dustfork is yours to run for as long as you like.</i></p>`);
      const done = QUESTS.filter(q => story.done.includes(q.id));
      if (done.length) h += '<p>' + done.map(q => `&#10004; ${esc(q.title)}`).join('<br>') + '</p>';
      h += `<h3>Standing in Dustfork · ${esc(story.standing)} / ${STANDING.max}</h3><p>` + STANDING.marks.map(([n, text]) => `${tick(story.standing >= n)} ${n}: ${esc(text)}`).join('<br>') + '</p>';
      const said = Object.entries(story.flags).map(([k, v]) => CHOICES[`${k}=${v}`]).filter(Boolean);
      if (said.length) h += '<h3>Choices you made</h3><p>' + said.map(esc).join('<br>') + '</p>';
      // field journal: one line per species, filled in as you spot and tame them
      h += '<h3>Field journal</h3><p>' + MOUNTS.map((m, i) => {
        const seen = player.journal[i];
        return seen === 2 ? `&#10004; <b>${esc(m.name)}</b> · ${NATURES[m.nature]} · yours, level ${esc(player.mountLv[i])}`
          : seen === 1 ? `&#9675; <b>${esc(m.name)}</b> · ${NATURES[m.nature]} · spotted: ${esc(m.zone)}`
            : `&#9675; Unknown · ${esc(m.wild ? `something lives in ${m.zone}` : m.zone)}`;
      }).join('<br>') + '</p>';
      h += '<h3>Current job</h3>' + (st ? `<p><b>${esc(st.title)}</b>: ${esc(st.line)}</p>` : '<p>None. Jobs are posted on the notice board in Dustfork.</p>');
      h += '<h3>The valley</h3><p>' + state.outposts.map(o => `${tick(o.captured)} Claim ${esc(o.name)}`).join('<br>') + `<br>${tick(state.rex.dead || sim.rexSealed())} ${sim.rexSealed() ? 'Seal the Alpha Rex in Rex Hollow' : 'Defeat the Alpha Rex in Rex Hollow'}</p>`;
      h += `<h3>Record</h3><p>Jobs done: ${esc(state.jobsDone)}<br>Longhorns penned: ${esc(herd.total)}<br>Longhorns lost to predators: ${esc(herd.lost)}</p>`;
      return h;
    },
    rider() {
      let h = `<h3>Level ${esc(player.level)}</h3><p>Experience ${esc(player.xp)} / ${esc(sim.xpNeeded())} · Health ${esc(Math.ceil(player.hp))} / ${esc(player.maxHp)} · Skill points: <b>${esc(player.skillPoints)}</b></p><div class="trees">`;
      for (const id in SKILLS) {
        const tree = SKILLS[id], have = player.skills[id];
        h += `<div><h3>${esc(tree.name)}</h3><p class="key">${esc(tree.role)}</p>`;
        tree.list.forEach((s, i) => {
          const cls = i < have ? 'got' : i === have ? 'next' : 'locked';
          h += `<div class="skill ${cls}"><b>${esc(s.name)}</b><span>${esc(s.note)}</span>${i === have ? btn('Learn', { type: 'skill', tree: id }, player.skillPoints < 1) : ''}</div>`;
        });
        h += '</div>';
      }
      return h + '</div>';
    },
    bag() {
      let h = `<h3>Saddle bags · ${esc(eco.bagUsed())} / ${esc(Math.floor(sim.st.bag))}</h3><p>` + Object.keys(RESOURCES).map(id => `${esc(RESOURCES[id].name)}: ${esc(player.res[id])}`).join(' · ') + '</p><h3>Weapons</h3>';
      WEAPON_ORDER.forEach((id, i) => { if (id in player.weapons) h += row(`${i + 1} · ${WEAPONS[id].name} · ${gradeName(player.weapons[id])}`, weaponNote(id), id === player.weapon ? '<i>In hand</i>' : ''); });
      h += '<h3>Worn gear</h3>';
      for (const slot of SLOTS) {
        const owned = Object.keys(player.gear).filter(id => GEAR[id]?.slot === slot);
        if (!owned.length) { h += row(slot, 'Nothing owned. The general store sells gear.', ''); continue; }
        for (const id of owned) h += row(`${GEAR[id].name} · ${gradeName(player.gear[id])}`, `${slot}: ${gearNote(GEAR[id], player.gear[id])}`, btn(player.equipped[slot] === id ? 'Take off' : 'Wear', { type: 'equip', id }));
      }
      h += '<h3>Food and tonics</h3>';
      for (const id in TONICS) {
        const q = player.quick;
        h += row(`${TONICS[id].name} · ${player.tonics[id]}`, TONICS[id].note,
          btn(q.z === id ? 'On Z' : 'Set Z', { type: 'quick', slot: 'z', id }, q.z === id) + btn(q.x === id ? 'On X' : 'Set X', { type: 'quick', slot: 'x', id }, q.x === id));
      }
      h += '<h3>Thrown</h3><p>' + Object.keys(THROWN).map(id => `${esc(THROWN[id].key)}: ${esc(THROWN[id].name)} x ${esc(player.thrown[id])}`).join(' · ') + '</p>';
      return h;
    },
  };

  function drawMap() {
    const c = document.getElementById('bigmap');
    if (!c) return;
    const g = c.getContext('2d'), S = c.width, at = (v) => (v / WORLD.half * 0.5 + 0.5) * S, X = at, Z = (v) => S - at(v);
    const INK = '#2b2018', BROWN = '#5a3d2b';
    g.fillStyle = '#d9c896'; g.fillRect(0, 0, S, S);
    // ponds
    g.fillStyle = '#8fb6c0';
    for (const [x, z] of PONDS) g.fillRect(X(x) - 3, Z(z) - 3, 7, 7);

    // ---- marks first ----
    const townR = TOWN.r / WORLD.half * S / 2, penR = PEN.r / WORLD.half * S / 2;
    g.strokeStyle = BROWN; g.lineWidth = 2;
    g.beginPath(); g.arc(X(TOWN.x), Z(TOWN.z), townR, 0, 6.28); g.stroke();
    g.beginPath(); g.arc(X(PEN.x), Z(PEN.z), penR, 0, 6.28); g.stroke();
    g.fillStyle = BROWN;
    for (const p of PLACES) g.fillRect(X(p.x) - 3, Z(p.z) - 3, 6, 6);
    for (const a of state.animals) if (!a.dead) { g.fillStyle = '#c99a00'; g.fillRect(X(a.x) - 2, Z(a.z) - 2, 4, 4); }
    for (const o of state.outposts) { g.fillStyle = o.captured ? '#2a8f7e' : '#b0362a'; g.fillRect(X(o.x) - 6, Z(o.z) - 6, 12, 12); }
    for (const e of state.enemies) {
      if (e.dead) continue;
      const boss = e === state.rex;
      g.fillStyle = boss ? '#d9661a' : e.bounty ? '#000' : e.tag === 'raid' || e.tag === 'hold' ? '#7a1fa0' : '#b0362a';
      g.beginPath(); g.arc(X(e.x), Z(e.z), boss ? 7 : e.bounty ? 4 : 3, 0, 6.28); g.fill();
    }
    for (const m of state.mates || []) { g.fillStyle = '#2a8f4a'; g.beginPath(); g.arc(X(m.x), Z(m.z), 4, 0, 6.28); g.fill(); }
    // the gold ring: the job's place, or the notice board when there is no job
    const job = sim.jobs.status(), board = PLACES.find(p => p.id === 'board'), mark = job ? job.mark : board;
    const quest = sim.story.status()?.mark;
    if (mark && (job || !quest)) { g.strokeStyle = '#c99a00'; g.lineWidth = 3; g.beginPath(); g.arc(X(mark.x), Z(mark.z), job ? 11 : 8, 0, 6.28); g.stroke(); }
    // the story's next place: a double gold ring
    if (quest) { g.strokeStyle = '#c99a00'; g.lineWidth = 3; for (const r of [9, 14]) { g.beginPath(); g.arc(X(quest.x), Z(quest.z), r, 0, 6.28); g.stroke(); } }
    g.fillStyle = '#1f6fb0';
    g.beginPath(); g.arc(X(player.x), Z(player.z), 6, 0, 6.28); g.fill();

    // ---- then names, most important first: each takes the first free spot around its mark, so none sit on top of another ----
    const taken = [];
    const hits = (b) => taken.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    const reserve = (x, y, r) => taken.push([x - r, y - r, x + r, y + r]);
    function name(text, x, y, { font = '12px Georgia, serif', color = INK, gap = 9, side = null, centre = false } = {}) {
      g.font = font;
      const w = g.measureText(text).width, h = 12;
      const above = [0, -gap], below = [0, gap + h], right = [w / 2 + gap, h / 2 - 1], left = [-w / 2 - gap, h / 2 - 1];
      const first = centre ? [[0, h / 2 - 1]] : side === 'left' ? [left] : side === 'right' ? [right] : side === 'below' ? [below] : [];
      const spots = [...first, above, below, right, left, [0, -gap - h - 3], [0, gap + 2 * h + 3]];
      let pick = null;
      for (const [dx, dy] of spots) {
        const cx = Math.max(w / 2 + 3, Math.min(S - w / 2 - 3, x + dx)), by = Math.max(h + 2, Math.min(S - 4, y + dy));
        const box = [cx - w / 2 - 2, by - h, cx + w / 2 + 2, by + 3];
        if (!pick) pick = { cx, by, box };
        if (!hits(box)) { pick = { cx, by, box }; break; }
      }
      taken.push(pick.box);
      g.textAlign = 'center';
      g.lineWidth = 3; g.strokeStyle = 'rgba(217,200,150,.8)'; g.strokeText(text, pick.cx, pick.by);
      g.fillStyle = color; g.fillText(text, pick.cx, pick.by);
    }
    reserve(X(player.x), Z(player.z), 7);
    for (const p of PLACES) reserve(X(p.x), Z(p.z), 4);
    for (const o of state.outposts) reserve(X(o.x), Z(o.z), 7);
    reserve(X(PEN.x), Z(PEN.z), penR);
    if (!state.rex.dead) reserve(X(state.rex.x), Z(state.rex.z), 8);

    name('You', X(player.x), Z(player.z), { font: 'bold 12px Georgia, serif' });
    for (const p of PLACES) name(p.id === 'store' ? 'Store' : p.name, X(p.x), Z(p.z), { font: '11px Georgia, serif', gap: 6, side: p.x < TOWN.x ? 'left' : 'right' });
    name('Dustfork', X(TOWN.x), Z(TOWN.z), { font: 'bold 13px Georgia, serif', gap: townR + 5, side: 'below' });
    name('Ranch pen', X(PEN.x), Z(PEN.z), { font: '11px Georgia, serif', gap: penR + 4 });
    for (const o of state.outposts) name(o.name, X(o.x), Z(o.z), { gap: 10 });
    for (const [zone, x, z] of ZONES) name(zone, X(x), Z(z), { font: 'italic 13px Georgia, serif', color: 'rgba(60,40,20,.6)', gap: 12, centre: true });
  }

  function render() {
    const tabs = (place ? [[place.id, place.name]] : []).concat(FIELD);
    el.innerHTML = `<div class="tabs">${tabs.map(([id, name]) => `<button class="${id === current ? 'on' : ''}" data-cmd="${esc(JSON.stringify({ tab: id }))}">${esc(name)}</button>`).join('')}`
      + `<span class="purse">$${esc(player.money)}</span><button data-cmd="${esc(JSON.stringify({ close: true }))}">Close</button></div><div class="sheet">${body[current]()}</div>`;
    drawMap();
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd]');
    if (!b || b.disabled) return;
    const cmd = JSON.parse(b.dataset.cmd);
    if (cmd.close) return close();
    if (cmd.tab) current = cmd.tab; else dispatch(sim.command(cmd));
    render();
  });

  function open(name) {
    place = sim.nearPlace();
    current = name === 'place' ? place?.id : name;
    if (!current) return false;
    el.style.display = 'block';
    document.body.classList.add('menu-open');   // messages move to the top edge, clear of the sheet
    render();
    return true;
  }
  function close() {
    if (!current) return;
    current = null;
    el.style.display = 'none';
    document.body.classList.remove('menu-open');
    onClose();
  }
  return { open, close, isOpen: () => !!current, current: () => current };
}
