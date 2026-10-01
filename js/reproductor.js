import * as sfx from './audio.js';
import { makeCanvas, pixelTexture, outlineCanvas } from './sprites.js';
import { drawText, measure } from './pixelfont.js';
import { Rf, P, disc, line, heart, BLACK_HEART } from './historieta.js';
import { sticker } from './calcos.js';

/* =====================================================================
   "Canciones": una grabadora retro. Cuelga del árbol como los carteles;
   al tocarla vuela a primer plano y empieza a sonar: los carretes del
   casete giran, las bocinas laten con los graves, bailan las agujas de
   los medidores, la aguja del dial avanza con la canción y la letra corre
   abajo en tiempo real (de un archivo .lrc: cada línea con su minuto).
   ===================================================================== */

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const OUT = '#26141f', OUT_HOVER = '#fff1c8', INK = '#3a1f3d';
const SIL = '#c9c9d1', SIL_L = '#dcdce4', SIL_H = '#f3f3f8', SIL_D = '#a9a9b5', SIL_DD = '#8f8f9c';
const DARK = '#26262e', GLASS = '#1d1a24';
const BLACK = [BLACK_HEART.fill, BLACK_HEART.edge, BLACK_HEART.shine];
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);

// Un solo <audio> para toda la visita: si ella cierra y vuelve a abrir la
// grabadora, la canción sigue donde se quedó.
let song = null;
let trackIndex = 0;
const lyricsCache = new Map();

// [mm:ss.xx] texto  (se permiten varias marcas por línea y [offset:±ms])
export function parseLRC(text) {
  let offset = 0;
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const off = raw.match(/^\[offset:\s*([+-]?\d+)\]/i);
    if (off) offset = parseInt(off[1], 10) / 1000;
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const words = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const s of stamps) {
      const t = parseInt(s[1], 10) * 60 + parseFloat(s[2].replace(':', '.'));
      lines.push({ t, text: words });
    }
  }
  return lines.map((l) => ({ ...l, t: Math.max(0, l.t - offset) })).sort((a, b) => a.t - b.t);
}

async function loadLyrics(src) {
  if (!src) return [];
  if (!lyricsCache.has(src)) {
    lyricsCache.set(src, fetch(src).then((r) => (r.ok ? r.text() : '')).then(parseLRC).catch(() => []));
  }
  return lyricsCache.get(src);
}

// Un casete de color distinto por canción: lila (el de ella) y verde agua (el de él).
const THEMES = [
  { body: '#b597e2', bodyD: '#8a6cc2', bodyL: '#d8c7f6', stripe: '#f4a6c1' },
  { body: '#8fd3c4', bodyD: '#5fa89a', bodyL: '#c9eee6', stripe: '#ffd27a' },
];

/* ---------------- la chiquita que cuelga del árbol ---------------- */

export function radioTexture(hover = false) {
  const { c, ctx } = makeCanvas(34, 22);
  const r = (x, y, w, h, col) => Rf(ctx, x, y, w, h, col);
  // asa
  r(7, 1, 20, 2, '#2e2e38');
  r(6, 1, 2, 5, SIL_D);
  r(26, 1, 2, 5, SIL_D);
  // cuerpo plateado con su dial
  r(1, 5, 32, 15, SIL);
  r(1, 5, 32, 1, SIL_H);
  r(1, 18, 32, 2, SIL_D);
  r(7, 7, 20, 2, GLASS);
  r(19, 7, 1, 2, '#e0426e');
  // bocinas
  for (const cx of [8, 25]) {
    disc(ctx, cx, 13, 4, DARK);
    disc(ctx, cx, 13, 1, '#44444f');
    P(ctx, cx - 1, 12, '#6b6b7a');
  }
  // casete lila al centro
  r(13, 11, 8, 6, SIL_DD);
  r(14, 12, 6, 4, hover ? '#d8c7f6' : '#b597e2');
  P(ctx, 15, 14, '#3a2f4a');
  P(ctx, 18, 14, '#3a2f4a');
  r(3, 20, 3, 1, SIL_DD);
  r(28, 20, 3, 1, SIL_DD);
  return { tex: pixelTexture(outlineCanvas(c, hover ? OUT_HOVER : OUT)), w: 34, h: 22 };
}

/* ---------------- la grande, en primer plano ---------------- */

