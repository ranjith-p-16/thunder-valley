// Act 1: the people of Dustfork, what they say, and the first six quests.
// Quests are data: each step says what the player must do and what happens when it is done.
//
// Step types
//   talk    { npc, dialogue }            press F beside the character
//   goto    { x, z, r, dialogue? }       ride there; an optional conversation starts on arrival
//   clear   { tag }                      every animal spawned with that tag is dead or gone
//   pen     { count, herd? }             pen that many longhorns (optionally only from one herd)
//   collect { tag, count }               ride over that many pickups
//   holler  { x, z, r }                  holler (E) within r of the spot
//   standing { min }                    wait until Standing with the town reaches min
//   slay    {}                          the Alpha Rex is dead
//   drive   { x, z, r, below }          holler within r of the spot while the Alpha Rex is under `below` of its health
//   hold    { x, z, r, time, wave }     stay alive inside r for `time` seconds while waves of { kind, n, every } ride in
// Any step may carry  if / unless: 'flag'  (skipped when the condition fails),
//   enter: [actions]  run when the step begins (and again after loading a save: spawns only),
//   then:  [actions]  run once when it is completed.
//
// Actions
//   { spawn: { kind, n, x, z, spread, tag, hpMul?, name? } }   { remove: tag }   { relocate: { tag, x, z } }
//   { give: { money?, xp?, standing?, res?, tonic?, mount? } } { set: { flag: value } }
//   { mate: id }   { npc: { id, hidden?, x?, z? } }   { pickups: { tag, points } }
//   { town: { owned } } hands the town over   { supplies: n } adds to the town's stores
//   { holdHerd: { herd, x, z } }   { freeHerd: herd }   { say: { who, text } }   { toast: text }

export const NPCS = [
  { id: 'ros', name: 'Ros Achterberg', role: 'Saloon owner', x: -15, z: -2.5, yaw: 1.2, color: 0x9a3b4a, idle: 'ros_idle' },
  { id: 'winifred', name: 'Winifred Tan', role: 'Storekeeper', x: 15.5, z: -2.5, yaw: -1.2, color: 0x3f7a55, idle: 'winifred_idle' },
  { id: 'doc', name: 'Doc Obi', role: 'Doctor', x: -10, z: -22, yaw: 0.6, color: 0xd8d2c2, idle: 'doc_idle' },
  { id: 'mara', name: 'Mara Quill', role: 'Rancher', x: 6, z: 15, yaw: 3.1, color: 0xc9953a, idle: 'mara_idle' },
  { id: 'collector', name: 'Gang collector', role: 'Blackthorn gang', x: 3, z: -13, yaw: 0, color: 0x2b2b30, hidden: true, idle: 'collector_idle' },
  { id: 'nettle', name: 'Old Nettle', role: 'Hermit', x: -232, z: 22, yaw: 1.5, color: 0x6b8a4a, hidden: true, idle: 'nettle_idle' },
  { id: 'tobe', name: 'Tobiah Reyes', role: 'Former sheriff', x: -150, z: -95, yaw: 0.9, color: 0x55606e, hidden: true, idle: 'tobe_idle' },
  { id: 'pell', name: '"Deacon" Amos Pell', role: 'Blackthorn lieutenant', x: -168, z: -62, yaw: 1.2, color: 0x3d3a36, hidden: true },
  { id: 'pike', name: 'Mayor Ansel Pike', role: 'Mayor', x: -6, z: -14, yaw: 0.4, color: 0x6a4a7a, hidden: true },
  { id: 'blackthorn', name: 'Cornelius Blackthorn', role: 'Gang leader', x: 124, z: -84, yaw: 3.6, color: 0x1a1a1f, hidden: true },
  { id: 'june', name: 'Juniper Vasko', role: 'Scout', x: 78, z: 218, yaw: 3.4, color: 0x2f8a8a, hidden: true, idle: 'june_idle' },
];

// The posse mate who joins in act 1. dmg per shot, fireCd in seconds, range in metres.
export const MATES = {
  mara: { name: 'Mara', mount: 1, speed: 15, dmg: 14, fireCd: 0.7, range: 26 },
  tobe: { name: 'Tobe', mount: 5, speed: 13, dmg: 20, fireCd: 1.0, range: 22 },
  june: { name: 'June', mount: 3, speed: 17, dmg: 10, fireCd: 0.5, range: 30 },
};
export const ORDERS = [
  { id: 'follow', label: 'Follow me' },
  { id: 'hold', label: 'Hold here' },
  { id: 'attack', label: 'Attack what I am fighting' },
  { id: 'herd', label: 'Help the herd' },
  { id: 'calm', label: 'Hold your fire' },
];

export const PLACES_OF_NOTE = {
  den: { x: 100, z: 130 },
  mesaCamp: { x: 120, z: -90 },
  nettle: { x: -228, z: 22 },
  rustlers: { x: 185, z: 105 },
  wagons: { x: 165, z: -55 },
  toll: { x: 150, z: 20 },
  square: { x: 0, z: -10 },
  kettles: { x: 40, z: -232 },
  hollow: { x: -70, z: -170 },
  firepits: [[-36, -150], [-100, -140], [-78, -208]],
};
const { den, mesaCamp, nettle, rustlers, wagons, toll, square, kettles, hollow, firepits } = PLACES_OF_NOTE;

