import * as sfx from './audio.js';
import { makeCanvas, outlineCanvas } from './sprites.js';
import { drawText, measure } from './pixelfont.js';
import { TU, ELLA, paintFront, paintSide, paintBack, outline, mirror, buildFrames } from './personitas.js';

/* =====================================================================
   Historietas de "Cómo empezó" y "Lo que viene": viñetas pixeladas y
   animadas con su texto. Cada escena pinta una vez su fondo fijo y, encima,
   lo que se mueve según t (segundos desde que empezó la viñeta). Los textos
   viven en config.js.
   ===================================================================== */

const W = 160, H = 96;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const INK = '#3a1f3d';

// Lupita y los compañeros del salón son personajes genéricos.
const LUPITA = {
  leg: 4, torso: 5,
  skin: '#d9a07c', skinD: '#b98062',
  hair: '#5a3423', hairL: '#8a5a3e', long: true,
  style: 'blusa', top: '#f2c14e', topDark: '#c9962f', topLight: '#fbe08f',
  pants: '#4a5f8a', pantsD: '#34456a', pantsL: '#6a80aa', wide: false,
  shoe: '#3b2f2c', toe: '#e8e0d0', frontShoe: '#e8e0d0',
};
const BASE = {
  leg: 5, torso: 6, wide: false, shoe: '#3b2f2c', toe: '#3b2f2c', frontShoe: '#3b2f2c',
  pants: '#3b4a6b', pantsD: '#2c3752', pantsL: '#56688e',
};
const COMPAS = [
  { ...BASE, skin: '#e0ad8a', skinD: '#c28f6e', hair: '#2a1d16', hairL: '#4d372b', long: false, style: 'playera', top: '#4f7cc4', topDark: '#3a5d99', topLight: '#7aa0dc' },
  { ...BASE, leg: 4, torso: 5, skin: '#c98a62', skinD: '#a86f4b', hair: '#1c1418', hairL: '#3d2a33', long: true, style: 'blusa', top: '#e0736f', topDark: '#b8514e', topLight: '#f2a19d' },
  { ...BASE, skin: '#b87a55', skinD: '#98603f', hair: '#3a2418', hairL: '#5e3e2c', long: false, style: 'playera', top: '#6aa66a', topDark: '#4d8450', topLight: '#8fc68c' },
  { ...BASE, leg: 4, torso: 5, skin: '#e6b596', skinD: '#c99676', hair: '#6b4a2e', hairL: '#8f6a48', long: true, style: 'blusa', top: '#8fb8e8', topDark: '#6a93c4', topLight: '#b8d4f4' },
  { ...BASE, skin: '#d19670', skinD: '#b17a55', hair: '#151013', hairL: '#3a2b31', long: false, style: 'playera', top: '#9a7fc2', topDark: '#7a5fa3', topLight: '#bba5dc' },
];

/* ---------------- pinceles ---------------- */
// (el minijuego de "7 razones" también los usa)

export function Rf(c, x, y, w, h, col) {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}
export const P = (c, x, y, col) => Rf(c, x, y, 1, 1, col);

export function dith(c, x, y, w, h, col, ph = 0) {
  c.fillStyle = col;
  for (let j = 0; j < h; j++) for (let i = (j + ph) & 1; i < w; i += 2) c.fillRect(x + i, y + j, 1, 1);
}

export function disc(c, cx, cy, r, col) {
  c.fillStyle = col;
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)) + 0.35);
    c.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2 + 1, 1);
  }
}

export function line(c, x0, y0, x1, y1, col) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) P(c, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col);
}

function inPoly(pts, x, y) {
  let r = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}

export function poly(c, pts, col) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  c.fillStyle = col;
  for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) {
      if (inPoly(pts, x + 0.5, y + 0.5)) c.fillRect(x, y, 1, 1);
    }
  }
}

// Desenfoque de caja en dos pasadas: el fondo queda fuera de foco y los
// personajes, dibujados encima, se mantienen nítidos.
function blur(canvas, r = 1, passes = 2) {
  const c = canvas.getContext('2d');
  const img = c.getImageData(0, 0, canvas.width, canvas.height);
  const { width: w, height: h, data } = img;
  const tmp = new Float32Array(data.length);
  const at = (x, y) => (y * w + x) * 4;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let ch = 0; ch < 4; ch++) {
          let sum = 0;
          for (let k = -r; k <= r; k++) sum += data[at(Math.min(w - 1, Math.max(0, x + k)), y) + ch];
          tmp[at(x, y) + ch] = sum / (2 * r + 1);
        }
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let ch = 0; ch < 4; ch++) {
          let sum = 0;
          for (let k = -r; k <= r; k++) sum += tmp[at(x, Math.min(h - 1, Math.max(0, y + k))) + ch];
          data[at(x, y) + ch] = sum / (2 * r + 1);
        }
      }
    }
  }
  c.putImageData(img, 0, 0);
}

function spr(c, img, x, y, s = 1) {
  c.drawImage(img, Math.round(x), Math.round(y), img.width * s, img.height * s);
}
// sentado detrás de una mesa cuya cubierta está en deskY (el torso queda arriba)
const seat = (c, img, cx, deskY, dy = 0) => spr(c, img, cx - 9, deskY - 22 + dy);
// lo mismo, en acercamiento al doble
const seat2 = (c, img, cx, deskY, dy = 0) => spr(c, img, cx - 18, deskY - 44 + dy * 2, 2);
// de pie, con los pies en footY
export const stand = (c, img, cx, footY, s = 1) => spr(c, img, cx - (img.width * s) / 2, footY - img.height * s, s);
const txt = (c, str, x, y, col) => drawText(c, str, Math.round(x), Math.round(y), col);
// igual que txt, pero los ♥ van de otro color
function txtHearts(c, str, x, y, col, heartCol) {
  for (const ch of str) {
    txt(c, ch, x, y, ch === '♥' ? heartCol : col);
    x += measure(ch) + 1;
  }
}

// corazones negros de la escena del celular (y del minijuego)
export const BLACK_HEART = { fill: '#1d171f', edge: '#0e0b10', shine: '#5d5063' };

const HEARTS = {
  5: ['.#.#.', '#####', '#####', '.###.', '..#..'],
  7: ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
  9: ['.###.###.', '#########', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'],
};
export function heart(c, cx, cy, size, fill, edge = '#6b1f3f', shine = '#ffd6e4') {
  const rows = HEARTS[size];
  const x0 = Math.round(cx - size / 2), y0 = Math.round(cy - rows.length / 2);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && P(c, x0 + x + dx, y0 + y + dy, edge)));
  }
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && P(c, x0 + x, y0 + y, fill)));
  P(c, x0 + 1, y0 + 1, shine);
}

// destello en cruz; k de 0 a 1 es su fase
export function sparkle(c, x, y, k, col = '#fff4c8') {
  if (k < 0 || k > 1) return;
  const s = k < 0.3 ? 0 : k < 0.7 ? 1 : 2 - (k > 0.9 ? 1 : 0);
  x = Math.round(x);
  y = Math.round(y);
  P(c, x, y, col);
  for (let d = 1; d <= s; d++) {
    P(c, x - d, y, col); P(c, x + d, y, col); P(c, x, y - d, col); P(c, x, y + d, col);
  }
}

function exclaim(c, x, y) {
  Rf(c, x - 1, y - 1, 4, 6, INK);
  Rf(c, x - 1, y + 5, 4, 4, INK);
  Rf(c, x, y, 2, 4, '#ffd27a');
  Rf(c, x, y + 6, 2, 2, '#ffd27a');
}

/* ---------------- piezas reutilizables ---------------- */

function carSprite() {
  const { c, ctx } = makeCanvas(52, 21);
  poly(ctx, [[1, 8], [6, 3], [12, 1], [28, 1], [35, 7], [45, 8], [50, 10], [50, 15], [1, 15]], '#f3f3ee');
  Rf(ctx, 1, 12, 50, 3, '#dcdcd4');
  Rf(ctx, 12, 1, 16, 1, '#ffffff');
  poly(ctx, [[7, 7], [12, 2.5], [20, 2.5], [20, 7]], '#33415c');
  poly(ctx, [[22, 2.5], [27.5, 2.5], [33, 7], [22, 7]], '#33415c');
  P(ctx, 13, 4, '#6b7fa3'); P(ctx, 24, 3, '#6b7fa3'); P(ctx, 25, 4, '#6b7fa3');
  Rf(ctx, 21, 8, 1, 6, '#bdbdb5'); Rf(ctx, 34, 8, 1, 5, '#bdbdb5');
  Rf(ctx, 24, 9, 2, 1, '#9a9a94');
  Rf(ctx, 34, 6, 2, 1, '#dcdcd4');
  Rf(ctx, 46, 9, 3, 1, '#ffe28a'); P(ctx, 49, 10, '#ffe28a');
  Rf(ctx, 1, 9, 2, 2, '#e04a4a');
  Rf(ctx, 1, 14, 50, 1, '#b5b5ae');
  disc(ctx, 11, 15, 4, '#2a2a30');
  disc(ctx, 40, 15, 4, '#2a2a30');
  return outlineCanvas(c, '#2a2233');
}

function wheels(c, x, y, a) {
  for (const wx of [11, 40]) {
    disc(c, x + wx, y + 15, 3, '#1e1e24');
    Rf(c, x + wx - 1, y + 14, 2, 2, '#a9a9b3');
    const d = [[0, -2], [2, 0], [0, 2], [-2, 0]][((Math.floor(a) % 4) + 4) % 4];
    P(c, x + wx + d[0], y + 15 + d[1], '#6e6e78');
  }
}

function desk(c, y, x0, x1) {
  Rf(c, x0, y, x1 - x0, 1, '#c3cbd2');
  Rf(c, x0, y + 1, x1 - x0, 7, '#8d98a3');
  Rf(c, x0, y + 8, x1 - x0, 1, '#6f7a85');
}

// monitor de tubo visto por detrás
function monitor(c, x, y) {
  Rf(c, x, y, 12, 10, '#5c5446');
  Rf(c, x + 1, y + 1, 10, 8, '#d8cfb8');
  Rf(c, x + 1, y + 1, 10, 1, '#ebe4d2');
  Rf(c, x + 3, y + 4, 6, 1, '#bdb29a');
  Rf(c, x + 3, y + 6, 6, 1, '#bdb29a');
}

