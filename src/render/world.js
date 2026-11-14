// Draws the static valley: ground, trees, rocks, the ranch pen and the outposts.
import * as THREE from 'three';
import { WORLD, heightAt, rng } from '../sim/terrain.js';
import { PEN, CAPTURE } from '../data/content.js';
import { PLACES, TOWN } from '../data/items.js';
import { buildTrees, WATER_Y } from './flora.js';

export function buildWorld(scene, obstacles, outposts, shadows, windTime) {
  const rand = rng(7);
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, 160, 160);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const dirt = new THREE.Color(0xb39763), mud = new THREE.Color(0x8f8463);
  const sand = new THREE.Color(0xc2a868), grass = new THREE.Color(0x79a84e), ridge = new THREE.Color(0xa3a97c), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = heightAt(pos.getX(i), pos.getZ(i));
    pos.setY(i, y);
    const k = THREE.MathUtils.clamp((y + 9) / 18, 0, 1);
    if (k < 0.5) c.lerpColors(sand, grass, k * 2); else c.lerpColors(grass, ridge, (k - 0.5) * 2);
    // trodden earth in town and on the track up to the ranch gate; wet sand at the water's edge
    const vx = pos.getX(i), vz = pos.getZ(i), townD = Math.hypot(vx - TOWN.x, vz - TOWN.z);
    const worn = Math.max(1 - Math.max(0, townD - (TOWN.r - 14)) / 10, Math.abs(vx - PEN.x) < 5 && vz > TOWN.z && vz < PEN.z - PEN.r + 2 ? 0.9 : 0);
    if (worn > 0) c.lerp(dirt, Math.min(1, worn) * 0.85);
    if (y < WATER_Y + 1.2) c.lerp(mud, Math.min(1, (WATER_Y + 1.2 - y) / 1.2) * 0.7);
    c.offsetHSL(0, 0, (rand() - 0.5) * 0.05);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const { trees, rocks, posts } = obstacles;
  const fallback = buildTrees(scene, trees, shadows, windTime);

  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1), new THREE.MeshStandardMaterial({ color: 0x8a8578, flatShading: true }), rocks.length);
  const euler = new THREE.Euler();
  rocks.forEach((r, i) => {
    q.setFromEuler(euler.set(r.rx, r.ry, r.rz));
    s.set(r.sx, r.sy, r.sz);
    rockMesh.setMatrixAt(i, m.compose(p.set(r.x, heightAt(r.x, r.z) + r.sy * 0.3, r.z), q, s));
  });
  rockMesh.castShadow = rockMesh.receiveShadow = shadows;
  scene.add(rockMesh);
  fallback.push(rockMesh);

  // ranch pen: posts joined by rails, with a gap for the gate
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, flatShading: true });
  const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 2.2, 6), railGeo = new THREE.BoxGeometry(1, 0.14, 0.1);
  posts.forEach((a, i) => {
    const post = new THREE.Mesh(postGeo, wood);
    post.position.set(a.x, heightAt(a.x, a.z) + 1.1, a.z);
    post.castShadow = shadows;
    scene.add(post);
    const b = posts[i + 1];
    if (!b || Math.hypot(b.x - a.x, b.z - a.z) > 4) return;   // no rail across the gate
    for (const up of [0.9, 1.7]) {
      const rail = new THREE.Mesh(railGeo, wood);
      const ya = heightAt(a.x, a.z) + up, yb = heightAt(b.x, b.z) + up;
      rail.position.set((a.x + b.x) / 2, (ya + yb) / 2, (a.z + b.z) / 2);
      rail.scale.x = Math.hypot(b.x - a.x, yb - ya, b.z - a.z);
      rail.lookAt(b.x, yb, b.z);
      rail.rotateY(Math.PI / 2);
      scene.add(rail);
    }
  });
  const penY = heightAt(PEN.x, PEN.z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 9, 6), wood);
  pole.position.set(PEN.x + PEN.r, penY + 4.5, PEN.z);
  const penFlag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.8), new THREE.MeshStandardMaterial({ color: 0x2fb5a0, side: THREE.DoubleSide }));
  penFlag.position.set(PEN.x + PEN.r + 1.6, penY + 7.8, PEN.z);
  scene.add(pole, penFlag);

  const flags = outposts.map((o) => {
    const g = new THREE.Group();
    g.position.set(o.x, heightAt(o.x, o.z), o.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 1, 8), wood);
    base.position.y = 0.3;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 9, 6), wood);
    mast.position.y = 5;
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xc23b2e, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.8), flagMat);
    flag.position.set(1.6, 8.3, 0);
    const ring = new THREE.Mesh(new THREE.RingGeometry(CAPTURE.r - 0.4, CAPTURE.r, 48),
      new THREE.MeshBasicMaterial({ color: 0xc23b2e, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 1.2;
    base.castShadow = mast.castShadow = flag.castShadow = shadows;
    g.add(base, mast, flag, ring);
    scene.add(g);
    return { outpost: o, flag, flagMat, ring };
  });
  buildTown(scene, wood, shadows);
  return { flags, penFlag, fallback };
}

