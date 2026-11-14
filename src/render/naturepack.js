// Swaps the hand-built trees, rocks and bushes for the Quaternius "Stylized Nature MegaKit" models (CC0) once they load.
// The hand-built scenery shows first and stays if a file fails, so the game never waits on art.
import * as THREE from 'three';
import { heightAt, rng } from '../sim/terrain.js';

const DIR = './assets/nature/';
// height: how tall the model stands in the world for a tree of scale 1 (or, for small plants, outright).
// weight: how often it is picked. Heavier models are picked less often to keep the triangle count down.
const TREES = {
  pine: [['pine_2', 9.5, 4], ['pine_3', 10.5, 3], ['pine_1', 8.5, 2], ['pine_5', 8.5, 2], ['pine_4', 8.5, 1]],
  leafy: [['tree_5', 8.5, 4], ['tree_1', 10, 3], ['tree_2', 10, 2], ['tree_3', 8.5, 1], ['tree_4', 8.5, 1]],
  rare: [['twisted_tree_1', 13, 1], ['twisted_tree_2', 14, 1], ['dead_tree_1', 9, 2]],
};
const ROCKS = ['rock_medium_1', 'rock_medium_2', 'rock_medium_3'];
const BUSHES = [['bush_1', 1.9], ['bush_with_flowers_1', 1.9], ['fern_1', 1.5]];
const FLOWERS = [['flower_group_1', 1.3], ['flower_group_2', 1.5]];

const m4 = new THREE.Matrix4(), quat = new THREE.Quaternion(), scl = new THREE.Vector3(), pos = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

async function load(names) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  THREE.Cache.enabled = true;   // the models share a dozen texture files: fetch each once, not once per model
  const loader = new GLTFLoader(), out = new Map(), shared = new Map();
  await Promise.all(names.map(async (name) => {
    const gltf = await loader.loadAsync(`${DIR}${name}.glb`);
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene), parts = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      // bake the node's own placement into the geometry so one matrix per instance is enough
      const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
      // every file carries its own copy of the same bark, leaf and rock textures: keep the first of each and free the rest
      let material = shared.get(o.material.name);
      const leafy = /leaves|flower/i.test(o.material.name);
      if (!material) {
        material = o.material;
        if (leafy) Object.assign(material, { transparent: false, alphaTest: 0.5, depthWrite: true, side: THREE.DoubleSide });   // cut-out cards, not blended: no sorting needed
        Object.assign(material, { metalness: 0, roughness: 1 });
        material.color.multiplyScalar(leafy ? 1.9 : 1.6);   // the pack is painted dark for a different lighting setup
        shared.set(material.name, material);
      } else if (o.material !== material) {
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) o.material[key]?.dispose();
        o.material.dispose();
      }
      parts.push({ geometry, material, leafy });
    });
    out.set(name, { parts, box, height: box.max.y - box.min.y, width: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) });
  }));
  return out;
}

// Leaves lean with the wind; the push grows with height above the model's foot.
function sway(material, strength, time) {
  if (material.userData.sways) return;
  material.userData.sways = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      vec3 root = instanceMatrix[3].xyz;
      float bend = max(position.y, 0.0) * ${strength.toFixed(4)};
      transformed.x += sin(uTime * 1.5 + root.x * 0.3 + root.z * 0.2 + position.y * 0.4) * bend;
      transformed.z += cos(uTime * 1.2 + root.z * 0.3) * bend * 0.6;`);
  };
}

// Draws one model at many places. place: { x, z, spin, sx, sy, sz } with scales in model units.
function scatter(scene, model, places, shadows, time, swayBy) {
  if (!places.length) return;
  for (const part of model.parts) {
    if (part.leafy && swayBy) sway(part.material, swayBy / model.height, time);
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, places.length);
    places.forEach((p, i) => {
      quat.setFromAxisAngle(UP, p.spin);
      mesh.setMatrixAt(i, m4.compose(pos.set(p.x, heightAt(p.x, p.z) - model.box.min.y * p.sy - (p.sink || 0), p.z), quat, scl.set(p.sx, p.sy, p.sz)));
    });
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    scene.add(mesh);
  }
}
const pick = (list, r) => {
  let total = 0;
  for (const e of list) total += e[2] ?? 1;
  let k = r * total;
  for (const e of list) { k -= e[2] ?? 1; if (k <= 0) return e; }
  return list[list.length - 1];
};

// fallback: the hand-built meshes to take away once the pack is in. spots: where bushes and flower patches go.
export async function applyNaturePack(scene, obstacles, { fallback, bushSpots, flowerCentres }, shadows, time) {
  const names = [...Object.values(TREES).flat().map(e => e[0]), ...ROCKS, ...BUSHES.map(e => e[0]), ...FLOWERS.map(e => e[0])];
  let models;
  try { models = await load(names); } catch (err) { console.warn('Nature pack not loaded, keeping the hand-built scenery:', err); return false; }
  const rand = rng(404), byModel = new Map();
  const add = (name, place) => { if (!byModel.has(name)) byModel.set(name, []); byModel.get(name).push(place); };

  for (const t of obstacles.trees) {
    // woods to the west are mostly pine; one tree in twenty is something odd
    const r = rand(), kind = r < 0.05 ? 'rare' : (t.x < -110 ? rand() < 0.8 : rand() < 0.45) ? 'pine' : 'leafy';
    const [name, height] = pick(TREES[kind], rand()), k = (height * t.k) / models.get(name).height * (0.9 + rand() * 0.2);
    add(name, { x: t.x, z: t.z, spin: t.spin, sx: k, sy: k, sz: k, sink: 0.25 });
  }
  for (const r of obstacles.rocks) {
    // match the rock's solid footprint (r.r) and its bullet-stopping height
    const name = ROCKS[Math.floor(rand() * ROCKS.length)], m = models.get(name), k = (2.3 * r.r) / m.width;
    add(name, { x: r.x, z: r.z, spin: r.ry * 2, sx: k, sy: (r.sy * 1.7) / m.height, sz: k, sink: 0.3 });
  }
  for (const [x, z] of bushSpots) {
    const [name, height] = BUSHES[Math.floor(rand() * BUSHES.length)], k = height / models.get(name).height * (0.7 + rand() * 0.7);
    add(name, { x, z, spin: rand() * 6.28, sx: k, sy: k, sz: k, sink: 0.05 });
  }
  for (const [x, z] of flowerCentres) {
    for (let i = 0; i < 3; i++) {
      const [name, height] = FLOWERS[Math.floor(rand() * FLOWERS.length)], k = height / models.get(name).height * (0.7 + rand() * 0.6);
      const a = rand() * 6.28, d = rand() * 5;
      add(name, { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, spin: rand() * 6.28, sx: k, sy: k, sz: k });
    }
  }
  for (const [name, places] of byModel) {
    const small = BUSHES.some(e => e[0] === name) || FLOWERS.some(e => e[0] === name);
    scatter(scene, models.get(name), places, shadows && !FLOWERS.some(e => e[0] === name), time, small ? 0.25 : ROCKS.includes(name) ? 0 : 0.5);
  }
  for (const mesh of fallback) { scene.remove(mesh); mesh.geometry.dispose(); }
  return true;
}
