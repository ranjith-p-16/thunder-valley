// Turns keyboard and mouse into the small input object the rules understand.
const ACTION_KEYS = {
  Space: 'ability', KeyE: 'holler', KeyQ: 'lasso', KeyR: 'reload', KeyC: 'dodge', KeyH: 'dismount', KeyG: 'order', KeyT: 'tame', KeyB: 'swap', KeyV: 'melee', KeyY: 'move', KeyZ: 'quickZ', KeyX: 'quickX',
  Digit1: 'weapon0', Digit2: 'weapon1', Digit3: 'weapon2', Digit4: 'weapon3', Digit5: 'throw:dynamite', Digit6: 'throw:bolas', Digit7: 'throw:trap', Digit8: 'throw:bait',
};

// onLockLost is called when the browser takes the mouse back (Esc, alt-tab) while the game is running.
export function createInput(canvas, { onLockLost, settings = {} } = {}) {
  const keys = {}, look = { yaw: 0, pitch: -0.22 };
  // active: the game is running (no menu, no pause). While it is false nothing is queued and the mouse is left alone.
  let firing = false, freeLook = false, actions = [], active = false, held = false, leaving = false;
  const clampPitch = () => { look.pitch = Math.max(-0.9, Math.min(0.4, look.pitch)); };
  const locked = () => document.pointerLockElement === canvas;
  // Embedded previews refuse pointer lock; fall back to plain mouse-move look until a lock succeeds.
  function lockPointer() {
    if (locked()) return;
    const refused = () => { if (!locked()) freeLook = true; };
    try { canvas.requestPointerLock?.()?.catch?.(refused); } catch { refused(); }
  }
  // Menus give the mouse back through here, so that release is not mistaken for the browser taking it.
  function unlockPointer() {
    if (!locked()) return;
    leaving = true;
    document.exitPointerLock?.();
  }
  document.addEventListener('pointerlockchange', () => {
    if (locked()) { freeLook = false; leaving = false; held = true; return; }
    const lost = held && !leaving;
    held = leaving = false;
    if (lost && active) onLockLost?.();
  });
  document.addEventListener('pointerlockerror', () => { if (!locked()) freeLook = true; });

  const release = () => { for (const k in keys) keys[k] = false; firing = false; };
  // Forgets held keys and anything queued: call on every change between playing and a menu.
  const flush = () => { release(); actions = []; };
  function setActive(on) {
    on = !!on;
    if (on === active) return;
    active = on;
    flush();
  }

  addEventListener('keydown', (e) => {
    if (!active) return;
    // leave browser shortcuts such as Cmd/Ctrl+R alone
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    keys[e.code] = true;
    if (ACTION_KEYS[e.code]) { e.preventDefault(); if (!e.repeat) actions.push(ACTION_KEYS[e.code]); }
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', release);
  canvas.addEventListener('mousedown', (e) => {
    if (!active) return;
    if (e.button === 2) return void actions.push('move');   // right button: the mount's second move
    if (e.button !== 0) return;   // only the left button fires
    if (!locked()) lockPointer();   // retried on every click, so one refusal does not disable the lock for good
    firing = true;
  });
  addEventListener('mouseup', () => { firing = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    if (!active || (!locked() && !freeLook)) return;
    const k = settings.sensitivity || 1;
    look.yaw -= e.movementX * 0.0025 * k;
    look.pitch -= e.movementY * 0.002 * k * (settings.invertY ? -1 : 1);
    clampPitch();
  });

  // Call once per drawn frame for camera keys.
  function frame(dt) {
    if (keys.ArrowLeft) look.yaw += 1.8 * dt;
    if (keys.ArrowRight) look.yaw -= 1.8 * dt;
    look.pitch += ((keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0)) * dt;
    clampPitch();
  }
  // Builds the input for one rule step. One-shot actions are handed over once.
  function read(aim) {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const out = {
      mx: Math.sin(look.yaw) * f - Math.cos(look.yaw) * r, mz: Math.cos(look.yaw) * f + Math.sin(look.yaw) * r,
      sprint: !!(keys.ShiftLeft || keys.ShiftRight), fire: firing, aim, actions,
    };
    actions = [];
    return out;
  }
  return { look, frame, read, lockPointer, unlockPointer, setActive, flush, release, keys, isActive: () => active, pending: () => actions.length };
}
