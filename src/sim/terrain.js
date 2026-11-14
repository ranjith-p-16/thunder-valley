// Pure world maths shared by the rules and the renderer. No drawing code in src/sim.
export const WORLD = { size: 640, half: 290 };

export function heightAt(x, z) {
  return 6 * Math.sin(x * 0.02) * Math.cos(z * 0.017)
    + 3 * Math.sin(x * 0.05 + 1.3) * Math.sin(z * 0.045)
    + 1.2 * Math.sin(x * 0.11) * Math.cos(z * 0.13);
}

// Seeded random source. `state` is exposed so a save can carry it.
export function rng(seed) {
  const r = () => {
    r.state = (r.state + 0x6D2B79F5) | 0;
    let t = Math.imul(r.state ^ (r.state >>> 15), 1 | r.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.state = seed;
  return r;
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const lerpAngle = (a, b, k) => a + angleDiff(a, b) * k;
