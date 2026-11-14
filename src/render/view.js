// Draws the game state. Reads from the rules, never writes to them.
import * as THREE from 'three';
import { heightAt, lerpAngle } from '../sim/terrain.js';
import { MOUNTS } from '../data/content.js';
import { buildWorld, showTownOwner } from './world.js';
import { createModel } from './assets.js';
import { makeRider } from './dinos.js';
import { FOOT, THROWN } from '../data/items.js';
import { createSky } from './sky.js';
import { createFlora, createWater } from './flora.js';
import { buildTownProps, buildCampProps } from './townprops.js';
import { applyNaturePack } from './naturepack.js';
import { createWeather } from './weather.js';
import { personFor } from './people.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const lerp = (a, b, k) => a + (b - a) * k;
const WHITE = new THREE.Color(0xffffff), BLOOD = new THREE.Color(0x5a1410);
const smooth = (lo, hi, v) => { const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo))); return t * t * (3 - 2 * t); };
// sky colours: `top` overhead and `low` at the horizon, for night, day and the warm light of dawn and dusk
const SKY = {
  top: { night: new THREE.Color(0x050916), day: new THREE.Color(0x4f9ad6), warm: new THREE.Color(0x6a7fb8) },
  low: { night: new THREE.Color(0x141c38), day: new THREE.Color(0xcfe4ee), warm: new THREE.Color(0xf6a468) },
};
const WATER = { night: new THREE.Color(0x12283a), day: new THREE.Color(0x3d93a6) };
const GROUND_LIGHT = { night: new THREE.Color(0x1a2030), day: new THREE.Color(0x7a6a44) };
// The camera boom. Between pitch `from` and `to` (looking down) its length shrinks to `back` of normal and its pivot
// drops to `height` of normal, never above `maxHeight`. `probe` is the spacing of the scenery checks along it.
const BOOM = { from: -0.35, to: -0.9, back: 0.4, height: 0.75, maxHeight: 3.8, min: 1, probe: 0.6 };
const SUN = { night: new THREE.Color(0x7089d0), day: new THREE.Color(0xfff1d6), warm: new THREE.Color(0xffa860) };

