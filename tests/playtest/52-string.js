// String of mounts, swapping (B), stables commands, save/restore of odd strings.
import { mk, lateGame, check, note, clone, createSim, sane } from './50-lib.js';
import { MOUNTS, SWAP_CD, STRING_MAX } from '../../src/data/content.js';

const town = (g) => { g.p.x = -20; g.p.z = -21; };
const field = (g) => { g.open(0, -120); for (const e of g.s.enemies) if (Math.hypot(e.x - g.p.x, e.z - g.p.z) < 80) { e.x += 150; e.home = { x: e.x, z: e.z }; } };

{ // basics
  const g = lateGame(); field(g); const { p } = g;
  check('late game string is [0,3,4,5]', JSON.stringify(p.string) === '[0,3,4,5]');
  g.act('swap'); check('B goes to the next in the string', p.mount === 3 && p.swapCd === SWAP_CD - 0 || p.mount === 3, `mount ${p.mount} cd ${p.swapCd}`);
  g.act('swap'); check('swap cooldown blocks an immediate second swap', p.mount === 3, g.lastToast());
  g.wait(2.9); g.act('swap'); check('still blocked at 2.9 s', p.mount === 3);
  g.wait(0.2); g.act('swap'); check('allowed after 3 s', p.mount === 4);
  g.wait(3.1); p.hurtT = 4.9; g.act('swap'); check('not within 5 s of being hurt', p.mount === 4, g.lastToast());
  g.wait(0.2); g.act('swap'); check('allowed 5 s after the hit', p.mount === 5);
  g.wait(3.1); g.act('swap'); check('wraps round to the first', p.mount === 0);
  // on foot, dead
  g.wait(3.1); g.act('dismount'); g.act('swap'); check('no swap on foot', p.mount === 0); g.act('dismount');
  p.dead = true; g.act('swap'); check('no swap when dead', p.mount === 0); p.dead = false; p.deadT = 0;
  // mid-dash
  g.act('ability'); const d = p.dashT; g.act('swap');
  check('swap mid-dash ends the dash', d > 0 && p.dashT <= 0 && p.mount === 3, `dash ${d} -> ${p.dashT}`);
  // mid-charge
  g.wait(8.1); g.act('swap'); check('on the Cinderjaw', p.mount === 4, `mount ${p.mount} ${g.lastToast()}`);
  g.wait(3.1); g.act('ability'); const ch = p.charging; g.act('swap');
  check('swap mid-charge ends the charge', ch && !p.charging && p.dashT <= 0 && p.mount === 5);
  // two swaps in one step
  g.wait(8); g.step({ actions: ['swap', 'swap', 'swap'] }); check('three B in one step swap once', p.mount === 0, `mount ${p.mount}`);
}

{ // ability cooldown and swapping
  const g = lateGame(); field(g); const { p, s } = g;
  const e = g.wild('cinder')[0]; g.bring(e, 0, 5, { held: 60 });
  // dash (cd 4) -> swap -> the next mount's ability
  let used = [], t = 0;
  const tryAb = () => { const ev = g.act('ability'); if (ev.some(x => x.type === 'ability')) used.push(`${t.toFixed(1)}s:${MOUNTS[p.mount].ability.name}`); };
  for (let i = 0; i < 30 * 60; i++) { t = i / 60; e.hp = e.maxHp; e.heldT = 60; e.x = p.x; e.z = p.z + 5; g.face(e); p.dashT = 0; p.hurtT = 99; if (p.abilityCd <= 0) tryAb(); if (p.swapCd <= 0) g.act('swap'); else g.step(); p.x = 0; p.z = -120; }
  note(`30 s of using every ability as soon as possible while swapping: ${used.length} uses: ${used.join(' ')}`);
  // does one mount's cooldown carry to the next? (shared timer)
  const h = lateGame(); field(h); h.act('ability'); const cd = h.p.abilityCd; h.act('swap');
  check('the ability timer is shared: swapping does not refresh it', h.p.abilityCd >= cd - 0.1, `${cd} -> ${h.p.abilityCd}`);
  // short-cooldown ability first, then swap to a long-cooldown one: wait is the short one's
  h.wait(4.1); h.act('swap'); h.wait(3.1); h.act('swap');   // now on Platewalker (index 5)? string 0,3,4,5: 0->3->4->5
  note(`on ${MOUNTS[h.p.mount].name}, abilityCd ${h.p.abilityCd.toFixed(2)}`);
  // stables 'mount' command: no swap cooldown, no hurt rule, no ability floor
  const k = lateGame(); town(k); k.p.hurtT = 0; k.p.swapCd = 3; k.cmd({ type: 'mount', i: 5 });
  note(`'mount' command in town with swapCd=3 and hurtT=0: now riding ${MOUNTS[k.p.mount].name} (the command ignores both swap rules; it works anywhere inside the town circle, also during a raid)`);
  k.sim.town.startRaid(); k.p.hurtT = 0; k.cmd({ type: 'mount', i: 2 });
  note(`during a raid, just hurt: 'mount' to a dinosaur not owned -> riding ${MOUNTS[k.p.mount].name}`);
  k.cmd({ type: 'mount', i: 1 });
  check('mount command during a raid right after a hit is refused', k.p.mount !== 1, `riding ${MOUNTS[k.p.mount].name} string ${JSON.stringify(k.p.string)}`);
}

