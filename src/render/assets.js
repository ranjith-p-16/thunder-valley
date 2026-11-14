// Art manifest. Game code only ever asks for a model by id. Each entry names a .glb file
// (clips ending in _Idle / _Run / _Attack / _Death); the box-built model shows until it loads,
// and stays if `glb` is null or the file fails to load.
import * as THREE from 'three';
import { buildBiped, buildQuad, makeRider, animateRig } from './dinos.js';
import { createPerson, LOOKS } from './people.js';

// height: world height the model is scaled to. tint: colour the model is pulled toward.
// rider: seat position (in model heights / world units) for the box-built ranger.
export const ASSETS = {
  mount:  { glb: './assets/raptor.glb', height: 5.4, tint: 0x4fbf8a, rider: { y: 0.6, z: -0.3 },
            build: () => buildBiped({ scale: 1.3, body: 0x3f8f6b, belly: 0xd9c58a, accent: 0xe0a030, rider: true }) },
  mountTrike: { glb: './assets/trike.glb', height: 3.6, tint: 0x4f8fbf, rider: { y: 0.8, z: -0.3 },
            build: () => buildQuad({ scale: 1.3, body: 0x4f7f9f, belly: 0xcfc6a8, accent: 0xe0a030 }) },
  mountRex: { glb: './assets/rex.glb', height: 7.5, tint: 0x9f5fbf, rider: { y: 0.7, z: -0.6 },
            build: () => buildBiped({ scale: 2.3, head: 1.5, body: 0x7f5f9f, belly: 0xc9b08a, accent: 0xe0a030 }) },
  // tameable kinds from Red Mesa and their saddled forms, built from the raptor and triceratops until they get their own models
  cinder: { glb: './assets/raptor.glb', height: 4.4, tint: 0xd0502a,
            build: () => buildBiped({ scale: 1.3, body: 0xc0502a, belly: 0xe2c79a, accent: 0x3a1a10 }) },
  plate:  { glb: './assets/stego.glb', height: 4.4, tint: 0x8a8f6a,
            build: () => buildQuad({ scale: 1.2, body: 0x7d7f6a, belly: 0xcfc6a8, accent: 0x3a3a30 }) },
  crest:  { glb: './assets/parasaur.glb', height: 4.6, tint: 0x6fae6a,
            build: () => buildBiped({ scale: 1.3, body: 0x6fae6a, belly: 0xe2d79a, accent: 0xc05a30 }) },
  hauler: { glb: './assets/apato.glb', height: 5.2, tint: 0x5f8f9a,
            build: () => buildQuad({ scale: 2.2, body: 0x5f8f9a, belly: 0xcfc6a8, accent: 0x3a4a50 }) },
  mountCrest: { glb: './assets/parasaur.glb', height: 5.6, tint: 0x6fae6a, rider: { y: 0.6, z: -0.5 },
            build: () => buildBiped({ scale: 1.4, body: 0x6fae6a, belly: 0xe2d79a, accent: 0xc05a30, rider: true }) },
  mountHauler: { glb: './assets/apato.glb', height: 5.6, tint: 0x5f8f9a, rider: { y: 0.9, z: -0.4 },
            build: () => buildQuad({ scale: 2.3, body: 0x5f8f9a, belly: 0xcfc6a8, accent: 0x3a4a50 }) },
  mountSpitter: { glb: './assets/raptor.glb', height: 5.0, tint: 0x6a4fa8, rider: { y: 0.6, z: -0.3 },
            build: () => buildBiped({ scale: 1.25, body: 0x6a4fa8, belly: 0xd9c58a, accent: 0xe05a30, rider: true }) },
  mountCinder: { glb: './assets/raptor.glb', height: 5.8, tint: 0xd0502a, rider: { y: 0.6, z: -0.3 },
            build: () => buildBiped({ scale: 1.4, body: 0xc0502a, belly: 0xe2c79a, accent: 0x3a1a10, rider: true }) },
  mountPlate: { glb: './assets/stego.glb', height: 5.2, tint: 0x8a8f6a, rider: { y: 0.66, z: 0.2 },
            build: () => buildQuad({ scale: 1.4, body: 0x7d7f6a, belly: 0xcfc6a8, accent: 0x3a3a30 }) },
  // the gang's lieutenants ride marked animals
  pell:   { glb: './assets/raptor.glb', height: 5.4, tint: 0x4a5a3a, rider: { y: 0.6, z: -0.3 }, shirt: 0x1c1c1c,
            build: () => buildBiped({ scale: 1.35, body: 0x4a5a3a, belly: 0xd9c58a, accent: 0x111111, rider: true }) },
  hester: { glb: './assets/trike.glb', height: 4.4, tint: 0x8a2f2f, rider: { y: 0.8, z: -0.3 }, shirt: 0x5a1a1a,
            build: () => buildQuad({ scale: 1.6, body: 0x8a2f2f, belly: 0xcfc6a8, accent: 0x222222 }) },
  kettle: { glb: './assets/raptor.glb', height: 5.0, tint: 0x2f6a6a, rider: { y: 0.6, z: -0.3 }, shirt: 0x6a5a2a,
            build: () => buildBiped({ scale: 1.3, body: 0x2f6a6a, belly: 0xd9c58a, accent: 0x111111, rider: true }) },
  blackthorn: { glb: './assets/rex.glb', height: 8.2, tint: 0x2a2a30, rider: { y: 0.7, z: -0.6 }, shirt: 0x101014,
            build: () => buildBiped({ scale: 2.5, head: 1.5, body: 0x2a2a30, belly: 0x8a7a6a, accent: 0xc02020 }) },
  // act 1 animals: all three reuse the raptor model at a different size and colour until they get their own
  compy:  { glb: './assets/raptor.glb', height: 1.2, tint: 0xb7c94a,
            build: () => buildBiped({ scale: 0.4, body: 0xa9b84a, belly: 0xe2d79a, accent: 0x3a2a20 }) },
  dilo:   { glb: './assets/raptor.glb', height: 3.9, tint: 0x6a4fa8,
            build: () => buildBiped({ scale: 1.2, body: 0x6a4fa8, belly: 0xd9c58a, accent: 0xe05a30 }) },
  rustler: { glb: './assets/raptor.glb', height: 4.8, tint: 0x8a3b32, rider: { y: 0.6, z: -0.3 }, shirt: 0x2b2b30,
            build: () => buildBiped({ scale: 1.2, body: 0x8a3b32, belly: 0xd9c58a, accent: 0x222222, rider: true }) },
  raptor: { glb: './assets/raptor.glb', height: 3.2,
            build: () => buildBiped({ scale: 1.0, body: 0xa5552f, belly: 0xe2c79a, accent: 0x3a2a20 }) },
  longhorn: { glb: './assets/trike.glb', height: 2.2, tint: 0xe6c060,
            build: () => buildQuad({ scale: 0.9, body: 0xc9a85a, belly: 0xe8dcb8, accent: 0x8a6a3a }) },
  trike:  { glb: './assets/trike.glb', height: 2.8,
            build: () => buildQuad({ scale: 1.0, body: 0x6b7f8f, belly: 0xcfc6a8, accent: 0xb5533c }) },
  rex:    { glb: './assets/rex.glb', height: 8.5,
            build: () => buildBiped({ scale: 2.6, head: 1.5, body: 0x5a3f52, belly: 0xc9b08a, accent: 0xd43d2a }) },
};

