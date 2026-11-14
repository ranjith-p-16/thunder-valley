// The sky: a gradient dome, sun and moon discs, stars at night and slow chunky clouds.
import * as THREE from 'three';

const R = 560;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createSky(scene, quality) {
  const group = new THREE.Group();
  scene.add(group);

  // gradient dome: horizon colour at eye level blending up to the zenith colour
  const uniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 12), new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying float h; void main() { h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying float h; void main() { float k = pow(clamp(h * 1.25, 0.0, 1.0), 0.6); gl_FragColor = vec4(mix(horizon, top, k), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  }));
  dome.renderOrder = -10;
  group.add(dome);

  const glow = glowTexture();
  const disc = (size, color, halo) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CircleGeometry(size, 24), new THREE.MeshBasicMaterial({ color, fog: false, depthWrite: false }));
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    aura.scale.setScalar(size * halo);
    g.add(aura, body);
    aura.renderOrder = -8; body.renderOrder = -8;
    group.add(g);
    return { g, body, aura };
  };
  const sun = disc(26, 0xfff3c4, 9), moon = disc(17, 0xdfe7ff, 5);

  // stars only on the upper half of the dome
  const STARS = quality === 'high' ? 700 : 300, pos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    const a = Math.random() * Math.PI * 2, y = 0.08 + Math.random() * 0.92, r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * (R - 20), y * (R - 20), Math.sin(a) * r * (R - 20)], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  stars.renderOrder = -9;
  group.add(stars);

  // clouds: a few flattened lumps each, drifting east and wrapping round
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.92, depthWrite: false });
  const lump = new THREE.IcosahedronGeometry(1, 1), clouds = [];
  for (let i = 0; i < (quality === 'high' ? 16 : 8); i++) {
    const c = new THREE.Group(), n = 3 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(lump, cloudMat);
      m.scale.set(14 + Math.random() * 16, 5 + Math.random() * 4, 9 + Math.random() * 9);
      m.position.set((k - n / 2) * 15 + Math.random() * 6, Math.random() * 4, Math.random() * 10 - 5);
      m.renderOrder = -7;
      c.add(m);
    }
    c.userData = { x: Math.random() * 900 - 450, z: Math.random() * 760 - 380, y: 95 + Math.random() * 55, speed: 1.2 + Math.random() * 1.6 };
    group.add(c);
    clouds.push(c);
  }

  // two rings of far hills beyond the valley edge, tinted toward the horizon so they read as distance
  const ridge = (radius, lo, hi, seed) => {
    const N = 80, v = [], hash = (i) => { const k = Math.sin(i * 127.1 + seed) * 43758.5453; return k - Math.floor(k); };
    const top = (i) => { const a = (i / N) * Math.PI * 2, r = radius + hash(i + 50) * 40; return [Math.cos(a) * r, lo + hash(i % N) * (hi - lo), Math.sin(a) * r]; };
    for (let i = 0; i < N; i++) {
      const a = top(i), b = top((i + 1) % N);
      v.push(a[0], -40, a[2], b[0], -40, b[2], a[0], a[1], a[2], b[0], -40, b[2], b[0], b[1], b[2], a[0], a[1], a[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ fog: false, side: THREE.DoubleSide }));
    mesh.renderOrder = -6;
    scene.add(mesh);
    return mesh;
  };
  const nearHills = ridge(400, 28, 80, 1.7), farHills = ridge(500, 60, 140, 9.3);
  const HILL_NEAR = new THREE.Color(0x3c5a4c), HILL_FAR = new THREE.Color(0x587092);

  const dir = new THREE.Vector3();
  // sunAngle: 0 at sunrise, PI/2 at noon. Colours come from the caller so fog and sky always agree.
  function update({ camera, sunAngle, dayK, top, horizon, cloudTint, dt, blood }) {
    moon.body.material.color.setHex(blood ? 0xd0402a : 0xdfe7ff);
    moon.aura.material.color.setHex(blood ? 0xd0402a : 0xdfe7ff);
    group.position.copy(camera.position);
    // the far hills travel with the rider, so the horizon never opens up or closes in
    nearHills.position.set(camera.position.x, 0, camera.position.z);
    farHills.position.set(camera.position.x, 0, camera.position.z);
    uniforms.top.value.copy(top);
    uniforms.horizon.value.copy(horizon);
    dir.set(Math.cos(sunAngle), Math.sin(sunAngle), 0.35).normalize();
    sun.g.position.copy(dir).multiplyScalar(R - 30);
    sun.g.lookAt(camera.position);
    moon.g.position.copy(dir).multiplyScalar(-(R - 30));
    moon.g.lookAt(camera.position);
    sun.g.visible = dir.y > -0.12;
    moon.g.visible = moon.g.position.y > -40;
    stars.material.opacity = Math.max(0, 1 - dayK * 2.2);
    nearHills.material.color.copy(HILL_NEAR).multiplyScalar(0.25 + dayK * 0.75).lerp(horizon, 0.45);
    farHills.material.color.copy(HILL_FAR).multiplyScalar(0.25 + dayK * 0.75).lerp(horizon, 0.68);
    cloudMat.color.copy(cloudTint);
    cloudMat.opacity = 0.55 + dayK * 0.37;
    for (const c of clouds) {
      const u = c.userData;
      u.x += u.speed * dt;
      if (u.x > 460) u.x = -460;
      c.position.set(u.x, u.y, u.z);
    }
  }
  return { update };
}