{ // string/mount commands
  const g = lateGame(); town(g); const { p } = g;
  g.cmd({ type: 'string', i: 0 }); check('cannot remove the ridden mount', p.string.includes(0), g.lastToast());
  g.cmd({ type: 'string', i: 1 }); check('a full string refuses a fifth', p.string.length === 4 && !p.string.includes(1), g.lastToast());
  g.cmd({ type: 'string', i: 3 }); check('remove one', JSON.stringify(p.string) === '[0,4,5]');
  g.cmd({ type: 'string', i: 1 }); check('add the Bulwark', JSON.stringify(p.string) === '[0,4,5,1]');
  g.cmd({ type: 'string', i: 2 }); check('cannot add one not owned', !p.string.includes(2));
  for (const bad of [-1, 6, 1.5, '1', null, NaN, undefined, {}]) { g.cmd({ type: 'string', i: bad }); g.cmd({ type: 'mount', i: bad }); }
  check('bad indices are ignored', JSON.stringify(p.string) === '[0,4,5,1]' && p.mount === 0);
  g.cmd({ type: 'mount', i: 3 }); check('riding one outside a full string replaces the last', p.mount === 3 && p.string.length === 4 && p.string.includes(3), JSON.stringify(p.string));
  note(`string after riding the Spitter out: ${JSON.stringify(p.string)} (the Bulwark, last added, was dropped)`);
  g.cmd({ type: 'mount', i: 3 }); g.cmd({ type: 'mount', i: 3 }); check('no duplicates from repeating the command', new Set(p.string).size === p.string.length);
  g.act('dismount'); g.cmd({ type: 'mount', i: 0 }); check('no mount change on foot', p.mount === 3); g.cmd({ type: 'string', i: 0 });
  note(`string edit on foot: ${JSON.stringify(p.string)}`); g.act('dismount');
  check('state sane', sane(g.sim).length === 0, sane(g.sim).join('; '));
  g.open(0, -120); g.cmd({ type: 'string', i: 4 }); g.cmd({ type: 'mount', i: 4 });
  check('string/mount commands need the town', p.mount === 3, g.lastToast());
  // remove all others; swap with one
  town(g); for (const i of [...p.string]) g.cmd({ type: 'string', i });
  check('string never goes below the ridden mount', JSON.stringify(p.string) === `[${p.mount}]`, JSON.stringify(p.string));
  g.open(0, -120); g.act('swap'); check('swap with one in the string does nothing', p.mount === 3, g.lastToast());
}

{ // buying the Bulwark and quest-given mounts vs the string and the journal
  const g = mk(); town(g); const { p } = g; p.money = 5000;
  g.cmd({ type: 'buy', kind: 'mount', i: 1 });
  check('bought Bulwark is owned', p.mounts[1]);
  note(`after buying: string ${JSON.stringify(p.string)} journal[1]=${p.journal[1]} (0 = "Unknown" in the field journal until a reload sets 2)`);
  const save = clone(g.sim.snapshot()), a = createSim(); a.restore(save);
  note(`after reload: journal[1]=${a.state.player.journal[1]}`);
  for (const i of [2, 3, 4, 5]) g.cmd({ type: 'buy', kind: 'mount', i });
  check('only the Bulwark can be bought', !p.mounts[2] && !p.mounts[3] && !p.mounts[4] && !p.mounts[5]);
  // rex kill
  const r = mk(99, { level: 30 }); r.s.rex.hp = 1; r.p.x = r.s.rex.x; r.p.z = r.s.rex.z - 20; r.wait(0.1);
  for (let i = 0; i < 600 && !r.s.rex.dead; i++) r.step({ fire: true, aim: r.aimAt(r.s.rex) });
  check('rex dead gives the Tyrant', r.s.rex.dead && r.p.mounts[2]); note(`journal[2] after the Rex: ${r.p.journal[2]}; string ${JSON.stringify(r.p.string)}`);
}