const BW = 190, BH = 153;                     // grabadora, en píxeles del dibujo
const DIAL = { x: 32, y: 24, w: 126, h: 19 };  // ventanita del dial
// teclas debajo del casete y los medidores: [id, x]; cada una mide 12×10
const KEYS = [['prev', 69], ['play', 82], ['next', 95], ['rec', 108]];
const KEY_Y = 129;
const SPEAKERS = [37, 152];
const SPK_Y = 100;
const DECK = { x: 76, y: 64 };                 // el casete adentro (38×24)
// arriba de las bocinas: a la izquierda el display con el número de canción y
// a la derecha el estantito con los casetes que esperan su turno (22×15)
const LCD = { x: 10, y: 48, w: 54, h: 23 };
const SHELF = { x: 126, y: 48, w: 54, h: 23 };
const MINI_W = 22, MINI_H = 15, MINI_Y = 51;
const slotX = (i, n) => SHELF.x + 1 + Math.round(((i + 0.5) * (SHELF.w - 2)) / n - MINI_W / 2);
// cambio de casete (segundos): sale el que suena, regresa a su lugar del
// estante, despega el nuevo, llega arriba de la casetera, entra y se asienta
const SWAP = { eject: 0.16, back: 0.62, lift: 0.46, over: 0.92, drop: 1.08, end: 1.22 };
const GLYPH = {
  prev: ['#...#', '#..##', '#.###', '#..##', '#...#'],
  next: ['#...#', '##..#', '###.#', '##..#', '#...#'],
  play: ['.#...', '.##..', '.###.', '.##..', '.#...'],
  pause: ['.#.#.', '.#.#.', '.#.#.', '.#.#.', '.#.#.'],
  rec: ['.###.', '#####', '#####', '#####', '.###.'],
};

// lo que no se mueve: se pinta una sola vez (n: cuántas canciones hay)
function paintBase(brand, n) {
  const { c, ctx } = makeCanvas(BW, BH);
  const r = (x, y, w, h, col) => Rf(ctx, x, y, w, h, col);
  // asa con sus postes
  r(24, 3, 142, 6, '#2e2e38');
  r(24, 3, 142, 1, '#5d5d6b');
  for (let x = 28; x < 164; x += 4) r(x, 5, 1, 3, '#1d1d24');
  r(18, 3, 6, 20, SIL_D);
  r(18, 3, 2, 20, SIL_H);
  r(166, 3, 6, 20, SIL_D);
  r(170, 3, 2, 20, SIL_DD);
  // perillas
  for (const x of [36, 48, 60]) {
    disc(ctx, x, 16, 4, '#1d1d24');
    r(x - 2, 13, 4, 1, '#5d5d6b');
    P(ctx, x, 16, SIL_DD);
  }
  // cuerpo plateado
  r(2, 20, 186, 130, SIL);
  r(2, 20, 186, 2, SIL_H);
  r(2, 22, 2, 124, SIL_L);
  r(186, 22, 2, 124, SIL_D);
  r(2, 144, 186, 6, SIL_D);
  // dial con su escala
  r(DIAL.x - 2, DIAL.y - 2, DIAL.w + 4, DIAL.h + 4, SIL_DD);
  r(DIAL.x, DIAL.y, DIAL.w, DIAL.h, GLASS);
  drawText(ctx, 'FM', DIAL.x + 3, DIAL.y - 1, '#6b6b7a');
  [88, 92, 96, 100, 104, 108].forEach((n, i) => drawText(ctx, String(n), DIAL.x + 18 + i * 19, DIAL.y - 1, '#8f8f9c'));
  for (let x = DIAL.x + 4; x < DIAL.x + DIAL.w - 4; x += 3) r(x, DIAL.y + 8, 1, x % 9 === 0 ? 2 : 1, '#5d5d6b');
  // placas cromadas a los lados del dial
  for (const x of [8, 162]) {
    r(x, 24, 20, 19, SIL_L);
    r(x, 24, 20, 1, SIL_H);
    r(x + 3, 31, 14, 5, '#8f8f9c');
    r(x + 4, 32, 12, 3, SIL_H);
  }
  // display de la canción (los números los pinta paintRadio)
  r(LCD.x, LCD.y, LCD.w, LCD.h, SIL_DD);
  r(LCD.x + 1, LCD.y + 1, LCD.w - 2, LCD.h - 2, GLASS);
  drawText(ctx, 'PISTA', LCD.x + 4, LCD.y, '#8a5a7a');
  // estantito con su repisa y un hueco punteado por casete
  r(SHELF.x, SHELF.y, SHELF.w, SHELF.h, SIL_DD);
  r(SHELF.x + 1, SHELF.y + 1, SHELF.w - 2, SHELF.h - 2, '#3a3a46');
  r(SHELF.x + 1, SHELF.y + 18, SHELF.w - 2, 4, SIL_D);
  r(SHELF.x + 1, SHELF.y + 18, SHELF.w - 2, 1, SIL_L);
  for (let i = 0; i < n; i++) {
    const x = slotX(i, n);
    r(x + 1, MINI_Y + 1, MINI_W - 2, MINI_H - 2, '#2e2e38');
    for (let k = 0; k < MINI_W; k += 2) {
      P(ctx, x + k, MINI_Y, '#5d5d6b');
      P(ctx, x + k + 1, MINI_Y + MINI_H - 1, '#5d5d6b');
    }
    for (let k = 2; k < MINI_H - 1; k += 2) {
      P(ctx, x, MINI_Y + k, '#5d5d6b');
      P(ctx, x + MINI_W - 1, MINI_Y + k, '#5d5d6b');
    }
  }
  // bocinas: aro cromado, anillo cobrizo y rejilla
  for (const cx of SPEAKERS) {
    disc(ctx, cx, SPK_Y, 27, SIL_DD);
    disc(ctx, cx, SPK_Y, 26, '#e8e8ee');
    disc(ctx, cx, SPK_Y, 24, '#5a3a2c');
    disc(ctx, cx, SPK_Y, 23, DARK);
    for (let y = -22; y <= 22; y += 2) {
      const w = Math.floor(Math.sqrt(22 * 22 - y * y));
      for (let x = -w + ((y / 2) & 1); x <= w; x += 2) P(ctx, cx + x, SPK_Y + y, '#30303a');
    }
  }
  // casetera: marco, marca y ventanita
  r(70, 46, 50, 55, SIL_DD);
  r(72, 48, 46, 51, SIL_L);
  r(72, 48, 46, 1, SIL_H);
  const bw = measure(brand);
  drawText(ctx, brand, Math.round(95 - bw / 2), 48, '#6b6b7a');
  r(74, 58, 42, 38, '#3a3a46');
  r(75, 59, 40, 1, '#5d5d6b');
  // ejes de los carretes: se ven cuando el casete sale
  for (const x of [DECK.x + 14, DECK.x + 24]) {
    disc(ctx, x, DECK.y + 16, 2, '#e8e8ee');
    P(ctx, x, DECK.y + 16, '#5d5d6b');
  }
  // medidores VU
  r(70, 103, 50, 22, SIL_DD);
  r(72, 105, 46, 18, SIL_L);
  // charola hundida de las teclas
  r(66, KEY_Y - 3, 58, 16, SIL_DD);
  r(67, KEY_Y - 2, 56, 14, '#3a3a46');
  // corazón negro de calcomanía y patitas
  heart(ctx, 176, 137, 7, ...BLACK);
  // más calcomanías: Kuromi, un murcielaguito en la casetera y el casco de Master Chief
  ctx.drawImage(sticker('kuromi'), 3, 121);
  ctx.drawImage(sticker('murcielago'), 102, 47);
  ctx.drawImage(sticker('masterchief'), 145, 124);
  r(8, 150, 16, 2, SIL_DD);
  r(166, 150, 16, 2, SIL_DD);
  return outlineCanvas(c, OUT);
}

