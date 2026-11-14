// All tuning numbers and content live here, so balance changes never touch the rules.
import { TOWN } from './items.js';

// dmg and bite (seconds between bites) are against the rider; preyDmg is what one bite does to a longhorn.
export const KINDS = {
  raptor: { hp: 85, speed: 13, dmg: 13, bite: 1.1, lunge: true, preyDmg: 15, xp: 25, aggro: 38, range: 3.2, radius: 1.6, nature: 'storm' },
  // tameable wild kinds from Red Mesa: cinderjaws hunt; platewalkers mind their own business until hurt
  cinder: { hp: 190, speed: 14.5, dmg: 18, bite: 1.2, lunge: true, preyDmg: 20, xp: 60, aggro: 40, range: 3.8, radius: 2, nature: 'ember' },
  // peaceful browsers: crestrunners are quick and turn on whoever hurts them; haulers are huge and slow to anger
  crest:  { hp: 110, speed: 13, dmg: 11, bite: 1.4, preyDmg: 0, xp: 45, aggro: 0, range: 3.6, radius: 1.9, nature: 'thorn' },
  hauler: { hp: 520, speed: 5.5, dmg: 26, bite: 2, preyDmg: 0, xp: 110, aggro: 0, range: 6, radius: 3.4, nature: 'swamp' },
  plate:  { hp: 260, speed: 7, dmg: 20, bite: 1.8, preyDmg: 0, xp: 70, aggro: 0, range: 4.5, radius: 2.6, nature: 'stone' },
  // act 1: compies are pests that only run; dilophosaurs spit from range and blur your sight; rustlers shoot from the saddle
  compy:  { hp: 10, speed: 11, dmg: 0, bite: 9, preyDmg: 0, xp: 5, aggro: 0, range: 0, radius: 0.7, ai: 'pest', nature: 'thorn' },
  dilo:   { hp: 150, speed: 10, dmg: 12, bite: 2.4, preyDmg: 0, xp: 80, aggro: 34, range: 20, radius: 1.8, ai: 'spitter', blind: 3, nature: 'swamp' },
  rustler: { hp: 90, speed: 11, dmg: 8, bite: 1.4, preyDmg: 0, xp: 60, aggro: 46, range: 24, radius: 1.6, ai: 'gunner' },
  // Blackthorn's lieutenants: Pell shoots from the saddle among his spitters; Hester charges on a war triceratops
  pell:   { hp: 1200, speed: 9, dmg: 10, bite: 1.5, preyDmg: 0, xp: 300, aggro: 46, range: 24, radius: 2, ai: 'gunner', nature: 'thorn' },
  hester: { hp: 1600, speed: 11, dmg: 22, bite: 1.6, lunge: true, preyDmg: 0, xp: 400, aggro: 50, range: 5, radius: 2.8, nature: 'stone' },
  // act 3: the Kettle twins fight as a pair of gunners; Blackthorn rides a tyrannosaur
  kettle: { hp: 1000, speed: 10, dmg: 9, bite: 1.4, preyDmg: 0, xp: 300, aggro: 48, range: 24, radius: 2, ai: 'gunner', nature: 'swamp' },
  blackthorn: { hp: 4000, speed: 11, dmg: 26, bite: 1.5, lunge: true, preyDmg: 0, xp: 1000, aggro: 60, range: 7, radius: 4.2, nature: 'ember' },
  rex:    { hp: 3500, speed: 12, dmg: 30, bite: 1.5, lunge: true, preyDmg: 90, xp: 500, aggro: 55, range: 7.5, radius: 4.6, nature: 'ember' },
};
// How far an animal strays from home, how long a wound keeps it coming, and how it works itself free of scenery.
// boss: quest enemies, giants and the Alpha follow this many times further, so a long fight is not undone by backing away
// The lunge: a biter a few lengths off crouches (the tell: it glows and snarls), then springs in a straight line.
// It hits harder than a bite, and the dodge (C) or a sidestep gets you clear.
export const LUNGE = { near: 5, far: 14, wind: 0.55, time: 0.42, speed: 34, dmg: 1.7, cd: [4, 7] };
export const LEASH = { boss: 2.5, home: 110, provokedHome: 140, giveUp: 2.2, provoked: 8, stuckT: 1, stuckMove: 1, sideT: 0.8 };