const typing = (t, i) => (Math.floor(t * 3 + i * 1.7) % 3 === 0 ? 1 : 0);

const STARS = [[8, 4], [22, 9], [37, 3], [52, 7], [96, 5], [110, 11], [124, 4], [150, 8], [70, 12], [84, 2], [144, 20], [118, 22]];
function stars(c, t, maxY = 99, avoid = null) {
  STARS.forEach(([x, y], i) => {
    if (y > maxY || (avoid && avoid(x, y))) return;
    const on = (Math.floor(t * 1.5 + i * 0.7) % 4) !== 0;
    P(c, x, y, on ? '#fff6d8' : '#8f8ab8');
  });
}

function moon(c, x, y, phase) {
  disc(c, x, y, 6, '#f4efd6');
  P(c, x - 2, y - 1, '#ddd6b6'); P(c, x + 2, y + 2, '#ddd6b6');
  const off = [-13, -9, -6, -3, 14, 3, 6, 9][phase % 8];
  disc(c, x + off, y - 1, 6, '#1b2046');
}

/* ---------------- escenarios ---------------- */

function labBg(c) {
  Rf(c, 0, 0, W, 48, '#e9dfc7');
  Rf(c, 0, 40, W, 7, '#dccfb1');
  Rf(c, 0, 47, W, 1, '#b8a47e');
  Rf(c, 9, 6, 34, 25, '#9c8a6a');
  disc(c, 72, 13, 6, '#6b5a4a');
  disc(c, 72, 13, 5, '#fbfbf5');
  for (const [dx, dy] of [[0, -4], [4, 0], [0, 4], [-4, 0]]) P(c, 72 + dx, 13 + dy, '#6b5a4a');
  Rf(c, 92, 8, 26, 18, '#9c7a52');
  Rf(c, 93, 9, 24, 16, '#caa06a');
  Rf(c, 95, 11, 6, 6, '#fff2a8'); Rf(c, 103, 12, 6, 5, '#ffc7d8'); Rf(c, 110, 10, 5, 7, '#bfe3ff');
  P(c, 97, 11, '#d04a4a'); P(c, 105, 12, '#4a7ad0'); P(c, 112, 10, '#d04a4a');
  Rf(c, 127, 11, 24, 37, '#6b4430');
  Rf(c, 0, 48, W, 48, '#c2baa8');
  for (let y = 55; y < H; y += 8) Rf(c, 0, y, W, 1, '#b5ad9a');
  for (let x = 8; x < W; x += 16) Rf(c, x, 48, 1, 48, '#b9b19e');
}

function labDynamic(c, t, open) {
  // nube que pasa por la ventana
  c.save();
  c.beginPath();
  c.rect(10, 7, 32, 23);
  c.clip();
  Rf(c, 10, 7, 32, 23, '#b7e0f5');
  const cx = Math.round(-8 + ((t * 3) % 56));
  disc(c, cx, 14, 3, '#ffffff'); disc(c, cx + 4, 12, 4, '#ffffff'); disc(c, cx + 8, 14, 3, '#ffffff');
  dith(c, 11, 8, 8, 5, '#e3f4fc');
  c.restore();
  Rf(c, 25, 7, 2, 23, '#9c8a6a');
  Rf(c, 10, 17, 32, 2, '#9c8a6a');
  // manecillas del reloj
  P(c, 71, 12, '#3a2e26'); P(c, 70, 11, '#3a2e26');
  Rf(c, 72, 9, 1, 4, '#3a2e26');
  const a = Math.floor(t) * (Math.PI / 30) - Math.PI / 2;
  line(c, 72, 13, 72 + Math.round(Math.cos(a) * 4), 13 + Math.round(Math.sin(a) * 4), '#d04a4a');
  // puerta
  if (open <= 0) {
    Rf(c, 128, 12, 22, 35, '#8a5a3c');
    Rf(c, 128, 12, 1, 35, '#a8744f');
    Rf(c, 132, 16, 14, 9, '#b7e0f5');
    Rf(c, 132, 16, 14, 1, '#6b4430');
    Rf(c, 131, 30, 2, 2, '#e0b050');
  } else {
    Rf(c, 128, 12, 22, 35, '#fff3d2');
    dith(c, 128, 12, 22, 35, '#ffe7a8');
    const lw = Math.max(3, Math.round(22 - open * 19));
    Rf(c, 150 - lw, 12, lw, 35, '#8a5a3c');
    Rf(c, 150 - lw, 12, 1, 35, '#6b4430');
    for (let y = 48; y < 66; y++) {
      const k = (y - 48) / 18;
      const x0 = Math.round(128 - k * 14), x1 = Math.round(150 - k * 4);
      dith(c, x0, y, x1 - x0, 1, 'rgba(255, 243, 210, .6)', y);
    }
  }
}

function labStudents(c, t, A, o = {}) {
  [[0, 20], [1, 50], [2, 82]].forEach(([k, x], i) => seat(c, o.turn ? A.compas[k].sitR : A.compas[k].sit, x, 58, typing(t, i)));
  if (o.herSeat) seat(c, A.ella.sitRBlush, 112, 58);
  desk(c, 58, 4, 124);
  monitor(c, 29, 48); monitor(c, 60, 48); monitor(c, 94, 48);
  seat(c, o.turn ? A.compas[3].sitR : A.compas[3].sit, 24, 80, typing(t, 3));
  seat(c, o.tu || A.tu.sit, 80, 80, o.tuStill ? 0 : typing(t, 4));
  seat(c, o.turn ? A.compas[4].sitR : A.compas[4].sit, 136, 80, typing(t, 5));
  desk(c, 80, 0, W);
  monitor(c, 44, 70); monitor(c, 100, 70); monitor(c, 150, 70);
}

function classBg(c) {
  Rf(c, 0, 0, W, 54, '#dfe7d6');
  Rf(c, 0, 52, W, 2, '#b9c4ae');
  Rf(c, 14, 5, 132, 32, '#7a4e32');
  Rf(c, 16, 7, 128, 28, '#2f5d46');
  dith(c, 16, 7, 128, 28, '#35644d');
  txt(c, 'TAREA', 22, 8, '#e8efe6');
  for (const [x, y, w] of [[22, 20, 34], [22, 24, 26], [22, 28, 30], [92, 12, 40], [96, 18, 28], [92, 24, 36], [100, 30, 20]]) Rf(c, x, y, w, 1, '#d5e0d3');
  Rf(c, 16, 35, 128, 2, '#9a6b4a');
  Rf(c, 40, 34, 3, 1, '#ffffff'); Rf(c, 120, 34, 2, 1, '#ffd6e4');
  Rf(c, 0, 54, W, 42, '#cbbfa8');
  for (let y = 60; y < H; y += 8) Rf(c, 0, y, W, 1, '#bcb099');
}

function calendar(c, x, y, t) {
  const MESES = ['MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC', 'ENE', 'FEB', 'MAR', 'ABR'];
  const i = Math.floor(t / 0.5) % 12;
  Rf(c, x, y, 22, 24, '#6b5a6e');
  Rf(c, x + 1, y + 1, 20, 22, '#ffffff');
  Rf(c, x + 1, y + 1, 20, 7, '#e0426e');
  txt(c, MESES[i], x + 4, y - 1, '#ffffff');
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 5; k++) Rf(c, x + 3 + k * 4, y + 11 + r * 4, 2, 2, r * 5 + k === (i * 3) % 15 ? '#e0426e' : '#c9c2d3');
  }
  if (t % 0.5 < 0.08) Rf(c, x + 1, y - 3, 20, 7, '#f4eef8');
  P(c, x + 6, y, '#44414f');
  P(c, x + 15, y, '#44414f');
}

const MSGS = [
  { yo: false, w: [22, 14] },
  { yo: true, w: [18] },
  { yo: false, txt: 'JAJA' },
  { yo: true, w: [26, 12] },
  { yo: false, w: [16] },
  { yo: true, heart: true },
  { yo: false, heart: true },
];
const msgAt = (i) => 0.4 + i * 0.7;

function chat(c, t) {
  const shown = MSGS.filter((_, i) => t >= msgAt(i));
  c.save();
  c.beginPath();
  c.rect(91, 22, 56, 64);
  c.clip();
  let y = 84;
  for (let i = shown.length - 1; i >= 0; i--) {
    const m = shown[i];
    const h = m.w ? 3 + m.w.length * 4 : 9;
    const w = m.w ? Math.max(...m.w) + 6 : m.txt ? 21 : 13;
    y -= h;
    const x = m.yo ? 145 - w : 93;
    const col = m.yo ? '#d8c7f6' : '#ece8f2';
    Rf(c, x + 1, y, w - 2, h, col);
    Rf(c, x, y + 1, w, h - 2, col);
    if (m.w) m.w.forEach((lw, k) => Rf(c, x + 3, y + 3 + k * 4, lw, 1, m.yo ? '#8a6cc2' : '#a79fb3'));
    else if (m.txt) txt(c, m.txt, x + 3, y - 1, '#6b4a5a');
    else heart(c, x + 6.5, y + 4.5, 5, BLACK_HEART.fill, BLACK_HEART.fill, BLACK_HEART.shine);
    y -= 3;
  }
  c.restore();
}

