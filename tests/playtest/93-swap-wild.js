// Playtest: hurt-crest behaviour, natural wear-down + tame of a hauler and crest, swap edge cases.
import { mk, check, note, sane, failCount } from './50-lib.js';
import { TAME, SWAP_CD } from '../../src/data/content.js';
// crest when hurt: bolt or fight?
{
  const g = mk(), { p } = g, e = g.wild('crest')[0];
  for (const x of g.s.enemies) if (x.kind === 'raptor' || x.kind === 'dilo') { x.dead = true; x.deadT = -1e9; }
  g.open(e.x + 15, e.z); g.wait(0.1);
  const d0 = g.dist(e); g.sim.state.enemies; 
  // one bow-like silent hit: use damage through a bullet
  for (let i = 0; i < 20 && e.hp === e.maxHp; i++) g.step({ fire: true, aim: g.aimAt(e) });
  let minD = 99, bitten = false;
  for (let i = 0; i < 360; i++) { g.step(); minD = Math.min(minD, g.dist(e)); if (p.hp < p.maxHp) bitten = true; }
  note(`hurt crest: start ${d0.toFixed(0)} m, closest ${minD.toFixed(1)} m, bit the rider: ${bitten}, state ${e.state}`);
  check('a hurt crestrunner bolts (content.js:9 says so) rather than charging the rider', !bitten && minD >= d0 - 1);
}
// natural tame, no cheating on hp: shoot, bolas, tame
for (const kind of ['hauler', 'crest', 'plate']) {
  const g = mk(99, { level: 6 }), { p, s } = g, e = g.wild(kind)[0];
  for (const x of s.enemies) if (x.kind === 'raptor' || x.kind === 'cinder' || x.kind === 'dilo') { x.dead = true; x.deadT = -1e9; }   // keep neighbours out of it
  p.thrown.bolas = 5;
  g.open(e.x + 24, e.z);
  let t = 0, done = false, phase = 'shoot';
  for (; t < 180 * 60 && !done; t++) {
    const d = g.dist(e), away = { mx: p.x - e.x, mz: p.z - e.z };
    if (e.dead && !e.tamed) { phase = 'killed'; break; }
    if (p.mounts[kind === 'hauler' ? 7 : kind === 'crest' ? 6 : 5]) { done = true; break; }
    if (p.tame) { g.step(); continue; }
    if (e.hp > e.maxHp * TAME.health) { g.step({ fire: true, aim: g.aimAt(e), ...(d < 14 ? { ...away, sprint: true } : {}) }); continue; }
    if (e.heldT <= 0.5) { g.face(e); g.step({ actions: ['throw:bolas'], aim: g.aimAt(e) }); continue; }
    if (d > TAME.reach - 1) { g.step({ mx: e.x - p.x, mz: e.z - p.z, sprint: true }); continue; }
    g.act('tame');
  }
  check(`natural tame of ${kind}`, done, `phase ${phase} t ${(t / 60).toFixed(0)}s hp ${e.hp.toFixed(0)}/${e.maxHp} bolas ${p.thrown.bolas} rider hp ${p.hp.toFixed(0)} last "${g.lastToast()}"`);
  check(`sane ${kind}`, sane(g.sim).length === 0, sane(g.sim).join(';'));
  // respawn of the tamed animal
  g.wait(42); check(`${kind} respawns after taming`, !e.dead && e.hp === e.maxHp);
}
// swap
{
  const g = mk(), { p, sim } = g; for (const i of [4, 6, 7]) p.mounts[i] = true; p.string = [0, 4, 6, 7]; g.open(0, -120);
  for (const x of g.s.enemies) if (x.kind !== 'crest') { x.dead = true; x.deadT = -1e9; }   // keep neighbours out of it
  g.act('swap'); check('swap 0->4', p.mount === 4);
  g.act('swap'); check('swap refused in cooldown', p.mount === 4 && /Next swap/.test(g.lastToast()));
  g.wait(SWAP_CD + 0.1); g.act('ability'); check('charging', p.charging && p.dashT > 0);
  // swap is on cd 2 from ability? no: abilityCd 7. swap mid-charge
  g.act('swap'); check('swap mid-charge ends it', p.mount === 6 && !p.charging && p.dashT <= 0, `${p.mount} ${p.charging} ${p.dashT}`);
  note('abilityCd carried to Crestrunner:', p.abilityCd.toFixed(1));
  g.wait(SWAP_CD + 0.1); g.act('swap'); check('->Hauler bag 60', p.mount === 7 && sim.st.bag === 60);
  g.wait(SWAP_CD + 0.1); g.act('swap'); check('wraps to Strider bag 20', p.mount === 0 && sim.st.bag === 20);
  // mid-tame swap
  const e = g.wild('crest')[0]; g.bring(e, 0, 6, { hpFrac: 0.2, held: 5 }); g.wait(SWAP_CD + 0.1);
  g.act('tame'); g.wait(1); g.act('swap'); g.wait(TAME.time);
  check('swap mid-tame: taming still completes, already owned -> xp', e.tamed && p.mountXp[6] + p.mountLv[6] * 100 > 100, `${e.tamed} ${p.mountXp[6]} ${p.mountLv[6]}`);
  // on foot swap
  g.wait(4); g.act('dismount'); const m = p.mount; g.act('swap'); check('no swap on foot', p.mount === m);
  check('sane', sane(sim).length === 0, sane(sim).join(';'));
  // stables: remove ridden / 5th
  p.x = -20; p.z = -24; g.act('dismount'); g.wait(0.2);
  p.mounts[5] = true; g.cmd({ type: 'string', i: 5 }); check('string stays 4', p.string.length === 4 && /holds 4/.test(g.lastToast()));
  g.cmd({ type: 'mount', i: 5 }); check('ride 5th: string still 4 and includes it', p.string.length === 4 && p.string.includes(5) && p.mount === 5, JSON.stringify(p.string));
  check('sane', sane(sim).length === 0, sane(sim).join(';'));
}
console.log(failCount() ? `\n${failCount()} FAILED` : '\nall passed');