// armor multiplies damage taken; cam is how high and how far back the camera sits; muzzle is the gun's height.
// Natures: each is strong against the next one round the ring and weak against the one before.
export const NATURES = { stone: 'Stone', storm: 'Storm', swamp: 'Swamp', ember: 'Ember', thorn: 'Thorn' };
export const BEATS = { stone: 'storm', storm: 'swamp', swamp: 'ember', ember: 'thorn', thorn: 'stone' };
export const NATURE = { strong: 1.25, weak: 0.8 };
// Mounts grow through three stages. k scales size and melee; hurt scales damage taken; pace scales speed.
export const STAGES = [
  { name: 'Young', from: 1, k: 0.85, hurt: 1.1, pace: 0.95 },
  { name: 'Grown', from: 10, k: 1, hurt: 1, pace: 1 },
  { name: 'Elder', from: 20, k: 1.15, hurt: 0.9, pace: 1.04 },
];
export const MOUNT_MAX_LEVEL = 30;
export const TAME = { reach: 10, time: 6, health: 0.3, repeatXp: 60, xp: 40 };
export const STRING_MAX = 4;
export const MELEE = { cd: 1.1, stamina: 12, reach: 3.5, arc: 1.0 };
export const SWAP_CD = 3;
// seconds before a killed wild animal is back at its home; long enough that one spot cannot be farmed
export const RESPAWN = 600;

// The species you can ride. wild: the animal kind that is tamed into it (null: story reward or bought).
// zone: where the field journal says to look. melee: damage of its V attack at Grown, level 1.
export const MOUNTS = [
  { id: 'mount', name: 'Strider', speed: 12, sprint: 21, armor: 1, cam: { h: 5.2, back: 15 }, muzzle: 4.4, ability: { name: 'Dash', cd: 4 }, nature: 'storm', wild: 'raptor', zone: 'everywhere', melee: 28 },
  { id: 'mountTrike', name: 'Bulwark', speed: 9, sprint: 15, armor: 0.6, cam: { h: 5.6, back: 16 }, muzzle: 4.2, ability: { name: 'Rally', cd: 14 }, nature: 'stone', wild: null, zone: 'Mara gives you one, or buy at the stables', melee: 40 },
  { id: 'mountRex', name: 'Tyrant', speed: 10.5, sprint: 17, armor: 0.8, cam: { h: 9, back: 24 }, muzzle: 6.6, ability: { name: 'Roar', cd: 12 }, nature: 'ember', wild: null, zone: 'defeat the Alpha Rex', melee: 60 },
  { id: 'mountSpitter', name: 'Spitter', speed: 11, sprint: 19, armor: 0.9, cam: { h: 4.8, back: 14 }, muzzle: 4, ability: { name: 'Spit', cd: 8 }, nature: 'swamp', wild: 'dilo', zone: 'Fernhollow woods, west', melee: 24 },
  { id: 'mountCinder', name: 'Cinderjaw', speed: 12.5, sprint: 22, armor: 0.85, cam: { h: 5.6, back: 16 }, muzzle: 4.8, ability: { name: 'Charge', cd: 7 }, nature: 'ember', wild: 'cinder', zone: 'Red Mesa, east', melee: 38 },
  { id: 'mountPlate', name: 'Platewalker', speed: 8.5, sprint: 14, armor: 0.5, cam: { h: 5.8, back: 17 }, muzzle: 4.4, ability: { name: 'Sweep', cd: 9 }, nature: 'stone', wild: 'plate', zone: 'Red Mesa, east', melee: 45 },
  { id: 'mountCrest', name: 'Crestrunner', speed: 11.5, sprint: 20, armor: 0.9, cam: { h: 5.4, back: 15 }, muzzle: 4.6, ability: { name: 'Call', cd: 12 }, nature: 'thorn', wild: 'crest', zone: 'Fernhollow woods, south-west', melee: 26 },
  { id: 'mountHauler', name: 'Hauler', speed: 8, sprint: 12.5, armor: 0.65, cam: { h: 8.2, back: 22 }, muzzle: 6.8, ability: { name: 'Stomp', cd: 11 }, nature: 'swamp', wild: 'hauler', zone: 'Sinkwater marsh, far south', melee: 50, bag: 40 },
];
// Spit holds and hurts one animal ahead; Charge is a damaging rush; Sweep hits and staggers everything close.
export const SPIT = { range: 26, dmg: 30, hold: 2.5 };
export const CHARGE = { speed: 30, time: 0.8, dmg: 50, reach: 3 };
export const SWEEP = { radius: 8, dmg: 45, hold: 1.5 };
// Stomp is a bigger, slower Sweep; Call brings loose longhorns to follow, like the Bulwark's Rally, from further off
export const STOMP = { radius: 11, dmg: 60, hold: 2 };
export const CALL = { radius: 55, time: 10 };
// Wild animals of the tameable kinds, placed where the journal says: [kind, x, z, how many, spread]
export const WILD = [['dilo', -215, -70, 3, 22], ['cinder', 205, -35, 4, 26], ['plate', 185, 20, 4, 24], ['crest', -175, -115, 4, 22], ['hauler', 70, -205, 3, 26]];

