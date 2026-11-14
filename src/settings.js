// Player settings, kept in the browser apart from the save: how the game looks, sounds and handles, not what happened in it.
const KEY = 'thunder-valley-settings';
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
export const defaults = () => ({ quality: 'auto', sensitivity: 1, invertY: false, shake: reducedMotion() ? 0 : 1, textSize: 1, volume: 0.7, palette: 'default' });

const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : d);
function clean(raw) {
  const d = defaults(), s = raw && typeof raw === 'object' ? raw : {};
  return {
    quality: ['auto', 'high', 'low'].includes(s.quality) ? s.quality : d.quality,
    sensitivity: clamp(s.sensitivity, 0.4, 2, d.sensitivity), invertY: s.invertY === true,
    shake: [0, 0.5, 1].includes(+s.shake) ? +s.shake : d.shake, textSize: [1, 1.15, 1.3].includes(+s.textSize) ? +s.textSize : d.textSize,
    volume: clamp(s.volume, 0, 1, d.volume), palette: s.palette === 'contrast' ? 'contrast' : 'default',
  };
}
export function loadSettings() {
  try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch { return defaults(); }
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(clean(s))); } catch { /* storage unavailable: the settings last until the page closes */ }
}
// ?q=low or ?q=high in the address wins; otherwise the setting; on Auto, modest machines and phones start on low.
export function pickQuality(s) {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low' || q === 'high') return q;
  if (s.quality !== 'auto') return s.quality;
  const modest = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 || /Mobi|Android/i.test(navigator.userAgent);
  return modest ? 'low' : 'high';
}
