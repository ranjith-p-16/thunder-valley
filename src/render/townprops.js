// Dressing for Dustfork: porches, windows that glow at night, lanterns, barrels, crates and a hitching rail.
// None of it is solid; the buildings themselves are.
import * as THREE from 'three';
import { heightAt } from '../sim/terrain.js';
import { PLACES, TOWN } from '../data/items.js';
import { TOWN_RULE } from '../data/content.js';
import { PLACES_OF_NOTE } from '../data/story.js';

export function buildTownProps(scene, shadows) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, flatShading: true, roughness: 1 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x4f3826, flatShading: true, roughness: 1 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3d42, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({ color: 0x2a3540, emissive: 0xffb45a, emissiveIntensity: 0, flatShading: true });
  const flame = new THREE.MeshStandardMaterial({ color: 0x40382a, emissive: 0xffc070, emissiveIntensity: 0 });
  const add = (geo, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadows; parent.add(m); return m; };
  const lights = [];

  for (const b of PLACES) {
    if (b.id === 'board') continue;
    const g = new THREE.Group();
    g.position.set(b.x, heightAt(b.x, b.z), b.z);
    scene.add(g);
    const dx = b.door.x - b.x, dz = b.door.z - b.z, alongX = Math.abs(dx) > Math.abs(dz), sign = Math.sign(alongX ? dx : dz);
    // local frame: `out` points from the door wall toward the street, `side` runs along that wall
    const at = (out, up, side) => (alongX ? [sign * (b.w / 2 + out), up, side] : [side, up, sign * (b.d / 2 + out)]);
    const span = alongX ? b.d : b.w;
    // porch: a plank floor, a lean-to roof and posts
    const floor = add(new THREE.BoxGeometry(alongX ? 3 : span + 1, 0.25, alongX ? span + 1 : 3), darkWood, ...at(1.5, 0.12, 0), g);
    floor.receiveShadow = shadows;
    const roof = add(new THREE.BoxGeometry(alongX ? 3.4 : span + 1.4, 0.18, alongX ? span + 1.4 : 3.4), darkWood, ...at(1.5, 3.5, 0), g);
    roof.rotation[alongX ? 'z' : 'x'] = (alongX ? -1 : 1) * sign * 0.16;
    for (const s of [-span / 2, 0, span / 2]) if (Math.abs(s) > 1.4) add(new THREE.BoxGeometry(0.22, 3.4, 0.22), wood, ...at(2.8, 1.7, s), g);
    // windows either side of the door
    for (const s of [-span * 0.3, span * 0.3]) add(new THREE.BoxGeometry(alongX ? 0.12 : 1.4, 1.3, alongX ? 1.4 : 0.12), glass, ...at(0.02, 2.2, s), g);
    // a lantern on the corner post
    const [lx, ly, lz] = at(2.8, 3.0, span / 2);
    add(new THREE.BoxGeometry(0.3, 0.42, 0.3), flame, lx, ly, lz, g);
    const light = new THREE.PointLight(0xffb060, 0, 16, 1.8);
    light.position.set(lx, ly, lz);
    g.add(light);
    lights.push(light);
    // barrels and a crate by the wall
    const barrel = new THREE.CylinderGeometry(0.5, 0.45, 1.1, 8);
    add(barrel, wood, ...at(0.8, 0.8, -span / 2 + 0.8), g);
    add(barrel, darkWood, ...at(0.9, 0.8, -span / 2 + 1.9), g);
    add(new THREE.BoxGeometry(1, 1, 1), wood, ...at(0.8, 0.75, span / 2 - 0.9), g).rotation.y = 0.3;
    // chimney
    add(new THREE.BoxGeometry(1, 2.6, 1), new THREE.MeshStandardMaterial({ color: 0x8b6f5c, flatShading: true }), -b.w * 0.28, b.h + 1.6, 0, g);
  }

  // hitching rail and water trough on the square
  const sq = (x, z) => [TOWN.x + x, heightAt(TOWN.x + x, TOWN.z + z), TOWN.z + z];
  for (const ox of [-2.5, 2.5]) { const [x, y, z] = sq(ox + 5, 9); add(new THREE.BoxGeometry(0.2, 1.3, 0.2), wood, x, y + 0.65, z); }
  { const [x, y, z] = sq(5, 9); add(new THREE.BoxGeometry(5.4, 0.16, 0.16), wood, x, y + 1.2, z); }
  { const [x, y, z] = sq(-6, 8); add(new THREE.BoxGeometry(3, 0.7, 1.1), darkWood, x, y + 0.4, z); add(new THREE.BoxGeometry(2.7, 0.1, 0.8), new THREE.MeshStandardMaterial({ color: 0x3d93a6, roughness: 0.1 }), x, y + 0.72, z); }
  // street lamps
  for (const [ox, oz] of [[-8, -4], [9, -16], [0, 18]]) {
    const [x, y, z] = sq(ox, oz);
    add(new THREE.CylinderGeometry(0.1, 0.14, 4.2, 6), iron, x, y + 2.1, z);
    add(new THREE.BoxGeometry(0.4, 0.5, 0.4), flame, x, y + 4.3, z);
    const light = new THREE.PointLight(0xffb060, 0, 18, 1.8);
    light.position.set(x, y + 4.3, z);
    scene.add(light);
    lights.push(light);
  }

  // the town bell on the square: what raiders come for
  { const [x, y, z] = sq(0, 0);
    for (const ox of [-1.2, 1.2]) add(new THREE.BoxGeometry(0.3, 4, 0.3), wood, x + ox, y + 2, z);
    add(new THREE.BoxGeometry(3, 0.3, 0.3), wood, x, y + 4, z);
    add(new THREE.CylinderGeometry(0.35, 0.8, 1.1, 10), new THREE.MeshStandardMaterial({ color: 0xb58a3a, metalness: 0.4, roughness: 0.5 }), x, y + 3.2, z); }
  const towers = new THREE.Group();
  for (const [ox, oz] of TOWN_RULE.towers) {
    const [x, y, z] = sq(ox, oz);
    for (const [lx, lz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) add(new THREE.BoxGeometry(0.35, 9, 0.35), wood, x + lx, y + 4.5, z + lz, towers);
    add(new THREE.BoxGeometry(4, 0.3, 4), darkWood, x, y + 9, z, towers);
    for (const [lx, lz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) add(new THREE.BoxGeometry(0.2, 2.2, 0.2), wood, x + lx, y + 10.2, z + lz, towers);
    add(new THREE.ConeGeometry(3.4, 2, 4), darkWood, x, y + 12.3, z, towers).rotation.y = Math.PI / 4;
  }
  towers.visible = false;
  scene.add(towers);

  return {
    setTowers(on) { towers.visible = on; },
    // nightK: 0 by day, 1 in full dark
    update(nightK) {
      glass.emissiveIntensity = nightK * 1.1;
      flame.emissiveIntensity = 0.25 + nightK * 2.2;
      for (const l of lights) l.intensity = nightK * 22;
    },
  };
}

// Landmarks for the story's places, so "the hut", "the camp" and "the den" are things you can see.
export function buildCampProps(scene, shadows) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x6f5236, flatShading: true, roughness: 1 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0xcdbd95, flatShading: true, roughness: 1 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x77736a, flatShading: true, roughness: 1 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xe6dfc8, flatShading: true, roughness: 1 });
  const ember = new THREE.MeshStandardMaterial({ color: 0x402a18, emissive: 0xff7a20, emissiveIntensity: 1.6 });
  const add = (geo, mat, x, z, up, rot = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, heightAt(x, z) + up, z); m.rotation.y = rot; m.castShadow = shadows; scene.add(m); return m; };
  const { nettle, rustlers, den, wagons, toll } = PLACES_OF_NOTE;
  // Old Nettle's hut: a low cabin with a lean roof and a herb rack
  add(new THREE.BoxGeometry(6, 3.4, 5), wood, nettle.x - 7, nettle.z, 1.4);
  add(new THREE.ConeGeometry(5, 2.4, 4), cloth, nettle.x - 7, nettle.z, 4.2, Math.PI / 4);
  add(new THREE.BoxGeometry(0.2, 2, 3), wood, nettle.x - 2.5, nettle.z + 3, 1);
  // the rustlers' camp: three tents round a fire
  for (const [dx, dz, r] of [[-9, 4, 0.4], [8, 6, 1.9], [2, -10, 3.4]]) add(new THREE.ConeGeometry(3.2, 4.2, 4), cloth, rustlers.x + dx, rustlers.z + dz, 2, r);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.28; add(new THREE.DodecahedronGeometry(0.45, 0), stone, rustlers.x + Math.cos(a) * 1.5, rustlers.z + Math.sin(a) * 1.5, 0.15); }
  add(new THREE.ConeGeometry(0.8, 1.2, 5), ember, rustlers.x, rustlers.z, 0.5);
  // the gang's supply wagons below Red Mesa
  for (const [dx, dz, r] of [[-4, 0, 0.3], [5, 2, -0.5]]) {
    add(new THREE.BoxGeometry(5, 1.6, 2.6), wood, wagons.x + dx, wagons.z + dz, 1.5, r);
    add(new THREE.CylinderGeometry(1.5, 1.5, 4.6, 8, 1, false, 0, Math.PI), cloth, wagons.x + dx, wagons.z + dz, 2.3, r).rotation.z = Math.PI / 2;
    for (const [wx, wz] of [[-1.8, 1.4], [1.8, 1.4], [-1.8, -1.4], [1.8, -1.4]]) add(new THREE.CylinderGeometry(0.8, 0.8, 0.2, 10), wood, wagons.x + dx + wx, wagons.z + dz + wz, 0.8).rotation.x = Math.PI / 2;
  }
  // Hester's toll: a log barrier across the mesa road
  for (const dz of [-6, 0, 6]) add(new THREE.CylinderGeometry(0.35, 0.35, 7, 6), wood, toll.x, toll.z + dz, 1.1).rotation.x = Math.PI / 2;
  for (const dz of [-9, -3, 3, 9]) add(new THREE.CylinderGeometry(0.3, 0.3, 2.6, 6), wood, toll.x, toll.z + dz, 1.3);
  // the signal fire on Highwatch ridge
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28; add(new THREE.DodecahedronGeometry(0.6, 0), stone, 70 + Math.cos(a) * 2.2, 214 + Math.sin(a) * 2.2, 0.2); }
  add(new THREE.ConeGeometry(1.2, 2.2, 6), ember, 70, 214, 1);
  // the den: a ring of boulders with old bones
  for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28 + 0.3; add(new THREE.DodecahedronGeometry(1.6 + (i % 3) * 0.5, 0), stone, den.x + Math.cos(a) * 6.5, den.z + Math.sin(a) * 6.5, 0.6, a); }
  for (const [dx, dz, r] of [[1, 0.5, 0.3], [-1.5, 1.2, 1.4], [0.4, -1.6, 2.2]]) add(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 5), bone, den.x + dx, den.z + dz, 0.2, r).rotation.z = 1.45;
}