// Dustfork: plain timber buildings with pitched roofs, a door on the side the rider approaches, and a name board.
// A painted sign: dark letters on a pale board, drawn once to a small canvas.
function signMaterial(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 104;
  const g = c.getContext('2d');
  g.fillStyle = '#e9dcb8'; g.fillRect(0, 0, 512, 104);
  g.strokeStyle = '#5a3d2b'; g.lineWidth = 8; g.strokeRect(4, 4, 504, 96);
  g.fillStyle = '#2b2018'; g.font = 'bold 58px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 56, 470);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map, roughness: 1 });
}
let townBanner = null;
// Call each frame: gang red until Dustfork is yours, then your teal.
export function showTownOwner(owned, time) { if (townBanner) { townBanner.material.color.setHex(owned ? 0x2fb5a0 : 0xc23b2e); townBanner.rotation.y = Math.sin(time * 2 + 1) * 0.25; } }
// Town buildings from the Quaternius village sets (CC0). [file, quarter turns to bring its front round to +z, height in the world]
const TOWN_MODELS = { saloon: ['inn', 0, 10.5], store: ['fhouse1', 0, 9], stables: ['stable', 0, 8] };
const staticCache = new Map();
function loadStatic(name) {
  if (!staticCache.has(name)) {
    staticCache.set(name, import('three/addons/loaders/GLTFLoader.js').then(async ({ GLTFLoader }) => {
      const gltf = await new GLTFLoader().loadAsync(`./assets/town/${name}.glb`);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(o => { if (o.isMesh) Object.assign(o.material, { metalness: 0, roughness: 0.9 }); });
      return { scene: gltf.scene, box: new THREE.Box3().setFromObject(gltf.scene) };
    }));
  }
  return staticCache.get(name);
}
// Stands a model on a w x d footprint, its front turned to `facing` (radians about y), as large as the footprint allows.
export async function placeModel(parent, name, { w, d, turns = 0, facing = 0, maxHeight = Infinity, shadows = true }) {
  const { scene, box } = await loadStatic(name);
  const inst = scene.clone(true), pivot = new THREE.Group(), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const sx = turns % 2 ? size.z : size.x, sz = turns % 2 ? size.x : size.z;
  const k = Math.min(w / sx, d / sz, maxHeight / size.y);
  inst.position.set(-mid.x, -box.min.y, -mid.z);
  const turn = new THREE.Group();
  turn.rotation.y = turns * Math.PI / 2;
  turn.add(inst);
  pivot.add(turn);
  pivot.scale.setScalar(k);
  pivot.rotation.y = facing;
  pivot.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = shadows; });
  parent.add(pivot);
  return { pivot, height: size.y * k };
}