function glyph(ctx, g, x, y, col) {
  GLYPH[g].forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && P(ctx, x + i, y + j, col)));
}

function smallReel(ctx, cx, cy, big, angle, hub) {
  disc(ctx, cx, cy, big ? 3 : 2, '#5a3a2c');
  disc(ctx, cx, cy, 1, '#f3eef8');
  P(ctx, cx, cy, hub);
  P(ctx, cx + Math.round(Math.cos(angle) * 1.4), cy + Math.round(Math.sin(angle) * 1.4), hub);
}

function cassette(ctx, x, y, angle, progress, th, label) {
  const r = (a, b, w, h, col) => Rf(ctx, a, b, w, h, col);
  r(x + 1, y, 36, 24, INK);
  r(x, y + 1, 38, 22, INK);
  r(x + 1, y + 1, 36, 22, th.body);
  r(x + 2, y + 1, 34, 1, th.bodyL);
  r(x + 1, y + 21, 36, 2, th.bodyD);
  r(x + 4, y + 3, 30, 8, '#fff4e6');
  r(x + 4, y + 9, 30, 2, th.stripe);
  drawText(ctx, label, Math.round(x + 19 - measure(label) / 2), y + 1, '#6b2a55');
  r(x + 9, y + 13, 20, 7, '#2a1b33');
  smallReel(ctx, x + 14, y + 16, progress < 0.5, angle, th.bodyD);
  smallReel(ctx, x + 24, y + 16, progress >= 0.5, angle, th.bodyD);
}

// casetito del estante (22×15), con su número en la etiqueta
function miniCassette(ctx, x, y, th, n) {
  const r = (a, b, w, h, col) => Rf(ctx, a, b, w, h, col);
  r(x + 1, y, 20, 15, INK);
  r(x, y + 1, 22, 13, INK);
  r(x + 1, y + 1, 20, 13, th.body);
  r(x + 2, y + 1, 18, 1, th.bodyL);
  r(x + 1, y + 12, 20, 2, th.bodyD);
  r(x + 3, y + 2, 16, 6, '#fff4e6');
  r(x + 3, y + 7, 16, 1, th.stripe);
  drawText(ctx, String(n), Math.floor(x + 11 - measure(String(n)) / 2), y - 1, '#6b2a55');
  r(x + 5, y + 9, 12, 3, '#2a1b33');
  for (const cx of [x + 8, x + 13]) {
    r(cx - 1, y + 9, 3, 3, '#5a3a2c');
    P(ctx, cx, y + 10, '#f3eef8');
  }
}

