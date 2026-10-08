// Synthesized sound effects (no audio files needed).
let ctx = null;
let master = null;
let noiseBuf = null;
let volume = 0.6;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlockAudio() { ensure(); }

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

function noiseBurst(freq, dur, vol, q = 1, type = 'lowpass') {
  const c = ensure();
  if (!c || vol <= 0.001) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, c.currentTime);
  f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.25), c.currentTime + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(c.currentTime, Math.random() * 0.5);
  src.stop(c.currentTime + dur + 0.05);
}

function tone(freq, dur, vol, type = 'square', endFreq) {
  const c = ensure();
  if (!c || vol <= 0.001) return;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, c.currentTime + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g); g.connect(master);
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

// distance: 0 for your own gun
export function playGun(sound, distance = 0) {
  const att = Math.max(0, 1 - distance / 90);
  const v = sound.vol * att * att;
  noiseBurst(sound.freq * (distance > 0 ? 0.6 : 1), sound.dur, v, 0.8);
  if (sound.low) tone(120, sound.dur * 0.8, v * sound.low * 0.5, 'sine', 40);
}

export const sfx = {
  hit: () => tone(1400, 0.06, 0.25, 'square', 900),
  headshot: () => { tone(1900, 0.08, 0.3, 'square', 1200); tone(2600, 0.06, 0.15, 'triangle'); },
  kill: () => { tone(880, 0.1, 0.25, 'triangle'); setTimeout(() => tone(1320, 0.18, 0.25, 'triangle'), 90); },
  hurt: () => noiseBurst(400, 0.15, 0.35, 1),
  empty: () => tone(300, 0.05, 0.2, 'square'),
  reload: () => { noiseBurst(2500, 0.05, 0.2, 2, 'bandpass'); setTimeout(() => noiseBurst(1800, 0.06, 0.25, 2, 'bandpass'), 220); },
  pickup: () => { tone(600, 0.08, 0.2, 'square'); setTimeout(() => tone(900, 0.1, 0.2, 'square'), 70); },
  dash: () => noiseBurst(1200, 0.25, 0.3, 0.5, 'bandpass'),
  jump: () => tone(220, 0.08, 0.06, 'sine', 330),
  land: () => noiseBurst(300, 0.08, 0.12),
  explosion: (distance = 0) => {
    const att = Math.max(0, 1 - distance / 120);
    noiseBurst(900, 0.9, 0.9 * att * att, 0.5);
    tone(80, 0.7, 0.6 * att * att, 'sine', 30);
  },
  click: () => tone(700, 0.04, 0.15, 'square'),
  death: () => { tone(400, 0.4, 0.25, 'sawtooth', 80); },
};