export function createView(canvas, sim, quality, settings = {}) {
  const { state } = sim, { player } = state;
  const high = quality === 'high';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: high });
  renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 2 : 1));
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 110, 460);
  const windTime = { value: 0 };   // shared clock for everything that sways
  const weatherFx = createWeather(scene, quality);
  // Silas's wagon, by the general store on the days he is in town
  const wagon = new THREE.Group();
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 }), cloth = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 1 }), iron = new THREE.MeshStandardMaterial({ color: 0x2c2622, roughness: 0.8 });
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 5), wood); bed.position.y = 1.5;
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 4.6, 12), cloth); cover.rotation.x = Math.PI / 2; cover.position.y = 2.05;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 3), wood); shaft.position.set(0, 1.1, 3.8); shaft.rotation.x = 0.25;
    wagon.add(bed, cover, shaft);
    for (const [x, z] of [[1.45, 1.7], [-1.45, 1.7], [1.45, -1.7], [-1.45, -1.7]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.2, 12), iron); w.rotation.z = Math.PI / 2; w.position.set(x, 0.85, z); wagon.add(w);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc46a })); lamp.position.set(1.5, 2.6, 2.4); wagon.add(lamp);
    wagon.traverse(o => { if (o.isMesh) o.castShadow = true; });
    wagon.position.set(21, heightAt(21, 3), 3); wagon.rotation.y = 1.2; wagon.visible = false;
    scene.add(wagon);
  }
  const silas = personFor('silas', { height: 3 });
  silas.root.position.set(17.5, heightAt(17.5, 5.5), 5.5); silas.root.rotation.y = -2.2; silas.root.visible = false;
  scene.add(silas.root);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 700);
  // High quality draws through a bloom pass: lanterns, fires, the sun and muzzle flashes glow softly.
  let composer = null;
  if (high) {
    const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.7, 0.92));
    composer.addPass(new OutputPass());
  }
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); }
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b5a3a, 1);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.castShadow = high;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 320 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.5;
  sun.shadow.radius = 3;
  scene.add(hemi, sun, sun.target);
  const { flags, penFlag, fallback } = buildWorld(scene, state.obstacles, state.outposts, high, windTime);
  const skyDome = createSky(scene, quality), water = createWater(scene), townProps = buildTownProps(scene, high);
  buildCampProps(scene, high);
  const flora = createFlora(scene, state.obstacles, quality, windTime);
  // the detailed tree, rock and bush models replace the hand-built ones when they arrive (high quality only: they are heavy)
  if (high) applyNaturePack(scene, state.obstacles, { fallback: [...fallback, ...flora.fallback], bushSpots: flora.bushSpots, flowerCentres: flora.flowerCentres }, high, windTime);
  const muzzleFlash = new THREE.PointLight(0xffd9a0, 0, 28);
  scene.add(muzzleFlash);

  // ---- creatures ----
  let riderModel = null, riderMount = -1;
  const views = new Map();
  const viewOf = (e, assetId, withBar) => {
    let v = views.get(e);
    if (!v) {
      v = { model: createModel(assetId), bar: null };
      if (withBar) {
        v.bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xe5484d, depthTest: false }));
        v.model.root.add(v.bar);
      }
      scene.add(v.model.root);
      views.set(e, v);
    }
    return v;
  };
  function place(root, e, alpha) {
    const x = lerp(e.ox, e.x, alpha), z = lerp(e.oz, e.z, alpha);
    root.position.set(x, heightAt(x, z), z);
    root.rotation.y = lerpAngle(e.oyaw, e.yaw, alpha);
  }
  function drawCreature(e, v, dt, alpha, attack) {
    const root = v.model.root;
    place(root, e, alpha);
    if (e.dead) {
      v.model.update(dt, 0, 0, true);
      root.rotation.z = v.model.hasDeathAnim ? 0 : Math.min(e.deadT / 0.4, 1) * Math.PI / 2;
      root.visible = e.deadT < 4.5 && !e.tamed;   // a tamed animal walks off with you: no body left behind
      return;
    }
    root.visible = true;
    root.rotation.z = 0;
    v.model.update(dt, e.moving, attack);
  }

  // ---- bullets, rope, holler wave ----
  const bulletGeo = new THREE.SphereGeometry(0.16, 6, 6), bulletMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const bulletMeshes = state.bullets.map(() => {
    const mesh = new THREE.Mesh(bulletGeo, bulletMat);
    mesh.scale.set(1, 1, 5);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xe8d9a8 }));
  rope.frustumCulled = false;
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  wave.rotation.x = -Math.PI / 2;
  wave.visible = false;
  scene.add(rope, wave);
  let waveT = 1, waveR = 1;

  // ---- dust: chunky puffs that swell and shrink, no transparency needed ----
  const DUST = 220;
  const dustMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xd8c49a, flatShading: true, roughness: 1 }), DUST);
  dustMesh.frustumCulled = false;
  const dust = Array.from({ length: DUST }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 1, life: 1, size: 0 }));
  let dustNext = 0;
  function puff(x, y, z, n, size, spread) {
    for (let i = 0; i < n; i++) {
      const d = dust[dustNext = (dustNext + 1) % DUST], a = Math.random() * 6.28;
      Object.assign(d, { x, y, z, vx: Math.cos(a) * spread * Math.random(), vy: 0.6 + Math.random() * 1.2, vz: Math.sin(a) * spread * Math.random(),
        age: 0, life: 0.5 + Math.random() * 0.6, size: size * (0.6 + Math.random() * 0.8) });
    }
  }
  const dustM = new THREE.Matrix4(), dustQ = new THREE.Quaternion(), dustS = new THREE.Vector3(), dustP = new THREE.Vector3();
  function updateDust(dt) {
    dust.forEach((d, i) => {
      let k = 0;
      if (d.age < d.life) {
        d.age += dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        d.vy *= 1 - 1.5 * dt;
        k = Math.sin(Math.PI * Math.min(1, d.age / d.life)) * d.size;
      }
      dustMesh.setMatrixAt(i, dustM.compose(dustP.set(d.x, d.y, d.z), dustQ, dustS.setScalar(k)));
    });
    dustMesh.instanceMatrix.needsUpdate = true;
  }
  scene.add(dustMesh);
  // feet kick up dust in proportion to speed, only near the camera
  function trail(e, dt, rate, size) {
    if (e.dead || e.moving < 0.55 || Math.hypot(e.x - player.x, e.z - player.z) > 110) return;
    if (Math.random() < rate * e.moving * dt) puff(e.x, heightAt(e.x, e.z) + 0.3, e.z, 1, size, 1.2);
  }

  // ---- the rider on foot, loot bags, dynamite, traps and the job marker ----
  const walker = makeRider();
  walker.group.scale.setScalar(1.6);
  walker.group.position.y = 0.75;
  const walkerRoot = new THREE.Group(), walkerBody = personFor('rider', { height: 3, placeholder: walker.group });
  // the gun's muzzle stays where the box figure had it, whichever figure is showing
  walker.muzzle.position.set(0.35, 2.1, 1.6);
  walkerRoot.add(walkerBody.root, walker.muzzle);
  walkerRoot.visible = false;
  scene.add(walkerRoot);

  const pool = (make) => {
    const live = new Map();
    // shows one mesh per item id and drops meshes whose item is gone
    return (items, each) => {
      if (live.size) {
        const ids = new Set(items.map(i => i.id));
        for (const [id, mesh] of live) if (!ids.has(id)) { scene.remove(mesh); live.delete(id); }
      }
      for (const item of items) {
        let mesh = live.get(item.id);
        if (!mesh) { mesh = make(); scene.add(mesh); live.set(item.id, mesh); }
        each(mesh, item);
      }
    };
  };
  const bagGeo = new THREE.DodecahedronGeometry(0.7, 0), bagMat = new THREE.MeshStandardMaterial({ color: 0xc9953a, flatShading: true, emissive: 0x3a2500 });
  const drawLoot = pool(() => new THREE.Mesh(bagGeo, bagMat));
  // supply caches: a strapped crate with a small flag so it can be picked out across the grass
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x9a6a38, flatShading: true }), strapMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, flatShading: true }), flagMat = new THREE.MeshBasicMaterial({ color: 0xffd84d, side: THREE.DoubleSide });
  const drawCaches = pool(() => {
    const g = new THREE.Group(), box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.2), crateMat), strap = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.18, 1.26), strapMat);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), strapMat), flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), flagMat);
    box.position.y = 0.55; strap.position.y = 0.6; pole.position.set(0.7, 1.6, 0.5); flag.position.set(1.15, 2.9, 0.5);
    box.castShadow = true;
    g.add(box, strap, pole, flag);
    return g;
  });
  const stickGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.9, 6), stickMat = new THREE.MeshStandardMaterial({ color: 0xc23b2e, flatShading: true, emissive: 0x400000 });
  const drawSticks = pool(() => new THREE.Mesh(stickGeo, stickMat));
  const trapGeo = new THREE.TorusGeometry(1.1, 0.14, 5, 12), trapMat = new THREE.MeshStandardMaterial({ color: 0x55595e, flatShading: true });
  const drawTraps = pool(() => { const m = new THREE.Mesh(trapGeo, trapMat); m.rotation.x = Math.PI / 2; return m; });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd84d, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  beam.visible = false;
  scene.add(beam);
  const blast = new THREE.PointLight(0xffb060, 0, 60);
  scene.add(blast);

  // ---- townsfolk, posse mates, quest pickups and the tracer of a mate's shot ----
  const npcViews = new Map();
  let npcTime = 0, npcDt = 0;
  function drawNpcs(time, questMark) {
    npcDt = Math.min(0.1, Math.max(0, time - npcTime)); npcTime = time;
    silas.root.visible = wagon.visible;
    if (wagon.visible) silas.update(npcDt);
    for (const n of state.npcs || []) {
      let v = npcViews.get(n.id);
      if (!v) {
        const fig = makeRider(n.color), root = new THREE.Group();
        fig.group.scale.setScalar(1.6);
        fig.group.position.y = 0.75;
        const body = personFor(n.id, { height: 3, placeholder: fig.group });
        const mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: 0xffd84d, fog: false }));
        root.add(body.root, mark);
        scene.add(root);
        v = { root, mark, body };
        npcViews.set(n.id, v);
      }
      v.root.visible = !n.hidden;
      if (!n.hidden && Math.hypot(n.x - player.x, n.z - player.z) < 140) v.body.update(npcDt);
      v.root.position.set(n.x, heightAt(n.x, n.z), n.z);
      v.root.rotation.y = n.yaw;
      // a gold marker bobs over whoever the current quest step wants you to talk to
      v.mark.visible = !!questMark && Math.hypot(questMark.x - n.x, questMark.z - n.z) < 1;
      v.mark.position.y = 4.4 + Math.sin(time * 3) * 0.25;
      v.mark.rotation.y = time * 2;
    }
  }
  const mateViews = new Map();
  function drawMates(dt, alpha) {
    for (const m of state.mates || []) {
      let model = mateViews.get(m.id);
      if (!model) { model = createModel(MOUNTS[m.mount].id); scene.add(model.root); mateViews.set(m.id, model); }
      place(model.root, m, alpha);
      model.update(dt, m.moving, 0);
      trail(m, dt, 20, 0.5);
    }
    for (const [id, model] of mateViews) if (!(state.mates || []).some(m => m.id === id)) { scene.remove(model.root); model.dispose?.(); mateViews.delete(id); }
  }
  const herbGeo = new THREE.ConeGeometry(0.5, 1.4, 5), herbMat = new THREE.MeshStandardMaterial({ color: 0x7fe08a, emissive: 0x1f6a2a, flatShading: true });
  const drawPickups = pool(() => new THREE.Mesh(herbGeo, herbMat));
  // the gang's fire pits: a ring of stones round a blaze
  const pitFlame = new THREE.MeshStandardMaterial({ color: 0x402010, emissive: 0xff6a18, emissiveIntensity: 2.6 });
  const pitStone = new THREE.MeshStandardMaterial({ color: 0x5a554c, flatShading: true });
  const drawFirePits = pool(() => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.4, 6), pitFlame));
    for (let i = 0; i < 8; i++) { const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), pitStone); st.position.set(Math.cos(i * 0.785) * 2.3, -1.4, Math.sin(i * 0.785) * 2.3); g.add(st); }
    return g;
  });
  let shake = 0;
  const TRACER = { mateShot: 0xfff2b0, gunfire: 0xffa040, spit: 0x8fe060 };
  const tracers = Array.from({ length: 8 }, () => {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    line.visible = false;
    scene.add(line);
    return { line, t: 0 };
  });
  let tracerNext = 0;
  function tracer(ev) {
    const tr = tracers[tracerNext = (tracerNext + 1) % tracers.length], y1 = heightAt(ev.x1, ev.z1) + (ev.high || 4), y2 = heightAt(ev.x2, ev.z2) + 2.2;
    tr.line.material.color.setHex(TRACER[ev.type]);
    tr.line.position.set((ev.x1 + ev.x2) / 2, (y1 + y2) / 2, (ev.z1 + ev.z2) / 2);
    tr.line.scale.set(ev.type === 'spit' ? 2.2 : 1, ev.type === 'spit' ? 2.2 : 1, Math.hypot(ev.x2 - ev.x1, y2 - y1, ev.z2 - ev.z1));
    tr.line.lookAt(ev.x2, y2, ev.z2);
    tr.t = 0.16;
    puff(ev.x1, y1, ev.z1, 2, 0.35, 1.5);   // a puff of smoke where the shot came from
  }

  function onEvents(events) {
    for (const ev of events) {
      if (ev.type === 'mateShot' || ev.type === 'spit' || ev.type === 'gunfire') tracer(ev);
      if (ev.type === 'thunder') weatherFx.thunder();
      if (ev.type === 'stagger') { puff(ev.x, heightAt(ev.x, ev.z) + 2, ev.z, 10, 1, 4); shake = Math.max(shake, 0.25); }
      if (ev.type === 'move' && ev.kind !== 'soothe' && ev.kind !== 'guard') shake = Math.max(shake, 0.5);
      if (ev.type === 'boom') shake = Math.max(shake, 1.1);
      else if (ev.type === 'hurt') shake = Math.max(shake, 0.45);
      else if (ev.type === 'ability' && ['Roar', 'Stomp', 'Sweep', 'Charge'].includes(ev.name)) shake = Math.max(shake, 0.6);
      if (ev.type === 'boom') {
        const y = heightAt(ev.x, ev.z);
        puff(ev.x, y + 1, ev.z, 30, 1.6, 9);
        blast.position.set(ev.x, y + 3, ev.z);
        blast.intensity = 400;
      } else if (ev.type === 'snap') puff(ev.x, heightAt(ev.x, ev.z) + 0.5, ev.z, 6, 0.5, 3);
      if (ev.type === 'shot' && ev.weapon !== 'bow') {
        const m = sim.muzzle();
        muzzleFlash.position.set(m.x, m.y, m.z);
        muzzleFlash.intensity = 120;
      } else if (ev.type === 'hit') puff(ev.x, heightAt(ev.x, ev.z) + 1.6, ev.z, 4, 0.3, 2.5);
      if (ev.type === 'wave') { waveT = 0; waveR = ev.r; wave.position.set(ev.x, heightAt(ev.x, ev.z) + 1, ev.z); }
      else if (ev.type === 'melee') puff(player.x + Math.sin(player.yaw) * 3, heightAt(player.x, player.z) + 1.5, player.z + Math.cos(player.yaw) * 3, ev.strong > 0 ? 9 : 4, 0.5, 3);
      else if (ev.type === 'tamed') puff(player.x, heightAt(player.x, player.z) + 1, player.z, 16, 0.8, 6);
      else if (ev.type === 'thud') puff(ev.x, ev.y + 0.2, ev.z, 3, 0.35, 1.5);
      else if (ev.type === 'kill') puff(ev.x, heightAt(ev.x, ev.z) + 0.5, ev.z, 10, 0.9, 4);
      else if (ev.type === 'dodge' || ev.type === 'respawn') puff(player.x, heightAt(player.x, player.z) + 0.4, player.z, 8, 0.7, 4);
      else if (ev.type === 'ability') puff(player.x, heightAt(player.x, player.z) + 0.4, player.z, 14, 0.9, 6);
    }
  }

  // ---- sky, sun and fog follow the time of day ----
  const skyTop = new THREE.Color(), skyLow = new THREE.Color(), sunCol = new THREE.Color(), cloudTint = new THREE.Color(), waterTint = new THREE.Color(), weatherTint = new THREE.Color();
  function updateSky(px, py, pz, dt, time) {
    const d = sim.dayPhase(), ang = (d - 0.25) * Math.PI * 2, e = Math.sin(ang);   // e: sun height, -1 midnight to 1 noon
    const dayK = smooth(-0.12, 0.3, e), warmK = (1 - smooth(0, 0.5, Math.abs(e))) * smooth(-0.35, 0, e);
    skyTop.lerpColors(SKY.top.night, SKY.top.day, dayK).lerp(SKY.top.warm, warmK * 0.6);
    skyLow.lerpColors(SKY.low.night, SKY.low.day, dayK).lerp(SKY.low.warm, warmK * 0.85);
    scene.fog.color.copy(skyLow);
    scene.fog.near = lerp(120, 55, warmK);
    sunCol.lerpColors(SUN.night, SUN.day, dayK).lerp(SUN.warm, warmK);
    sun.color.copy(sunCol);
    sun.intensity = lerp(1.0, 2.6, dayK) + warmK * 0.9;     // moonlight strong enough to ride and fight by
    hemi.intensity = lerp(0.62, 1.25, dayK) + warmK * 0.3;   // and enough fill by day that walls in shade keep their colour
    hemi.color.copy(skyTop).lerp(skyLow, 0.6);
    hemi.groundColor.lerpColors(GROUND_LIGHT.night, GROUND_LIGHT.day, dayK);
    // by day the light is the sun; at night the same light stands in for the moon, opposite it
    const up = e > -0.12 ? Math.max(e, 0.16) : Math.max(-e, 0.3), side = Math.cos(ang) * (e > -0.12 ? 1 : -1);
    sun.position.set(px + side * 95, py + up * 115, pz + 45);
    sun.target.position.set(px, py, pz);
    cloudTint.copy(skyLow).lerp(sunCol, 0.5).lerp(WHITE, 0.35 + dayK * 0.4);
    if (state.bloodMoon) { skyLow.lerp(BLOOD, 0.3); scene.fog.color.copy(skyLow); }
    // weather closes the view in, greys or yellows the sky and takes some of the light
    const w = weatherFx.update(dt, state.frontier?.weather, camera.position);
    scene.fog.far = lerp(460, w.far, w.k);
    if (w.k > 0) {
      scene.fog.near = lerp(scene.fog.near, w.near, w.k);
      weatherTint.copy(w.color).multiplyScalar(0.22 + 0.78 * dayK);
      skyLow.lerp(weatherTint, w.k * w.tint); skyTop.lerp(weatherTint, w.k * w.tint * 0.85);
      scene.fog.color.copy(skyLow);
      sun.intensity *= 1 - w.k * w.dim;
      cloudTint.lerp(weatherTint, w.k * 0.7);
    }
    if (w.flash > 0) hemi.intensity += w.flash * 2.2;
    wagon.visible = !!sim.frontier?.traderHere();
    skyDome.update({ camera, sunAngle: ang, dayK, top: skyTop, horizon: skyLow, cloudTint, dt, blood: !!state.bloodMoon });
    water.update(time, waterTint.lerpColors(WATER.night, WATER.day, dayK).lerp(skyLow, 0.25));
    townProps.update(1 - dayK);
    townProps.setTowers(!!state.town?.owned && state.town.level >= 3);
    windTime.value = time;
    muzzleFlash.intensity *= Math.exp(-30 * dt);
  }

  const camDir = new THREE.Vector3(), tmp = new THREE.Vector3();
  let boom = null;   // share of the camera boom not cut short by scenery, 0..1
  const aim = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1, yaw: 0 };
  // Draws one frame. alpha blends each body between its last two rule steps. Returns the aim ray for the next input.
  function render(dt, alpha, look, time) {
    if (riderMount !== player.mount) {
      if (riderModel) { scene.remove(riderModel.root); riderModel.dispose(); }
      riderMount = player.mount;
      riderModel = createModel(MOUNTS[riderMount].id);
      scene.add(riderModel.root);
    }
    const mount = MOUNTS[player.mount], root = riderModel.root, cam = player.onFoot ? FOOT.cam : mount.cam;
    const stageK = sim.stageOf().k;
    root.scale.setScalar(stageK);   // Young mounts are smaller, Elders larger
    if (riderModel.rider) riderModel.rider.scale.setScalar(1.15 / stageK);   // the rider stays the same size
    const topple = player.dead ? Math.min(player.deadT / 0.4, 1) * Math.PI / 2 : 0;
    if (riderModel.rider) riderModel.rider.visible = !player.onFoot;
    walkerRoot.visible = player.onFoot;
    if (player.onFoot) {
      // the mount waits where it was left (or trots over when whistled); the rider walks, and falls where he stood
      const s = player.steed, sx = lerp(s.ox ?? s.x, s.x, alpha), sz = lerp(s.oz ?? s.z, s.z, alpha);
      root.rotation.z = 0;
      root.position.set(sx, heightAt(sx, sz), sz);
      root.rotation.y = s.yaw;
      riderModel.update(dt, s.coming ? 1 : 0, 0);
      place(walkerRoot, player, alpha);
      walkerRoot.rotation.z = topple;
      walkerBody.update(dt, player.dead ? 0 : player.moving);
    } else if (player.dead) {
      riderModel.update(dt, 0, 0, true);
      root.rotation.z = riderModel.hasDeathAnim ? 0 : topple;
    } else {
      root.rotation.z = 0;
      place(root, player, alpha);
      riderModel.update(dt, player.moving, 0);
      trail(player, dt, 26, 0.55);
    }
    // the camera stays with the rider, on foot or mounted, alive or thrown
    const body = player.onFoot ? walkerRoot : root;
    const px = body.position.x, pz = body.position.z, py = heightAt(px, pz);

    drawCaches(state.caches || [], (mesh, c) => { mesh.position.set(c.x, heightAt(c.x, c.z), c.z); });
    drawLoot(state.loot, (mesh, l) => { mesh.position.set(l.x, heightAt(l.x, l.z) + 1 + Math.sin(time * 3 + l.x) * 0.2, l.z); mesh.rotation.y = time * 1.5; });
    drawSticks(state.thrown, (mesh, s) => {
      const k = Math.min(1, s.t / THROWN.dynamite.flight);
      mesh.position.set(s.x, heightAt(s.x, s.z) + 0.4 + Math.sin(k * Math.PI) * 6 + (1 - k) * 3, s.z);
      mesh.rotation.set(time * 9, 0, time * 7);
    });
    drawTraps(state.traps, (mesh, t) => mesh.position.set(t.x, heightAt(t.x, t.z) + 0.2, t.z));
    const questMark = sim.story?.status()?.mark || null;
    drawNpcs(time, questMark);
    drawMates(dt, alpha);
    const picks = state.pickups || [];
    drawPickups(picks.filter(k => k.tag !== 'firepit'), (mesh, k) => { mesh.position.set(k.x, heightAt(k.x, k.z) + 0.7, k.z); mesh.rotation.y = time; });
    drawFirePits(picks.filter(k => k.tag === 'firepit'), (mesh, k) => { mesh.position.set(k.x, heightAt(k.x, k.z) + 1.7, k.z); mesh.children[0].scale.y = 1 + Math.sin(time * 9 + k.x) * 0.12; });
    for (const tr of tracers) { tr.t -= dt; tr.line.visible = tr.t > 0; }
    const mark = sim.jobs.status()?.mark || questMark;
    beam.visible = !!mark && Math.hypot(mark.x - px, mark.z - pz) > 12;
    if (mark) beam.position.set(mark.x, heightAt(mark.x, mark.z) + 30, mark.z);
    blast.intensity *= Math.exp(-9 * dt);
    // drop the models of enemies the rules have removed (one lookup set per frame, not a list scan per model)
    const present = new Set(state.enemies);
    for (const [e, v] of views) {
      if (!e.kind || present.has(e)) continue;
      scene.remove(v.model.root);
      v.model.dispose();
      if (v.bar) v.bar.material.dispose();
      views.delete(e);
    }

    for (const e of state.enemies) {
      const v = viewOf(e, e.kind, true), r = e.def.radius;
      drawCreature(e, v, dt, alpha, e.attackT);
      const glow = e.flashT > 0 ? 0x802020 : e.windT > 0 ? 0x8a6a00 : 0x000000;   // red when hit, amber while it gathers to spring
      for (const m of v.model.materials) m.emissive.setHex(glow);
      const giant = e.tag === 'giant', marked = e.bounty || giant || e.alpha;
      v.bar.visible = !e.dead && e.def.ai !== 'pest' && (e.hp < e.maxHp || marked);
      v.bar.material.color.setHex(marked ? 0xffd84d : 0xe5484d);
      v.bar.position.set(0, r * 2.2 + 0.8, 0);
      v.bar.scale.set(Math.max(0.01, e.hp / e.maxHp) * r * 1.6 * (marked ? 1.6 : 1), 0.22, 1);
      if (marked) v.model.root.scale.setScalar(giant ? 1.75 : e.alpha ? 1.35 : 1.3);
      trail(e, dt, 14, r * 0.3);
    }
    for (const a of state.animals) {
      drawCreature(a, viewOf(a, 'longhorn', false), dt, alpha, 0);
      trail(a, dt, 16, 0.5);
    }

    state.bullets.forEach((b, i) => {
      const mesh = bulletMeshes[i];
      mesh.visible = b.life > 0;
      if (!mesh.visible) return;
      mesh.position.set(lerp(b.ox, b.x, alpha), lerp(b.oy, b.y, alpha), lerp(b.oz, b.z, alpha));
      mesh.lookAt(tmp.set(b.vx, b.vy, b.vz).add(mesh.position));
    });

    const roped = state.herd.roped;
    rope.visible = !!roped;
    if (roped) {
      const p = rope.geometry.attributes.position, rv = views.get(roped).model.root.position;
      (player.onFoot ? walker.muzzle : riderModel.muzzle).getWorldPosition(tmp);
      p.setXYZ(0, tmp.x, tmp.y, tmp.z);
      p.setXYZ(1, rv.x, rv.y + 2.2, rv.z);
      p.needsUpdate = true;
    }
    if (waveT < 1) {
      waveT += dt * 1.6;
      wave.scale.setScalar(waveR * waveT);
      wave.material.opacity = 0.7 * (1 - waveT);
    }
    wave.visible = waveT < 1;
    updateDust(dt);

    for (const f of flags) {
      const col = f.outpost.captured ? 0x2fb5a0 : 0xc23b2e;
      f.flagMat.color.setHex(col);
      f.ring.material.color.setHex(col);
      f.flag.rotation.y = Math.sin(time * 2 + f.outpost.x) * 0.25;
    }
    penFlag.rotation.y = Math.sin(time * 2) * 0.25;
    showTownOwner(!!state.town?.owned, time);

    camDir.set(Math.sin(look.yaw) * Math.cos(look.pitch), Math.sin(look.pitch), Math.cos(look.yaw) * Math.cos(look.pitch));
    // Looking down pulls the boom in and lowers its pivot, so the aim ray can reach the ground just ahead of
    // the rider even from the Tyrant's high, far-back camera.
    const down = Math.max(0, Math.min(1, (BOOM.from - look.pitch) / (BOOM.from - BOOM.to)));
    const pivotH = lerp(cam.h, Math.min(cam.h * BOOM.height, BOOM.maxHeight), down), want = cam.back * lerp(1, BOOM.back, down);
    const ax = px - Math.cos(look.yaw) * 1.6, ay = py + pivotH, az = pz + Math.sin(look.yaw) * 1.6;
    // Walk out along the boom from the rider and stop short of the first tree, rock or building in the way.
    let clear = want;
    for (let d = BOOM.probe; d <= want; d += BOOM.probe) {
      if (state.obstacles.blocksShot(ax - camDir.x * d, ay - camDir.y * d, az - camDir.z * d)) { clear = Math.max(BOOM.min, d - BOOM.probe - 0.4); break; }
    }
    // only the blocked share is smoothed (in quickly, back out gently), so the camera neither pops nor lags the mouse
    const open = clear / want;
    boom = boom === null ? open : boom + (open - boom) * (1 - Math.exp(-dt * (open < boom ? 18 : 5)));
    camera.position.set(ax, ay, az).addScaledVector(camDir, -want * boom);
    camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 1);
    // a jolt for blasts and blows, and a slightly wider view at full gallop
    shake *= Math.exp(-6 * dt);
    const jolt = shake * (settings.shake ?? 1);
    if (jolt > 0.01) camera.position.add(tmp.set(Math.sin(time * 71) * jolt * 0.35, Math.cos(time * 83) * jolt * 0.3, Math.sin(time * 59) * jolt * 0.35));
    const wantFov = 60 + (player.dead ? 0 : player.moving) * 5 + (player.dashT > 0 ? 6 : 0);
    if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-5 * dt)); camera.updateProjectionMatrix(); }
    camera.lookAt(tmp.copy(camera.position).add(camDir));
    updateSky(px, py, pz, dt, time);
    if (composer) composer.render(dt); else renderer.render(scene, camera);

    Object.assign(aim, { ox: camera.position.x, oy: camera.position.y, oz: camera.position.z, dx: camDir.x, dy: camDir.y, dz: camDir.z, yaw: look.yaw });
    return aim;
  }

  // For a machine that cannot keep up on high: drop the bloom pass and the extra pixels, keep everything else.
  function degrade() {
    if (!composer && renderer.getPixelRatio() <= 1) return false;
    composer = null;
    renderer.setPixelRatio(1);
    return true;
  }
  return { render, onEvents, renderer, scene, camera, degrade };
}