function uniBg(c) {
  Rf(c, 0, 0, W, 72, '#1b2046');
  dith(c, 0, 36, W, 36, '#252b58');
  Rf(c, 2, 16, 88, 3, '#5f5a78');
  Rf(c, 4, 19, 84, 51, '#8c86a3');
  dith(c, 4, 19, 84, 51, '#857f9c');
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 7; k++) {
      const lit = ((r * 7 + k) * 37) % 5 !== 0;
      Rf(c, 8 + k * 12, 23 + r * 8, 7, 5, lit ? '#ffe08a' : '#4a4766');
      if (lit) Rf(c, 8 + k * 12, 23 + r * 8, 7, 1, '#fff2c0');
    }
  }
  Rf(c, 21, 48, 50, 8, '#3b3650');
  txt(c, 'UNIVERSIDAD', 24, 48, '#fff4e6');
  Rf(c, 38, 58, 16, 12, '#ffe9b0');
  Rf(c, 37, 57, 18, 1, '#5f5a78');
  Rf(c, 46, 58, 1, 12, '#d9c48a');
  Rf(c, 12, 59, 20, 9, '#1d1b27');
  txt(c, '9:00', 14, 58, '#7cf2a0');
  Rf(c, 0, 70, W, 7, '#8f8a99');
  Rf(c, 0, 70, W, 1, '#b3aebc');
  Rf(c, 0, 77, W, 19, '#34334a');
  for (let x = 4; x < W; x += 18) Rf(c, x, 87, 9, 1, '#8f8aa3');
  Rf(c, 96, 30, 2, 40, '#4a4760');
  Rf(c, 92, 28, 9, 3, '#4a4760');
  Rf(c, 93, 31, 7, 1, '#ffe9a8');
  for (let y = 32; y < 70; y++) {
    const k = (y - 32) / 38;
    dith(c, Math.round(92 - k * 10), y, Math.round(10 + k * 20), 1, 'rgba(255, 233, 168, .16)', y);
  }
}

function tally(c, n) {
  for (let i = 0; i < Math.min(n, 20); i++) {
    const g = Math.floor(i / 5), k = i % 5;
    const x = 4 + g * 9;
    if (k < 4) Rf(c, x + k * 2, 71, 1, 5, '#f4f1ea');
    else line(c, x - 1, 75, x + 7, 71, '#f4f1ea');
  }
}

function carInsideBg(c) {
  Rf(c, 0, 0, W, H, '#2a2835');
  Rf(c, 22, 10, 116, 30, '#1c2344');
  dith(c, 22, 26, 116, 14, '#232b52');
  // respaldos con su cabecera, detrás de cada uno
  for (const x of [29, 97]) {
    Rf(c, x + 7, 30, 20, 9, '#4a4858');
    Rf(c, x + 8, 30, 18, 1, '#5d5a6d');
    Rf(c, x + 14, 39, 6, 3, '#3d3b49');
    Rf(c, x, 42, 34, 16, '#4a4858');
    Rf(c, x + 1, 42, 32, 1, '#5d5a6d');
  }
}

// Volante inclinado visto desde el parabrisas: un aro achatado frente a su
// pecho; la mitad de abajo la tapa el tablero.
function steeringWheel(c, cx, cy) {
  const rx = 14, ry = 7;
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      const out = (x / rx) ** 2 + (y / ry) ** 2;
      const inn = (x / (rx - 2)) ** 2 + (y / (ry - 2)) ** 2;
      if (out <= 1 && inn >= 1) P(c, cx + x, cy + y, y < -ry + 2 ? '#9a97a8' : '#5f5c6b');
    }
  }
  // sus manos en el volante
  for (const hx of [cx - 11, cx + 9]) {
    Rf(c, hx, cy - 6, 3, 2, TU.skin);
    Rf(c, hx, cy - 4, 3, 1, TU.skinD);
  }
}

function carInsideFront(c, t) {
  // tablero, volante y la carrocería alrededor del parabrisas
  Rf(c, 0, 58, W, 20, '#34313f');
  Rf(c, 0, 58, W, 1, '#4a4658');
  Rf(c, 0, 59, W, 1, '#3d3a48');
  poly(c, [[0, 0], [13, 0], [5, 78], [0, 78]], '#e9e9e2');
  poly(c, [[147, 0], [W, 0], [W, 78], [155, 78]], '#e9e9e2');
  Rf(c, 0, 0, W, 5, '#e9e9e2');
  Rf(c, 0, 5, W, 1, '#c9c9c1');
  Rf(c, 0, 78, W, 18, '#f3f3ee');
  Rf(c, 0, 78, W, 1, '#ffffff');
  dith(c, 0, 88, W, 8, '#e2e2da');
  // reflejos del vidrio y luces de la calle que pasan
  line(c, 16, 7, 26, 19, 'rgba(255, 255, 255, .22)');
  line(c, 19, 7, 27, 16, 'rgba(255, 255, 255, .16)');
  const sx = Math.round(175 - ((t % 1.5) / 1.5) * 230);
  dith(c, sx, 6, 14, 52, 'rgba(255, 240, 200, .16)');
  // espejo con un corazoncito colgando
  Rf(c, 72, 5, 16, 4, '#3a3844');
  Rf(c, 73, 6, 14, 2, '#5d6f8f');
  const sw = Math.round(Math.sin(t * 2.2) * 1.5);
  line(c, 80, 9, 80 + sw, 12, '#c9c2d3');
  heart(c, 80 + sw, 15, 5, '#f28ab2');
}

function papeleriaBg(c, A) {
  Rf(c, 0, 0, W, 70, '#1b2046');
  dith(c, 0, 12, W, 58, '#252b58');
  // edificios vecinos
  Rf(c, 0, 30, 9, 40, '#3b3650');
  Rf(c, 2, 38, 4, 5, '#ffe08a');
  Rf(c, 139, 26, 21, 44, '#3b3650');
  Rf(c, 143, 32, 5, 5, '#ffe08a'); Rf(c, 151, 32, 5, 5, '#4a4766');
  Rf(c, 143, 44, 5, 5, '#4a4766'); Rf(c, 151, 44, 5, 5, '#ffe08a');
  Rf(c, 8, 10, 132, 3, '#9a7458');
  Rf(c, 10, 13, 128, 57, '#e7c9a4');
  dith(c, 10, 13, 128, 57, '#e0c09a');
  Rf(c, 28, 15, 88, 11, '#8a5530');
  Rf(c, 29, 16, 86, 9, '#fff4e6');
  txt(c, 'PAPELERÍA', 58, 15, '#b0356b');
  Rf(c, 34, 19, 14, 3, '#ffd27a');
  Rf(c, 34, 19, 2, 3, '#f28ab2');
  Rf(c, 48, 20, 2, 1, '#e0b88a');
  P(c, 50, 20, INK);
  Rf(c, 36, 20, 12, 1, '#f2c14e');
  for (let x = 16; x < 132; x += 6) {
    Rf(c, x, 28, 3, 5, '#f28ab2');
    Rf(c, x + 3, 28, 3, 5, '#fff4e6');
  }
  for (let x = 16; x < 132; x += 2) P(c, x, 33, x % 6 < 3 ? '#f28ab2' : '#fff4e6');
  Rf(c, 20, 36, 56, 30, '#7a5a40');
  Rf(c, 22, 38, 52, 26, '#fff1c9');
  Rf(c, 22, 47, 52, 1, '#c9a27a');
  Rf(c, 22, 56, 52, 1, '#c9a27a');
  const cols = ['#f28ab2', '#8fd3c4', '#b597e2', '#ffd27a', '#9fd8f5', '#e0736f'];
  for (let i = 0; i < 12; i++) Rf(c, 24 + i * 4, 40 + (i % 3), 3, 7 - (i % 3), cols[i % 6]);
  for (let i = 0; i < 8; i++) Rf(c, 25 + i * 6, 50, 4, 6, cols[(i + 2) % 6]);
  for (let i = 0; i < 10; i++) Rf(c, 24 + i * 5, 58, 1, 5, cols[(i + 4) % 6]);
  line(c, 26, 60, 36, 40, 'rgba(255, 255, 255, .45)');
  Rf(c, 84, 38, 22, 32, '#7a5a40');
  Rf(c, 86, 40, 18, 30, '#ffe7b0');
  dith(c, 86, 40, 18, 30, '#fff3d2');
  Rf(c, 0, 70, W, 6, '#9a93a6');
  Rf(c, 0, 70, W, 1, '#bdb6c8');
  Rf(c, 0, 76, W, 20, '#34334a');
  dith(c, 20, 70, 90, 6, 'rgba(255, 233, 168, .35)');
  spr(c, A.car, 110, 73);
  wheels(c, 110, 73, 0);
}

/* ---------------- escenarios de "Lo que viene" ---------------- */

const SEA = '#1a2c55', SEA_D = '#223a6b', SEA_L = '#2f4a80', SEA_H = '#3d5a8f';
const MOONLIGHT = ['#f4efd6', '#b9b8d8', '#8a93c4'];

function fullMoon(c, x, y, r, halo = true) {
  if (halo) disc(c, x, y, r + 3, '#232a5e');
  disc(c, x, y, r, '#f4efd6');
  P(c, x + 1, y + 1, '#ddd6b6');
  if (r >= 5) {
    P(c, x - 2, y - 2, '#ddd6b6');
    Rf(c, x + 2, y + 1, 2, 2, '#ddd6b6');
    P(c, x - 3, y + 2, '#ddd6b6');
  }
}

// cielo en franjas, con un tramado entre una y otra
export function gradientSky(c, bands, bottom) {
  bands.forEach(([y, col], i) => {
    const y1 = i + 1 < bands.length ? bands[i + 1][0] : bottom;
    Rf(c, 0, y, W, y1 - y, col);
    if (i) dith(c, 0, y, W, 2, bands[i - 1][1]);
  });
}

// Olas: rayitas que se van quedando atrás; las de más cerca pasan más rápido.
function waves(c, t, x0, x1, y0, y1, cols = [SEA_H, SEA_L]) {
  for (let y = y0, k = 0; y < y1; y += 3, k++) {
    const gap = 13 + k * 4, len = 2 + k;
    const off = (((k * 7 - t * (5 + k * 4)) % gap) + gap) % gap;
    for (let x = x0 - gap + off; x < x1; x += gap) {
      const a = Math.max(x0, Math.round(x)), b = Math.min(x1, Math.round(x) + len);
      if (b > a) Rf(c, a, y, b - a, 1, cols[k % cols.length]);
    }
  }
}

// El reflejo de la luna (o del sol): rayitas que titilan sobre el agua.
function glint(c, t, cx, y0, y1, cols) {
  for (let y = y0; y < y1; y += 2) {
    const k = (y - y0) / Math.max(1, y1 - y0);
    const w = Math.max(1, Math.round(2 + k * 8 + Math.sin(t * 3 + y) * 1.5));
    const x = Math.round(cx - w / 2 + Math.sin(t * 2 + y * 0.7) * 1.5);
    Rf(c, x, y, w, 1, cols[(y + Math.floor(t * 5)) % cols.length]);
  }
}