{ // taming with a full string, and with a roped longhorn / tame in progress
  const g = lateGame(); field(g); const { p, s } = g; p.mounts[3] = false; p.string = [0, 1, 4, 5]; p.mounts[1] = true;
  const e = g.wild('dilo')[0]; g.bring(e, 0, 6, { hpFrac: 0.2, held: 30 }); g.act('tame'); g.wait(1); g.act('swap');
  check('swap while taming is allowed and the tame goes on', p.mount === 1 && !!p.tame); g.wait(5.5);
  check('tamed with a full string: waits at the stables', p.mounts[3] && !p.string.includes(3) && p.string.length === 4, g.lastToast());
  // roped longhorn
  const a = s.animals[0]; a.x = p.x + 6; a.z = p.z; g.act('lasso'); const roped = s.herd.roped === a; g.wait(3.1); g.act('swap');
  check('swap with a roped longhorn keeps the rope', roped && s.herd.roped === a && p.mount !== 1, `mount ${p.mount}`);
}

{ // save / restore with odd strings
  const g = lateGame(); const base = clone(g.sim.snapshot());
  const tryStr = (str, mount, mounts) => {
    const sv = clone(base); sv.player.string = str; if (mount !== undefined) sv.player.mount = mount; if (mounts) sv.player.mounts = mounts;
    const a = createSim(); const ok = a.restore(sv); const bad = ok ? sane(a) : ['refused'];
    // play a little: swap round the whole string
    if (ok) for (let i = 0; i < 6; i++) { a.state.player.x = 0; a.state.player.z = -120; a.step({ mx: 0, mz: 0, actions: ['swap'] }); for (let k = 0; k < 190; k++) a.step(); bad.push(...sane(a)); }
    return { ok, str: ok ? JSON.stringify(a.state.player.string) : '-', mount: ok ? a.state.player.mount : -1, bad: [...new Set(bad)] };
  };
  const cases = [
    [[0, 0, 0, 0], 0], [[5, 5, 3], 3], [[1, 2, 3, 4, 5, 0], 0], [[], 4], [[2], 0], [['3', 4.5, -1, 99, null], 5], ['x', 0], [null, 3], [[3, 4, 5, 1], 0], [[3, 4, 5, 1], 2], [[0, 3], 99], [[0, 3], -1], [[4, 4, 4, 4, 4, 4, 4], 4],
  ];
  for (const [str, mount] of cases) {
    const r = tryStr(str, mount);
    check(`restore string ${JSON.stringify(str)} mount ${mount} -> ${r.str} riding ${r.mount}`, r.ok && r.bad.length === 0, r.bad.join('; '));
  }
  const r = tryStr([0, 3, 4, 5], 3, [true, false, false, false, false, false]);
  check(`mounts not owned are dropped from the string -> ${r.str} riding ${r.mount}`, r.ok && r.str === '[0]' && r.mount === 0 && !r.bad.length, r.bad.join(';'));
  // mount levels and xp
  const sv = clone(base); sv.player.mountLv = [99, -3, 'a', null, 1.6, 30]; sv.player.mountXp = [1e12, -5, NaN, 'x', 7, 1e6];
  const a = createSim(); check('odd mount levels/xp are cleaned', a.restore(sv) && sane(a).length === 0, `${JSON.stringify(a.state.player.mountLv)} ${JSON.stringify(a.state.player.mountXp)} ${sane(a).join(';')}`);
  note(`cleaned: lv ${JSON.stringify(a.state.player.mountLv)} xp ${JSON.stringify(a.state.player.mountXp)}`);
  // saved xp far above what the level needs: next gain
  const p2 = a.state.player; p2.x = 0; p2.z = -120; a.step(); const lv = p2.mountLv[1];
  note(`mount 1 restored at lv ${lv} with xp ${p2.mountXp[1]}`);
}
process.exit(0);