const collectMaterials = (obj) => {
  const set = new Set();
  obj.traverse(o => { if (o.isMesh) set.add(o.material); });
  return [...set];
};

// Frees the GPU side of a model's own materials and skeletons (and its geometry when that is not shared).
function freeTree(obj, geometry) {
  obj.traverse(o => {
    if (!o.isMesh) return;
    if (geometry) o.geometry.dispose();
    for (const m of [].concat(o.material)) m.dispose();
    if (o.skeleton) o.skeleton.dispose();
  });
}

// The true bounds of a rigged model in the stance of the clip whose name matches: measured vertex by vertex, since a box
// carried through a rotated node balloons.
export function posedBox(gltf, clipName) {
  const clip = gltf.animations.find(a => clipName.test(a.name));
  let poser = null;
  if (clip) { poser = new THREE.AnimationMixer(gltf.scene); poser.clipAction(clip).play(); poser.update(0); }
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    if (!o.isSkinnedMesh) return void box.expandByObject(o);
    o.skeleton.update();
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) box.expandByPoint(o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld));
  });
  if (poser) { poser.stopAllAction(); poser.uncacheRoot(gltf.scene); gltf.scene.updateMatrixWorld(true); }
  return box;
}

// Each file is fetched and measured once; every dino gets its own clone of it.
const glbCache = new Map();
function loadGlb(url) {
  if (!glbCache.has(url)) {
    glbCache.set(url, Promise.all([
      import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js'),
    ]).then(async ([{ GLTFLoader }, SkeletonUtils]) => {
      const gltf = await new GLTFLoader().loadAsync(url);
      const box = posedBox(gltf, /_Idle$/);
      return { gltf, box, clone: SkeletonUtils.clone };
    }));
  }
  return glbCache.get(url);
}