// estrella fugaz que cruza entre t0 y t0 + 0.6 s
function shootingStar(c, t, t0, x0, y0, x1, y1) {
  const k = (t - t0) / 0.6;
  if (k < 0 || k > 1) return;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k;
  const tail = ['#ffffff', '#fff6d8', '#fff6d8', '#c9c4ee', '#c9c4ee', '#8f8ab8', '#8f8ab8'];
  for (let i = tail.length - 1; i >= 0; i--) P(c, x - ux * i, y - uy * i, tail[i]);
}

function porthole(c, x, y, r, glass) {
  disc(c, x, y, r, '#8f8a99');
  disc(c, x, y, r - 1, glass);
  P(c, x - 1, y - 1, '#fff2c0');
}

function lifeRing(c, x, y, hole) {
  disc(c, x, y, 7, '#b8481f');
  disc(c, x, y, 6, '#f26b3a');
  Rf(c, x - 1, y - 5, 3, 2, '#fff4e6');
  Rf(c, x - 1, y + 4, 3, 2, '#fff4e6');
  Rf(c, x - 5, y - 1, 2, 3, '#fff4e6');
  Rf(c, x + 4, y - 1, 2, 3, '#fff4e6');
  disc(c, x, y, 3, '#b8481f');
  disc(c, x, y, 2, hole);
}

// barandilla blanca del barco
function railing(c, x0, x1, top, bottom) {
  for (let x = x0 + 6; x < x1; x += 12) Rf(c, x, top, 2, bottom - top, '#d6d6ce');
  Rf(c, x0, top, x1 - x0, 2, '#f3f3ee');
  Rf(c, x0, top + 2, x1 - x0, 1, '#a9a9a2');
  Rf(c, x0, top + 8, x1 - x0, 1, '#dcdcd4');
}

function gull(c, x, y, up, col = '#5d5a6d') {
  x = Math.round(x);
  y = Math.round(y);
  P(c, x, y, col);
  const wy = up ? -1 : 1;
  P(c, x - 1, y + (up ? -1 : 0), col); P(c, x + 1, y + (up ? -1 : 0), col);
  P(c, x - 2, y + wy, col); P(c, x + 2, y + wy, col);
}

// Texto al doble de tamaño (para la cuenta regresiva de la pantalla).
const bigCache = new Map();
function bigTxt(c, str, x, y, col) {
  let img = bigCache.get(str + col);
  if (!img) {
    const b = makeCanvas(measure(str), 9);
    drawText(b.ctx, str, 0, 0, col);
    bigCache.set(str + col, (img = b.c));
  }
  spr(c, img, x, y, 2);
}

// calendario de pared con los días tachados; el último, con corazón, es el día en que vuelve
function daysCalendar(c, x, y, crossed) {
  Rf(c, x, y, 20, 24, '#6b5a6e');
  Rf(c, x + 1, y + 1, 18, 22, '#ffffff');
  Rf(c, x + 1, y + 1, 18, 5, '#e0426e');
  P(c, x + 5, y, '#44414f');
  P(c, x + 14, y, '#44414f');
  for (let i = 0; i < 16; i++) {
    const cx = x + 3 + (i % 4) * 4, cy = y + 8 + Math.floor(i / 4) * 4;
    if (i === 15) {
      P(c, cx, cy, '#f25a8c'); P(c, cx + 2, cy, '#f25a8c');
      Rf(c, cx, cy + 1, 3, 1, '#f25a8c');
      P(c, cx + 1, cy + 2, '#f25a8c');
    } else if (i < crossed) {
      for (const [dx, dy] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]) P(c, cx + dx, cy + dy, '#e0426e');
    } else {
      Rf(c, cx, cy, 3, 3, '#dcd6e4');
    }
  }
}

// laptop vista por detrás, con un corazón en la tapa
function laptop(c, cx, y, lid, logo) {
  Rf(c, cx - 9, y, 18, 8, lid);
  heart(c, cx, y + 4, 5, logo, lid);
  Rf(c, cx - 11, y + 8, 22, 2, '#8f8a99');
  Rf(c, cx - 11, y + 9, 22, 1, '#6b6878');
}

// el mar que se ve por el ojo de buey; se mece con el barco
function portholeSea(c, t, cx, cy, r) {
  const from = 1 + Math.round(Math.sin(t * 1.3));
  for (let dy = from; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.35);
    for (let x = cx - w; x <= cx + w; x++) {
      const crest = (x + Math.floor(t * 5) + dy * 5) % 6 === 0;
      const moonlit = Math.abs(x - cx - 3) < 1 + dy / 3 && (dy + Math.floor(t * 4)) % 2;
      P(c, x, cy + dy, dy === from ? SEA_L : moonlit ? MOONLIGHT[1] : crest ? SEA_H : SEA);
    }
  }
}

// Arco por el que viajan los corazones de una viñeta a la otra.
const callArc = (k) => [38 + 80 * k, 46 - Math.sin(k * Math.PI) * 34];

function bollard(c, x, y) {
  Rf(c, x - 2, y, 5, 5, '#3b3650');
  Rf(c, x - 3, y - 1, 7, 2, '#4a4560');
  Rf(c, x - 2, y - 1, 5, 1, '#5d5870');
}

// Crucero atracado, con la chimenea lila y un corazón.
function cruiseShip(c) {
  const bow = (y) => 54 + ((y - 40) * 12) / 31;
  poly(c, [[54, 40], [W, 40], [W, 71], [66, 71]], '#f3f3ee');
  poly(c, [[bow(62), 62], [W, 62], [W, 71], [66, 71]], '#2c4a7a');
  Rf(c, Math.round(bow(59)), 59, W, 1, '#b597e2');
  for (const [y, x0] of [[46, 64], [53, 66]]) {
    for (let x = x0; x < W - 2; x += 5) if (x < 123 || x > 137) Rf(c, x, y, 2, 2, '#4a5a7a');
  }
  // cubiertas con balcones
  poly(c, [[64, 40], [71, 25], [W, 25], [W, 40]], '#f3f3ee');
  for (const y of [28, 33]) {
    const x0 = Math.ceil(64 + ((40 - y) * 7) / 15) + 2;
    Rf(c, x0, y, W - x0, 2, '#7ea2cc');
    Rf(c, x0, y + 2, W - x0, 1, '#dcdcd4');
  }
  Rf(c, 82, 19, 78, 6, '#ecebe4');
  Rf(c, 84, 21, 76, 2, '#7ea2cc');
  // chimenea
  Rf(c, 120, 8, 14, 11, '#b597e2');
  Rf(c, 120, 8, 14, 2, '#3a2f4a');
  Rf(c, 132, 10, 2, 9, '#8a6cc2');
  heart(c, 126.5, 14, 5, '#ffffff', '#8a6cc2', '#ffffff');
  // botes salvavidas
  for (let x = 86; x < W - 8; x += 16) {
    Rf(c, x, 37, 9, 3, '#f28a3c');
    Rf(c, x + 1, 36, 7, 1, '#f6a45a');
  }
  // puerta y pasarela hasta el muelle
  Rf(c, 126, 42, 10, 18, '#3a3448');
  Rf(c, 127, 43, 8, 1, '#4a4458');
  poly(c, [[125, 59], [137, 59], [117, 78], [105, 78]], '#9a93a6');
  line(c, 125, 60, 106, 77, '#c9c2d3');
  line(c, 137, 54, 117, 72, '#dcdcd4');
  for (let i = 0; i <= 3; i++) line(c, 137 - i * 6, 54 + i * 5.4, 137 - i * 6, 59 + i * 5.7, '#dcdcd4');
}

// el mismo crucero, chiquito y a contraluz en el horizonte
function tinyShip(c, x, y) {
  x = Math.round(x);
  Rf(c, x, y, 16, 2, '#3a2f4a');
  P(c, x - 1, y, '#3a2f4a');
  Rf(c, x + 3, y - 2, 10, 2, '#3a2f4a');
  Rf(c, x + 9, y - 4, 2, 2, '#3a2f4a');
  P(c, x + 5, y - 1, '#ffe08a'); P(c, x + 8, y - 1, '#ffe08a'); P(c, x + 12, y, '#ffe08a');
}

// silla de oficina vista por detrás: respaldo, asiento, poste y base con rueditas
function chairSprite() {
  const { c, ctx } = makeCanvas(32, 32);
  const DK = '#2a2733', MD = '#3d3850', LT = '#524b68', BASE = '#35304a';
  Rf(ctx, 9, 1, 14, 1, LT);
  Rf(ctx, 8, 2, 16, 10, MD);
  Rf(ctx, 8, 2, 1, 10, LT);
  Rf(ctx, 23, 2, 1, 10, DK);
  Rf(ctx, 10, 4, 12, 6, '#37324a');
  Rf(ctx, 9, 12, 14, 1, DK);
  Rf(ctx, 14, 13, 4, 2, DK);
  Rf(ctx, 5, 15, 22, 1, LT);
  Rf(ctx, 4, 16, 24, 2, MD);
  Rf(ctx, 5, 18, 22, 1, DK);
  Rf(ctx, 14, 19, 4, 6, BASE);
  Rf(ctx, 15, 19, 1, 6, LT);
  Rf(ctx, 13, 25, 6, 2, BASE);
  line(ctx, 13, 25, 4, 27, BASE); line(ctx, 13, 26, 4, 28, BASE);
  line(ctx, 18, 25, 27, 27, BASE); line(ctx, 18, 26, 27, 28, BASE);
  for (const x of [2, 14, 26]) {
    Rf(ctx, x, 28, 4, 2, '#1d1a26');
    P(ctx, x + 1, 28, '#5d5670');
  }
  return outlineCanvas(c, '#17131e');
}

function bouquetSprite() {
  const rows = ['.p.l.w.', 'ppllwww', '.prrrw.', 'grrryyg', '.gyyyg.', '..kgk..', '..kkk..', '...k...', '...k...'];
  const pal = { p: '#f28ab2', l: '#b597e2', w: '#fff4e6', r: '#f25a8c', y: '#ffd27a', g: '#6aa66a', k: '#d8c7f6' };
  const { c, ctx } = makeCanvas(rows[0].length + 2, rows.length + 2);
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== '.' && P(ctx, x + 1, y + 1, pal[ch])));
  return outlineCanvas(c, '#26141f');
}

