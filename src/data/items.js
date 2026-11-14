// Things the rider can own: weapons, thrown items, tonics, gear, skills. Plus the town and its job board.

// dmg is per projectile; spread is the cone half-angle in radians; life is seconds of flight (reach = speed x life:
// revolver 70 m, rifle 130 m, shotgun 45 m, bow 80 m).
export const WEAPONS = {
  revolver: { name: 'Revolver', note: 'All-round, fast', dmg: 22, pellets: 1, spread: 0, magazine: 6, reload: 1.4, fireCd: 0.32, speed: 130, life: 70 / 130, price: 0 },
  rifle:    { name: 'Rifle', note: 'Slow, hits hard at long range', dmg: 80, pellets: 1, spread: 0, magazine: 5, reload: 2.2, fireCd: 0.9, speed: 220, life: 130 / 220, price: 500 },
  shotgun:  { name: 'Shotgun', note: 'Eight pellets, short range', dmg: 12, pellets: 8, spread: 0.09, magazine: 2, reload: 1.8, fireCd: 0.5, speed: 110, life: 45 / 110, price: 450 },
  bow:      { name: 'Bow', note: 'Silent: does not alert other animals', dmg: 45, pellets: 1, spread: 0, magazine: 1, reload: 0.7, fireCd: 0.6, speed: 95, life: 80 / 95, price: 350, silent: true },
};
export const WEAPON_ORDER = ['revolver', 'rifle', 'shotgun', 'bow'];
export const GRADES = ['Common', 'Sturdy', 'Fine'];
export const GRADE_POWER = [1, 1.25, 1.5];
// cost to raise an item one grade: dollars and materials (claws for weapons and trinkets, hide for outfits and saddles)
export const UPGRADE = [{ money: 200, mats: 5 }, { money: 600, mats: 12 }];

export const THROWN = {
  dynamite: { name: 'Dynamite', note: 'Explodes after a short fuse', key: '5', price: 40, max: 5, dmg: 150, radius: 6, range: 30, flight: 0.8, fuse: 1.6 },
  bolas:    { name: 'Bolas', note: 'Stops the animal you aim at for 3 s. Needed for taming', key: '6', price: 25, max: 5, hold: 3, range: 40 },
  bait:     { name: 'Bait', note: 'Dropped at your feet: a wild animal within 14 m comes to feed and stands still, and can be tamed at 60% health instead of a third', key: '8', price: 35, max: 3 },
  trap:     { name: 'Trap', note: 'Placed at your feet; bites and holds. Also holds an animal for taming', key: '7', price: 30, max: 3, dmg: 40, hold: 4, radius: 2.5 },
};

export const TONICS = {
  jerky:  { name: 'Jerky', note: 'Restores 40 health over 5 s', price: 8, heal: 40, over: 5 },
  tonic:  { name: 'Healing tonic', note: 'Restores 100 health at once', price: 25, heal: 100 },
  brew:   { name: 'Stamina brew', note: 'Unlimited sprint for 20 s', price: 20, time: 20 },
  steady: { name: 'Steady-hand tonic', note: '+25% weapon damage for 60 s', price: 40, time: 60, dmg: 1.25 },
  salve:  { name: 'Thick-hide salve', note: 'Take 30% less damage for 60 s', price: 40, time: 60, armor: 0.7 },
  herb:   { name: 'Calming herb', note: 'Nearby herd stops panicking', price: 12, radius: 40 },
};
export const TONIC_MAX = 5;

