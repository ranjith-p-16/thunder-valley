// The frontier: weather, each mount's second move, bait, the hatchery, Silas the trader, roaming giants and favours.

// aggro: how far off predators notice you. pace: riding speed. Chosen by weight; a spell lasts WEATHER_LASTS seconds.
export const WEATHER = {
  clear: { name: 'Clear', weight: 55, aggro: 1, pace: 1 },
  rain:  { name: 'Rain', weight: 20, aggro: 0.8, pace: 0.94, says: 'Rain sweeps up the valley: the going is heavy, and predators keep to cover' },
  fog:   { name: 'Fog', weight: 14, aggro: 0.6, pace: 1, says: 'Fog settles in the hollows: nothing sees far, you included' },
  dust:  { name: 'Dust storm', weight: 11, aggro: 0.7, pace: 0.9, says: 'A dust storm blows in off the mesa: slow riding until it passes' },
};
export const WEATHER_LASTS = [150, 330];

// A mount's second move (right mouse button or Y), learned when it is Grown. Indexed like MOUNTS.
// strike: the nearest animal ahead. cone: everything within radius and arc ahead. guard: the rider takes less damage.
// soothe: calms the herd and mends the rider.
export const MOVE_FROM = 10;
export const MOVES = [
  { name: 'Pounce', note: 'Leaps on one animal up to 14 m ahead and pins it', cd: 8, kind: 'strike', range: 14, dmg: 55, hold: 1.2 },
  { name: 'Bash', note: 'Horns through everything close ahead, staggering it', cd: 9, kind: 'cone', radius: 7, arc: 0.9, dmg: 40, hold: 2 },
  { name: 'Crush', note: 'One bite, the hardest hit there is', cd: 10, kind: 'strike', range: 7, dmg: 140, hold: 0 },
  { name: 'Blind', note: 'Venom in the eyes: animals ahead turn and run', cd: 12, kind: 'cone', radius: 16, arc: 0.8, dmg: 10, scare: 3.5 },
  { name: 'Rend', note: 'A tearing bite on the animal in front', cd: 8, kind: 'strike', range: 6, dmg: 85, hold: 0 },
  { name: 'Brace', note: 'Plates up: you take 60% less damage for 6 s', cd: 16, kind: 'guard', time: 6, hurt: 0.4 },
  { name: 'Soothe', note: 'A low call that settles the herd and mends the rider', cd: 18, kind: 'soothe', radius: 45, heal: 35 },
  { name: 'Tail whip', note: 'Sweeps everything around, front and back', cd: 10, kind: 'cone', radius: 11, arc: 3.2, dmg: 55, hold: 1.5 },
];

// Bait: an animal that takes it stands still, and can be tamed at up to this share of its health instead of a third.
export const BAIT = { reach: 14, hold: 8, health: 0.6 };

// The hatchery at the stables. An egg of a species you lack hatches into a mount; of one you own, into a stronger bloodline
// (each step: +6% strike and move damage, 4% less damage taken). Breeding needs a Grown mount and gives an egg of its kind.
export const HATCH = { price: 150, time: 12 * 60, eggMax: 3, bloodMax: 3, bloodDmg: 0.06, bloodHurt: 0.04, breedPrice: 400, breedMeat: 6, repeatEgg: 0.5, xp: 80, spareXp: 400 };

// Silas pulls up by the general store every third day and stays until the next morning.
export const TRADER = { every: 3, egg: 500, feed: 250, feedXp: 300, feedStock: 2, clawsMul: 2 };

// Every few days an outsized animal is seen somewhere in the valley.
export const GIANT = {
  kinds: ['raptor', 'raptor', 'dilo', 'cinder'], names: ['Old Scar', 'Greyback', 'The Widow', 'Longtooth', 'Ashmaw', 'Split-Ear'],
  hp: 10, dmg: 1.7, xp: 5, money: 250, egg: 0.5, first: 1, every: [2, 4], near: 140, far: 215,
};