function altamarBg(c) {
  Rf(c, 0, 0, W, 72, '#1b2046');
  dith(c, 0, 30, W, 26, '#252b58');
  Rf(c, 0, 56, W, 16, '#252b58');
  dith(c, 0, 56, W, 16, '#2f3670', 1);
  for (const [x, y] of [[40, 30], [62, 40], [100, 34], [150, 44], [86, 48], [30, 50]]) P(c, x, y, '#8f8ab8');
  fullMoon(c, 126, 22, 7);
  // costado del barco con sus ojos de buey y un salvavidas
  Rf(c, 0, 0, 24, 88, '#e9e9e2');
  Rf(c, 21, 0, 3, 88, '#c9c9c1');
  porthole(c, 11, 12, 4, '#ffe08a');
  lifeRing(c, 11, 36, '#e9e9e2');
  porthole(c, 11, 60, 4, '#ffe08a');
  // cubierta de madera
  Rf(c, 0, 88, W, 8, '#9a6a45');
  Rf(c, 0, 88, W, 1, '#c08a5e');
  Rf(c, 0, 92, W, 1, '#8a5a3c');
  for (let x = 6; x < W; x += 14) Rf(c, x, 89, 1, 3, '#7a5236');
  for (let x = 13; x < W; x += 14) Rf(c, x, 93, 1, 3, '#7a5236');
}

// su cuarto de noche: ventana con la misma luna, calendario, monitor y escritorio
function cuartoBg(c) {
  // pared hasta el piso, con su zoclo, y el piso de madera
  Rf(c, 0, 0, W, 86, '#2b2744');
  dith(c, 0, 0, W, 86, '#2f2a4a');
  Rf(c, 0, 84, W, 2, '#3d3656');
  Rf(c, 0, 86, W, 10, '#3a3050');
  Rf(c, 0, 86, W, 1, '#4a4064');
  Rf(c, 0, 91, W, 1, '#322a46');
  for (let x = 10; x < W; x += 26) Rf(c, x, 87, 1, 4, '#322a46');
  for (let x = 23; x < W; x += 26) Rf(c, x, 92, 1, 4, '#322a46');
  // ventana con la misma luna que ella ve desde el mar
  Rf(c, 6, 8, 34, 34, '#5c5068');
  Rf(c, 8, 10, 30, 30, '#1b2046');
  dith(c, 8, 28, 30, 12, '#252b58');
  fullMoon(c, 30, 18, 4, false);
  for (const [x, y] of [[12, 14], [16, 31], [34, 34], [11, 23]]) P(c, x, y, '#fff6d8');
  Rf(c, 22, 10, 1, 30, '#5c5068');
  Rf(c, 8, 25, 30, 1, '#5c5068');
  Rf(c, 4, 42, 38, 3, '#6b5e7a');
  Rf(c, 4, 42, 38, 1, '#7d7090');
  // maceta bajo la ventana
  for (const [x, h, col] of [[15, 13, '#4d8450'], [18, 19, '#6aa66a'], [21, 15, '#4d8450'], [24, 17, '#6aa66a'], [27, 11, '#4d8450']]) {
    Rf(c, x, 74 - h, 2, h, col);
    Rf(c, x + 1, 76 - h, 1, h - 2, '#3d6b40');
    P(c, x, 73 - h, col);
  }
  Rf(c, 13, 73, 18, 2, '#c97a4e');
  poly(c, [[14, 75], [30, 75], [28, 86], [16, 86]], '#b4623e');
  Rf(c, 26, 75, 3, 11, '#9a4f30');
  // monitor
  Rf(c, 72, 10, 76, 48, '#23222b');
  Rf(c, 75, 13, 70, 42, '#151a33');
  Rf(c, 106, 58, 8, 5, '#23222b');
  Rf(c, 100, 63, 20, 2, '#23222b');
  // escritorio: cubierta, canto, una pata de tabla y una cajonera
  Rf(c, 42, 63, 116, 5, '#b07a52');
  Rf(c, 42, 63, 116, 1, '#c9925f');
  Rf(c, 42, 68, 116, 3, '#7a5236');
  dith(c, 48, 71, 76, 3, '#211c33');
  Rf(c, 44, 71, 4, 15, '#6b4430');
  Rf(c, 44, 71, 1, 15, '#8a5a3c');
  Rf(c, 124, 71, 30, 15, '#8a5a3c');
  for (const y of [72, 76, 80]) {
    Rf(c, 125, y, 28, 3, '#9a6a45');
    Rf(c, 125, y + 3, 28, 1, '#6b4430');
    Rf(c, 137, y + 1, 4, 1, '#e0c080');
  }
  Rf(c, 124, 84, 30, 2, '#6b4430');
  // teclado frente a él y el mouse
  Rf(c, 62, 64, 34, 3, '#3a3844');
  for (let x = 63; x < 95; x += 2) P(c, x, 65, '#6b6878');
  Rf(c, 101, 64, 3, 2, '#3a3844');
  P(c, 102, 64, '#6b6878');
  // taza con un corazón
  Rf(c, 128, 59, 6, 6, '#f3f3ee');
  Rf(c, 128, 59, 6, 1, '#6b4a33');
  Rf(c, 134, 60, 2, 1, '#f3f3ee'); Rf(c, 135, 61, 1, 2, '#f3f3ee'); Rf(c, 134, 63, 2, 1, '#f3f3ee');
  P(c, 129, 61, '#f28ab2'); P(c, 131, 61, '#f28ab2');
  Rf(c, 129, 62, 3, 1, '#f28ab2');
  P(c, 130, 63, '#f28ab2');
  // portarretratos
  Rf(c, 144, 54, 12, 11, '#caa06a');
  Rf(c, 145, 55, 10, 9, '#fbe3c0');
  heart(c, 150, 59.5, 5, '#f28ab2');
}

// dos viñetas en una: su camarote en el barco y el cuarto de él
function llamadaBg(c) {
  Rf(c, 0, 0, 80, H, '#eadbc6');
  dith(c, 0, 0, 80, 56, '#e3d1b9');
  Rf(c, 0, 56, 80, 2, '#c9a27a');
  disc(c, 24, 26, 12, '#8a6a2e');
  disc(c, 24, 26, 11, '#c9a14a');
  disc(c, 24, 26, 8, '#1b2046');
  fullMoon(c, 27, 22, 2, false);
  P(c, 19, 22, '#fff6d8'); P(c, 22, 19, '#fff6d8');
  for (const [dx, dy] of [[0, -10], [10, 0], [0, 10], [-10, 0]]) P(c, 24 + dx, 26 + dy, '#8a6a2e');
  Rf(c, 0, 76, 80, 20, '#8a5a3c');
  Rf(c, 0, 76, 80, 2, '#a8744f');
  Rf(c, 80, 0, 80, H, '#2b2744');
  dith(c, 80, 0, 80, 76, '#2f2a4a');
  Rf(c, 122, 8, 32, 28, '#5c5068');
  Rf(c, 124, 10, 28, 24, '#1b2046');
  fullMoon(c, 145, 17, 3, false);
  for (const [x, y] of [[128, 14], [133, 28], [148, 30]]) P(c, x, y, '#fff6d8');
  Rf(c, 137, 10, 1, 24, '#5c5068');
  Rf(c, 124, 22, 28, 1, '#5c5068');
  Rf(c, 80, 76, 80, 20, '#6b4a33');
  Rf(c, 80, 76, 80, 2, '#8a6040');
  // el corte entre las dos viñetas
  poly(c, [[77, 0], [85, 0], [82, H], [74, H]], '#fdf6ec');
  line(c, 77, 0, 74, H - 1, INK);
  line(c, 85, 0, 82, H - 1, INK);
}

function puertoBg(c) {
  gradientSky(c, [[0, '#f4ae93'], [14, '#f7bf9f'], [28, '#f9d0ab'], [42, '#fbe0bb']], 58);
  disc(c, 26, 50, 9, '#fde6bd');
  disc(c, 26, 50, 7, '#fff3d6');
  Rf(c, 0, 58, W, 20, '#6f93c4');
  Rf(c, 0, 58, W, 1, '#b3cbe6');
  dith(c, 0, 59, W, 2, '#86a8d4');
  cruiseShip(c);
  // muelle
  Rf(c, 0, 78, W, 18, '#cbbfae');
  Rf(c, 0, 78, W, 1, '#e8dfd0');
  Rf(c, 0, 79, W, 1, '#b3a996');
  for (let x = 12; x < W; x += 24) Rf(c, x, 80, 1, 16, '#b9ad9b');
  Rf(c, 0, 87, W, 1, '#c2b6a4');
  line(c, 150, 81, 157, 66, '#8a6a4a');
  bollard(c, 8, 82);
  bollard(c, 150, 82);
}

function atardecerBg(c) {
  gradientSky(c, [[0, '#4a3a7a'], [13, '#6a4486'], [25, '#94528a'], [36, '#c0607f'], [46, '#e27f7c'], [55, '#f3a17c'], [61, '#f9c08a']], 66);
  Rf(c, 10, 40, 30, 2, '#d77487'); Rf(c, 18, 38, 14, 2, '#d77487');
  Rf(c, 118, 30, 34, 2, '#b25e86'); Rf(c, 126, 28, 16, 2, '#b25e86');
  Rf(c, 40, 52, 18, 1, '#f0967c');
}

const CODE = [[0, 16, 0], [4, 20, 1], [4, 12, 2], [8, 18, 3], [8, 10, 0], [4, 6, 1], [0, 4, 4], [0, 14, 2], [4, 22, 3]];
const CODE_COLS = ['#f28ab2', '#8fd3c4', '#ffd27a', '#b597e2', '#9fd8f5'];
// momentos en que se tacha un día más
const DAYS_AT = [1.2, 2.0, 2.8, 3.6, 4.4];

/* ---------------- las viñetas ---------------- */