// Each piece changes one stat. `add` values scale with grade; `mul` values scale their distance from 1.
export const GEAR = {
  duster: { slot: 'outfit', name: 'Duster', note: '+30 health', stat: 'maxHp', add: 30, price: 300 },
  vest:   { slot: 'outfit', name: 'Hide vest', note: 'Take 10% less damage', stat: 'armor', mul: 0.9, price: 300 },
  poncho: { slot: 'outfit', name: 'Poncho', note: 'Stamina returns 30% faster', stat: 'staminaRegen', mul: 1.3, price: 300 },
  light:  { slot: 'saddle', name: 'Light saddle', note: 'Mount 8% faster', stat: 'speed', mul: 1.08, price: 350 },
  pack:   { slot: 'saddle', name: 'Pack saddle', note: '+20 bag space', stat: 'bag', add: 20, price: 350 },
  war:    { slot: 'saddle', name: 'War saddle', note: 'Take 12% less damage', stat: 'armor', mul: 0.88, price: 350 },
  charm:  { slot: 'trinket', name: 'Lucky charm', note: '+10% experience', stat: 'xp', mul: 1.1, price: 400 },
  spurs:  { slot: 'trinket', name: 'Silver spurs', note: 'Mount ability returns 15% sooner', stat: 'abilityCd', mul: 0.85, price: 400 },
  horn:   { slot: 'trinket', name: 'Herding horn', note: 'Holler reaches 30% farther', stat: 'hollerR', mul: 1.3, price: 400 },
};
export const SLOTS = ['outfit', 'saddle', 'trinket'];

// Skills are bought top to bottom within a tree, one point each.
export const SKILLS = {
  gunslinger: { name: 'Gunslinger', role: 'Damage', list: [
    { name: 'Quick hands', note: 'Reload 15% faster', stat: 'reload', mul: 0.85 },
    { name: 'Sharp eye', note: '+8% weapon damage', stat: 'dmg', mul: 1.08 },
    { name: 'Long barrel', note: 'Shots fly 25% farther', stat: 'range', mul: 1.25 },
    { name: 'Fast trigger', note: 'Fire 12% faster', stat: 'fireCd', mul: 0.88 },
    { name: 'Deadeye', note: '15% chance of double damage', stat: 'crit', add: 0.15 },
    { name: 'Extra round', note: '+1 round in every magazine', stat: 'magazine', add: 1 },
    { name: 'Scavenger', note: 'A kill returns one round', stat: 'ammoBack', add: 1 },
    { name: 'Powder monkey', note: 'Thrown items 30% stronger', stat: 'thrown', mul: 1.3 },
    { name: 'Piercing shot', note: 'Shots pass through one animal', stat: 'pierce', add: 1 },
    { name: 'Dead shot', note: '+15% weapon damage', stat: 'dmg', mul: 1.15 },
  ] },
  wrangler: { name: 'Wrangler', role: 'Herding and riding', list: [
    { name: 'Long rope', note: 'Lasso reaches 30% farther', stat: 'rope', mul: 1.3 },
    { name: 'Big voice', note: 'Holler reaches 25% farther', stat: 'hollerR', mul: 1.25 },
    { name: 'Quick holler', note: 'Holler ready 30% sooner', stat: 'hollerCd', mul: 0.7 },
    { name: 'Good price', note: '+$10 for every penned longhorn', stat: 'penPay', add: 10 },
    { name: 'Lead mare', note: 'Rallied herds follow 40% longer', stat: 'follow', mul: 1.4 },
    { name: 'Easy rider', note: 'Sprinting costs 25% less stamina', stat: 'sprintCost', mul: 0.75 },
    { name: 'Fleet', note: 'Mount 6% faster', stat: 'speed', mul: 1.06 },
    { name: 'Second wind', note: 'Mount ability returns 15% sooner', stat: 'abilityCd', mul: 0.85 },
    { name: 'Skinner', note: 'Animals drop more', stat: 'loot', add: 0.25 },
    { name: 'Trail boss', note: '+$15 for every penned longhorn', stat: 'penPay', add: 15 },
  ] },
  marshal: { name: 'Marshal', role: 'Survival and trade', list: [
    { name: 'Tough', note: '+20 health', stat: 'maxHp', add: 20 },
    { name: 'Thick skin', note: 'Take 8% less damage', stat: 'armor', mul: 0.92 },
    { name: 'Field medic', note: 'Food and tonics heal 30% more', stat: 'heal', mul: 1.3 },
    { name: 'Haggler', note: 'Shop prices 10% lower', stat: 'buy', mul: 0.9 },
    { name: 'Trader', note: 'Sell for 15% more', stat: 'sell', mul: 1.15 },
    { name: 'Quick study', note: '+10% experience', stat: 'xp', mul: 1.1 },
    { name: 'Rested', note: 'Health returns twice as fast', stat: 'regen', mul: 2 },
    { name: 'Good name', note: 'Jobs pay 20% more', stat: 'jobPay', mul: 1.2 },
    { name: 'Deep pockets', note: 'Lose no money when thrown', stat: 'deathLoss', mul: 0 },
    { name: 'Iron constitution', note: '+40 health', stat: 'maxHp', add: 40 },
  ] },
};
export const BASE_STATS = {
  reload: 1, dmg: 1, range: 1, fireCd: 1, crit: 0, magazine: 0, ammoBack: 0, thrown: 1, pierce: 0,
  rope: 1, hollerR: 1, hollerCd: 1, penPay: 0, follow: 1, sprintCost: 1, speed: 1, abilityCd: 1, loot: 0,
  maxHp: 0, armor: 1, heal: 1, buy: 1, sell: 1, xp: 1, regen: 1, jobPay: 1, deathLoss: 0.1, bag: 20, staminaRegen: 1,
};