// Favours for the townsfolk, taken and handed in at the notice board. Up to FAVOUR_MAX at once.
// need: give (resources), kill (a kind, counted after taking), pen (longhorns), tame (own that mount), hatch (an egg), giant (a giant killed).
export const FAVOUR_MAX = 3;
export const FAVOURS = [
  { id: 'docHides', who: 'Doc Obi', title: 'Hides for the infirmary', text: 'Splints, slings and a new roof for the sick room', need: { type: 'give', res: 'hide', n: 6 }, reward: { money: 120, xp: 150, standing: 3 } },
  { id: 'rosMeat', who: 'Ros', title: 'A feast at the saloon', text: 'Ros wants the whole town at one table for once', need: { type: 'give', res: 'meat', n: 8 }, reward: { money: 150, xp: 150, standing: 4 } },
  { id: 'winClaws', who: 'Winifred', title: 'Claws for the store', text: 'City buyers pay well for a good claw', need: { type: 'give', res: 'claws', n: 5 }, reward: { money: 200, xp: 120, thrown: ['dynamite', 2] } },
  { id: 'tobeRaptors', who: 'Tobe', title: 'Thin the packs', text: 'Too many raptors on the roads for honest folk', need: { type: 'kill', kind: 'raptor', n: 10 }, reward: { money: 180, xp: 250, standing: 3 } },
  { id: 'juneCinder', who: 'June', title: 'Cinderjaws on the mesa', text: 'They have taken to hunting the east trail', need: { type: 'kill', kind: 'cinder', n: 4 }, reward: { money: 260, xp: 300, standing: 2 } },
  { id: 'pikePen', who: 'Mayor Pike', title: 'Stock for the town', text: 'A town that eats is a town that stays', need: { type: 'pen', n: 6 }, reward: { money: 220, xp: 200, standing: 5 } },
  { id: 'maraCrest', who: 'Mara', title: 'A runner for the ranch', text: 'Mara has always wanted to see a Crestrunner under saddle', need: { type: 'tame', i: 6 }, reward: { money: 300, xp: 300, thrown: ['bait', 2] } },
  { id: 'silasEgg', who: 'Silas', title: 'A hatchling for Silas', text: 'Hatch an egg at the stables and let the old trader see it', need: { type: 'hatch', n: 1 }, reward: { money: 400, xp: 250 } },
  { id: 'nettleGiant', who: 'Old Nettle', title: 'The big one', text: 'She has seen what walks the valley. Bring one of the giants down', need: { type: 'giant', n: 1 }, reward: { money: 500, xp: 500, standing: 5 } },
];

// ---- things to find and to work toward ----

// Named places: riding into one for the first time is a discovery (experience, and it counts toward goals).
export const DISCOVER = { xp: 40 };
export const LANDMARKS = [
  { id: 'ranch', name: "Quill's ranch", x: 0, z: 34, r: 30 },
  { id: 'eastgraze', name: 'East grazing', x: 85, z: 55, r: 30 },
  { id: 'northgraze', name: 'North grazing', x: -75, z: 105, r: 30 },
  { id: 'westgraze', name: 'West grazing', x: -105, z: -55, r: 30 },
  { id: 'den', name: 'The raptor den', x: 100, z: 130, r: 32 },
  { id: 'mesa', name: 'Red Mesa', x: 195, z: -8, r: 45 },
  { id: 'mesacamp', name: 'Red Mesa camp', x: 120, z: -90, r: 30 },
  { id: 'ferncamp', name: 'Fernhollow camp', x: -140, z: 60, r: 30 },
  { id: 'highwatch', name: 'Highwatch camp', x: 40, z: 170, r: 30 },
  { id: 'fernwest', name: 'Fernhollow woods', x: -215, z: -70, r: 40 },
  { id: 'crestwood', name: 'Crestrunner glade', x: -175, z: -115, r: 35 },
  { id: 'marsh', name: 'Sinkwater marsh', x: 70, z: -205, r: 40 },
  { id: 'hollow', name: 'Rex Hollow', x: -70, z: -170, r: 45 },
  { id: 'toll', name: 'The toll road', x: 150, z: 20, r: 28 },
  { id: 'nettle', name: "Old Nettle's hollow", x: -228, z: 22, r: 28 },
  { id: 'kettles', name: 'Smugglers\' landing', x: 40, z: -232, r: 30 },
];