const SCENES = {
  laboratorio: {
    dur: 4,
    bg: labBg,
    draw(c, t, A) {
      labDynamic(c, t, 0);
      labStudents(c, t, A);
    },
  },

  puerta: {
    dur: 5.2,
    notaAt: 3.6,
    bg: labBg,
    sounds: [[0.8, () => sfx.door()], [1.3, () => sfx.sparkle()], [1.9, () => sfx.tick()]],
    bubbles: (p) => [{ at: 2.8, x: 80, y: 58, kind: 'piensa', text: p.pensamiento || 'qué bonita…' }],
    draw(c, t, A) {
      const open = Math.min(1, Math.max(0, (t - 0.8) / 0.4));
      labDynamic(c, t, open);
      // ella llega a la puerta, entra y se sienta hasta atrás
      if (t >= 1.2 && t < 3.4) {
        stand(c, t < 2.4 ? A.ella.stand : A.ella.standBlush, 139, 48);
        if (t < 2.8) for (let i = 0; i < 4; i++) sparkle(c, 131 + i * 6, 24 + (i % 2) * 14, (t * 2 + i * 0.3) % 1);
      } else if (t >= 3.4 && t < 4.4) {
        stand(c, A.ella.runL[Math.floor(t * 8) % 4], 139 - (t - 3.4) * 27, 48);
      }
      labStudents(c, t, A, {
        turn: t >= 1.6,
        herSeat: t >= 4.4,
        tu: t >= 2.4 ? A.tu.sitRBlush : t >= 1.6 ? A.tu.sitR : A.tu.sit,
        tuStill: t >= 1.6,
      });
      if (t >= 1.9 && t < 2.6) exclaim(c, 80, 56);
    },
  },

  salivosa: {
    dur: 5.5,
    notaAt: 4.4,
    bg: classBg,
    blurBg: true,
    sounds: [[1.9, () => sfx.tick()], [3.5, () => sfx.sparkle()]],
    bubbles: (p) => [{ at: 3.5, x: 124, y: 55, kind: 'grito', text: p.globo || '¡Bien salivosa!' }],
    draw(c, t, A) {
      const talk = t < 1.6, spit = t >= 1.6 && t < 1.9, wince = t >= 1.9 && t < 2.3, laugh = t >= 2.3;
      const bob = (on, k) => (on && Math.floor(t * 7 + k) % 2 ? -1 : 0);
      const g = wince ? A.ella.sitRClosed : laugh ? A.ella.sitLaugh : A.ella.sitR;
      const l = laugh ? A.lupita.sitLaugh : (talk && Math.floor(t * 6) % 2) || spit ? A.lupita.sitLTalk : A.lupita.sitL;
      const m = t >= 4.4 ? A.tu.sitLaugh : t >= 3.2 ? A.tu.sitL : A.tu.sit;
      const D = 86;
      seat2(c, g, 36, D, bob(laugh, 0));
      seat2(c, l, 80, D, bob(laugh, 1));
      seat2(c, m, 124, D, bob(t >= 4.4, 0));
      desk(c, D, 0, W);
      Rf(c, 22, D - 2, 16, 3, '#f28ab2'); Rf(c, 68, D - 2, 14, 3, '#8fd3c4'); Rf(c, 116, D - 2, 16, 3, '#ffd27a');
      // ellas platican
      if (talk) for (let i = 0; i < 3; i++) if (Math.floor(t * 4) % 4 > i) Rf(c, 55 + i * 4, 64, 2, 2, '#6b4a5a');
      // la gotita que sale volando hacia su ojo
      if (spit) {
        const k = (t - 1.6) / 0.3;
        const x = 74 + (41 - 74) * k, y = 72 + (68 - 72) * k - Math.sin(k * Math.PI) * 8;
        Rf(c, x, y, 3, 3, '#9fd8f5');
        P(c, x, y, '#ffffff');
      }
      if (wince) {
        Rf(c, 44, 67, 2, 2, '#9fd8f5');
        sparkle(c, 45, 65, (t - 1.9) / 0.4, '#bfe8ff');
      }
      if (laugh && t < 4.4) txt(c, 'JAJA', Math.floor(t * 2.5) % 2 ? 29 : 73, 47, '#6b2a55');
      if (t >= 4.4) {
        txt(c, 'JAJAJA', 58, 44, '#6b2a55');
        [[12, 54], [98, 44], [148, 52], [48, 38]].forEach(([x, y], i) => sparkle(c, x, y, (t * 1.5 + i * 0.25) % 1));
      }
    },
  },

  tiempo: {
    dur: 5.5,
    bg(c, A, p) {
      Rf(c, 0, 0, W, 72, '#ece3f6');
      dith(c, 0, 0, W, 72, '#e5daf2');
      Rf(c, 0, 72, W, 24, '#b98a5a');
      Rf(c, 0, 72, W, 1, '#d4a676');
      Rf(c, 0, 80, W, 1, '#a0754a');
      Rf(c, 88, 3, 62, 90, '#2a2833');
      for (const [x, y] of [[88, 3], [149, 3], [88, 92], [149, 92]]) P(c, x, y, '#e5daf2');
      Rf(c, 91, 12, 56, 74, '#faf7ff');
      Rf(c, 91, 12, 56, 9, '#b597e2');
      txtHearts(c, (p.contacto || 'Grecia ♥').toUpperCase(), 95, 11, '#ffffff', BLACK_HEART.fill);
      Rf(c, 113, 6, 12, 2, '#44414f');
      Rf(c, 114, 88, 10, 2, '#44414f');
    },
    sounds: [...MSGS.map((_, i) => [msgAt(i), () => sfx.tick()]), [3.6, () => sfx.sparkle()]],
    draw(c, t, A) {
      calendar(c, 58, 8, t);
      stand(c, A.tu.stand, 36, 78, 2);
      // su celular, con la pantalla prendida
      Rf(c, 30, 57, 11, 13, '#2a2833');
      Rf(c, 31, 58, 9, 10, Math.floor(t * 3) % 2 ? '#cfe8ff' : '#bfe0ff');
      Rf(c, 28, 62, 3, 3, TU.skin);
      Rf(c, 40, 62, 3, 3, TU.skin);
      // el corazón que le va creciendo
      if (t >= 1.2) {
        const size = t < 2.4 ? 5 : t < 3.6 ? 7 : Math.floor(t * 2.5) % 2 ? 9 : 7;
        heart(c, 36, 28, size, BLACK_HEART.fill, BLACK_HEART.edge, BLACK_HEART.shine);
        for (let i = 0; i < 6; i++) sparkle(c, 36 + Math.cos(i) * 11, 28 + Math.sin(i) * 8, (t - 3.6) / 0.7);
      }
      chat(c, t);
    },
  },

  esperar: {
    dur: 6,
    bg: uniBg,
    sounds: [],
    draw(c, t, A) {
      const cyc = Math.floor(t / 6), k = t % 6;
      stars(c, t, 99, (x, y) => (x < 92 && y > 14) || y > 26);
      moon(c, 140, 12, cyc);
      // coche: llega, espera, se va
      let carX = null;
      if (k < 0.8) carX = -52 + 156 * (1 - Math.pow(1 - k / 0.8, 2));
      else if (k < 3.3) carX = 104;
      else if (k < 4.9) carX = 104 + 70 * Math.pow((k - 3.3) / 1.6, 2);
      // él espera recargado; ella sale y camina hacia el coche
      if (k >= 0.9 && k < 2.95) stand(c, k >= 2.1 && k < 2.8 ? A.tu.cheer : A.tu.stand, 88, 73);
      if (k >= 1.3 && k < 2.6) stand(c, A.ella.runR[Math.floor(t * 8) % 4], 46 + (k - 1.3) * 25, 71);
      else if (k >= 2.6 && k < 2.95) stand(c, A.ella.sideR, 78, 71);
      if (carX != null) {
        spr(c, A.car, carX, 71);
        wheels(c, carX, 71, k < 0.8 || k >= 3.3 ? t * 14 : 0);
        if (k >= 3.3) for (let i = 0; i < 3; i++) disc(c, carX - 4 - i * 6, 85 - i * 2, i > 1 ? 1 : 2, 'rgba(200, 200, 215, .45)');
      }
      if (k >= 2.95 && k < 3.3) sparkle(c, 118, 76, (k - 2.95) / 0.35);
      tally(c, cyc + (k >= 5 ? 1 : 0));
    },
  },

  pregunta: {
    dur: 6.5,
    notaAt: 4.8,
    bg: carInsideBg,
    sounds: [[0.6, () => sfx.heartbeat()], [1.6, () => sfx.heartbeat()], [2.2, () => sfx.tick()], [4.0, () => sfx.bloom()]],
    bubbles: (p) => [
      { at: 2.2, x: 114, y: 35, kind: 'dice', text: p.globo || '¿Quieres ser mi novia?' },
      { at: 4.0, x: 46, y: 37, kind: 'grito', text: p.respuesta || '¡Sí!' },
    ],
    draw(c, t, A) {
      for (let i = 0; i < 9; i++) {
        const x = 24 + ((i * 17 + t * 10) % 112);
        P(c, x, 30 + (i % 3), ['#ffe08a', '#ff9fb8', '#9fd8f5'][i % 3]);
      }
      const her = t >= 4.6 ? A.ella.sitHappy : t >= 3.6 ? A.ella.sitRBlush : A.ella.sit;
      const him = t >= 4.0 ? A.tu.sitLaugh : t >= 2.0 ? A.tu.sitLBlush : A.tu.sit;
      const jit = t < 2.0 && Math.floor(t * 12) % 2 ? 1 : 0;
      spr(c, her, 46 - 18, 21, 2);
      spr(c, him, 114 - 18 + jit, 21, 2);
      if (t < 3.2) {
        const y = 40 + ((t * 10) % 8);
        Rf(c, 104, y, 1, 2, '#bfe8ff');
        P(c, 104, y - 1, '#e8f7ff');
      }
      steeringWheel(c, 114, 60);
      carInsideFront(c, t);
      if (t >= 4.0) {
        for (let i = 0; i < 6; i++) {
          const ph = (t - 4.0 - i * 0.3) % 2.4;
          if (ph < 0) continue;
          heart(c, 80 + Math.sin(ph * 3 + i) * 10, 58 - ph * 16, i % 2 ? 5 : 7, i % 3 ? '#f28ab2' : '#f25a8c');
        }
      }
    },
  },

  papeleria: {
    dur: 6,
    notaAt: 3.8,
    bg: papeleriaBg,
    sounds: [[2.4, () => sfx.chu()], [2.5, () => sfx.sparkle()]],
    draw(c, t, A) {
      stars(c, t, 9);
      if (t < 1.8) {
        const k = t / 1.8, f = Math.floor(t * 7) % 4;
        stand(c, A.tu.runL[f], 130 - k * 36, 73);
        stand(c, A.ella.runL[(f + 2) % 4], 142 - k * 38, 73);
      } else if (t < 2.4) {
        stand(c, A.tu.sideR, 94, 73);
        stand(c, A.ella.sideL, 104, 73);
      } else if (t < 3.6) {
        stand(c, A.kiss, 99, 73);
      } else {
        stand(c, A.hug[Math.floor(t * 2) % 2], 99, 73);
      }
      if (t >= 2.4) {
        for (let i = 0; i < 7; i++) {
          const ph = (t - 2.4 - i * 0.28) % 2.6;
          if (ph < 0) continue;
          heart(c, 99 + Math.sin(ph * 3 + i * 2) * 12, 50 - ph * 14, i % 2 ? 5 : 7, i % 3 ? '#f28ab2' : '#f25a8c');
        }
        for (let i = 0; i < 4; i++) sparkle(c, 84 + i * 10, 44 + (i % 2) * 6, (t * 1.3 + i * 0.25) % 1);
      }
    },
  },

  /* ----- Lo que viene ----- */

  altamar: {
    dur: 5,
    bg: altamarBg,
    sounds: [[0.2, () => sfx.wave()], [1.4, () => sfx.sparkle()], [2.3, () => sfx.chime(4)], [3.4, () => sfx.wave()]],
    draw(c, t, A) {
      stars(c, t, 50, (x, y) => x < 26 || (Math.abs(x - 126) < 12 && Math.abs(y - 22) < 12));
      shootingStar(c, t, 1.4, 36, 6, 88, 30);
      // el barco se mece: el horizonte sube y baja un pixel
      const hz = 64 + Math.round(Math.sin(t * 1.3));
      Rf(c, 24, hz, W - 24, 88 - hz, SEA);
      Rf(c, 24, hz, W - 24, 1, SEA_L);
      dith(c, 24, hz + 1, W - 24, 2, SEA_D);
      waves(c, t, 24, W, hz + 4, 88);
      glint(c, t, 126, hz + 2, 88, MOONLIGHT);
      railing(c, 24, W, 74, 88);
      // con la estrella fugaz cierra los ojos y pide un deseo
      const wish = t >= 2.1 && t < 4.3;
      stand(c, wish ? A.ella.seaWish : A.ella.sea, 70, 92, 2);
      if (wish) for (let i = 0; i < 3; i++) sparkle(c, 90 + i * 8, 56 - i * 7, (t - 2.3 - i * 0.35) / 0.8);
    },
  },

  codigo: {
    dur: 5.5,
    bg: cuartoBg,
    sounds: DAYS_AT.map((at) => [at, () => sfx.tick()]),
    draw(c, t, A) {
      const dec = DAYS_AT.filter((at) => t >= at).length;
      const crossed = 8 + dec;
      daysCalendar(c, 46, 10, crossed);
      // en la pantalla: su código y los días que faltan
      Rf(c, 75, 13, 70, 4, '#2d3560');
      Rf(c, 77, 14, 2, 2, '#f28ab2'); Rf(c, 80, 14, 2, 2, '#ffd27a'); Rf(c, 83, 14, 2, 2, '#8fd3c4');
      txt(c, 'DÍAS PARA VERTE', 80, 17, '#ffd6e4');
      let budget = Math.floor(t * 16) % 160;
      CODE.forEach(([ind, len, k], i) => {
        const n = Math.max(0, Math.min(len, budget));
        budget -= len;
        if (n) Rf(c, 78 + ind, 30 + i * 3, n, 1, CODE_COLS[k]);
        if (n > 0 && n < len && Math.floor(t * 4) % 2) Rf(c, 78 + ind + n, 29 + i * 3, 1, 2, '#ffffff');
      });
      bigTxt(c, String(15 - crossed), 122, 25, '#f28ab2');
      heart(c, 135, 36, 5, '#f28ab2', '#6b1f3f');
      const since = dec ? t - DAYS_AT[dec - 1] : 9;
      if (since < 0.7) for (let i = 0; i < 3; i++) sparkle(c, 119 + i * 9, 29 + (i % 2) * 12, since / 0.7 + i * 0.1);
      // él, de espaldas, tecleando; el respaldo de la silla queda enfrente
      spr(c, A.tu.back, 52, 24 + typing(t, 0), 2);
      spr(c, A.chair, 54, 58);
      // vapor de la taza
      for (let i = 0; i < 2; i++) {
        const ph = (t * 0.7 + i * 0.5) % 1;
        P(c, 130 + i * 2 + Math.round(Math.sin(ph * 6 + i * 2)), 57 - ph * 9, ph < 0.6 ? '#8f8ab8' : '#5c5577');
      }
    },
  },

  llamada: {
    dur: 5.5,
    bg: llamadaBg,
    sounds: [[1.0, () => sfx.tick()], [2.4, () => sfx.tick()], [3.4, () => sfx.sparkle()]],
    bubbles: (p) => [
      { at: 1.0, x: 118, y: 45, kind: 'dice', text: p.globo || '¡Te extraño!' },
      { at: 2.4, x: 40, y: 47, kind: 'dice', text: p.respuesta || '¡Y yo a ti!' },
    ],
    draw(c, t, A) {
      portholeSea(c, t, 24, 26, 8);
      const talk = (a, b) => t >= a && t < b && Math.floor(t * 6) % 2;
      const face = (p, a, b) => (talk(a, b) ? p.sitLaugh : t >= 4.2 ? p.sitHappy : t >= a ? p.sitBlush : p.sit);
      seat2(c, face(A.ella, 2.4, 3.3), 38, 76);
      seat2(c, face(A.tu, 1.0, 1.9), 118, 76);
      laptop(c, 38, 68, '#e8e4ee', '#f28ab2');
      laptop(c, 118, 68, '#4a4858', '#b597e2');
      // la señal que los une y los corazones que van y vienen por encima de las dos viñetas
      for (let j = 0; j < 16; j += 2) {
        const [x, y] = callArc((j + ((t * 1.6) % 2)) / 16);
        P(c, x, y, '#d8c7f6');
      }
      if (t >= 1.2) {
        for (let i = 0; i < 4; i++) {
          const ph = t - 1.2 - i * 0.6;
          if (ph < 0) continue;
          const k = (ph % 2.4) / 2.4;
          const [x, y] = callArc(i % 2 ? 1 - k : k);
          heart(c, x, y, i % 3 ? 5 : 7, i % 2 ? '#f28ab2' : '#f25a8c');
        }
      }
    },
  },

  puerto: {
    dur: 6,
    notaAt: 4.2,
    bg: puertoBg,
    sounds: [[0.3, () => sfx.horn()], [2.9, () => sfx.hug()], [3.1, () => sfx.sparkle()]],
    draw(c, t, A) {
      for (let i = 0; i < 2; i++) {
        const x = ((t * (7 + i * 3) + i * 80) % 190) - 15;
        gull(c, x, 12 + i * 9 + Math.round(Math.sin(t * 2 + i) * 2), Math.floor(t * 4 + i) % 2);
      }
      // humo de la chimenea
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.45 + i / 3) % 1;
        disc(c, 125 - ph * 28, 6 - ph * 5, Math.round(1 + ph * 2), '#fbeee2');
      }
      const HX = 44, FY = 90;
      if (t < 2.9) {
        stand(c, A.tu.sideR, HX, FY);
        spr(c, A.bouquet, HX - 4, FY - 15);
        if (t >= 0.9 && t < 1.6) exclaim(c, HX, 60);
      }
      // ella sale del barco, baja por la pasarela y corre hacia él
      if (t >= 0.8 && t < 1.8) {
        const k = (t - 0.8) / 1.0;
        stand(c, A.ella.runL[Math.floor(t * 8) % 4], 131 - k * 20, 60 + k * 18);
      } else if (t >= 1.8 && t < 2.9) {
        const k = (t - 1.8) / 1.1;
        stand(c, A.ella.runL[Math.floor(t * 9) % 4], 111 - k * 54, 78 + k * 12);
      } else if (t >= 2.9) {
        // el ramo queda detrás de su espalda mientras la abraza
        spr(c, A.bouquet, HX + 12, FY - 19);
        stand(c, A.hug[Math.floor(t * 2) % 2], HX + 5, FY);
        for (let i = 0; i < 6; i++) {
          const ph = (t - 2.9 - i * 0.3) % 2.4;
          if (ph < 0) continue;
          heart(c, HX + 5 + Math.sin(ph * 3 + i * 2) * 10, 64 - ph * 14, i % 2 ? 5 : 7, i % 3 ? '#f28ab2' : '#f25a8c');
        }
        for (let i = 0; i < 3; i++) sparkle(c, HX - 8 + i * 13, 66 + (i % 2) * 5, (t * 1.3 + i * 0.3) % 1);
      }
    },
  },

  siempre: {
    dur: 6,
    notaAt: 4.6,
    bg: atardecerBg,
    sounds: [[0.4, () => sfx.wave()], [2.4, () => sfx.chu()], [2.5, () => sfx.sparkle()]],
    draw(c, t, A) {
      if (t > 3.4) stars(c, t, 14);
      for (let i = 0; i < 2; i++) gull(c, 30 + i * 9 + t * 3, 24 + i * 4, Math.floor(t * 3 + i) % 2, '#4a3a6a');
      // el sol se va metiendo en el mar, a un lado de ellos
      const sy = 54 + Math.min(4, t * 0.7);
      disc(c, 126, sy, 10, '#ffd9a0');
      disc(c, 126, sy, 8, '#fff1c9');
      Rf(c, 0, 64, W, 12, '#6a4f8a');
      Rf(c, 0, 64, W, 1, '#ffc58a');
      dith(c, 0, 65, W, 2, '#8a5f95');
      waves(c, t, 0, W, 68, 76, ['#8a67a3', '#7a5a96']);
      glint(c, t, 126, 65, 76, ['#ffd08a', '#fff1c9', '#f3a17c']);
      tinyShip(c, 24 - t * 1.2, 63);
      // el muelle donde están sentados
      Rf(c, 6, 62, 4, 15, '#6b4430'); Rf(c, 150, 62, 4, 15, '#6b4430');
      Rf(c, 5, 61, 6, 2, '#8a5a3c'); Rf(c, 149, 61, 6, 2, '#8a5a3c');
      Rf(c, 0, 76, W, 20, '#8a5a3c');
      Rf(c, 0, 76, W, 1, '#a8744f');
      for (const y of [81, 87, 93]) Rf(c, 0, y, W, 1, '#6b4430');
      for (let x = 12; x < W; x += 22) Rf(c, x, 77, 1, 4, '#6b4430');
      for (let x = 23; x < W; x += 22) Rf(c, x, 82, 1, 5, '#6b4430');
      // ellos dos, de la mano; ella recargada en él y él le da un besito en el cachete
      const kiss = t >= 2.4 && t < 3.8;
      spr(c, A.ella.sitLean, 68, 36, 2);
      spr(c, kiss ? A.tu.sitRKiss : t >= 3.8 ? A.tu.sitHappy : A.tu.sitRBlush, 48, 36, 2);
      if (t >= 2.4) {
        for (let i = 0; i < 5; i++) {
          const ph = (t - 2.4 - i * 0.45) % 3;
          if (ph < 0) continue;
          heart(c, 76 + Math.sin(ph * 2.5 + i * 2) * 9, 50 - ph * 12, i % 2 ? 5 : 7, i % 3 ? '#f28ab2' : '#f25a8c');
        }
      }
      [[22, 70], [108, 72], [146, 69]].forEach(([x, y], i) => sparkle(c, x, y, (t * 0.9 + i * 0.37) % 1, '#fff1c9'));
    },
  },
};

