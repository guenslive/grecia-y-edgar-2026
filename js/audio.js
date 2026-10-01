// Sonidos sintetizados con WebAudio: nada que descargar, todo suave.
let ctx = null;
let master = null;
let fx = null;
let muted = false;
let musicEl = null;
let musicTimer = null;
let musicBus = null;
let analyser = null;

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];

export function init(musicSrc) {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  master.connect(ctx.destination);

  // eco suave para que todo suene a cajita de música
  fx = ctx.createGain();
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.27;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  fx.connect(master);
  fx.connect(delay);
  delay.connect(lp);
  lp.connect(fb);
  fb.connect(delay);
  lp.connect(master);

  // la cajita musical va por su propio canal para poder bajarla
  musicBus = ctx.createGain();
  musicBus.connect(fx);

  if (musicSrc) {
    musicEl = new Audio(musicSrc);
    musicEl.loop = true;
    musicEl.volume = 0;
  }
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05);
  if (musicEl) musicEl.muted = m;
}
export const isMuted = () => muted;

function tone({ f, type = 'triangle', t = 0, dur = 1, vol = 0.2, attack = 0.005, to = null, dest = fx }) {
  if (!ctx) return;
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (to) o.frequency.exponentialRampToValueAtTime(to, now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g);
  g.connect(dest);
  o.start(now);
  o.stop(now + dur + 0.05);
}

function noise({ t = 0, dur = 0.2, vol = 0.2, freq = 800, q = 1, type = 'bandpass', sweep = null }) {
  if (!ctx) return;
  const now = ctx.currentTime + t;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, now);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, now + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(now);
}

export function plop() {
  tone({ f: 620, to: 240, type: 'sine', dur: 0.18, vol: 0.28 });
}

export function thud() {
  tone({ f: 120, to: 55, type: 'sine', dur: 0.35, vol: 0.45, dest: master });
  noise({ dur: 0.3, vol: 0.35, freq: 420, type: 'lowpass' });
}

export function chime(i) {
  const f = PENTA[i % PENTA.length];
  tone({ f, dur: 1.6, vol: 0.16 });
  tone({ f: f * 2, type: 'sine', dur: 0.9, vol: 0.05, t: 0.01 });
}

export function bloom() {
  [0, 2, 4, 5, 7, 8].forEach((n, k) => tone({ f: PENTA[n], t: k * 0.09, dur: 1.4, vol: 0.09 }));
  noise({ dur: 1.4, vol: 0.05, freq: 6000, q: 0.7, sweep: 2500 });
}

export function wood(k = 0) {
  tone({ f: 190 + k * 18, to: 120, type: 'square', dur: 0.09, vol: 0.07, dest: master });
  noise({ dur: 0.06, vol: 0.18, freq: 1200, q: 3 });
}

export function tick() {
  tone({ f: 1760, type: 'sine', dur: 0.05, vol: 0.05 });
}

export function swish() {
  noise({ dur: 0.28, vol: 0.12, freq: 500, q: 0.8, sweep: 3200 });
  tone({ f: 784, dur: 0.6, vol: 0.06, t: 0.05 });
}

export function sparkle() {
  tone({ f: 1567.98, dur: 0.5, vol: 0.06 });
  tone({ f: 2093, dur: 0.5, vol: 0.05, t: 0.07 });
}

export function carve(n) {
  noise({ dur: 0.04, vol: 0.08, freq: 2500 + (n % 3) * 400, q: 4 });
}

export function land() {
  tone({ f: 150, to: 80, type: 'sine', dur: 0.2, vol: 0.25, dest: master });
  noise({ dur: 0.15, vol: 0.12, freq: 700, type: 'lowpass' });
}

export function step() {
  noise({ dur: 0.04, vol: 0.05, freq: 1800, q: 2 });
}

export function hug() {
  [0, 2, 4].forEach((n, k) => tone({ f: PENTA[n] / 2, t: k * 0.05, dur: 1.6, vol: 0.08 }));
}

export function chu() {
  tone({ f: 1400, to: 2600, type: 'sine', dur: 0.12, vol: 0.12 });
  tone({ f: 1318.51, t: 0.14, dur: 0.9, vol: 0.07 });
  tone({ f: 1760, t: 0.24, dur: 0.9, vol: 0.05 });
}

// Cajita musical en bucle (Do - Sol - La m - Fa), o la canción si hay mp3.
export function startMusic() {
  if (!ctx || musicTimer) return;
  if (musicEl) {
    musicEl.play().catch(() => {});
    let v = 0;
    const up = setInterval(() => {
      v = Math.min(0.6, v + 0.03);
      musicEl.volume = v;
      if (v >= 0.6) clearInterval(up);
    }, 120);
    musicTimer = 1;
    return;
  }
  const chords = [
    [261.63, 329.63, 392.0, 523.25],
    [196.0, 246.94, 293.66, 392.0],
    [220.0, 261.63, 329.63, 440.0],
    [174.61, 220.0, 261.63, 349.23],
  ];
  const melody = [
    [659.25, null, 783.99, 659.25, 587.33, null, 523.25, null],
    [587.33, null, 659.25, 587.33, 493.88, null, 392.0, null],
    [523.25, null, 659.25, 783.99, 880.0, null, 783.99, 659.25],
    [698.46, null, 659.25, 587.33, 523.25, null, null, null],
  ];
  const beat = 60 / 76 / 2;
  let step = 0;
  let next = ctx.currentTime + 0.1;
  const schedule = () => {
    while (next < ctx.currentTime + 0.4) {
      const bar = Math.floor(step / 8) % 4;
      const s = step % 8;
      const t = next - ctx.currentTime;
      const ch = chords[bar];
      const arp = [0, 2, 1, 3, 2, 1, 3, 2][s];
      tone({ f: ch[arp] * 2, type: 'sine', t, dur: 1.1, vol: 0.035, dest: musicBus });
      const m = melody[bar][s];
      if (m && Math.floor(step / 32) % 2 === 1) tone({ f: m * 2, type: 'triangle', t, dur: 1.3, vol: 0.03, dest: musicBus });
      if (s === 0) tone({ f: ch[0] / 2, type: 'sine', t, dur: 2.4, vol: 0.04, dest: musicBus });
      next += beat;
      step++;
    }
  };
  schedule();
  musicTimer = setInterval(schedule, 120);
}

