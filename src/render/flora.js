// Plants: two kinds of tree, bushes, swaying grass and flowers. All drawn in batches, none of it solid except tree trunks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, heightAt, rng } from '../sim/terrain.js';
import { PEN, WATER_Y } from '../data/content.js';
import { TOWN } from '../data/items.js';

export { WATER_Y };
const m4 = new THREE.Matrix4(), quat = new THREE.Quaternion(), scl = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);

// Leaves and grass lean with the wind: the shader pushes each vertex sideways by its height.
function sway(material, strength, time) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 root = instanceMatrix[3].xyz;
      #else
        vec3 root = vec3(0.0);
      #endif
      float bend = max(position.y, 0.0) * ${strength.toFixed(3)};
      transformed.x += sin(uTime * 1.7 + root.x * 0.35 + root.z * 0.2) * bend;
      transformed.z += cos(uTime * 1.3 + root.z * 0.3) * bend * 0.6;`);
  };
  return material;
}

function pineGeometry() {
  // three stacked cones, widest at the bottom
  const tiers = [[2.4, 3.4, 3.6], [1.9, 3.0, 5.6], [1.3, 2.6, 7.4]].map(([r, h, y]) => new THREE.ConeGeometry(r, h, 7).translate(0, y, 0));
  return mergeGeometries(tiers);
}
function crownGeometry() {
  const blobs = [[2.6, 0, 5.2, 0], [1.9, 1.5, 6.3, 0.6], [1.7, -1.3, 6.0, -0.8]].map(([r, x, y, z]) => new THREE.IcosahedronGeometry(r, 0).translate(x, y, z));
  return mergeGeometries(blobs);
}

export function buildTrees(scene, trees, shadows, time) {
  const pines = trees.filter((t, i) => (i * 7 + Math.floor(t.spin * 10)) % 5 < 3 || t.x < -110), leafy = trees.filter(t => !pines.includes(t));
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, flatShading: true, roughness: 1 });
  const rand = rng(21);
  const made = [];
  const batch = (list, leafGeo, trunkH, hue, sat) => {
    if (!list.length) return;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.5, trunkH, 6).translate(0, trunkH / 2, 0), trunkMat, list.length);
    const leaves = new THREE.InstancedMesh(leafGeo, sway(new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1 }), 0.012, time), list.length);
    list.forEach((t, i) => {
      quat.setFromAxisAngle(UP, t.spin);
      m4.compose(pos.set(t.x, heightAt(t.x, t.z) - 0.2, t.z), quat, scl.setScalar(t.k));
      trunks.setMatrixAt(i, m4);
      leaves.setMatrixAt(i, m4);
      leaves.setColorAt(i, col.setHSL(hue + rand() * 0.07, sat, 0.24 + rand() * 0.13));
    });
    trunks.castShadow = leaves.castShadow = shadows;
    leaves.receiveShadow = shadows;
    scene.add(trunks, leaves);
    made.push(trunks, leaves);
  };
  batch(pines, pineGeometry(), 3.2, 0.33, 0.42);
  batch(leafy, crownGeometry(), 4.4, 0.24, 0.5);
  return made;
}

export function createFlora(scene, obstacles, quality, time) {
  const rand = rng(77), high = quality === 'high';
  const dry = (x, z) => heightAt(x, z) > WATER_Y + 0.5;
  const open = (x, z) => Math.hypot(x - TOWN.x, z - TOWN.z) > TOWN.r - 6 && Math.hypot(x - PEN.x, z - PEN.z) > PEN.r + 1;
  const scatter = (n, ok) => {
    const out = [];
    for (let tries = 0; out.length < n && tries < n * 6; tries++) {
      const x = (rand() - 0.5) * WORLD.size * 0.94, z = (rand() - 0.5) * WORLD.size * 0.94;
      if (ok(x, z)) out.push([x, z]);
    }
    return out;
  };

  // grass: each tuft is three thin blades
  const blade = (ang, lean) => {
    const g = new THREE.BufferGeometry(), c = Math.cos(ang), s = Math.sin(ang), w = 0.1;
    const A = [-w * c, 0, -w * s], B = [w * c, 0, w * s], T = [lean * s, 0.5, lean * c];
    // both windings with the same upward normal, so a blade is lit alike from either side
    g.setAttribute('position', new THREE.Float32BufferAttribute([...A, ...B, ...T, ...B, ...A, ...T], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    return g;
  };
  const tuft = mergeGeometries([blade(0, 0.1), blade(2.1, -0.12), blade(4.2, 0.06)]);
  const spots = scatter(high ? 30000 : 8000, (x, z) => dry(x, z) && open(x, z) && heightAt(x, z) < 6.5);
  const grass = new THREE.InstancedMesh(tuft, sway(new THREE.MeshLambertMaterial({ color: 0xffffff }), 0.16, time), spots.length);
  spots.forEach(([x, z], i) => {
    quat.setFromAxisAngle(UP, rand() * 6.28);
    const k = 0.8 + rand() * 1.5;
    grass.setMatrixAt(i, m4.compose(pos.set(x, heightAt(x, z) - 0.05, z), quat, scl.set(k, k * (0.8 + rand() * 0.6), k)));
    grass.setColorAt(i, col.setHSL(0.25 + rand() * 0.06, 0.5 + rand() * 0.12, 0.27 + rand() * 0.1));
  });
  grass.receiveShadow = high;
  scene.add(grass);

  // flowers in loose patches
  const petals = new THREE.OctahedronGeometry(0.16, 0).translate(0, 0.55, 0), stem = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 3).translate(0, 0.25, 0);
  const flowerSpots = [], hues = [0.14, 0.0, 0.92, 0.6, 0.1];
  const flowerCentres = scatter(high ? 70 : 30, (x, z) => dry(x, z) && open(x, z));
  for (const [cx, cz] of flowerCentres) {
    const hue = hues[Math.floor(rand() * hues.length)];
    for (let i = 0; i < 12; i++) {
      const a = rand() * 6.28, r = rand() * 7, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (dry(x, z)) flowerSpots.push([x, z, hue]);
    }
  }
  const heads = new THREE.InstancedMesh(petals, sway(new THREE.MeshLambertMaterial({ color: 0xffffff }), 0.1, time), flowerSpots.length);
  const stems = new THREE.InstancedMesh(stem, sway(new THREE.MeshLambertMaterial({ color: 0x4f8a3a }), 0.1, time), flowerSpots.length);
  flowerSpots.forEach(([x, z, hue], i) => {
    const k = 0.8 + rand() * 0.7;
    m4.compose(pos.set(x, heightAt(x, z), z), quat.setFromAxisAngle(UP, rand() * 6.28), scl.setScalar(k));
    heads.setMatrixAt(i, m4);
    stems.setMatrixAt(i, m4);
    heads.setColorAt(i, col.setHSL(hue, hue === 0.1 ? 0.1 : 0.8, hue === 0.1 ? 0.92 : 0.62));
  });
  scene.add(heads, stems);

  // bushes: low dark lumps, mostly near trees
  const bushSpots = [];
  for (const t of obstacles.trees) if (rand() < 0.4) { const a = rand() * 6.28, r = 2.5 + rand() * 4; bushSpots.push([t.x + Math.cos(a) * r, t.z + Math.sin(a) * r]); }
  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), sway(new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1 }), 0.02, time), bushSpots.length);
  let n = 0;
  for (const [x, z] of bushSpots) {
    if (!dry(x, z) || !open(x, z)) continue;
    quat.setFromAxisAngle(UP, rand() * 6.28);
    bushes.setMatrixAt(n, m4.compose(pos.set(x, heightAt(x, z) + 0.35, z), quat, scl.set(0.9 + rand() * 0.9, 0.6 + rand() * 0.5, 0.9 + rand() * 0.9)));
    bushes.setColorAt(n++, col.setHSL(0.27 + rand() * 0.07, 0.4, 0.2 + rand() * 0.1));
  }
  bushes.count = n;
  bushes.castShadow = high;
  scene.add(bushes);
  // where the bushes and flower patches are, and the hand-built bushes, for the model pack to take over
  return { bushSpots: bushSpots.filter(([x, z]) => dry(x, z) && open(x, z)), flowerCentres, fallback: [bushes] };
}

// Shallow ponds fill the lowest ground. The surface ripples; the facets catch the light.
export function createWater(scene) {
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, 72, 72);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3d93a6, transparent: true, opacity: 0.78, roughness: 0.12, metalness: 0.15, flatShading: true });
  const water = new THREE.Mesh(geo, mat);
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  scene.add(water);
  const p = geo.attributes.position;
  return {
    update(t, tint) {
      for (let i = 0; i < p.count; i++) p.setY(i, Math.sin(p.getX(i) * 0.21 + t * 1.1) * 0.09 + Math.cos(p.getZ(i) * 0.17 + t * 0.8) * 0.09);
      p.needsUpdate = true;
      mat.color.copy(tint);
    },
  };
}