export function createModel(id) {
  const def = ASSETS[id];
  const root = new THREE.Group();
  const proc = def.build();
  root.add(proc);
  let muzzle = proc.userData.muzzle;
  if (!muzzle) {
    muzzle = new THREE.Object3D();
    muzzle.position.set(0.3, 3, 1.5);
    root.add(muzzle);
  }
  let disposed = false, release = () => freeTree(proc, true);
  const model = {
    root, muzzle, rider: null, materials: collectMaterials(proc), hasDeathAnim: false,
    update: (dt, speed01, attack01) => animateRig(proc.userData.rig, dt, speed01, attack01),
    // Call when the model leaves the scene for good: frees what was made just for it.
    dispose: () => { if (!disposed) { disposed = true; release(); } },
  };

  if (def.glb) loadGlb(def.glb).then(({ gltf, box, clone }) => {
    if (disposed) return;   // removed before the file arrived
    const inst = clone(gltf.scene);
    const k = def.height / (box.max.y - box.min.y);
    inst.scale.setScalar(k);
    inst.position.y = -box.min.y * k;
    const tint = def.tint && new THREE.Color(def.tint);
    inst.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.material = o.material.clone();
      // exported as part-metallic, which renders near-black without an environment map
      Object.assign(o.material, { metalness: 0, roughness: 0.85, flatShading: true });
      o.material.color.multiplyScalar(1.6);   // the pack's palette is very dark under this lighting
      if (tint) o.material.color.lerp(tint, 0.6);
    });
    root.remove(proc);
    freeTree(proc, true);
    root.add(inst);
    model.materials = collectMaterials(inst);
    let riderGroup = null, seated = null;
    if (def.rider) {
      const r = makeRider(def.shirt), [file, tints] = LOOKS.rider;
      seated = createPerson(file, { height: 2.05, hat: true, tints: { ...tints, ...(def.shirt ? { Shirt: def.shirt } : {}) }, placeholder: r.group });
      seated.root.position.y = -0.62;   // the saddle is at the hips, not the feet
      riderGroup = new THREE.Group();
      riderGroup.add(seated.root, r.muzzle);
      riderGroup.scale.setScalar(1.15);
      riderGroup.position.set(0, def.height * def.rider.y, def.rider.z);
      root.add(riderGroup);
      model.muzzle = r.muzzle;
      model.rider = riderGroup;
    }

    const mixer = new THREE.AnimationMixer(inst);
    // the clone shares its geometry with every other copy of the file, so only its own materials and skeleton go
    release = () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(inst);
      freeTree(inst, false);
      if (seated) seated.dispose();
      if (riderGroup) freeTree(riderGroup, true);
    };
    const action =(suffix) => { const c = gltf.animations.find(a => a.name.endsWith(suffix)); return c && mixer.clipAction(c); };
    const idle = action('_Idle'), run = action('_Run'), attack = action('_Attack'), death = action('_Death');
    [idle, run].forEach(a => a && a.play());
    [attack, death].forEach(a => a && a.setLoop(THREE.LoopOnce));
    if (death) death.clampWhenFinished = true;
    model.hasDeathAnim = !!death;
    let wasAttacking = false, wasDead = false;
    model.update = (dt, speed01, attack01, dead = false) => {
      if (dead !== wasDead) {
        wasDead = dead;
        if (death) dead ? death.reset().play() : death.stop();
        if (attack) attack.stop();
      }
      const busy = dead && death ? 0 : attack && attack.isRunning() ? 0.15 : 1;
      if (idle) idle.setEffectiveWeight((1 - speed01) * busy);
      if (run) { run.setEffectiveWeight(speed01 * busy); run.timeScale = 0.7 + speed01 * 0.5; }
      if (!dead && attack && attack01 > 0.9 && !wasAttacking) attack.reset().play();
      wasAttacking = attack01 > 0.9;
      mixer.update(dt);
      if (seated) seated.update(dt, 0, 'sit');
    };
  }).catch((err) => console.warn(`Model "${id}" failed to load, keeping placeholder:`, err));
  return model;
}
