// Procedural low-poly placeholder models. All face +Z and stand on y = 0.
import * as THREE from 'three';

const M = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });

function box(mat, w, h, d, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function makeLeg(mat, len, t) {
  const pivot = new THREE.Group();
  pivot.add(box(mat, t, len, t * 1.3, 0, -len / 2, 0));
  pivot.add(box(mat, t * 1.2, t * 0.5, t * 2.2, 0, -len + t * 0.25, t * 0.6));
  return pivot;
}

function makeTail(mat, segs, w, h, len) {
  const root = new THREE.Group();
  root.userData.segs = [];
  let parent = root;
  for (let i = 0; i < segs; i++) {
    const k = 1 - (i / segs) * 0.75;
    const seg = new THREE.Group();
    seg.position.z = i === 0 ? 0 : -len;
    seg.add(box(mat, w * k, h * k, len, 0, 0, -len / 2));
    parent.add(seg);
    parent = seg;
    root.userData.segs.push(seg);
  }
  return root;
}

export function makeRider(shirtColor = 0x2f5d8a) {
  const shirt = M(shirtColor), skin = M(0xd9a377), hat = M(0x4a3222), dark = M(0x22262b), g = new THREE.Group();
  g.add(box(shirt, 0.55, 0.7, 0.35, 0, 0.5, 0));
  g.add(box(skin, 0.32, 0.32, 0.32, 0, 1.05, 0.02));
  for (const sx of [-1, 1]) {
    g.add(box(dark, 0.2, 0.7, 0.25, sx * 0.5, -0.1, 0.1));
    const arm = box(shirt, 0.16, 0.16, 0.6, sx * 0.3, 0.6, 0.35);
    g.add(arm);
  }
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 10), hat);
  brim.position.y = 1.22;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.28, 10), hat);
  crown.position.y = 1.37;
  brim.castShadow = crown.castShadow = true;
  g.add(brim, crown, box(dark, 0.1, 0.12, 1.3, 0.22, 0.58, 0.75));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.22, 0.58, 1.45);
  g.add(muzzle);
  return { group: g, muzzle };
}

export function buildBiped({ scale = 1, head = 1, body, belly, accent, rider = false }) {
  const root = new THREE.Group(), inner = new THREE.Group();
  inner.scale.setScalar(scale);
  root.add(inner);
  const bodyM = M(body), bellyM = M(belly), accM = M(accent), dark = M(0x15110f);
  const hip = 1.5;

  inner.add(box(bodyM, 0.9, 1.0, 2.0, 0, hip + 0.2, 0.1), box(bellyM, 0.7, 0.3, 1.7, 0, hip - 0.35, 0.1));
  const neck = box(bodyM, 0.5, 0.95, 0.5, 0, hip + 0.85, 1.0);
  neck.rotation.x = 0.5;
  inner.add(neck);

  const headG = new THREE.Group();
  headG.position.set(0, hip + 1.35, 1.3);
  headG.add(box(bodyM, 0.6 * head, 0.5 * head, 1.1 * head, 0, 0, 0.35 * head));
  const jaw = box(bellyM, 0.5 * head, 0.15 * head, 0.9 * head, 0, -0.32 * head, 0.35 * head);
  headG.add(jaw);
  for (const sx of [-1, 1]) headG.add(box(dark, 0.05, 0.12 * head, 0.12 * head, sx * 0.31 * head, 0.08 * head, 0.2 * head));
  inner.add(headG);

  const tail = makeTail(bodyM, 4, 0.6, 0.6, 0.75);
  tail.position.set(0, hip + 0.25, -0.9);
  inner.add(tail);

  const legs = [-1, 1].map((sx, i) => {
    const pivot = makeLeg(bodyM, 1.4, 0.3);
    pivot.position.set(sx * 0.4, hip - 0.1, -0.1);
    inner.add(pivot);
    const arm = box(bodyM, 0.15, 0.5, 0.15, sx * 0.42, hip - 0.1, 0.95);
    arm.rotation.x = -0.6;
    inner.add(arm);
    return { pivot, phase: i * Math.PI };
  });

  for (let i = 0; i < 4; i++) inner.add(box(accM, 0.25, 0.18, 0.3, 0, hip + 0.78, -0.6 + i * 0.45));

  if (rider) {
    inner.add(box(M(0x5a3a22), 1.0, 0.2, 0.9, 0, hip + 0.82, 0));
    const r = makeRider();
    r.group.position.set(0, hip + 1.0, 0);
    inner.add(r.group);
    root.userData.muzzle = r.muzzle;
  }
  root.userData.rig = { inner, legs, tail, head: headG, headZ: headG.position.z, jaw, t: 0 };
  return root;
}

export function buildQuad({ scale = 1, body, belly, accent }) {
  const root = new THREE.Group(), inner = new THREE.Group();
  inner.scale.setScalar(scale);
  root.add(inner);
  const bodyM = M(body), bellyM = M(belly), accM = M(accent), horn = M(0xe8e0c8);

  inner.add(box(bodyM, 1.7, 1.5, 3.2, 0, 1.75, 0), box(bellyM, 1.4, 0.3, 2.8, 0, 0.95, 0));
  const headG = new THREE.Group();
  headG.position.set(0, 1.9, 1.7);
  headG.add(box(bodyM, 1.1, 1.0, 1.3, 0, 0, 0.5), box(bellyM, 0.6, 0.5, 0.5, 0, -0.2, 1.3));
  const frill = box(accM, 2.2, 1.7, 0.2, 0, 0.55, -0.1);
  frill.rotation.x = -0.35;
  headG.add(frill);
  const cone = (len, x, y, z, tilt) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.13, len, 6), horn);
    c.position.set(x, y, z);
    c.rotation.x = tilt;
    c.castShadow = true;
    headG.add(c);
  };
  cone(1.1, -0.35, 0.55, 1.2, 1.2);
  cone(1.1, 0.35, 0.55, 1.2, 1.2);
  cone(0.5, 0, 0.2, 1.5, 0.7);
  inner.add(headG);

  const tail = makeTail(bodyM, 3, 0.9, 0.8, 0.8);
  tail.position.set(0, 1.8, -1.6);
  inner.add(tail);

  const legs = [];
  [[-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0]].forEach(([sx, sz, phase]) => {
    const pivot = makeLeg(bodyM, 1.1, 0.42);
    pivot.position.set(sx * 0.6, 1.1, sz * 1.1);
    inner.add(pivot);
    legs.push({ pivot, phase });
  });
  root.userData.rig = { inner, legs, tail, head: headG, headZ: headG.position.z, jaw: null, t: 0 };
  return root;
}

// speed01: 0 idle .. 1 full run; attack01: 1 at the moment of a bite, decaying to 0
export function animateRig(rig, dt, speed01, attack01) {
  rig.t += dt * (2 + speed01 * 9);
  const t = rig.t;
  for (const l of rig.legs) l.pivot.rotation.x = Math.sin(t + l.phase) * 0.75 * speed01;
  rig.tail.userData.segs.forEach((seg, i) => { seg.rotation.y = Math.sin(t * 0.5 + i * 0.7) * (0.08 + 0.1 * speed01); });
  rig.inner.position.y = Math.abs(Math.sin(t)) * 0.1 * speed01 * rig.inner.scale.y;
  rig.head.rotation.x = Math.sin(t * 0.4) * 0.04 + attack01 * 0.5;
  rig.head.position.z = rig.headZ + attack01 * 0.5;
  if (rig.jaw) rig.jaw.rotation.x = attack01 * 0.5;
}