/* ---------------- personajes ---------------- */

function buildAssets() {
  const f = buildFrames();
  const cv = (s) => s.tex.image;
  const front = (spec, o = {}) => outline(paintFront(spec, o).c);
  const person = (spec) => {
    const p = {
      sit: front(spec, { legs: 'sit' }),
      sitR: front(spec, { legs: 'sit', turn: true }),
      sitRBlush: front(spec, { legs: 'sit', turn: true, blush: true }),
      sitRClosed: front(spec, { legs: 'sit', turn: true, closed: true }),
      sitRTalk: front(spec, { legs: 'sit', turn: true, laugh: true }),
      sitLaugh: front(spec, { legs: 'sit', closed: true, laugh: true, blush: true }),
      sitHappy: front(spec, { legs: 'sit', closed: true, blush: true }),
      sitBlush: front(spec, { legs: 'sit', blush: true }),
      stand: front(spec),
      standBlush: front(spec, { blush: true }),
      cheer: front(spec, { arms: 'up', closed: true, laugh: true, blush: true }),
    };
    // las mismas poses mirando a la izquierda
    for (const k of ['sitR', 'sitRBlush', 'sitRClosed', 'sitRTalk']) p[k.replace('R', 'L')] = mirror(p[k]);
    return p;
  };
  const A = { tu: person(TU), ella: person(ELLA), lupita: person(LUPITA), compas: COMPAS.map(person) };
  A.tu.runR = f.tu.run.map(cv);
  A.tu.runL = A.tu.runR.map((c) => mirror(c));
  A.ella.runL = f.ella.run.map(cv);
  A.ella.runR = A.ella.runL.map((c) => mirror(c));
  A.tu.sideR = cv(f.tu.stand);
  A.ella.sideL = cv(f.ella.stand);
  A.ella.sideR = mirror(A.ella.sideL);
  A.kiss = cv(f.kiss);
  A.hug = f.hug.map(cv);
  // para "Lo que viene"
  A.ella.sea = outline(paintSide(ELLA, { arm: 'down' }));
  A.ella.seaWish = outline(paintSide(ELLA, { arm: 'down', closed: true, blush: true }));
  A.tu.back = outline(paintBack(TU, { legs: 'sit', arms: 'typing' }).c);
  A.tu.sitRKiss = front(TU, { legs: 'sit', turn: true, closed: true, kiss: true, blush: true });
  A.ella.sitLean = front(ELLA, { legs: 'sit', headDx: -1, closed: true, blush: true });
  A.bouquet = bouquetSprite();
  A.chair = chairSprite();
  A.car = carSprite();
  A.bg = {};
  return A;
}