export const DASH = { speed: 34, time: 1.2 };
export const RALLY = { radius: 40, time: 8 };
export const ROAR = { herd: 50, predators: 45, time: 5 };

export const RIDER = {
  hp: 120, hpPerLevel: 10, dmgPerLevel: 1.03, radius: 1.2,
  staminaSprint: 25, staminaRegen: 20,
  regenDelay: 9, regen: 1.5,
};
// A short burst in the move direction; no damage is taken while it lasts.
export const DODGE = { speed: 26, time: 0.35, cost: 30, cd: 0.9 };

export const OUTPOST_DEFS = [
  { name: 'Red Mesa camp', x: 120, z: -90, guards: 4 },
  { name: 'Fernhollow camp', x: -140, z: 60, guards: 5 },
  { name: 'Highwatch camp', x: 40, z: 170, guards: 6 },
];
export const REX_HOME = { x: -70, z: -170 };
export const CAPTURE = { r: 13, time: 5, xp: 150 };
export const ROAMERS = 12;
// wild packs make their homes this far from the town, the herds, the Rex and the camps
export const ROAMER_CLEAR = { town: 80, herd: 60, rex: 80, camp: 60, wild: 90 };

export const PEN = { x: 0, z: 34, r: 13 };
// The fence is solid except for a gate facing the valley centre. Angles use x = cos, z = sin.
export const GATE = { angle: -Math.PI / 2, half: 0.6 };
export const HERD_SPOTS = [{ x: 85, z: 55 }, { x: -75, z: 105 }, { x: -105, z: -55 }];
export const HERD = {
  goal: 10, size: 6, pressure: 17, walk: 3.5, run: 10.5, panic: 14, hp: 90, radius: 1.2,
  hollerR: 34, hollerCd: 5, ropeR: 28, ropeSlack: 7, xp: 40, respawn: 120,
};

// One full day in seconds, and when a new game starts (0 = midnight, 0.5 = noon).
export const DAY = { length: 24 * 60, start: 0.32, nightAggro: 1.4 };

export const CLEARINGS = [
  { x: TOWN.x, z: TOWN.z, r: TOWN.r + 3 }, { ...REX_HOME, r: 22 },
  ...OUTPOST_DEFS.map(o => ({ x: o.x, z: o.z, r: 18 })),
  { x: PEN.x, z: PEN.z, r: PEN.r + 6 }, ...HERD_SPOTS.map(h => ({ ...h, r: 14 })),
];
export const SCENERY = { trees: 520, rocks: 170 };
// Ground below this height is under water: shallow ponds, no trees or rocks.
export const WATER_Y = -6.8;

// ---- ruling Dustfork ----
// Levels: what the next level costs from the treasury and how full the stores must be.
export const TOWN_LEVELS = [null, { cost: 1500, supplies: 60, gives: 'Shop prices 10% lower, daily tax doubled' }, { cost: 4000, supplies: 80, gives: 'Watchtowers shoot at raiders, daily tax tripled' },
  { cost: 9000, supplies: 85, gives: 'A town hall: you set the tax law. Daily tax x4' }, { cost: 20000, supplies: 90, gives: 'Stone footings for the bell: it takes twice as long to bring down. Daily tax x5' }];
// The tax law, from town level 4: how much comes in, and what it does to morale each day.
export const TAX_LAWS = { low: { name: 'Low taxes', tax: 0.8, morale: 4 }, fair: { name: 'Fair taxes', tax: 1, morale: 0 }, high: { name: 'High taxes', tax: 1.5, morale: -7 } };
// Every fifth night is a blood moon: predators notice you from further off and everything drops double.
export const BLOOD_MOON = { every: 5, aggro: 1.3, loot: 2 };
export const TOWN_RULE = {
  tax: 100, supplyUse: 8, safetyDrift: 3, start: { treasury: 200, supplies: 50, safety: 50, morale: 60 },
  firstRaid: 480, raidEvery: [900, 1500], warning: 120, bell: 300, bellHurt: 0.45,
  towers: [[22, 22], [-24, 20], [24, -24], [-30, -8]],   // watchtower spots, as offsets from the town centre
  raiders: 3, raidersPerLevel: 2, towerDmg: 4, towerReach: 48,
  win: { treasury: 300, safety: 10, morale: 6, xp: 400 }, lose: { treasury: 0.3, supplies: 20, safety: 10, morale: 15 },
  meat: 1, hide: 2,
};