function buildTown(scene, wood, shadows) {
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a3d2b, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2018, flatShading: true });
  const paper = new THREE.MeshStandardMaterial({ color: 0xe9dcb8, flatShading: true });
  const solid = (mesh) => { mesh.castShadow = mesh.receiveShadow = shadows; return mesh; };
  for (const b of PLACES) {
    const g = new THREE.Group(), y = heightAt(b.x, b.z);
    g.position.set(b.x, y, b.z);
    scene.add(g);
    if (b.id === 'board') {
      for (const sx of [-1, 1]) { const post = solid(new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.4, 0.25), wood)); post.position.set(sx * 1.4, 1.7, 0); g.add(post); }
      const plank = solid(new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 0.15), wood));
      plank.position.y = 2.3;
      g.add(plank);
      [[-0.8, 2.5], [0.1, 2.2], [0.9, 2.55]].forEach(([px, py]) => { const note = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.02), paper); note.position.set(px, py, 0.09); g.add(note); });
      continue;
    }
    const wall = new THREE.MeshStandardMaterial({ color: b.color, flatShading: true });
    const body = solid(new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h + 2, b.d), wall));
    body.position.y = b.h / 2 - 1;   // sunk a little so sloping ground never shows a gap
    // a pitched roof: a triangle pulled along the building's length
    const rise = b.h * 0.45, over = 0.8, tri = new THREE.Shape([new THREE.Vector2(-b.d / 2 - over, 0), new THREE.Vector2(b.d / 2 + over, 0), new THREE.Vector2(0, rise)]);
    const roof = solid(new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: b.w + over * 2, bevelEnabled: false }), roofMat));
    roof.rotation.y = Math.PI / 2;
    roof.position.set(-b.w / 2 - over, b.h, 0);
    g.add(body, roof);
    // door and name board on the wall that faces the door spot
    const dx = b.door.x - b.x, dz = b.door.z - b.z, alongX = Math.abs(dx) > Math.abs(dz), sign = Math.sign(alongX ? dx : dz);
    const door = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.2 : 2, 3.2, alongX ? 2 : 0.2), dark);
    const board = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.2 : 6, 1.2, alongX ? 6 : 0.2), signMaterial(b.name.toUpperCase()));
    if (alongX) { door.position.set(sign * b.w / 2, 1.6, 0); board.position.set(sign * (b.w / 2 + 0.05), b.h - 0.9, 0); }
    else { door.position.set(0, 1.6, sign * b.d / 2); board.position.set(0, b.h - 0.9, sign * (b.d / 2 + 0.05)); }
    g.add(door, board);
    // the modelled building replaces the plain one once it has loaded; the name board stays, lifted clear of the porch
    const look = TOWN_MODELS[b.id];
    if (look) {
      const wide = alongX ? b.d : b.w, deep = alongX ? b.w : b.d;
      placeModel(g, look[0], { w: wide * 1.12, d: deep * 1.12, turns: look[1], facing: Math.atan2(dx, dz), maxHeight: look[2], shadows }).then(({ pivot }) => {
        g.remove(body, roof, door);
        pivot.position.y = -0.4;   // sunk a little so sloping ground never shows a gap
        board.position.y = 4.6;
        if (alongX) board.position.x = sign * (b.w / 2 + 0.9); else board.position.z = sign * (b.d / 2 + 0.9);
      }).catch((err) => console.warn(`Building "${look[0]}" failed to load, keeping the plain one:`, err));
    }
  }
  // the town banner, off to one side of the square so it never stands between the camera and a rider who starts there
  const bx = TOWN.x - 9, bz = TOWN.z - 6, y = heightAt(bx, bz);
  const mast = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 12, 6), wood));
  mast.position.set(bx, y + 6, bz);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshStandardMaterial({ color: 0x2fb5a0, side: THREE.DoubleSide }));
  banner.position.set(bx + 2.1, y + 10.6, bz);
  scene.add(mast, banner);
  townBanner = banner;
}