// A conversation is a set of nodes. A node with no choices shows a single "Continue".
// A choice may carry  do: [actions],  next: node id (omit to end),  need: { money } to be available.
export const DIALOGUES = {
  // ----- idle chatter -----
  ros_idle: { who: 'Ros Achterberg', text: 'Glass is clean, the beds are $10, and the gossip is free. The notice board has paying work.' },
  winifred_idle: { who: 'Winifred Tan', text: 'Hides, claws, meat: I buy the lot. Use the door, not the window, please.' },
  doc_idle: { who: 'Doc Obi', text: 'If it bleeds I can stitch it. If it has scales, I can usually stitch that too.' },
  mara_idle: { who: 'Mara Quill', text: 'Longhorns do not pen themselves. Ride behind them, not at them.' },
  collector_idle: { who: 'Gang collector', text: 'Mister Blackthorn sends his regards. Mind how you ride.' },
  nettle_idle: { who: 'Old Nettle', text: 'The big ones are restless this year. Something is pushing them. Mark my words.' },

  // ----- quest 1 -----
  q1_ros: { who: 'Ros Achterberg', text: 'New in Dustfork? You picked a poor year. The Blackthorn gang takes a cut of everything, and what they leave, the compies steal.', next: 'q1_ros2' },
  q1_ros2: { who: 'Ros Achterberg', text: 'You want folk here to know your name, start small. Winifred\'s store is crawling with compies. No shooting in town: ride at them and they scatter.',
    choices: [{ text: 'I\'ll clear them out.' }, { text: 'What do I get out of it?', next: 'q1_ros3' }] },
  q1_ros3: { who: 'Ros Achterberg', text: 'A few dollars, and a town that nods when you ride past. Out here the second one is worth more.' },
  q1_winifred: { who: 'Winifred Tan', text: 'Gone? All of them? They ate half my jerky. Here, take what they left, and this for your trouble.',
    choices: [{ text: 'Glad to help.', do: [{ give: { money: 40, standing: 5, tonic: { jerky: 2 } } }] }] },

  // ----- quest 2 -----
  q2_mara: { who: 'Mara Quill', text: 'So you\'re the one who chased lizards out of a shop. I have a real job. My longhorns are scattered over the pastures and the raptors know it.', next: 'q2_mara2' },
  q2_mara2: { who: 'Mara Quill', text: 'Bring two home through this gate. Ride behind a herd and it moves away from you. E to holler and start them running. Q throws a rope on one and it follows you.',
    choices: [{ text: 'Two longhorns. Understood.' }, { text: 'Why not do it yourself?', next: 'q2_mara3' }] },
  q2_mara3: { who: 'Mara Quill', text: 'Because I am one rider and the gang took my hands. Now I have you. Go on.' },
  q2_done: { who: 'Mara Quill', text: 'Huh. They walked in, and nobody got trampled. You\'ll do. I ride with you from here, if you\'ll have me. Press G to tell me what you need.',
    choices: [{ text: 'Welcome to the posse.', do: [{ give: { money: 60, standing: 5 } }, { mate: 'mara' }, { npc: { id: 'mara', hidden: true } }] }] },

  // ----- quest 3 -----
  q3_ros: { who: 'Ros Achterberg', text: 'Trouble. The gang\'s collector is by the banner and he is asking for you by name. Whatever you say to him, the whole town will hear of it by supper.' },
  q3_collector: { who: 'Gang collector', text: 'You\'re the new rider. Everyone in Dustfork pays Mister Blackthorn for the peace and quiet. Fifty dollars. Call it a welcome.',
    choices: [
      { text: 'Pay the $50.', need: { money: 50 }, do: [{ give: { money: -50 } }, { set: { collector: 'paid' } }], next: 'q3_paid' },
      { text: 'Not a cent. Tell Blackthorn that.', do: [{ set: { collector: 'refused' } }, { give: { standing: 10 } }], next: 'q3_refused' },
      { text: 'The money is coming. Give me a week.', do: [{ set: { collector: 'stalled' } }, { give: { standing: 5 } }], next: 'q3_stalled' },
    ] },
  q3_paid: { who: 'Gang collector', text: 'Smart. Smart riders live a long time.', choices: [{ text: '...', do: [{ npc: { id: 'collector', hidden: true } }] }] },
  q3_refused: { who: 'Gang collector', text: 'I\'ll tell him. He remembers faces. So do the boys out on the range.', choices: [{ text: 'Get out of my town.', do: [{ npc: { id: 'collector', hidden: true } }] }] },
  q3_stalled: { who: 'Gang collector', text: 'A week. Mister Blackthorn counts the days himself.', choices: [{ text: 'So do I.', do: [{ npc: { id: 'collector', hidden: true } }] }] },

  // ----- quest 4 -----
  q4_mara: { who: 'Mara Quill', text: 'Something took a calf by the north fence last night. Tracks run north-east to a den. A pack that close will not stop at one calf.',
    choices: [{ text: 'Let\'s find it.' }] },
  q4_den: { who: 'Mara Quill', text: 'There. Five of them. We can kill the pack here, or spook it south. Raptors that run from a holler keep running, and south of here is the gang\'s camp on Red Mesa.',
    choices: [
      { text: 'Destroy the den.', do: [{ set: { den: 'destroyed' } }] },
      { text: 'Drive them onto the gang.', do: [{ set: { den: 'driven' } }] },
    ] },
  q4_done_destroyed: { who: 'Mara Quill', text: 'Clean work. The pastures will be quieter for it.', choices: [{ text: 'On to the next.', do: [{ give: { money: 80, standing: 10 } }] }] },
  q4_done_driven: { who: 'Mara Quill', text: 'Ha! Let Blackthorn\'s boys feed them for a while. Mind, a fed pack grows, and that camp just got harder to take.', choices: [{ text: 'Worth it.', do: [{ give: { money: 80, standing: 10 } }] }] },

  // ----- quest 5 -----
  q5_doc: { who: 'Doc Obi', text: 'I am out of feverleaf, and it only grows in Fernhollow woods, west of here. Three plants would do. Watch for the frilled ones. They spit, and it blinds.',
    choices: [{ text: 'Three plants. I\'ll be back.' }] },
  q5_nettle: { who: 'Old Nettle', text: 'You pick my feverleaf and then come to my door? Bold. Sit. Nobody from town has walked out here in six years.', next: 'q5_nettle2' },
  q5_nettle2: { who: 'Old Nettle', text: 'Tell your doctor the plants are his. But I like my quiet. The fewer who know where I live, the longer I will live.',
    choices: [{ text: 'I\'ll remember that.' }] },
  q5_done: { who: 'Doc Obi', text: 'Feverleaf! And this fresh. Somebody is tending that patch. Did you see who? I would dearly like to trade with them.',
    choices: [
      { text: 'A hermit called Nettle. I\'ll mark your map.', do: [{ set: { nettle: 'revealed' } }, { give: { money: 120, standing: 10 } }] },
      { text: 'Nobody. It grows wild.', do: [{ set: { nettle: 'secret' } }, { give: { money: 60, standing: 5 } }] },
    ] },

  // ----- quest 6 -----
  q6_mara: { who: 'Mara Quill', text: 'My breeding herd. The one the gang took in spring. A drover saw it penned at a rustlers\' camp past the mesa road. I am going. Are you?',
    choices: [{ text: 'We\'re going.' }] },
  q6_camp: { who: 'Mara Quill', text: 'That\'s them, and that\'s my herd. We shoot it out, or we holler and let the herd run straight through their camp. Longhorns in a panic do not go around things.',
    choices: [
      { text: 'Fight the rustlers.', do: [{ set: { rustlers: 'fought' } }] },
      { text: 'Stampede the herd through the camp.', do: [{ set: { rustlers: 'stampeded' } }] },
    ] },
  q6_done: { who: 'Mara Quill', text: 'They\'re home. Six years of breeding in that herd. Take the big one, the Bulwark. He is steady, he is stubborn, and he likes you better than he likes me.',
    choices: [{ text: 'I\'ll look after him.', do: [{ give: { money: 150, standing: 15, mount: 1 } }] }] },
  // ===== act 2: taking the town =====
  tobe_idle: { who: 'Tobiah Reyes', text: 'I kept the peace in Dustfork for eleven years. Then I handed Blackthorn the keys. Do not ask me which I think about more.' },
  june_idle: { who: 'Juniper Vasko', text: 'From up here you can see every herd in the valley, and every fool chasing one.' },

  // ----- quest 7 -----
  q7_ros: { who: 'Ros Achterberg', text: 'You want to hurt Blackthorn, hurt his stomach. His wagons come up the south side of Red Mesa every week: powder, flour, wages. No wagons, no gang.',
    choices: [{ text: 'Where exactly?' , next: 'q7_ros2' }] },
  q7_ros2: { who: 'Ros Achterberg', text: 'South-east, below the mesa. Four or five guns riding with it. Take Mara. And decide before you get there what you mean to do with a wagon full of somebody else\'s supplies.' },
  q7_wagons: { who: 'Mara Quill', text: 'The guards are down and the wagons are ours. Burn them, and the gang goes hungry and knows we mean it. Or drive them home, and Dustfork eats well for a month. They\'ll call that stealing, mind.',
    choices: [
      { text: 'Burn the lot.', do: [{ set: { wagons: 'burned' } }, { give: { standing: 10, xp: 200 } }] },
      { text: 'Take them to town.', do: [{ set: { wagons: 'taken' } }, { give: { standing: 5, money: 150, xp: 200 } }, { supplies: 30 }] },
    ] },

  // ----- quest 8 -----
  q8_ros: { who: 'Ros Achterberg', text: 'If you mean to take this town you need the man who lost it. Tobe Reyes was sheriff here. He lives out past the south-west pastures now, with a Platewalker and a bottle.',
    choices: [{ text: 'I\'ll find him.' }] },
  q8_tobe: { who: 'Tobiah Reyes', text: 'I know why you rode out here. The answer was no when Ros asked and it is no now. I gave that town away to keep it from burning. Give me one reason to ride back.',
    choices: [
      { text: 'Because it is still your duty.', do: [{ set: { tobe: 'duty' } }], next: 'q8_duty' },
      { text: 'Because you have not slept since.', do: [{ set: { tobe: 'guilt' } }], next: 'q8_guilt' },
      { text: 'Because Blackthorn owes you.', do: [{ set: { tobe: 'revenge' } }], next: 'q8_revenge' },
    ] },
  q8_duty: { who: 'Tobiah Reyes', text: 'Duty. Hm. I still have the badge, you know. Could not make myself throw it down the well. All right. One more time.',
    choices: [{ text: 'Saddle up, Sheriff.', do: [{ mate: 'tobe' }, { npc: { id: 'tobe', hidden: true } }, { give: { standing: 5, xp: 150 } }] }] },
  q8_guilt: { who: 'Tobiah Reyes', text: 'No. I have not. You see a great deal for someone who just rode in. All right. Maybe a man sleeps better after.',
    choices: [{ text: 'Saddle up, Tobe.', do: [{ mate: 'tobe' }, { npc: { id: 'tobe', hidden: true } }, { give: { standing: 5, xp: 150 } }] }] },
  q8_revenge: { who: 'Tobiah Reyes', text: 'He does. He owes me eleven years. That is a poor reason to do a right thing, but I find it is the one that gets my boots on.',
    choices: [{ text: 'Then let\'s collect.', do: [{ mate: 'tobe' }, { npc: { id: 'tobe', hidden: true } }, { give: { standing: 5, xp: 150 } }] }] },

  // ----- quest 9 -----
  q9_tobe: { who: 'Tobe', text: 'Blackthorn has three lieutenants. Amos Pell holds the woods road for him. They call him Deacon. He preaches that the animals should be left wild, and takes the gang\'s money to do it. He can be reasoned with. Or shot.',
    choices: [{ text: 'Let\'s go and see which.' }] },
  q9_pell: { who: '"Deacon" Amos Pell', text: 'Stop there, rider. These woods are not for saddles and fences. Blackthorn pays me to keep your kind out, and for once his money and my conscience agree.',
    choices: [
      { text: 'Blackthorn is driving the animals mad, not saving them. Ride with the truth or get out of its way.', do: [{ set: { pell: 'spared' } }, { give: { standing: 10, xp: 300 } }], next: 'q9_spared' },
      { text: 'I did not come to talk.', do: [{ set: { pell: 'fought' } }, { npc: { id: 'pell', hidden: true } }] },
    ] },
  q9_spared: { who: '"Deacon" Amos Pell', text: 'I have seen burns on the big ones. I told myself it was lightning. If you are lying to me I will know by autumn. I am done with his money.',
    choices: [{ text: 'Go well, Deacon.', do: [{ npc: { id: 'pell', hidden: true } }] }] },

  // ----- quest 10 -----
  q10_mara: { who: 'Mara Quill', text: 'We are blind out here. The old watch post on Highwatch ridge sees the whole valley, and there is a girl up there who never comes down. Juniper Vasko. Light the signal fire and she will know we are friends.',
    choices: [{ text: 'To the ridge, then.' }] },
  q10_june: { who: 'Juniper Vasko', text: 'You lit the fire! Nobody has lit it since Tobe left. I have watched you for weeks, you know. You ride like you mean it. Does the posse have room for somebody who talks too much?',
    choices: [{ text: 'It does now.', do: [{ mate: 'june' }, { npc: { id: 'june', hidden: true } }, { give: { standing: 5, xp: 200 } }] }] },

  // ----- quest 11 -----
  q11_june: { who: 'June', text: 'Bad news from up high. Hester Voss has closed the mesa road. Big woman, bigger triceratops, and nothing gets to Dustfork from the east unless it pays her. Blackthorn calls it a toll.',
    choices: [{ text: 'Then the toll house closes today.' }] },
  q11_done: { who: 'Tobe', text: 'Hester Voss, down in the dust. I rode with her once. She would have taken the gang off Blackthorn by winter. Now he has nobody between him and you. And he knows it.',
    choices: [{ text: 'Good.', do: [{ give: { standing: 10, money: 200 } }] }] },

  // ----- quest 12 -----
  q12_ros: { who: 'Ros Achterberg', text: 'Listen. Hear that? Nothing. Nobody is paying the gang tonight. The whole town is behind you. Blackthorn\'s riders are coming to take it back, all of them. Stand in the square and do not leave it.',
    choices: [{ text: 'Ring the bell.' }] },
  q12_done: { who: 'Mayor Ansel Pike', text: 'Remarkable. Truly. I always said this town would rise again. I have served Dustfork through difficult years, friend. I would be honoured to go on serving. Under you, of course.',
    choices: [
      { text: 'You stay, Pike. But you answer to the town now.', do: [{ set: { mayor: 'kept' } }, { give: { standing: 5 } }] },
      { text: 'You were Blackthorn\'s man. Ros is mayor.', do: [{ set: { mayor: 'replaced' } }, { give: { standing: 10 } }] },
      { text: 'Dustfork does not need a mayor yet.', do: [{ set: { mayor: 'empty' } }] },
    ] },
  // ===== act 3: the thunder =====
  // ----- quest 13 -----
  q13_ros: { who: 'Ros Achterberg', text: 'You hear them? Every raptor from here to the ridge, and they are not hunting. They are running from something. They will be over the fence by dark. Stand in the square. Again.',
    choices: [{ text: 'Get everyone inside.' }] },
  q13_doc: { who: 'Doc Obi', text: 'Come and look at this one. Here, along the flank. That is not a bite and it is not a rope. That is a burn. Somebody is driving these animals with fire.',
    choices: [{ text: 'Who would do that?', next: 'q13_doc2' }] },
  q13_doc2: { who: 'Doc Obi', text: 'Who gains when Dustfork is overrun? The smoke I have seen these last weeks rises from the marsh, to the south. I would start there.',
    choices: [{ text: 'Then I ride south.', do: [{ give: { standing: 5, xp: 300 } }] }] },

  // ----- quest 14 -----
  q14_june: { who: 'June', text: 'Smoke in Sinkwater marsh, where nobody lives. I flew my eyes over it. It is a camp: cages, crates, and the Kettle twins. They are Blackthorn\'s last lieutenants and they sell eggs out of the valley.',
    choices: [{ text: 'Not after today.' }] },
  q14_camp: { who: 'Mara Quill', text: 'The twins are finished. Look at this. Hatchlings in cages, and crates of eggs packed in straw for the railroad. We can open the cages and smash the crates. Or the eggs would fetch four hundred dollars, and the town could use it.',
    choices: [
      { text: 'Open the cages. All of it goes back to the marsh.', do: [{ set: { eggs: 'freed' } }, { give: { standing: 10, xp: 400 } }] },
      { text: 'Free the hatchlings. Sell the eggs.', do: [{ set: { eggs: 'sold' } }, { give: { money: 400, xp: 400, standing: -5 } }] },
    ] },

  // ----- quest 15 -----
  q15_tobe: { who: 'Tobe', text: 'Cages and fire. Blackthorn wants this valley empty: of animals, then of us. But fire does not drive a raptor pack mad for weeks. Something bigger is being moved. There is one person who watches the big ones. The hermit in Fernhollow.',
    choices: [{ text: 'Old Nettle.' }] },
  q15_secret: { who: 'Old Nettle', text: 'You kept my door to yourself. So I will tell you what I saw, and gladly. Blackthorn\'s men ring Rex Hollow with fire pits every dusk. The old king cannot rest, so he walks, and everything that fears him runs before him. Toward your town.',
    choices: [{ text: 'Put out the fires, and the valley settles.', do: [{ give: { standing: 5, xp: 300 } }] }] },
  q15_revealed: { who: 'Old Nettle', text: 'You. Since you told that doctor where I live I have had visitors every week, wanting poultices. I ought to send you off. But what is coming is worse than company. I will tell you. And you will owe me.',
    choices: [
      { text: 'I am sorry, Nettle. I owe you.', do: [{ give: { standing: -5 } }], next: 'q15_told' },
      { text: 'Here is $200 for a stronger door.', need: { money: 200 }, do: [{ give: { money: -200 } }], next: 'q15_told' },
    ] },
  q15_told: { who: 'Old Nettle', text: 'Blackthorn\'s men ring Rex Hollow with fire pits every dusk. The old king cannot rest, so he walks, and everything that fears him runs before him. Toward your town.',
    choices: [{ text: 'Put out the fires, and the valley settles.', do: [{ give: { xp: 300 } }] }] },

  // ----- quest 16 -----
  q16_june: { who: 'June', text: 'Three fire pits round the hollow, and a watch on each. I can lead us in along the dry creek while the guards are at supper: we would only meet two. Or we ride straight at them in daylight and take all six.',
    choices: [
      { text: 'The dry creek. Quietly.', do: [{ set: { fires: 'stealth' } }] },
      { text: 'Straight at them.', do: [{ set: { fires: 'assault' } }, { give: { standing: 5 } }] },
    ] },

  // ----- quest 17 -----
  q17_tobe: { who: 'Tobe', text: 'The fires are out, but the Alpha will not settle while it remembers them. It has to be dealt with. I will not tell you how. I have made enough choices for this valley.',
    choices: [{ text: 'To the hollow.' }] },
  q17_hollow: { who: 'Mara Quill', text: 'There he is. Biggest thing I ever saw. You can kill him, and the valley will be safer and poorer. Or wear him down, holler him back into the hollow, and we bring the pass down behind him. He lives. So does everything that needs him.',
    choices: [
      { text: 'Kill the Alpha Rex.', do: [{ set: { rex: 'killed' } }] },
      { text: 'Drive him back and seal the pass.', do: [{ set: { rex: 'sealed' } }] },
    ] },
  q17_killed: { who: 'Mara Quill', text: 'It is done. No more thunder in the night. I found this in the nest. Warm still. Take it. Raise it better than the valley raised him.',
    choices: [{ text: 'I will.', do: [{ give: { money: 500, xp: 1500, mount: 2 } }] }] },
  q17_sealed: { who: 'Mara Quill', text: 'Listen to that. He is roaring at a wall of rock, and he will forget us by spring. There was an egg in the old nest outside the pass. Abandoned. It is yours. He will never know.',
    choices: [{ text: 'A fair trade.', do: [{ give: { standing: 15, xp: 1500, mount: 2 } }] }] },

  // ----- quest 18 -----
  q18_ros: { who: 'Ros Achterberg', text: 'He has nothing left. No wagons, no lieutenants, no fire. Cornelius Blackthorn is sitting in his camp on Red Mesa with the last of his riders, waiting for you. The whole town knows it. Go and finish it.',
    choices: [{ text: 'It ends today.' }] },
  q18_blackthorn: { who: 'Cornelius Blackthorn', text: 'Well ridden. I mean that. I would have sold this valley to the railroad for more money than you will see in ten lifetimes, and all it needed was to be empty. And here you are, filling it. So. What becomes of me?',
    choices: [
      { text: 'A cell in Dustfork, and a trial.', do: [{ set: { blackthorn: 'jailed' } }, { give: { standing: 10, xp: 2000 } }], next: 'q18_jailed' },
      { text: 'Ride out of the valley and do not come back.', do: [{ set: { blackthorn: 'exiled' } }, { give: { money: 300, xp: 2000 } }], next: 'q18_exiled' },
    ] },
  q18_jailed: { who: 'Cornelius Blackthorn', text: 'A trial. In the town I owned. You people and your decencies. Lead on, then.',
    choices: [{ text: 'Walk.', do: [{ npc: { id: 'blackthorn', hidden: true } }] }] },
  q18_exiled: { who: 'Cornelius Blackthorn', text: 'Generous. Foolish, but generous. There are other valleys, rider, and men in them who will remember the name Dustfork. Good day to you.',
    choices: [{ text: 'Go.', do: [{ npc: { id: 'blackthorn', hidden: true } }] }] },
};