// Supply caches lie about the valley: ride over one to open it. They are put back every few days, in the same spots.
export const CACHES = { count: 24, clear: 75, reach: 3.2, refill: 3, money: [20, 60], egg: 0.06 };

// Riding far from town sometimes springs an ambush: a pack breaks cover ahead of you.
export const AMBUSH = { every: [200, 380], first: 150, away: 110, ahead: 42, size: [2, 3], lose: 170 };

// One in every few roaming raptors leads its pack: bigger, tougher, worth more.
export const ALPHA = { every: 4, hp: 2.4, dmg: 1.4, xp: 3, name: 'Pack alpha' };

// Shooting an animal while it is crouched to spring staggers it: it is stopped for a moment and the shot hits harder.
export const STAGGER = { hold: 1.3, dmg: 1.5 };

// The rider's goals: always one to work toward, each paying out as it is reached. In order.
// need: tally (a running count), level, found (places), favours, grown (a mount at level 10), string (dinosaurs riding out).
export const GOALS = [
  { id: 'ride', text: 'Find a named place beyond town', need: { type: 'found', n: 1 }, reward: { money: 20 } },
  { id: 'hunt3', text: 'Kill 3 raptors', need: { type: 'tally', key: 'raptor', n: 3 }, reward: { money: 30, tonic: ['jerky', 2] } },
  { id: 'cache1', text: 'Open a supply cache (look for crates out in the valley)', need: { type: 'tally', key: 'cache', n: 1 }, reward: { thrown: ['bolas', 1] } },
  { id: 'job1', text: 'Finish a job from the notice board', need: { type: 'tally', key: 'job', n: 1 }, reward: { money: 40 } },
  { id: 'stagger3', text: 'Stagger 3 animals: shoot them while they glow, crouched to spring', need: { type: 'tally', key: 'stagger', n: 3 }, reward: { tonic: ['tonic', 1] } },
  { id: 'pen3', text: 'Pen 3 longhorns', need: { type: 'tally', key: 'pen', n: 3 }, reward: { money: 50 } },
  { id: 'tame1', text: 'Tame a dinosaur', need: { type: 'tally', key: 'tame', n: 1 }, reward: { thrown: ['bait', 2] } },
  { id: 'level4', text: 'Reach rider level 4', need: { type: 'level', n: 4 }, reward: { money: 80 } },
  { id: 'alpha1', text: 'Bring down a pack alpha', need: { type: 'tally', key: 'alpha', n: 1 }, reward: { money: 100 } },
  { id: 'found6', text: 'Find 6 named places', need: { type: 'found', n: 6 }, reward: { money: 100 } },
  { id: 'favour1', text: 'Do a favour for someone in town (notice board)', need: { type: 'favours', n: 1 }, reward: { thrown: ['dynamite', 2] } },
  { id: 'cache6', text: 'Open 6 supply caches', need: { type: 'tally', key: 'cache', n: 6 }, reward: { money: 120 } },
  { id: 'string3', text: 'Ride out with 3 dinosaurs in your string', need: { type: 'string', n: 3 }, reward: { money: 150 } },
  { id: 'grown', text: 'Raise a dinosaur to Grown (level 10)', need: { type: 'grown', n: 1 }, reward: { money: 200 } },
  { id: 'giant1', text: 'Kill a giant', need: { type: 'tally', key: 'giant', n: 1 }, reward: { money: 300 } },
  { id: 'foundAll', text: 'Find every named place in the valley', need: { type: 'found', n: 16 }, reward: { money: 400 } },
];
