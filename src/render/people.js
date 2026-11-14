// People: townsfolk, the rider on foot and in the saddle. Rigged, animated models (Quaternius, CC0) stand in for the
// box-built figure, which shows until the file arrives and stays if it fails.
import * as THREE from 'three';
import { posedBox } from './assets.js';

const DIR = './assets/people/';
const cache = new Map();
function load(name) {
  if (!cache.has(name)) {
    cache.set(name, Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js')]).then(async ([{ GLTFLoader }, SkeletonUtils]) => {
      const gltf = await new GLTFLoader().loadAsync(`${DIR}${name}.glb`);
      return { gltf, box: posedBox(gltf, /Idle$/), clone: SkeletonUtils.clone };
    }));
  }
  return cache.get(name);
}

const hatMat = new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.9, flatShading: true });
function makeHat() {
  const g = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 12), hatMat), crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.29, 0.3, 12), hatMat);
  crown.position.y = 0.16;
  brim.castShadow = crown.castShadow = true;
  g.add(brim, crown);
  return g;
}

// name: file in assets/people. height: how tall the figure stands. tints: { materialName: colour }. hat: a frontier hat.
// placeholder: something to show until the model loads. Returns { root, update(dt, moving 0..1, pose 'stand' | 'sit'), dispose }.
export function createPerson(name, { height = 3, tints = {}, hat = false, placeholder = null } = {}) {
  const root = new THREE.Group();
  if (placeholder) root.add(placeholder);
  let disposed = false, release = () => {};
  const person = { root, ready: false, update: () => {}, dispose: () => { if (!disposed) { disposed = true; release(); } } };
  load(name).then(({ gltf, box, clone }) => {
    if (disposed) return;
    const inst = clone(gltf.scene), k = height / (box.max.y - box.min.y);
    inst.scale.setScalar(k);
    inst.position.y = -box.min.y * k;
    const made = [];
    inst.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;   // skinned bounds are those of the bind pose: never let a posed figure blink out
      o.material = o.material.clone();
      made.push(o.material);
      Object.assign(o.material, { metalness: 0, roughness: 0.9 });
      if (tints[o.material.name] !== undefined) o.material.color.setHex(tints[o.material.name]);
    });
    if (placeholder) root.remove(placeholder);
    root.add(inst);
    if (hat) {
      let head = null;
      inst.traverse(o => { if (o.isBone && /^head$/i.test(o.name.replace(/^.*[|:_]/, ''))) head = head || o; });
      if (!head) inst.traverse(o => { if (o.isBone && /head/i.test(o.name)) head = head || o; });
      if (head) {
        root.updateMatrixWorld(true);
        const s = head.getWorldScale(new THREE.Vector3()).x || 1, h = makeHat(), size = height * 0.36;
        h.scale.setScalar(size / s);
        h.position.y = (height * 0.085) / s;
        head.add(h);
      }
    }
    const mixer = new THREE.AnimationMixer(inst);
    const clip = (re) => { const c = gltf.animations.find(a => re.test(a.name)); return c ? mixer.clipAction(c) : null; };
    const idle = clip(/Idle$/), run = clip(/Run$/), sit = clip(/Sitting$/);
    for (const a of [idle, run, sit]) if (a) { a.play(); a.setEffectiveWeight(0); }
    if (idle) idle.setEffectiveWeight(1);
    mixer.update(Math.random() * 3);   // people standing together should not breathe in step
    person.update = (dt, moving = 0, pose = 'stand') => {
      const seated = pose === 'sit' && sit ? 1 : 0;
      if (sit) sit.setEffectiveWeight(seated);
      if (run) run.setEffectiveWeight((1 - seated) * moving);
      if (idle) idle.setEffectiveWeight((1 - seated) * (run ? 1 - moving : 1));
      mixer.update(dt);
    };
    release = () => { mixer.stopAllAction(); mixer.uncacheRoot(inst); for (const m of made) m.dispose(); inst.traverse(o => { if (o.skeleton) o.skeleton.dispose(); }); };
    person.ready = true;
  }).catch((err) => console.warn(`Person "${name}" failed to load, keeping the placeholder:`, err));
  return person;
}

// Who looks like what. Material names differ between the two character sets the files come from.
export const LOOKS = {
  rider: ['man', { Shirt: 0x2f5d8a, Pants: 0x3a3026 }, true],
  ros: ['womandress', { Dress: 0x9a3b4a }],
  winifred: ['womancasual', { Shirt: 0x3f7a55 }],
  doc: ['mansuit', { Shirt: 0xd8d2c2, Pants: 0x4a4a52 }],
  mara: ['womanq', { Jacket: 0xb07a2a, LightJacket: 0xc9953a }, true],
  collector: ['man', { Shirt: 0x2b2b30, Pants: 0x1c1c20 }, true],
  nettle: ['hooded', {}],
  tobe: ['worker', {}],
  pell: ['mansuit', { Shirt: 0x2a2826, Pants: 0x1c1a18 }, true],
  pike: ['mansuit', { Shirt: 0x6a4a7a, Pants: 0x2e2836 }],
  blackthorn: ['man', { Shirt: 0x141418, Pants: 0x101014 }, true],
  june: ['womanq', { Jacket: 0x2f8a8a, LightJacket: 0x3fa0a0 }, true],
  silas: ['farmer', {}],
};
export function personFor(id, opts = {}) {
  const [name, tints, hat] = LOOKS[id] || LOOKS.rider;
  return createPerson(name, { tints: { ...tints, ...(opts.tints || {}) }, hat: !!hat, ...opts, tints: { ...tints, ...(opts.tints || {}) } });
}