/* ---------------- el visor ---------------- */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// panels: lista de { escena, texto, nota?, globo?, respuesta?, pensamiento?, contacto? }
// turn(dir, swap): si se da, cambiar de viñeta lo hace quien la contiene
// (por ejemplo, volteando la hoja) y llama a swap() para cambiarla.
// paused: no empieza a contarse hasta play() (mientras, su primer cuadro quieto).
// onShow(i, frame): avisa cada vez que se muestra la viñeta i (frame: su cuadro).
export function createComic(panels, { turn = null, paused = false, onShow = null } = {}) {
  panels = panels.filter((p) => SCENES[p.escena]);
  const A = buildAssets();

  const root = el('section', 'comic');
  root.setAttribute('aria-label', 'Historieta');
  const frame = el('div', 'comic__vineta');
  const canvas = el('canvas', 'comic__lienzo');
  canvas.width = W;
  canvas.height = H;
  canvas.setAttribute('aria-hidden', 'true');
  const layer = el('div', 'comic__globos');
  layer.setAttribute('aria-hidden', 'true');
  frame.append(canvas, layer);
  const caption = el('p', 'comic__texto');
  caption.setAttribute('aria-hidden', 'true');
  const note = el('p', 'comic__nota');
  note.setAttribute('aria-hidden', 'true');
  const spoken = el('p', 'solo-lectores');
  spoken.setAttribute('aria-live', 'polite');
  const nav = el('div', 'comic__nav');
  const prev = el('button', 'comic__boton', 'Anterior');
  const next = el('button', 'comic__boton comic__boton--siguiente', 'Siguiente');
  prev.type = next.type = 'button';
  const count = el('span', 'comic__cuenta');
  nav.append(prev, count, next);
  root.append(frame, caption, note, spoken, nav);

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let i = 0, start = 0, raf = 0, running = !paused;
  let played = new Set();
  let bubbles = [];

  function show(k) {
    i = Math.max(0, Math.min(panels.length - 1, k));
    const p = panels[i], sc = SCENES[p.escena];
    start = performance.now();
    played = new Set();
    if (!A.bg[p.escena]) {
      const b = makeCanvas(W, H);
      sc.bg?.(b.ctx, A, p);
      if (sc.blurBg) blur(b.c);
      A.bg[p.escena] = b.c;
    }
    const defs = sc.bubbles?.(p) || [];
    bubbles = defs.map((b) => {
      const e = el('p', `comic__globo comic__globo--${b.kind}`, b.text);
      e.style.left = (b.x / W) * 100 + '%';
      e.style.top = (b.y / H) * 100 + '%';
      e.hidden = true;
      return { ...b, e };
    });
    layer.replaceChildren(...bubbles.map((b) => b.e));
    caption.textContent = '';
    note.textContent = p.nota || '';
    note.hidden = true;
    spoken.textContent = [p.texto, ...defs.map((b) => b.text), p.nota].filter(Boolean).join(' ');
    count.textContent = `${i + 1} / ${panels.length}`;
    prev.disabled = i === 0;
    next.textContent = i === panels.length - 1 ? 'Ver otra vez' : 'Siguiente';
    next.classList.remove('lista');
    frame.classList.remove('entra');
    void frame.offsetWidth;
    frame.classList.add('entra');
    onShow?.(i, frame);
  }

  function loop(now) {
    const p = panels[i], sc = SCENES[p.escena];
    const t = REDUCED ? sc.dur + 1 : Math.max(0, (now - start) / 1000);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(A.bg[p.escena], 0, 0);
    sc.draw(ctx, t, A);
    (sc.sounds || []).forEach(([at, play], k) => {
      if (!REDUCED && t >= at && !played.has(k)) {
        played.add(k);
        play();
      }
    });
    for (const b of bubbles) b.e.hidden = t < b.at;
    const typed = REDUCED ? p.texto : p.texto.slice(0, Math.floor(t * 34));
    if (caption.textContent !== typed) caption.textContent = typed;
    note.hidden = !p.nota || t < (sc.notaAt ?? sc.dur);
    // cuando la viñeta ya se contó completa, el botón invita a seguir
    next.classList.toggle('lista', t > Math.max(sc.dur, p.texto.length / 34) + 0.5);
    raf = requestAnimationFrame(loop);
  }

  // Tamaño entero de píxel cuando cabe (se ve más nítido); si no, a lo ancho.
  function fit() {
    const avail = root.clientWidth;
    const s = Math.floor(avail / W);
    frame.style.width = s >= 2 ? `${W * s}px` : '100%';
  }

  // el primer cuadro quieto, para que la viñeta no se vea en blanco
  function still() {
    const p = panels[i];
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(A.bg[p.escena], 0, 0);
    SCENES[p.escena].draw(ctx, 0, A);
  }

  const go = (k) => {
    // hacia adelante (o de la última a la primera) o hacia atrás
    if (turn) return turn(k < i && !(i === panels.length - 1 && k === 0) ? -1 : 1, () => show(k));
    sfx.swish();
    show(k);
  };
  prev.addEventListener('click', () => go(i - 1));
  next.addEventListener('click', () => go(i === panels.length - 1 ? 0 : i + 1));
  const onKey = (e) => {
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === 'ArrowRight' && i < panels.length - 1) go(i + 1);
    if (e.key === 'ArrowLeft' && i > 0) go(i - 1);
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', fit);

  show(0);
  requestAnimationFrame(() => {
    fit();
    if (running) raf = requestAnimationFrame(loop);
    else still();
  });

  return {
    el: root,
    play() {
      if (running) return;
      running = true;
      start = performance.now();
      played = new Set();
      raf = requestAnimationFrame(loop);
    },
    destroy() {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', fit);
    },
  };
}
