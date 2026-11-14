// Saves live in the browser's storage on this machine. Export gives the player a backup file.
const KEY = 'thunder-valley-save';

export function loadSave() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
export function writeSave(snapshot) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...snapshot, savedAt: Date.now() })); return true; } catch { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable: nothing to clear */ }
}
export function exportSave(snapshot) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot)], { type: 'application/json' }));
  a.download = 'thunder-valley-save.json';
  a.click();
  // the download starts asynchronously: revoking at once can cancel it
  const url = a.href;
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importSave(file) {
  try { return JSON.parse(await file.text()); } catch { return null; }
}