// Dónde va cada casete k segundos después de empezar el cambio. El que sonaba
// salta y vuela a su lugar del estante; el nuevo despega, llega arriba de la
// casetera y entra. Devuelve los que van en el aire (centro; s: 0 chiquito,
// 1 grande; lift: qué tan despegados van) y qué huecos del estante están vacíos.
function swapPose(k, from, to, n) {
  const dx = DECK.x + 19, dy = DECK.y + 12;
  const sx = (i) => slotX(i, n) + MINI_W / 2, sy = MINI_Y + MINI_H / 2;
  const span = (a, b) => clamp01((k - a) / (b - a));
  const air = [], empty = new Set();
  if (k < SWAP.back) {
    empty.add(from);
    if (k < SWAP.eject) {
      const u = easeOut(span(0, SWAP.eject));
      air.push({ i: from, x: dx, y: dy - 10 * u, s: 1, lift: u });
    } else {
      const u = easeInOut(span(SWAP.eject, SWAP.back));
      air.push({ i: from, x: lerp(dx, sx(from), u), y: lerp(dy - 10, sy, u) - Math.sin(u * Math.PI) * 14, s: 1 - u, lift: 1 - u });
    }
  }
  if (k >= SWAP.lift) {
    empty.add(to);
    let p;
    if (k < SWAP.over) {
      const u = easeInOut(span(SWAP.lift, SWAP.over));
      p = { x: lerp(sx(to), dx, u), y: lerp(sy, dy - 16, u) - Math.sin(u * Math.PI) * 14, s: u, lift: Math.min(1, u * 3) };
    } else if (k < SWAP.drop) {
      const u = span(SWAP.over, SWAP.drop) ** 2;
      p = { x: dx, y: dy - 16 * (1 - u), s: 1, lift: 1 - u };
    } else {
      p = { x: dx, y: dy - Math.round(Math.sin(span(SWAP.drop, SWAP.end) * Math.PI) * 2), s: 1, lift: 0 };
    }
    air.push({ i: to, ...p });
  }
  return { air, empty };
}

function vuMeter(ctx, x, y, level) {
  Rf(ctx, x, y, 21, 14, '#f2d36b');
  Rf(ctx, x, y, 21, 1, '#fbe7a1');
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI * 0.8 + (i / 8) * Math.PI * 0.6;
    P(ctx, x + 10 + Math.round(Math.cos(a) * 9), y + 12 + Math.round(Math.sin(a) * 9), i > 6 ? '#e0426e' : '#5a3a2c');
  }
  const a = -Math.PI * 0.8 + clamp01(level) * Math.PI * 0.6;
  line(ctx, x + 10, y + 12, x + 10 + Math.round(Math.cos(a) * 8), y + 12 + Math.round(Math.sin(a) * 8), '#3a2a2a');
  Rf(ctx, x + 9, y + 12, 3, 2, '#3a2a2a');
}

