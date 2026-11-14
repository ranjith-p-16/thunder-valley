// The number changes this analysis proposes, applied in memory only (nothing under src/ is edited), so their effect can be measured.
import { KINDS, RIDER, TOWN_RULE, TAX_LAWS } from '../../src/data/content.js';
import { WEAPONS, RESOURCES } from '../../src/data/items.js';
import { GIANT } from '../../src/data/frontier.js';
export const RESPAWN = 1440;   // src/sim/sim.js brings a shot animal back after 40 s (a literal in updateEnemies); the bots emulate this value
export function apply(o = {}) {
  RIDER.dmgPerLevel = 1.02;
  Object.assign(KINDS.rex, { hp: o.rexHp || 6000, speed: o.rexSpeed || +process.env.REX_SPEED || 15 });
  KINDS.blackthorn.hp = 7000; KINDS.hester.hp = o.hesterHp || 2000; KINDS.pell.hp = 1800; KINDS.kettle.hp = 1500;
  GIANT.hp = 15;
  WEAPONS.rifle.dmg = 80;
  WEAPONS.bow.fireCd = 0.7;
  RESOURCES.hide.sell = 8; RESOURCES.meat.sell = 3;
}
