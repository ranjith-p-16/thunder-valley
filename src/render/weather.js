// Weather you can see: rain streaks, blowing dust, and the fog and light each kind brings.
import * as THREE from 'three';

const LOOK = {
  rain: { near: 40, far: 260, color: new THREE.Color(0x6f7c88), tint: 0.7, dim: 0.45 },
  fog:  { near: 6, far: 115, color: new THREE.Color(0xc9cfd2), tint: 0.85, dim: 0.35 },
  dust: { near: 10, far: 150, color: new THREE.Color(0xc79a5e), tint: 0.85, dim: 0.3 },
};
const BOX = 60, TALL = 34;

export function createWeather(scene, quality) {
  const nRain = quality === 'high' ? 1400 : 600, nDust = quality === 'high' ? 500 : 220;
  const rainPos = new Float32Array(nRain * 6), dustPos = new Float32Array(nDust * 3);
  const rnd = (n) => (Math.random() - 0.5) * n;
  for (let i = 0; i < nRain; i++) {
    const x = rnd(BOX), y = Math.random() * TALL, z = rnd(BOX);
    rainPos.set([x, y, z, x + 0.25, y - 1.3, z], i * 6);
  }
  for (let i = 0; i < nDust; i++) dustPos.set([rnd(BOX), Math.random() * 9, rnd(BOX)], i * 3);
  const rainGeo = new THREE.BufferGeometry(), dustGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xc4d4e4, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xd9b27a, size: 0.55, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  rain.frustumCulled = dust.frustumCulled = false;
  rain.visible = dust.visible = false;
  scene.add(rain, dust);

  // shown: the kind on screen now; k: how fully it has come in. A change fades the old out before the new comes in.
  let shown = 'clear', k = 0, flash = 0;
  const out = { k: 0, near: 0, far: 0, color: new THREE.Color(), tint: 0, dim: 0, flash: 0 };
  function update(dt, kind, cam) {
    if (!LOOK[kind]) kind = 'clear';
    if (kind !== shown) { k = Math.max(0, k - dt / 4); if (k === 0) shown = kind; }
    else if (shown !== 'clear') k = Math.min(1, k + dt / 6);
    flash = Math.max(0, flash - dt * 3);
    const look = LOOK[shown];
    rain.visible = shown === 'rain' && k > 0;
    dust.visible = shown === 'dust' && k > 0;
    if (rain.visible) {
      rain.material.opacity = 0.5 * k;
      rain.position.set(cam.x, cam.y - TALL / 2, cam.z);
      const fall = 46 * dt;
      for (let i = 0; i < nRain; i++) {
        let y = rainPos[i * 6 + 1] - fall;
        if (y < 0) y += TALL;
        rainPos[i * 6 + 1] = y; rainPos[i * 6 + 4] = y - 1.3;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    if (dust.visible) {
      dust.material.opacity = 0.55 * k;
      dust.position.set(cam.x, cam.y - 5, cam.z);
      const blow = 16 * dt;
      for (let i = 0; i < nDust; i++) {
        let x = dustPos[i * 3] + blow;
        if (x > BOX / 2) x -= BOX;
        dustPos[i * 3] = x;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }
    out.k = look ? k : 0;
    out.flash = flash;
    if (look) Object.assign(out, { near: look.near, far: look.far, tint: look.tint, dim: look.dim }), out.color.copy(look.color);
    return out;
  }
  return { update, thunder: () => { flash = 1; } };
}
