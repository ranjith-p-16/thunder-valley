// Re-runs the key fights and the income bots with the proposed numbers (see 105-proposed.js).   /opt/homebrew/bin/node tests/playtest/104-proposed-check.js
import { apply, RESPAWN } from './105-proposed.js';
import { run, POSSE } from './102-fights.js';
import { farm, jobs } from './103-income.js';
apply();
console.log('--- Alpha Rex 6000 hp, speed 12.5; gun damage x1.02 per level ---');
run('L1 Common revolver, circle, alone', { rex: 1, level: 1, mode: 'kite', max: 400 });
run('L9 Common revolver GS8, stand, alone', { rex: 1, level: 9, gs: 8, mountLv: 11, max: 400 });
run('L9 Common revolver GS8, circle, alone', { rex: 1, level: 9, gs: 8, mountLv: 11, mode: 'kite', max: 400 });
run('L9 Common revolver GS8, circle, alone, on a Grown Platewalker', { rex: 1, level: 9, gs: 8, mount: 5, mountLv: 11, mode: 'kite', max: 400 });
run('L9 Common revolver GS8, stand, posse', { rex: 1, level: 9, gs: 8, mountLv: 11, mates: POSSE, max: 400 });
run('L9 Common revolver GS8, circle, posse', { rex: 1, level: 9, gs: 8, mountLv: 11, mates: POSSE, mode: 'kite', max: 400 });
run('L9 Fine rifle GS8, circle, posse', { rex: 1, level: 9, gs: 8, mountLv: 11, weapon: 'rifle', grade: 2, mates: POSSE, mode: 'kite', max: 400 });
run('L9 Fine shotgun GS8, stand, posse, tonic', { rex: 1, level: 9, gs: 8, mountLv: 11, weapon: 'shotgun', grade: 2, mates: POSSE, tonic: 1, max: 400 });
run('L9 Fine shotgun GS8 + Fine vest/war (marshal 2), Grown Platewalker, stand, alone', { rex: 1, level: 9, gs: 8, marshal: 2, mount: 5, mountLv: 11, weapon: 'shotgun', grade: 2, max: 400 });
run('L12 Fine bow GS10, stand, posse', { rex: 1, level: 12, gs: 10, mountLv: 14, weapon: 'bow', grade: 2, mates: POSSE, max: 400 });
run('L9 no shooting: Grown Platewalker V + Sweep + Brace', { rex: 1, level: 9, mount: 5, mountLv: 11, mode: 'melee', max: 400 });
console.log('--- lieutenants: Pell 1800, Hester 2500, Kettles 1500 each, Blackthorn 7000 ---');
run('q9 Pell: L5 Common revolver GS4, stand, Mara+Tobe', { quest: 8, step: 2, flags: { pell: 'fought' }, level: 5, gs: 4, mountLv: 6, mates: ['mara', 'tobe'], focus: true });
run('q9 Pell: same, alone, circling', { quest: 8, step: 2, flags: { pell: 'fought' }, level: 5, gs: 4, mountLv: 6, focus: true, mode: 'kite' });
run('q11 Hester: L5 Common revolver GS4, stand, posse', { quest: 10, step: 1, level: 5, gs: 4, mountLv: 6, mates: POSSE, focus: true });
run('q11 Hester: L5 Sturdy rifle GS4, circle, posse', { quest: 10, step: 1, level: 5, gs: 4, mountLv: 6, mates: POSSE, focus: true, mode: 'kite', weapon: 'rifle', grade: 1 });
run('q11 Hester: alone, circling', { quest: 10, step: 1, level: 5, gs: 4, mountLv: 6, focus: true, mode: 'kite' });
run('q14 Kettles: L8 Common GS7, stand, posse', { quest: 13, step: 1, level: 8, gs: 7, mountLv: 10, mates: POSSE });
run('q14 Kettles: L8 Sturdy revolver GS7, circle, posse', { quest: 13, step: 1, level: 8, gs: 7, mountLv: 10, mates: POSSE, grade: 1, mode: 'kite' });
run('q18 Blackthorn: L9 Common GS8, stand, posse', { quest: 17, step: 1, level: 9, gs: 8, mountLv: 12, mates: POSSE, focus: true, max: 400 });
run('q18 Blackthorn: L9 Common GS8, circle, posse', { quest: 17, step: 1, level: 9, gs: 8, mountLv: 12, mates: POSSE, focus: true, mode: 'kite', max: 400 });
run('q18 Blackthorn: L10 Fine rifle GS9, circle, posse', { quest: 17, step: 1, level: 10, gs: 9, mountLv: 12, mates: POSSE, focus: true, mode: 'kite', weapon: 'rifle', grade: 2, max: 400 });
console.log('--- giants at 15x health ---');
for (const kind of ['raptor', 'dilo', 'cinder']) {
  run(`giant ${kind}: L4 Common revolver GS3, circle, alone`, { giant: kind, level: 4, gs: 3, mountLv: 5, mode: 'kite' });
  run(`giant ${kind}: L9 Sturdy revolver GS8, stand, alone`, { giant: kind, level: 9, gs: 8, grade: 1, mountLv: 11 });
}
console.log(`--- income: hide $8, meat $3, shot animals back after ${RESPAWN} s ---`);
farm('any', 2, 99, { respawn: RESPAWN });
farm('any', 2, 7, { respawn: RESPAWN });
farm('hauler', 1, 99, { respawn: RESPAWN });
jobs(1, 99); jobs(1, 7);