export const QUESTS = [
  { id: 'q1', title: 'Dust on your boots', steps: [
    { type: 'talk', npc: 'ros', dialogue: 'q1_ros', text: 'Talk to Ros at the saloon' },
    { type: 'clear', tag: 'q1', text: 'Ride at the compies to chase them out of town',
      enter: [{ spawn: { kind: 'compy', n: 6, x: 18, z: -1, spread: 6, tag: 'q1' } }] },
    { type: 'talk', npc: 'winifred', dialogue: 'q1_winifred', text: 'Tell Winifred the store is clear' },
  ] },
  { id: 'q2', title: 'A day\'s work', steps: [
    { type: 'talk', npc: 'mara', dialogue: 'q2_mara', text: 'Talk to Mara at the ranch gate' },
    { type: 'pen', count: 2, text: 'Drive longhorns through the ranch gate' },
    { type: 'talk', npc: 'mara', dialogue: 'q2_done', text: 'Return to Mara' },
  ] },
  { id: 'q3', title: 'The collector', steps: [
    { type: 'talk', npc: 'ros', dialogue: 'q3_ros', text: 'Ros wants a word at the saloon', then: [{ npc: { id: 'collector', hidden: false } }] },
    { type: 'talk', npc: 'collector', dialogue: 'q3_collector', text: 'Face the gang\'s collector by the town banner',
      enter: [{ npc: { id: 'collector', hidden: false } }] },
  ] },
  { id: 'q4', title: 'Raptors at the fence', steps: [
    { type: 'talk', npc: 'mara', dialogue: 'q4_mara', text: 'Talk to Mara' },
    { type: 'goto', ...den, r: 62, dialogue: 'q4_den', text: 'Follow the tracks north-east to the den',
      enter: [{ spawn: { kind: 'raptor', n: 5, ...den, spread: 8, tag: 'den' } }] },
    { type: 'clear', tag: 'den', if: 'den=destroyed', text: 'Kill the pack at the den',
      enter: [{ spawn: { kind: 'raptor', n: 5, ...den, spread: 8, tag: 'den' } }] },
    { type: 'holler', ...den, r: 34, if: 'den=driven', text: 'Holler (E) close to the den to spook the pack south',
      enter: [{ spawn: { kind: 'raptor', n: 5, ...den, spread: 8, tag: 'den' } }],
      then: [{ relocate: { tag: 'den', x: mesaCamp.x + 14, z: mesaCamp.z + 6 } }, { toast: 'The pack bolts south toward Red Mesa' }] },
    { type: 'talk', npc: 'mara', dialogue: 'q4_done_destroyed', if: 'den=destroyed', text: 'Talk to Mara' },
    { type: 'talk', npc: 'mara', dialogue: 'q4_done_driven', if: 'den=driven', text: 'Talk to Mara' },
  ] },
  { id: 'q5', title: 'Doc\'s errand', steps: [
    { type: 'talk', npc: 'doc', dialogue: 'q5_doc', text: 'Doc Obi is asking for you, by the stables' },
    { type: 'collect', tag: 'herb', count: 3, x: -203, z: 10, text: 'Gather feverleaf in Fernhollow woods, to the west',
      enter: [{ pickups: { tag: 'herb', points: [[-190, -30], [-215, 8], [-200, 45]] } },
        { spawn: { kind: 'dilo', n: 1, x: -196, z: -26, spread: 3, tag: 'q5a' } }, { spawn: { kind: 'dilo', n: 1, x: -210, z: 14, spread: 3, tag: 'q5b' } },
        { spawn: { kind: 'dilo', n: 1, x: -194, z: 50, spread: 3, tag: 'q5c' } }, { npc: { id: 'nettle', hidden: false } }] },
    { type: 'talk', npc: 'nettle', dialogue: 'q5_nettle', text: 'Someone tends these plants. Find the hut deeper in the woods',
      enter: [{ npc: { id: 'nettle', hidden: false } }] },
    { type: 'talk', npc: 'doc', dialogue: 'q5_done', text: 'Bring the feverleaf to Doc Obi', then: [{ remove: 'q5' }] },
  ] },
  { id: 'q6', title: 'The stolen herd', steps: [
    { type: 'talk', npc: 'mara', dialogue: 'q6_mara', text: 'Talk to Mara' },
    { type: 'goto', ...rustlers, r: 72, dialogue: 'q6_camp', text: 'Ride to the rustlers\' camp past the mesa road, to the east',
      enter: [{ holdHerd: { herd: 0, ...rustlers } }, { spawn: { kind: 'rustler', n: 4, ...rustlers, spread: 9, tag: 'q6' } },
        { spawn: { kind: 'rustler', n: 2, ...rustlers, spread: 12, tag: 'q6x', onlyIf: 'collector=refused' } }] },
    { type: 'clear', tag: 'q6', if: 'rustlers=fought', text: 'Deal with the rustlers',
      enter: [{ holdHerd: { herd: 0, ...rustlers } }, { spawn: { kind: 'rustler', n: 4, ...rustlers, spread: 9, tag: 'q6' } },
        { spawn: { kind: 'rustler', n: 2, ...rustlers, spread: 12, tag: 'q6x', onlyIf: 'collector=refused' } }],
      then: [{ freeHerd: 0 }] },
    { type: 'holler', ...rustlers, r: 30, if: 'rustlers=stampeded', text: 'Holler (E) beside the stolen herd to stampede it through the camp',
      enter: [{ holdHerd: { herd: 0, ...rustlers } }, { spawn: { kind: 'rustler', n: 4, ...rustlers, spread: 9, tag: 'q6' } },
        { spawn: { kind: 'rustler', n: 2, ...rustlers, spread: 12, tag: 'q6x', onlyIf: 'collector=refused' } }],
      then: [{ freeHerd: 0 }, { trample: 'q6' }, { toast: 'The herd thunders through the camp!' }] },
    { type: 'pen', count: 3, herd: 0, text: 'Bring Mara\'s herd home through the ranch gate', enter: [{ freeHerd: 0 }], then: [{ remove: 'q6' }] },
    { type: 'talk', npc: 'mara', dialogue: 'q6_done', text: 'Talk to Mara' },
  ] },
  // ===== act 2 =====
  { id: 'q7', title: 'Empty wagons', steps: [
    { type: 'talk', npc: 'ros', dialogue: 'q7_ros', text: 'Ros has a plan. Talk to her at the saloon' },
    { type: 'clear', tag: 'q7', text: 'Stop the gang\'s supply wagons below Red Mesa, to the south-east',
      enter: [{ spawn: { kind: 'rustler', n: 5, ...wagons, spread: 10, tag: 'q7' } }] },
    { type: 'goto', ...wagons, r: 14, dialogue: 'q7_wagons', text: 'Ride up to the wagons' },
  ] },
  { id: 'q8', title: 'The old sheriff', steps: [
    { type: 'talk', npc: 'ros', dialogue: 'q8_ros', text: 'Talk to Ros at the saloon', then: [{ npc: { id: 'tobe', hidden: false } }] },
    { type: 'talk', npc: 'tobe', dialogue: 'q8_tobe', text: 'Find Tobe Reyes past the south-west pastures', enter: [{ npc: { id: 'tobe', hidden: false } }] },
  ] },
  { id: 'q9', title: 'Deacon\'s sermon', steps: [
    { type: 'talk', npc: 'tobe', dialogue: 'q9_tobe', text: 'Talk to Tobe' },
    { type: 'talk', npc: 'pell', dialogue: 'q9_pell', text: 'Find Amos Pell on the woods road, to the west',
      enter: [{ npc: { id: 'pell', hidden: false } }] },
    { type: 'clear', tag: 'q9', if: 'pell=fought', text: 'Defeat Deacon Pell and his spitters',
      enter: [{ spawn: { kind: 'pell', n: 1, x: -168, z: -62, spread: 2, tag: 'q9' } }, { spawn: { kind: 'dilo', n: 2, x: -172, z: -58, spread: 6, tag: 'q9d' } }],
      then: [{ give: { standing: 5, xp: 300 } }, { remove: 'q9' }] },
  ] },
  { id: 'q10', title: 'High ground', steps: [
    { type: 'talk', npc: 'mara', dialogue: 'q10_mara', text: 'Talk to Mara' },
    { type: 'goto', x: 70, z: 214, r: 9, text: 'Light the signal fire on Highwatch ridge, far to the north', then: [{ npc: { id: 'june', hidden: false } }, { toast: 'The signal fire is lit' }] },
    { type: 'talk', npc: 'june', dialogue: 'q10_june', text: 'Somebody is coming down the ridge. Talk to her', enter: [{ npc: { id: 'june', hidden: false } }] },
  ] },
  { id: 'q11', title: 'Hester\'s toll', steps: [
    { type: 'talk', npc: 'june', dialogue: 'q11_june', text: 'June has news. Talk to her' },
    { type: 'clear', tag: 'q11', text: 'Break Hester Voss\'s blockade on the mesa road, to the east',
      enter: [{ spawn: { kind: 'hester', n: 1, ...toll, spread: 2, tag: 'q11' } }, { spawn: { kind: 'rustler', n: 3, ...toll, spread: 9, tag: 'q11r' } }] },
    { type: 'talk', npc: 'tobe', dialogue: 'q11_done', text: 'Talk to Tobe' },
  ] },
  { id: 'q12', title: 'The gate', steps: [
    { type: 'standing', min: 60, text: 'The town is not yet ready to stand with you: raise your Standing to 60 (jobs and quests)' },
    { type: 'talk', npc: 'ros', dialogue: 'q12_ros', text: 'Dustfork is ready. Talk to Ros at the saloon' },
    { type: 'hold', ...square, r: 34, time: 180, wave: { kind: 'rustler', n: 3, every: 40, most: 6 }, text: 'Hold the town square against the Blackthorn gang',
      then: [{ town: { owned: true } }, { give: { xp: 1000, money: 300 } }, { npc: { id: 'pike', hidden: false } }] },
    { type: 'talk', npc: 'pike', dialogue: 'q12_done', text: 'The mayor wants a word, by the town banner', enter: [{ npc: { id: 'pike', hidden: false } }],
      then: [{ npc: { id: 'pike', hidden: true } }] },
  ] },
  // ===== act 3 =====
  { id: 'q13', title: 'Restless nights', steps: [
    { type: 'talk', npc: 'ros', dialogue: 'q13_ros', text: 'Something is wrong on the range. Talk to Ros at the saloon' },
    { type: 'hold', ...square, r: 34, time: 120, wave: { kind: 'raptor', n: 4, every: 25, most: 9 }, text: 'Hold the town square against the stampeding predators' },
    { type: 'talk', npc: 'doc', dialogue: 'q13_doc', text: 'Doc Obi has found something. He is by the stables' },
  ] },
  { id: 'q14', title: 'Smoke in the marsh', steps: [
    { type: 'talk', npc: 'june', dialogue: 'q14_june', text: 'Talk to June' },
    { type: 'clear', tag: 'q14', text: 'Break up the Kettle twins\' camp in Sinkwater marsh, far to the south',
      enter: [{ spawn: { kind: 'kettle', n: 2, ...kettles, spread: 5, tag: 'q14' } }, { spawn: { kind: 'rustler', n: 3, ...kettles, spread: 11, tag: 'q14r' } }] },
    { type: 'goto', ...kettles, r: 12, dialogue: 'q14_camp', text: 'Search the camp' },
  ] },
  { id: 'q15', title: 'What Nettle saw', steps: [
    { type: 'talk', npc: 'tobe', dialogue: 'q15_tobe', text: 'Talk to Tobe', then: [{ npc: { id: 'nettle', hidden: false } }] },
    { type: 'talk', npc: 'nettle', dialogue: 'q15_secret', if: 'nettle=secret', text: 'Ask Old Nettle what she has seen, at her hut in Fernhollow woods', enter: [{ npc: { id: 'nettle', hidden: false } }] },
    { type: 'talk', npc: 'nettle', dialogue: 'q15_revealed', unless: 'nettle=secret', text: 'Ask Old Nettle what she has seen, at her hut in Fernhollow woods', enter: [{ npc: { id: 'nettle', hidden: false } }] },
  ] },
  { id: 'q16', title: 'Fire in the hollow', steps: [
    { type: 'talk', npc: 'june', dialogue: 'q16_june', text: 'Plan the approach with June' },
    { type: 'collect', tag: 'firepit', count: 3, ...hollow, text: 'Ride through the three fire pits round Rex Hollow to scatter them',
      enter: [{ pickups: { tag: 'firepit', points: firepits } },
        { spawn: { kind: 'rustler', n: 2, x: -36, z: -150, spread: 6, tag: 'q16a' } },
        { spawn: { kind: 'rustler', n: 2, x: -100, z: -140, spread: 6, tag: 'q16b', onlyIf: 'fires=assault' } },
        { spawn: { kind: 'rustler', n: 2, x: -78, z: -208, spread: 6, tag: 'q16c', onlyIf: 'fires=assault' } }],
      then: [{ remove: 'q16' }, { toast: 'The fires are out' }] },
  ] },
  { id: 'q17', title: 'The thunder', steps: [
    { type: 'talk', npc: 'tobe', dialogue: 'q17_tobe', text: 'Talk to Tobe' },
    { type: 'goto', ...hollow, r: 75, dialogue: 'q17_hollow', unless: 'rexdead', text: 'Ride to Rex Hollow, to the south-west' },
    { type: 'slay', if: 'rex=killed', unless: 'rexdead', text: 'Kill the Alpha Rex' },
    { type: 'drive', ...hollow, r: 60, below: 0.5, if: 'rex=sealed', unless: 'rexdead', text: 'Wear the Alpha Rex down to half its health, then holler (E) to drive it into the hollow' },
    { type: 'talk', npc: 'mara', dialogue: 'q17_sealed', if: 'rex=sealed', unless: 'rexdead', text: 'Talk to Mara' },
    { type: 'talk', npc: 'mara', dialogue: 'q17_killed', unless: 'rex=sealed', text: 'Talk to Mara' },
  ] },
  { id: 'q18', title: 'Blackthorn\'s reckoning', steps: [
    { type: 'talk', npc: 'ros', dialogue: 'q18_ros', text: 'Talk to Ros at the saloon' },
    { type: 'clear', tag: 'q18', text: 'Defeat Cornelius Blackthorn and his last riders at the Red Mesa camp',
      enter: [{ spawn: { kind: 'blackthorn', n: 1, x: 126, z: -82, spread: 2, tag: 'q18' } }, { spawn: { kind: 'rustler', n: 4, x: 126, z: -82, spread: 12, tag: 'q18r' } }],
      then: [{ npc: { id: 'blackthorn', hidden: false } }] },
    { type: 'talk', npc: 'blackthorn', dialogue: 'q18_blackthorn', text: 'Blackthorn is beaten. Decide what becomes of him', enter: [{ npc: { id: 'blackthorn', hidden: false } }],
      then: [{ toast: 'Thunder Valley is at peace. Thank you for playing' }] },
  ] },
];

// How the story ended, for the journal: keyed by the two last choices.
export const ENDINGS = {
  'killed|jailed': 'The Alpha is dead and Blackthorn sits in a Dustfork cell. The valley is quiet, safe and a little smaller than it was.',
  'killed|exiled': 'The Alpha is dead and Blackthorn rode out alive. The valley is quiet for now; the name Dustfork is one you will hear again.',
  'sealed|jailed': 'The Alpha roars behind a wall of rock and Blackthorn sits in a Dustfork cell. The valley keeps its thunder, and its law.',
  'sealed|exiled': 'The Alpha roars behind a wall of rock and Blackthorn rode out alive. The valley is wild and free, and not yet done with trouble.',
};

// Standing with the town: what each level opens (shown in the journal).
export const STANDING = { max: 100, perJob: 2, marks: [[25, 'Shop prices drop 10%'], [50, 'More riders will join your posse'], [60, 'The town will stand with you at the gate'], [75, 'Townsfolk greet you by name']] };