// o: { t, playing, progress, bass, vu: [l, r], angle, key (apretada), marquee,
//      counter ("01/02"), blink, status ('play' | 'pause' | null),
//      deck: { theme, label } | null (el casete que está adentro),
//      shelf: [tema | null] (los del estante), hover (el que tiene el mouse encima),
//      air: [{ img: { big, mini }, x, y, s, lift }] (los que van volando) }
function paintRadio(ctx, base, o) {
  ctx.clearRect(0, 0, BW, BH);
  ctx.drawImage(base, 0, 0);
  // teclas en su charola (la apretada se hunde)
  for (const [id, x] of KEYS) {
    const down = o.key === id ? 2 : 0;
    Rf(ctx, x - 1, KEY_Y - 1 + down, 14, 12 - down, OUT);
    Rf(ctx, x, KEY_Y + down, 12, 8, id === 'rec' ? '#e8c8cc' : '#e8e8ee');
    Rf(ctx, x, KEY_Y + down, 12, 1, '#ffffff');
    if (!down) Rf(ctx, x, KEY_Y + 8, 12, 2, '#9a9aa6');
    const g = id === 'play' && o.playing ? 'pause' : id;
    glyph(ctx, g, x + 4, KEY_Y + 2 + down, id === 'rec' ? '#e0426e' : '#3a3a46');
  }
  // dial: el nombre de la canción corre como en una radio y la aguja avanza
  ctx.save();
  ctx.beginPath();
  ctx.rect(DIAL.x + 1, DIAL.y + 11, DIAL.w - 2, 7);
  ctx.clip();
  const mw = measure(o.marquee) + 30;
  const off = o.playing ? Math.floor(o.t * 18) % mw : 0;
  for (let x = DIAL.x + 4 - off; x < DIAL.x + DIAL.w; x += mw) drawText(ctx, o.marquee, x, DIAL.y + 9, o.playing ? '#f28ab2' : '#8a6a9a');
  ctx.restore();
  const nx = Math.round(DIAL.x + 4 + o.progress * (DIAL.w - 8));
  Rf(ctx, nx, DIAL.y + 1, 2, DIAL.h - 2, '#e0426e');
  // foquito verde de encendido en la placa de la derecha
  Rf(ctx, 176, 26, 2, 2, o.playing ? '#7cf2a0' : '#5d6b62');
  // bocinas: el cono late con los graves
  for (const cx of SPEAKERS) {
    const b = Math.round(o.bass * 3);
    disc(ctx, cx, SPK_Y, 10 + b, '#3a3a46');
    disc(ctx, cx, SPK_Y, 9 + b, '#2e2e38');
    disc(ctx, cx, SPK_Y, 5 + b, '#4a4a58');
    P(ctx, cx - 2 - b, SPK_Y - 3 - b, '#8f8f9c');
  }
  // display: el número de canción en LEDs grandotes, con los apagados de fondo
  const led = (text, col) => {
    ctx.save();
    ctx.translate(LCD.x + 8, LCD.y + 10);
    ctx.scale(2, 2);
    drawText(ctx, text, 0, -3, col);
    ctx.restore();
  };
  led('88/88', '#3a2a3e');
  if (!o.blink) led(o.counter, '#f28ab2');
  if (o.status) glyph(ctx, o.status, LCD.x + 44, LCD.y + 3, '#f28ab2');
  // estantito: los casetes que esperan su turno
  o.shelf.forEach((th, i) => th && miniCassette(ctx, slotX(i, o.shelf.length), MINI_Y - (o.hover === i ? 2 : 0), th, i + 1));
  // casete y medidores
  if (o.deck) cassette(ctx, DECK.x, DECK.y, o.angle, o.progress, o.deck.theme, o.deck.label);
  vuMeter(ctx, 73, 107, o.vu[0]);
  vuMeter(ctx, 96, 107, o.vu[1]);
  // los que van volando en el cambio de casete, con su sombrita
  for (const a of o.air) {
    const w = Math.round(lerp(MINI_W, 38, a.s)), h = Math.round(lerp(MINI_H, 24, a.s));
    const x = Math.round(a.x - w / 2), y = Math.round(a.y - h / 2);
    if (a.lift > 0.1) {
      ctx.globalAlpha = 0.28;
      Rf(ctx, x + 2, y + 1 + Math.round(a.lift * 4), w - 2, h - 1, '#000');
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(a.s < 0.5 ? a.img.mini : a.img.big, x, y, w, h);
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const CLOSE_ICON = '<svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h2v1H0zM1 1h2v1H1zM2 2h3v3H2zM4 1h2v1H4zM5 0h2v1H5zM1 5h2v1H1zM0 6h2v1H0zM4 5h2v1H4zM5 6h2v1H5z"/></svg>';

// tracks: lista de { titulo, artista, audio, letra, dedicatoria?, etiqueta? }
export class Radio {
  constructor(tracks, { brand = 'G&E', onClose } = {}) {
    this.tracks = tracks;
    this.brand = brand;
    this.onClose = onClose;
    this.isOpen = false;
  }

  // from: rectángulo en pantalla (px) de la grabadora que cuelga del árbol
  play(from) {
    if (this.isOpen) return;
    this.isOpen = true;
    const tracks = this.tracks;
    if (!song) {
      song = new Audio();
      song.preload = 'auto';
    }
    if (trackIndex >= tracks.length) trackIndex = 0;
    sfx.init(window.CONFIG?.musica);
    const analyser = sfx.connectSong(song);
    const freq = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    // tamaño entero de píxel; en pantallas chiquitas se encoge un poco
    const vw = innerWidth, vh = innerHeight;
    const fitS = Math.min((vw * 0.94) / BW, (vh * 0.55) / BH);
    const S = Math.max(2, Math.floor(fitS));
    const shrink = Math.min(1, fitS / S);

    const root = el('div', 'radio-show');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Grabadora con nuestras canciones');
    const stage = el('div', 'radio-show__escena');
    const box = el('div', 'radio-show__grabadora');
    box.style.width = `${BW * S * shrink}px`;
    box.style.height = `${BH * S * shrink}px`;
    const inner = el('div', 'radio-show__cuerpo');
    Object.assign(inner.style, { width: `${BW * S}px`, height: `${BH * S}px`, transform: shrink < 1 ? `scale(${shrink})` : '' });
    const cab = el('canvas', 'radio-show__mueble');
    cab.width = BW;
    cab.height = BH;
    cab.setAttribute('aria-hidden', 'true');
    inner.append(cab);
    const place = (e, x, y, w, h) => {
      Object.assign(e.style, { left: `${x * S}px`, top: `${y * S}px`, width: `${w * S}px`, height: `${h * S}px` });
      inner.append(e);
      return e;
    };
    const key = (id, label) => {
      const b = el('button', 'radio-show__control');
      b.type = 'button';
      b.setAttribute('aria-label', label);
      return place(b, KEYS.find((k) => k[0] === id)[1] - 1, KEY_Y - 2, 14, 14);
    };
    const prevBtn = key('prev', 'Canción anterior');
    const playBtn = key('play', 'Reproducir');
    const nextBtn = key('next', 'Siguiente canción');
    // el dial también sirve para adelantar o regresar la canción
    const dial = place(el('div', 'radio-show__control radio-show__dial'), DIAL.x, DIAL.y, DIAL.w, DIAL.h);
    dial.tabIndex = 0;
    dial.setAttribute('role', 'slider');
    dial.setAttribute('aria-label', 'Posición en la canción');
    dial.setAttribute('aria-valuemin', '0');
    // los casetes del estante también se tocan para ponerlos
    const slotBtns = tracks.map((tr, i) => {
      const b = el('button', 'radio-show__control');
      b.type = 'button';
      b.setAttribute('aria-label', `Poner la canción ${i + 1}: ${tr.titulo || ''}`);
      return place(b, slotX(i, tracks.length) - 2, MINI_Y - 4, MINI_W + 4, MINI_H + 6);
    });
    box.append(inner);

    const info = el('div', 'radio-show__info');
    const nowEl = el('p', 'radio-show__cancion');
    const notice = el('p', 'radio-show__aviso');
    notice.hidden = true;
    const list = el('ol', 'radio-show__letra');
    const dedication = el('p', 'radio-show__dedicatoria');
    info.append(nowEl, notice, list, dedication);
    stage.append(box, info);
    const closeBtn = el('button', 'radio-show__cerrar');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Cerrar la grabadora');
    closeBtn.innerHTML = CLOSE_ICON;
    root.append(el('div', 'radio-show__fondo'), stage, closeBtn);
    document.body.append(root);
    this.root = root;
    this.timers = [];

    const ctx = cab.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const base = paintBase(this.brand, tracks.length);
    const labelOf = (tr) => tr.etiqueta || 'PARA TI ♥';
    // cada casete suelto, grande y chiquito, para cuando van volando
    const sprites = tracks.map((tr, i) => {
      const th = THEMES[i % THEMES.length];
      const big = makeCanvas(38, 24), mini = makeCanvas(MINI_W, MINI_H);
      cassette(big.ctx, 0, 0, 0, 0, th, labelOf(tr));
      miniCassette(mini.ctx, 0, 0, th, i + 1);
      return { big: big.c, mini: mini.c };
    });
    let cfg = tracks[trackIndex];
    let theme = THEMES[0];
    let lines = [];
    let current = -2;
    let angle = 0;
    let bass = 0, vu = [0, 0];
    let pressed = null;
    let hoverSlot = -1;
    let swap = null;              // { from, to, t0 } mientras se cambia el casete
    let userScrollUntil = 0;
    let loadToken = 0;
    let t = 0, last = performance.now();

    const setPlaying = (on) => {
      playBtn.setAttribute('aria-label', on ? 'Pausar' : 'Reproducir');
      root.classList.toggle('sonando', on);
      // mientras se cambia el casete, la música de fondo no se asoma
      sfx.duckMusic(on || !!swap);
    };
    const warn = (msg) => {
      notice.textContent = msg;
      notice.hidden = !msg;
    };
    const seek = (s) => {
      if (!isFinite(song.duration)) return;
      song.currentTime = Math.max(0, Math.min(song.duration - 0.1, s));
      tick(0, true);
    };

    function tick(dt, force = false) {
      t += dt;
      const now = song.currentTime || 0;
      const d = song.duration || 0;
      const p = d ? now / d : 0;
      dial.setAttribute('aria-valuemax', String(Math.round(d)));
      dial.setAttribute('aria-valuenow', String(Math.round(now)));
      const mm = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      dial.setAttribute('aria-valuetext', `${mm(now)} de ${mm(d || 0)}`);

      // línea actual de la letra
      let i = -1;
      while (i + 1 < lines.length && lines[i + 1].t <= now + 0.15) i++;
      if (i !== current || force) {
        current = i;
        [...list.children].forEach((li, k) => {
          li.classList.toggle('actual', k === i);
          li.classList.toggle('pasada', k < i);
        });
        const li = list.children[Math.max(0, i)];
        if (li && performance.now() > userScrollUntil) {
          list.scrollTo({ top: li.offsetTop - list.clientHeight / 2 + li.offsetHeight / 2, behavior: REDUCED ? 'auto' : 'smooth' });
        }
      }

      // graves para las bocinas; graves y agudos para las dos agujas
      if (freq && !song.paused) {
        analyser.getByteFrequencyData(freq);
        const avg = (a, b) => freq.slice(a, b).reduce((s, v) => s + v, 0) / (b - a) / 255;
        bass = lerp(bass, avg(1, 4), 0.5);
        vu = [lerp(vu[0], avg(2, 10) * 1.3, 0.35), lerp(vu[1], avg(10, 40) * 1.8, 0.35)];
      } else {
        bass *= 0.85;
        vu = vu.map((v) => v * 0.9);
      }
      if (!song.paused) angle += dt * 7;
      const k = swap ? (performance.now() - swap.t0) / 1000 : 0;
      const pose = swap && swapPose(Math.min(k, SWAP.end), swap.from, swap.to, tracks.length);
      const pad = (v) => String(v).padStart(2, '0');
      paintRadio(ctx, base, {
        t, playing: !song.paused, progress: p, bass: bass > 0.55 ? bass : 0, vu, angle, key: pressed,
        marquee: `${cfg.titulo || ''} - ${cfg.artista || ''}`,
        counter: `${pad(trackIndex + 1)}/${pad(tracks.length)}`,
        blink: !!pose && Math.floor(k * 7) % 2 === 1,
        status: pose ? null : song.paused ? 'pause' : 'play',
        deck: pose ? null : { theme, label: labelOf(cfg) },
        shelf: tracks.map((_, i) => ((pose ? pose.empty.has(i) : i === trackIndex) ? null : THEMES[i % THEMES.length])),
        hover: hoverSlot,
        air: pose ? pose.air.map((a) => ({ ...a, img: sprites[a.i] })) : [],
      });
    }

    const loop = (nowMs) => {
      if (!this.isOpen) return;
      const dt = Math.min(0.25, (nowMs - last) / 1000);
      last = nowMs;
      tick(dt);
      this.raf = requestAnimationFrame(loop);
    };

    const onError = () => {
      warn(`No encuentro la canción. Guárdala en ${cfg.audio} para que suene aquí.`);
      setPlaying(false);
    };

    // Cambio de casete: expulsa el que suena y mete el nuevo; ya adentro,
    // (si toca) empieza a sonar.
    const startSwap = (from, to, autoplay) => {
      swap = { from, to, t0: performance.now() };
      setPlaying(false);
      sfx.eject();
      this.timers.push(
        setTimeout(sfx.paper, SWAP.lift * 1000),
        setTimeout(sfx.tick, SWAP.back * 1000),
        setTimeout(sfx.clack, SWAP.drop * 1000),
        setTimeout(() => {
          swap = null;
          if (autoplay && cfg.audio) song.play().catch(() => setPlaying(false));
          else setPlaying(false);
          tick(0, true);
        }, SWAP.end * 1000),
      );
    };

    // Cambia de canción; con autoplay empieza a sonar en cuanto se pueda. Con
    // animate se ve el cambio de casete y suena cuando el nuevo ya entró.
    const select = (i, autoplay, animate = false) => {
      const from = trackIndex;
      trackIndex = (i + tracks.length) % tracks.length;
      const swapping = animate && trackIndex !== from && !REDUCED;
      if (swapping) startSwap(from, trackIndex, autoplay);
      hoverSlot = -1;
      slotBtns.forEach((b, k) => (b.hidden = k === trackIndex));
      cfg = tracks[trackIndex];
      theme = THEMES[trackIndex % THEMES.length];
      const src = cfg.audio || '';
      if (song.dataset.src !== src) {
        song.pause();
        song.dataset.src = src;
        if (src) song.src = src;
        else song.removeAttribute('src');
      }
      nowEl.textContent = [cfg.titulo, cfg.artista].filter(Boolean).join(' · ');
      dedication.textContent = cfg.dedicatoria || '';
      dedication.hidden = !cfg.dedicatoria;
      warn(src ? '' : 'Falta indicar el archivo de la canción en config.js.');
      if (src && song.error) onError();

      lines = [];
      current = -2;
      list.replaceChildren();
      const token = ++loadToken;
      loadLyrics(cfg.letra).then((ls) => {
        if (token !== loadToken) return;
        lines = ls;
        list.replaceChildren(
          ...ls.map((l) => {
            const li = el('li', null, l.text || '♪');
            li.addEventListener('click', () => {
              seek(l.t);
              if (song.paused && !swap) song.play().catch(() => {});
            });
            return li;
          }),
        );
        if (!ls.length) list.append(el('li', 'radio-show__sin-letra', `La letra aparecerá aquí cuando agregues ${cfg.letra || 'el archivo .lrc'}.`));
        tick(0, true);
      });
      if (autoplay && src && !swapping) song.play().catch(() => {});
    };

    // las teclas se hunden un momentito al apretarlas
    const press = (id, fn) => () => {
      pressed = id;
      sfx.tick();
      fn();
      this.timers.push(setTimeout(() => (pressed = null), 180));
    };
    playBtn.addEventListener('click', press('play', () => {
      if (!cfg.audio || swap) return;
      if (song.paused) song.play().catch(() => warn('Toca de nuevo para reproducir.'));
      else song.pause();
    }));
    prevBtn.addEventListener('click', press('prev', () => {
      if (swap) return;
      if (song.currentTime > 3) seek(0);
      else select(trackIndex - 1, true, true);
    }));
    nextBtn.addEventListener('click', press('next', () => !swap && select(trackIndex + 1, true, true)));
    slotBtns.forEach((b, i) => {
      b.addEventListener('pointerenter', () => (hoverSlot = i));
      b.addEventListener('pointerleave', () => hoverSlot === i && (hoverSlot = -1));
      b.addEventListener('click', () => {
        if (swap || i === trackIndex) return;
        select(i, true, true);
        if (document.activeElement === b) playBtn.focus({ preventScroll: true });
      });
    });
    dial.addEventListener('pointerdown', (e) => {
      const r = dial.getBoundingClientRect();
      seek(((e.clientX - r.left) / r.width) * (song.duration || 0));
    });
    dial.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') seek(song.currentTime + 5);
      else if (e.key === 'ArrowLeft') seek(song.currentTime - 5);
      else return;
      e.preventDefault();
    });
    list.addEventListener('wheel', () => (userScrollUntil = performance.now() + 2500), { passive: true });
    list.addEventListener('touchmove', () => (userScrollUntil = performance.now() + 2500), { passive: true });
    closeBtn.addEventListener('click', () => this.close());

    const onPlay = () => setPlaying(true);
    // al terminar, "ended" decide (así la música de fondo no se asoma entre canciones)
    const onPause = () => !song.ended && setPlaying(false);
    // al terminar una canción sigue la siguiente (si de verdad llegó al final:
    // una descarga cortada también dispara "ended")
    const onEnded = () => {
      const finished = song.currentTime > 5 && song.currentTime >= song.duration - 1.5;
      if (finished && trackIndex + 1 < tracks.length) select(trackIndex + 1, true, true);
      else setPlaying(false);
    };
    song.addEventListener('play', onPlay);
    song.addEventListener('pause', onPause);
    song.addEventListener('ended', onEnded);
    song.addEventListener('error', onError);
    this.unlisten = () => {
      song.removeEventListener('play', onPlay);
      song.removeEventListener('pause', onPause);
      song.removeEventListener('ended', onEnded);
      song.removeEventListener('error', onError);
    };
    this.cancelLyrics = () => loadToken++;

    this.onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Tab') {
        // el foco se queda dentro de la grabadora
        const f = [...root.querySelectorAll('button:not([hidden]), [tabindex="0"]')];
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
      }
    };
    document.addEventListener('keydown', this.onKey);

    setPlaying(false);
    tick(0, true);
    this.raf = requestAnimationFrame(loop);
    // ya en primer plano: se enciende y empieza a sonar (o sigue donde se quedó)
    const turnOn = () => {
      root.classList.add('encendida');
      if (!swap) select(trackIndex, true);
      playBtn.focus({ preventScroll: true });
    };
    if (REDUCED || !from) return turnOn();

    // vuela desde el árbol hasta su lugar
    sfx.swish();
    const end = box.getBoundingClientRect();
    const fx = from.x + from.w / 2 - (end.left + end.width / 2);
    const fy = from.y + from.h / 2 - (end.top + end.height / 2);
    const s0 = from.w / end.width;
    const t0 = performance.now();
    const FLY = 1;
    const fly = (nowMs) => {
      if (!this.isOpen) return;
      const k = easeInOut(clamp01((nowMs - t0) / 1000 / FLY));
      const arc = Math.sin(k * Math.PI) * Math.min(80, vh * 0.1);
      box.style.transform = `translate(${lerp(fx, 0, k)}px, ${lerp(fy, 0, k) - arc}px) rotate(${(1 - k) * 10}deg) scale(${lerp(s0, 1, k)})`;
      if (k < 1) this.flyRaf = requestAnimationFrame(fly);
    };
    this.flyRaf = requestAnimationFrame(fly);
    this.timers.push(setTimeout(() => {
      box.style.transform = '';
      turnOn();
    }, FLY * 1000 + 60));
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.timers.forEach(clearTimeout);
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.flyRaf);
    document.removeEventListener('keydown', this.onKey);
    this.cancelLyrics();
    song.pause();
    this.unlisten();
    sfx.duckMusic(false);
    sfx.swish();
    const root = this.root;
    root.classList.add('saliendo');
    setTimeout(() => root.remove(), 320);
    this.onClose?.();
  }
}
