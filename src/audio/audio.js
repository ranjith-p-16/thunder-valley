// All sound is synthesised in the browser, so there are no audio files to download yet.
// Recorded sounds and music can replace these one by one later without touching the callers.
export function createAudio(startVolume = 0.7) {
  const MUTE_KEY = 'thunder-valley-muted';
  let VOLUME = startVolume;
  let ctx = null, master = null, noiseBuf = null, muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage unavailable: start with sound on */ }
  let windGain = null, rumbleGain = null, musicGain = null, tenseGain = null;
  let nextBeat = 0, beat = 0, stepT = 0;

  function start() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    windGain = loopNoise('bandpass', 420, 0.6, 0.05);
    rumbleGain = loopNoise('lowpass', 90, 1, 0);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
    tenseGain = ctx.createGain(); tenseGain.gain.value = 0; tenseGain.connect(master);
    nextBeat = ctx.currentTime + 0.3;
  }
  function loopNoise(type, freq, q, gain) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.value = gain;
    src.connect(f).connect(g).connect(master);
    src.start();
    return g;
  }
  // a burst of filtered noise: shots, thuds, footfalls
  function noise(dur, freq, gain, type = 'lowpass', dest = master, at = ctx.currentTime) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(at, Math.random());
    src.stop(at + dur + 0.02);
  }
  // a tone that slides from f0 to f1 and fades
  function tone(f0, f1, dur, gain, wave = 'sine', dest = master, at = ctx.currentTime) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  const SOUNDS = {
    shot: (ev) => {
      if (ev.weapon === 'bow') { noise(0.12, 2600, 0.14, 'bandpass'); tone(420, 180, 0.1, 0.12, 'triangle'); }
      else if (ev.weapon === 'rifle') { noise(0.3, 2400, 0.6); tone(160, 40, 0.2, 0.4, 'square'); }
      else if (ev.weapon === 'shotgun') { noise(0.35, 1100, 0.75); tone(120, 35, 0.22, 0.45, 'square'); }
      else { noise(0.18, 1800, 0.5); tone(220, 60, 0.12, 0.35, 'square'); }
    },
    talk: () => { tone(520, 620, 0.06, 0.08, 'triangle'); },
    say: () => { tone(700, 880, 0.08, 0.08, 'triangle'); },
    order: () => { tone(440, 660, 0.1, 0.12, 'triangle'); },
    stepdone: () => { tone(660, 880, 0.14, 0.14, 'triangle'); },
    questdone: () => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.3, 0.2, 'triangle', master, ctx.currentTime + i * 0.12)); },
    standing: () => { tone(880, 1175, 0.16, 0.1, 'sine'); },
    mateShot: () => { noise(0.12, 1500, 0.2); },
    gunfire: () => { noise(0.16, 1700, 0.3); tone(200, 60, 0.1, 0.2, 'square'); },
    spit: () => { noise(0.25, 900, 0.25, 'bandpass'); },
    melee: (ev) => { noise(0.16, ev.strong > 0 ? 500 : 900, 0.3); if (ev.strong > 0) tone(180, 90, 0.2, 0.25, 'square'); },
    tamed: () => { [440, 554, 659, 880].forEach((f, i) => tone(f, f, 0.3, 0.18, 'triangle', master, ctx.currentTime + i * 0.13)); },
    swap: () => { noise(0.05, 3000, 0.14, 'highpass'); },
    coin: () => { tone(1300, 1300, 0.07, 0.12, 'triangle'); tone(1750, 1750, 0.12, 0.12, 'triangle', master, ctx.currentTime + 0.07); },
    pickup: () => { tone(700, 1000, 0.1, 0.14, 'triangle'); },
    drink: () => { tone(300, 500, 0.25, 0.14, 'sine'); },
    throw: () => { noise(0.2, 1800, 0.14, 'bandpass'); },
    boom: () => { noise(0.9, 400, 0.9); tone(90, 25, 0.8, 0.7, 'sine'); },
    snap: () => { noise(0.05, 4000, 0.4, 'highpass'); tone(500, 200, 0.08, 0.2, 'square'); },
    jobdone: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.22, 0.18, 'triangle', master, ctx.currentTime + i * 0.09)); },
    reload: () => { for (let i = 0; i < 3; i++) noise(0.04, 3500, 0.18, 'highpass', master, ctx.currentTime + 0.25 + i * 0.3); },
    reloaded: () => { tone(900, 1300, 0.06, 0.12, 'triangle'); },
    hit: () => { noise(0.08, 900, 0.25); },
    thud: () => { noise(0.06, 500, 0.08); },
    kill: () => { tone(300, 70, 0.5, 0.25, 'sawtooth'); },
    bite: () => { noise(0.12, 700, 0.14, 'bandpass'); },
    windup: () => { tone(240, 420, 0.4, 0.22, 'sawtooth'); noise(0.35, 1200, 0.12, 'bandpass'); },
    hurt: () => { tone(180, 90, 0.2, 0.3, 'square'); },
    death: () => { tone(260, 40, 1.1, 0.3, 'sawtooth'); },
    dodge: () => { noise(0.22, 1200, 0.18, 'bandpass'); },
    holler: () => { tone(500, 900, 0.18, 0.2, 'triangle'); tone(900, 600, 0.3, 0.18, 'triangle', master, ctx.currentTime + 0.18); },
    lasso: () => { noise(0.3, 2500, 0.12, 'bandpass'); },
    penned: () => { tone(660, 660, 0.12, 0.18, 'triangle'); tone(880, 880, 0.2, 0.18, 'triangle', master, ctx.currentTime + 0.12); },
    lost: () => { tone(300, 150, 0.5, 0.2, 'triangle'); },
    levelup: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.25, 0.2, 'triangle', master, ctx.currentTime + i * 0.11)); },
    capture: () => { [392, 523, 659].forEach((f, i) => tone(f, f, 0.4, 0.2, 'triangle', master, ctx.currentTime + i * 0.16)); },
    mount: () => { noise(0.15, 600, 0.15); },
    Dash: () => { noise(0.5, 1600, 0.22, 'bandpass'); },
    Rally: () => { tone(330, 495, 0.5, 0.22, 'sawtooth'); },
    Charge: () => { noise(0.7, 500, 0.3); tone(140, 90, 0.6, 0.25, 'sawtooth'); },
    Sweep: () => { noise(0.35, 900, 0.3, 'bandpass'); tone(180, 70, 0.3, 0.3, 'triangle'); },
    Stomp: () => { tone(90, 35, 0.6, 0.55, 'sine'); noise(0.5, 200, 0.4); },
    Call: () => { tone(260, 390, 0.45, 0.22, 'triangle'); tone(390, 290, 0.5, 0.2, 'triangle', master, ctx.currentTime + 0.4); },
    Spit: () => { noise(0.2, 3000, 0.18, 'bandpass'); },
    move: (ev) => {
      if (ev.kind === 'soothe') { tone(330, 440, 0.5, 0.2, 'triangle'); tone(440, 392, 0.6, 0.18, 'triangle', master, ctx.currentTime + 0.45); }
      else if (ev.kind === 'guard') { tone(120, 80, 0.4, 0.3, 'square'); noise(0.3, 400, 0.2); }
      else { tone(170, 60, 0.35, 0.4, 'sawtooth'); noise(0.25, 700, 0.3, 'bandpass'); }
    },
    thunder: () => { noise(2.2, 160, 0.55); tone(70, 38, 1.6, 0.35, 'sine'); },
    Roar: () => { tone(110, 45, 1.2, 0.5, 'sawtooth'); noise(1.2, 300, 0.4); },
  };
  function onEvents(events) {
    if (!ctx || muted) return;
    for (const ev of events) {
      const fn = SOUNDS[ev.type === 'ability' ? ev.name : ev.type];
      if (fn) fn(ev);
    }
  }

  // A slow western-flavoured loop: plucked notes over a bass, with drums that fade in during a fight.
  const SCALE = [220, 261.6, 293.7, 329.6, 392, 440, 523.3], BASS = [110, 110, 146.8, 98];
  const TUNE = [0, -1, 2, 3, -1, 2, 4, -1, 5, 4, 3, -1, 2, -1, 0, -1];
  function schedule() {
    // after the tab was hidden the clock has run on: skip the missed beats instead of playing them all at once
    if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.05;
    while (nextBeat < ctx.currentTime + 0.2) {
      const n = TUNE[beat % TUNE.length];
      if (n >= 0) { tone(SCALE[n], SCALE[n] * 0.995, 0.7, 0.5, 'triangle', musicGain, nextBeat); }
      if (beat % 4 === 0) tone(BASS[(beat / 4) % BASS.length | 0], BASS[(beat / 4) % BASS.length | 0], 1.1, 0.6, 'sine', musicGain, nextBeat);
      tone(beat % 2 ? 150 : 70, 40, 0.16, 0.5, 'sine', tenseGain, nextBeat);
      if (beat % 2) noise(0.05, 5000, 0.25, 'highpass', tenseGain, nextBeat);
      nextBeat += 0.36;
      beat++;
    }
  }

  // Called every drawn frame with a few facts about the scene.
  function frame(dt, { speed01, herdRun, danger, night }) {
    if (!ctx) return;
    schedule();
    const t = ctx.currentTime;
    windGain.gain.setTargetAtTime(muted ? 0 : 0.04 + speed01 * 0.05, t, 0.3);
    rumbleGain.gain.setTargetAtTime(muted ? 0 : Math.min(0.5, herdRun * 0.09), t, 0.2);
    tenseGain.gain.setTargetAtTime(muted ? 0 : danger ? 0.22 : 0, t, 0.8);
    musicGain.gain.setTargetAtTime(muted ? 0 : night ? 0.08 : 0.16, t, 1);
    stepT -= dt * (1.5 + speed01 * 5);
    if (speed01 > 0.1 && stepT <= 0 && !muted) { stepT = 1; noise(0.07, 160, 0.16 + speed01 * 0.14); }
  }
  // Mute drives the master gain, so it silences everything, including sounds already playing.
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* not remembered across visits */ }
    if (ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx.currentTime, 0.02);
    }
    return muted;
  }
  function setVolume(v) { VOLUME = v; if (ctx && !muted) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02); }
  return { start, onEvents, frame, toggleMute, setVolume };
}