export const RESOURCES = {
  hide: { name: 'Hide', sell: 10 },
  meat: { name: 'Meat', sell: 4 },
  claws: { name: 'Claws', sell: 20 },
};
// chance of each resource from a kill
export const LOOT = {
  raptor: { hide: 0.7, meat: 0.8, claws: 0.3, money: [2, 8] },
  rex: { hide: 3, meat: 3, claws: 3, money: [300, 300] },
  compy: { hide: 0, meat: 0, claws: 0, money: [0, 0] },
  dilo: { hide: 1, meat: 1, claws: 0.6, money: [5, 15] },
  rustler: { hide: 0, meat: 0, claws: 0, money: [15, 40] },
  pell: { hide: 0, meat: 0, claws: 0, money: [120, 160] },
  hester: { hide: 2, meat: 0, claws: 0, money: [180, 240] },
  kettle: { hide: 0, meat: 0, claws: 0, money: [100, 140] },
  blackthorn: { hide: 3, meat: 0, claws: 3, money: [400, 500] },
  crest: { hide: 1, meat: 1, claws: 0, money: [3, 9] },
  hauler: { hide: 3, meat: 4, claws: 0, money: [8, 20] },
  cinder: { hide: 1, meat: 1, claws: 0.6, money: [6, 16] },
  plate: { hide: 2, meat: 2, claws: 0, money: [4, 12] },
};
export const PEN_PAY = 30, PEN_HOLDS = 8;

// The town sits just south of the ranch gate. Animals will not enter it.
export const TOWN = { x: 0, z: -10, r: 36 };
// w and d are the footprint along x and z; door is where the rider stands to use the place.
export const PLACES = [
  { id: 'saloon', name: 'Saloon', x: -24, z: -6, w: 13, d: 9, h: 6, color: 0x9a5b3c, door: { x: -16, z: -6 } },
  { id: 'store', name: 'General store', x: 24, z: -6, w: 11, d: 8, h: 5, color: 0x6f8a5a, door: { x: 17, z: -6 } },
  { id: 'stables', name: 'Stables', x: -20, z: -30, w: 15, d: 9, h: 5, color: 0x8a744c, door: { x: -20, z: -24 } },
  { id: 'board', name: 'Notice board', x: 12, z: -28, w: 3, d: 0.6, h: 3, color: 0x7a5a3a, door: { x: 12, z: -25 } },
];
export const PLACE_REACH = 7;
export const REST_PRICE = 10;
export const MOUNT_PRICE = [0, 1800, null, null, null, null, null, null];   // by mount index; null cannot be bought
export const FOOT = { speed: 5, sprint: 8.5, radius: 0.6, cam: { h: 3.4, back: 9 }, muzzle: 2, reach: 8 };

export const JOBS = {
  bounty: { title: 'Bounty', pay: [80, 160], xp: 120, names: ['Old Ripper', 'Scarback', 'Three-Toes', 'The Widow', 'Red Jack', 'Longtooth'], hp: 3, xpMul: 2 },
  herd:   { title: 'Herd order', pay: [60, 120], xp: 100, count: [3, 5], time: 300 },
  hunt:   { title: 'Hunt contract', pay: [50, 110], xp: 80, count: [2, 4] },
  supply: { title: 'Supply run', pay: [60, 130], xp: 90, time: 150 },
};
export const BOARD_SIZE = 3;