// Mientras suena su canción, la música de fondo se calla.
export function duckMusic(on) {
  if (musicBus) musicBus.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.35);
  if (musicEl && musicTimer) {
    if (on) musicEl.pause();
    else musicEl.play().catch(() => {});
  }
}

// Conecta un <audio> al mezclador (respeta el botón de silencio) y devuelve
// un analizador para dibujar las barritas.
export function connectSong(el) {
  if (!ctx) return null;
  if (ctx.state === 'suspended') ctx.resume();
  if (!el.dataset.conectado) {
    const src = ctx.createMediaElementSource(el);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.7;
    src.connect(analyser);
    analyser.connect(master);
    el.dataset.conectado = '1';
  }
  return analyser;
}

// Zumbido suave de la avioneta; cruza de un audífono al otro según su dirección.
export function planeHum(dur, dir) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(92, now);
  o.frequency.linearRampToValueAtTime(76, now + dur);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 17;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 5;
  lfo.connect(lfoGain);
  lfoGain.connect(o.frequency);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 380;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(0.05, now + dur * 0.45);
  g.gain.linearRampToValueAtTime(0.0001, now + dur);
  o.connect(lp);
  lp.connect(g);
  let out = g;
  if (ctx.createStereoPanner) {
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(dir < 0 ? 0.8 : -0.8, now);
    pan.pan.linearRampToValueAtTime(dir < 0 ? -0.8 : 0.8, now + dur);
    g.connect(pan);
    out = pan;
  }
  out.connect(musicBus);
  o.start(now);
  lfo.start(now);
  o.stop(now + dur + 0.1);
  lfo.stop(now + dur + 0.1);
}

// Puerta que se abre (rechinido corto).
export function door() {
  tone({ f: 170, to: 105, type: 'sawtooth', dur: 0.45, vol: 0.025, dest: master });
  noise({ dur: 0.25, vol: 0.05, freq: 900, q: 1.5 });
}

// Dos latidos graves, para los nervios.
export function heartbeat() {
  tone({ f: 72, to: 48, type: 'sine', dur: 0.14, vol: 0.3, dest: master });
  tone({ f: 72, to: 48, type: 'sine', dur: 0.14, vol: 0.22, dest: master, t: 0.22 });
}

// Bocina grave de barco, a lo lejos.
export function horn() {
  for (const [f, vol] of [[98, 0.03], [147, 0.02]]) {
    tone({ f, type: 'sawtooth', dur: 1.6, vol, attack: 0.18, dest: master });
  }
}

// Una ola que rompe suave.
export function wave() {
  noise({ dur: 1.4, vol: 0.05, freq: 700, type: 'lowpass', sweep: 180 });
}

// Tecla de máquina de escribir: un golpecito seco, cada uno un poco distinto.
export function key() {
  noise({ dur: 0.035, vol: 0.05 + Math.random() * 0.03, freq: 2200 + Math.random() * 900, q: 2.5 });
  tone({ f: 170 + Math.random() * 50, to: 90, type: 'square', dur: 0.03, vol: 0.01, dest: master });
}

// Papel que se desdobla.
export function paper() {
  noise({ dur: 0.2, vol: 0.06, freq: 3200, q: 0.8, sweep: 1400 });
}

// Casete: el botón de expulsar (clac con su resorte)…
export function eject() {
  noise({ dur: 0.04, vol: 0.2, freq: 1400, q: 3 });
  tone({ f: 260, to: 140, type: 'square', dur: 0.06, vol: 0.04, dest: master });
  noise({ t: 0.05, dur: 0.14, vol: 0.05, freq: 3000, q: 1.5, sweep: 1200 });
}

// …y cuando el nuevo encaja adentro.
export function clack() {
  noise({ dur: 0.035, vol: 0.22, freq: 900, q: 3 });
  tone({ f: 140, to: 70, type: 'square', dur: 0.06, vol: 0.05, dest: master });
  noise({ t: 0.06, dur: 0.03, vol: 0.14, freq: 1600, q: 3 });
}

// Moneda de maquinita: dos notas cuadradas rapiditas.
export function coin() {
  tone({ f: 988, type: 'square', dur: 0.09, vol: 0.05, dest: master });
  tone({ f: 1319, type: 'square', dur: 0.35, vol: 0.05, dest: master, t: 0.08 });
}
