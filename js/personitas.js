import * as THREE from 'three';
import { makeCanvas, pixelTexture, PixelSprite, outlineCanvas } from './sprites.js';
import { islandTop } from './mundo.js';
import { clamp, lerp, easeOutCubic } from './comun.js';

/* =====================================================================
   Las dos personitas. Los colores salen de sus fotos: cámbialos aquí si
   quieres otra ropa o tono de cabello.
   ===================================================================== */

export const TU = {
  leg: 5, torso: 6,
  skin: '#c68a5e', skinD: '#a56e48',
  hair: '#21160f', hairL: '#5a4034', long: false,
  style: 'playera', top: '#2e2e38', topDark: '#1c1c23', topLight: '#4b4b5a',
  pants: '#5b7aa6', pantsD: '#46628b', pantsL: '#86a3c9', wide: false,
  shoe: '#3b2f2c', toe: '#4a3b36', frontShoe: '#3b2f2c',
  chute: ['#5fb8b0', '#fff1d6', '#3f8f88'],
};

export const ELLA = {
  leg: 4, torso: 5,
  skin: '#e6b092', skinD: '#c98f70',
  hair: '#171018', hairL: '#4b3553', long: true,
  style: 'blusa', top: '#b597e2', topDark: '#8a6cc2', topLight: '#d8c7f6',
  pants: '#1c1c23', pantsD: '#111116', pantsL: '#34343f', wide: true,
  shoe: '#24242c', toe: '#f3efe6', frontShoe: '#f3efe6',
  chute: ['#b99ce8', '#fff1d6', '#8a6cc2'],
};

const EYE = '#1a1216';
const CLOSED = '#7a4a3e';
const MOUTH = '#8e3f3a';
const KISS = '#d9536f';
const LAUGH = '#7a2a33';
const BLUSH = '#f08c9c';
const OUT = '#26141f';
const STRING = '#f6ecdb';

const W = 18, H = 24, F = 22;
const X0 = 5;

function pen(ctx) {
  return {
    p(x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); },
    r(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); },
    clear(x, y) { ctx.clearRect(x, y, 1, 1); },
  };
}

// k = cuántos píxeles lleva el brazo desde el hombro
const sleeve = (s, k) => (s.style === 'playera' ? (k < 2 ? s.top : s.skin) : s.topLight);

/* ---------------- vista de frente ---------------- */

// ojos de 1×2; cerrados son una rayita
function eyes(g, xa, xb, y, closed) {
  for (const x of [xa, xb]) {
    if (closed) g.p(x, y + 1, CLOSED);
    else g.r(x, y, 1, 2, EYE);
  }
}

function frontHead(g, s, x0, y0, o) {
  const Hc = s.hair, HL = s.hairL;
  if (s.long) {
    g.r(x0 + 1, y0, 6, 1, Hc);
    g.r(x0, y0 + 1, 8, 1, Hc);
    g.r(x0 - 1, y0 + 2, 10, 2, Hc);
    g.r(x0 - 1, y0 + 4, 2, 6, Hc);
    g.r(x0 + 7, y0 + 4, 2, 6, Hc);
    g.p(x0 - 2, y0 + 5, Hc); g.p(x0 - 2, y0 + 8, Hc);
    g.p(x0 + 9, y0 + 6, Hc); g.p(x0 + 9, y0 + 9, Hc);
    g.p(x0 + 2, y0 + 1, HL); g.p(x0 + 3, y0 + 1, HL); g.p(x0 + 1, y0 + 2, HL);
  } else {
    g.r(x0 + 1, y0, 6, 1, Hc);
    g.r(x0, y0 + 1, 8, 3, Hc);
    g.p(x0 - 1, y0 + 2, Hc); g.p(x0 + 8, y0 + 2, Hc);
    g.r(x0, y0 + 4, 1, 3, Hc);
    g.r(x0 + 7, y0 + 4, 1, 2, Hc);
    g.p(x0 + 2, y0 + 1, HL); g.p(x0 + 3, y0 + 1, HL); g.p(x0 + 5, y0 + 2, HL);
  }
  g.r(x0 + 1, y0 + 4, 6, 3, s.skin);
  g.r(x0 + 2, y0 + 7, 4, 1, s.skin);
  g.p(x0 + 6, y0 + 6, s.skinD);
  eyes(g, x0 + 2, x0 + 5, y0 + 4, o.closed);
  if (o.laugh) g.r(x0 + 3, y0 + 6, 2, 1, LAUGH);
  else g.p(x0 + 4, y0 + 6, o.kiss ? KISS : MOUTH);
  if (o.blush) { g.p(x0 + 1, y0 + 6, BLUSH); g.p(x0 + 6, y0 + 6, BLUSH); }
}

function frontTorso(g, s, x0, top) {
  const rows = s.torso;
  if (s.style === 'playera') {
    g.r(x0, top, 8, rows, s.top);
    g.r(x0 + 3, top, 2, 1, s.skin);
    g.p(x0 + 1, top + 1, s.topLight);
    g.p(x0 + 2, top + 3, s.topLight);
    g.p(x0 + 5, top + 2, s.topLight);
    g.r(x0, top + rows - 1, 8, 1, s.topDark);
    g.clear(x0, top);
    g.clear(x0 + 7, top);
  } else {
    g.r(x0, top, 8, rows, s.top);
    g.r(x0 + 2, top, 4, 1, s.skin);
    g.r(x0 + 3, top + 1, 2, 1, s.skin);
    g.p(x0 + 1, top, s.topLight);
    g.p(x0 + 6, top, s.topLight);
    g.p(x0 + 1, top + 2, s.topLight);
    g.r(x0, top + rows - 1, 8, 1, s.topDark);
    g.clear(x0, top);
    g.clear(x0 + 7, top);
  }
}

function armCols(s, x0) {
  return [x0 - 1, x0 + 8];
}

// con los brazos en alto la melena queda por dentro de los brazos
function upCols(s, x0) {
  return s.long ? [x0 - 3, x0 + 10] : armCols(s, x0);
}

function frontArms(g, s, x0, top, pose) {
  const [L, R] = pose === 'up' ? upCols(s, x0) : armCols(s, x0);
  if (pose === 'up') {
    const [l0, r0] = armCols(s, x0);
    for (let x = L; x <= l0; x++) g.p(x, top + 1, sleeve(s, 0));
    for (let x = r0; x <= R; x++) g.p(x, top + 1, sleeve(s, 0));
    for (let y = top - 6; y <= top + 1; y++) { g.p(L, y, sleeve(s, top + 1 - y)); g.p(R, y, sleeve(s, top + 1 - y)); }
    g.p(L, top - 7, s.skin); g.p(R, top - 7, s.skin);
  } else {
    for (let y = top + 1; y <= top + 4; y++) { g.p(L, y, sleeve(s, y - top - 1)); g.p(R, y, sleeve(s, y - top - 1)); }
    g.p(L, top + 5, s.skin); g.p(R, top + 5, s.skin);
  }
}

function frontLegs(g, s, x0, hip, pose) {
  if (pose === 'sit') {
    g.r(x0 - 1, F - 1, 10, 1, s.pants);
    g.r(x0, F, 8, 1, s.pantsD);
    g.p(x0 + 1, F - 1, s.pantsL);
    g.p(x0 + 6, F - 1, s.pantsL);
    g.r(x0 - 2, F, 2, 1, s.frontShoe);
    g.r(x0 + 8, F, 2, 1, s.frontShoe);
    return;
  }
  const sp = pose === 'squat' ? 1 : 0;
  const w = s.wide ? 3 : 2;
  const lx = x0 + (s.wide ? 0 : 1) - sp, rx = x0 + 5 + sp;
  for (let y = hip; y < F; y++) {
    g.r(lx, y, w, 1, s.pants);
    g.r(rx, y, w, 1, s.pants);
  }
  if (s.wide) {
    g.r(lx - 1, F - 1, w + 1, 1, s.pants);
    g.r(rx, F - 1, w + 1, 1, s.pants);
    g.p(x0 + 4, F - 1, s.pantsD);
  }
  g.p(lx, hip + 1, s.pantsL);
  g.r(lx - 1 + (s.wide ? 1 : 0), F, 3, 1, s.frontShoe);
  g.r(rx + (s.wide ? 0 : 0), F, 3, 1, s.frontShoe);
}

export function paintFront(s, o = {}) {
  const { c, ctx } = makeCanvas(W, H);
  const g = pen(ctx);
  const hip = o.legs === 'sit' ? F - 1 : F - s.leg + (o.legs === 'squat' ? 2 : 0);
  const top = hip - s.torso;
  const y0 = top - 7 + (o.headDy || 0);
  frontLegs(g, s, X0, hip, o.legs || 'stand');
  frontTorso(g, s, X0, top);
  frontArms(g, s, X0, top, o.arms || 'down');
  (o.turn ? sideHead : frontHead)(g, s, X0 + (o.headDx || 0), y0, o);
  return { c, top, hip };
}

/* ---------------- vista de perfil (mirando a la derecha) ---------------- */

function sideHead(g, s, x0, y0, o) {
  const Hc = s.hair, HL = s.hairL;
  if (s.long) {
    g.r(x0 + 1, y0, 6, 1, Hc);
    g.r(x0, y0 + 1, 8, 1, Hc);
    g.r(x0 - 1, y0 + 2, 10, 2, Hc);
    g.r(x0, y0 + 4, 3, 6, Hc);
    g.p(x0 + 3, y0 + 1, HL); g.p(x0 + 4, y0 + 1, HL); g.p(x0 + 2, y0 + 2, HL); g.p(x0, y0 + 6, HL);
  } else {
    g.r(x0 + 1, y0, 6, 1, Hc);
    g.r(x0, y0 + 1, 8, 3, Hc);
    g.r(x0 + 8, y0 + 2, 1, 2, Hc);
    g.r(x0, y0 + 4, 2, 3, Hc);
    g.p(x0 - 1, y0 + 2, Hc);
    g.p(x0 + 3, y0 + 1, HL); g.p(x0 + 4, y0 + 1, HL); g.p(x0 + 6, y0 + 2, HL);
  }
  g.r(x0 + 2, y0 + 4, 6, 3, s.skin);
  g.r(x0 + 3, y0 + 7, 4, 1, s.skin);
  g.p(x0 + 2, y0 + 5, s.skinD);
  g.p(x0 + 8, y0 + 5, s.skin);
  const E = o.closed ? CLOSED : EYE;
  eyes(g, x0 + 4, x0 + 6, y0 + 4, o.closed);
  if (o.laugh) g.r(x0 + 5, y0 + 6, 2, 1, LAUGH);
  else g.p(x0 + 6, y0 + 6, o.kiss ? KISS : MOUTH);
  if (o.blush) g.p(x0 + 4, y0 + 6, BLUSH);
}

function sideTorso(g, s, x0, top) {
  const rows = s.torso;
  if (s.style === 'playera') {
    g.r(x0 + 1, top, 6, rows, s.top);
    g.p(x0 + 5, top, s.skin);
    g.r(x0 + 1, top + 1, 1, rows - 1, s.topDark);
    g.p(x0 + 5, top + 2, s.topLight);
    g.r(x0 + 1, top + rows - 1, 6, 1, s.topDark);
    g.clear(x0 + 1, top);
  } else {
    g.r(x0 + 1, top, 6, rows, s.top);
    g.r(x0 + 5, top, 2, 1, s.skin);
    g.r(x0 + 1, top + 1, 1, rows - 1, s.topDark);
    g.p(x0 + 6, top + 1, s.topLight);
    g.r(x0 + 1, top + rows - 1, 6, 1, s.topDark);
    g.clear(x0 + 1, top);
  }
}

/* ---------------- vista de espaldas ---------------- */

function backHead(g, s, x0, y0) {
  const Hc = s.hair, HL = s.hairL;
  g.r(x0 + 1, y0, 6, 1, Hc);
  if (s.long) {
    g.r(x0, y0 + 1, 8, 1, Hc);
    g.r(x0 - 1, y0 + 2, 10, 6, Hc);
    g.r(x0, y0 + 8, 8, 2, Hc);
    g.p(x0 - 1, y0 + 9, Hc); g.p(x0 + 8, y0 + 8, Hc);
    g.r(x0, y0 + 10, 2, 1, Hc); g.r(x0 + 3, y0 + 10, 2, 1, Hc); g.r(x0 + 6, y0 + 10, 2, 1, Hc);
    for (const [x, y] of [[2, 1], [3, 1], [1, 2], [6, 3], [2, 5], [5, 6], [1, 8], [6, 9]]) g.p(x0 + x, y0 + y, HL);
  } else {
    g.r(x0, y0 + 1, 8, 5, Hc);
    g.p(x0 - 1, y0 + 2, Hc); g.p(x0 + 8, y0 + 2, Hc);
    g.r(x0 + 1, y0 + 6, 6, 1, Hc);
    for (const [x, y] of [[2, 1], [3, 1], [5, 2], [2, 3], [6, 4]]) g.p(x0 + x, y0 + y, HL);
    g.r(x0 - 1, y0 + 4, 1, 2, s.skin); g.r(x0 + 8, y0 + 4, 1, 2, s.skin);
  }
}

function backTorso(g, s, x0, top) {
  const rows = s.torso;
  if (s.style === 'playera') {
    g.r(x0, top, 8, rows, s.top);
    g.r(x0 + 3, top, 2, 1, s.skin);
    g.p(x0 + 2, top + 2, s.topLight);
    g.p(x0 + 5, top + 3, s.topLight);
    g.r(x0, top + rows - 1, 8, 1, s.topDark);
  } else {
    g.r(x0, top, 8, rows, s.top);
    g.p(x0 + 1, top + 1, s.topLight);
    g.p(x0 + 6, top + 1, s.topLight);
    g.r(x0, top + rows - 1, 8, 1, s.topDark);
  }
  g.clear(x0, top);
  g.clear(x0 + 7, top);
}

function backLegs(g, s, x0, hip, pose) {
  if (pose === 'sit') {
    g.r(x0, F - 1, 8, 1, s.pants);
    g.r(x0, F, 8, 1, s.pantsD);
    return;
  }
  const w = s.wide ? 3 : 2;
  const lx = x0 + (s.wide ? 0 : 1), rx = x0 + 5;
  for (let y = hip; y < F; y++) {
    g.r(lx, y, w, 1, s.pants);
    g.r(rx, y, w, 1, s.pants);
  }
  g.r(lx, F, w, 1, s.frontShoe);
  g.r(rx, F, w, 1, s.frontShoe);
}

export function paintBack(s, o = {}) {
  const { c, ctx } = makeCanvas(W, H);
  const g = pen(ctx);
  const sit = o.legs === 'sit';
  const hip = sit ? F - 1 : F - s.leg;
  const top = hip - s.torso;
  backLegs(g, s, X0, hip, o.legs || 'stand');
  backTorso(g, s, X0, top);
  const [L, R] = armCols(s, X0);
  // tecleando, de espaldas solo se ven los codos: los antebrazos van hacia el teclado
  const typing = o.arms === 'typing';
  for (let y = top + 1; y <= top + (typing ? 3 : 4); y++) { g.p(L, y, sleeve(s, y - top - 1)); g.p(R, y, sleeve(s, y - top - 1)); }
  if (typing) { g.p(L + 1, top + 4, s.skin); g.p(R - 1, top + 4, s.skin); }
  else if (sit) { g.p(L, top + 5, s.skin); g.p(R, top + 5, s.skin); }
  backHead(g, s, X0 + (o.headDx || 0), top - 7 + (o.headDy || 0));
  return { c, top };
}

const ARMS = {
  down: { sl: [[3, 1], [4, 1], [3, 2], [4, 2], [3, 3], [4, 3], [3, 4], [4, 4]], hand: [4, 5] },
  fwd: { sl: [[3, 1], [4, 1], [4, 2], [5, 2], [5, 3], [6, 3]], hand: [7, 3] },
  back: { sl: [[3, 1], [4, 1], [2, 2], [3, 2], [1, 3], [2, 3]], hand: [1, 4] },
  hug: { sl: [[3, 1], [4, 1], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2]], hand: [11, 2] },
};

function sideArm(g, s, x0, top, pose) {
  const a = ARMS[pose];
  if (!a) return;
  a.sl.forEach(([x, y], i) => g.p(x0 + x, top + y, sleeve(s, Math.floor(i / 2))));
  g.p(x0 + a.hand[0], top + a.hand[1], s.skin);
}

// [cadera x, pie x, cuánto se levanta el pie] para la pierna de atrás y la de adelante
const LEGS = {
  stand: [[2, 2, 0], [4, 4, 0]],
  run1: [[2, 0, 1], [4, 6, 0]],
  run2: [[2, 3, 2], [4, 4, 0]],
  run3: [[2, 5, 0], [4, 1, 1]],
  run4: [[2, 2, 0], [4, 4, 2]],
};

function sideLegs(g, s, x0, hip, pose) {
  const w = s.wide ? 3 : 2;
  LEGS[pose].forEach(([hx, fx, lift], i) => {
    const fy = F - lift;
    const rows = fy - hip;
    const col = i === 0 ? s.pantsD : s.pants;
    for (let k = 0; k < rows; k++) {
      const x = Math.round(lerp(hx, fx, rows > 1 ? k / (rows - 1) : 1));
      g.r(x0 + x, hip + k, w, 1, col);
    }
    g.r(x0 + fx, fy, 2, 1, s.shoe);
    g.p(x0 + fx + 2, fy, s.toe);
  });
}

export function paintSide(s, o = {}) {
  const { c, ctx } = makeCanvas(W, H);
  const g = pen(ctx);
  const hip = F - s.leg + (o.bob || 0);
  const top = hip - s.torso;
  if (!o.onlyArm) {
    sideLegs(g, s, X0, hip, o.legs || 'stand');
    sideTorso(g, s, X0, top);
    sideHead(g, s, X0 + (o.headDx || 0), top - 7 + (o.headDy || 0), o);
  }
  if (o.arm) sideArm(g, s, X0, top, o.arm);
  return c;
}

/* ---------------- utilidades de lienzo ---------------- */

export const outline = (c) => outlineCanvas(c, OUT);

export function mirror(src) {
  const { c, ctx } = makeCanvas(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  // Sin esto, lo que se dibuje después (p. ej. el contorno) saldría volteado.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

function compose(w, layers) {
  const { c, ctx } = makeCanvas(w, H);
  for (const [src, x] of layers) ctx.drawImage(src, x, 0);
  return c;
}

const toSprite = (c) => ({ tex: pixelTexture(c), w: c.width, h: c.height });

// Luz del atardecer que les llega de frente: aclara solo el borde exterior de
// arriba de la silueta (cabello y hombros), mezclada con el color original.
function rimLight(c, color = '#f4a67f', amount = 0.5) {
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const w = c.width, h = c.height;
  const out = new THREE.Color(OUT);
  const idx = (x, y) => (y * w + x) * 4;
  const empty = (x, y) => x < 0 || y < 0 || x >= w || y >= h || d[idx(x, y) + 3] === 0;
  const isOut = (x, y) => !empty(x, y) && Math.abs(d[idx(x, y)] / 255 - out.r) < 0.02 && Math.abs(d[idx(x, y) + 1] / 255 - out.g) < 0.02;
  const outer = (x, y) => isOut(x, y) && (empty(x, y - 1) || empty(x - 1, y) || empty(x + 1, y));
  const rim = new THREE.Color(color);
  const lit = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (empty(x, y) || isOut(x, y)) continue;
      if (outer(x, y - 1)) lit.push(x, y);
    }
  }
  for (let k = 0; k < lit.length; k += 2) {
    const i = idx(lit[k], lit[k + 1]);
    d[i] = Math.round(d[i] + (rim.r * 255 - d[i]) * amount);
    d[i + 1] = Math.round(d[i + 1] + (rim.g * 255 - d[i + 1]) * amount);
    d[i + 2] = Math.round(d[i + 2] + (rim.b * 255 - d[i + 2]) * amount);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ---------------- paracaídas ---------------- */

const DOME = [[9, 16], [6, 19], [4, 21], [3, 22], [2, 23], [2, 23], [1, 24]];

function line(g, x0, y0, x1, y1, col) {
  if (x0 === x1 && y0 === y1) return g.p(x0, y0, col);
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) g.p(Math.round(lerp(x0, x1, i / n)), Math.round(lerp(y0, y1, i / n)), col);
}

function paintChute(s, tilt, hl, hr) {
  const { c, ctx } = makeCanvas(26, 17);
  const g = pen(ctx);
  const [c1, c2, cd] = s.chute;
  DOME.forEach(([a, b], y) => {
    for (let x = a; x <= b; x++) {
      let col = Math.floor((x + 1) / 4) % 2 ? c2 : c1;
      if (y === DOME.length - 1) col = cd;
      else if (x > b - 2 || y === DOME.length - 2) col = new THREE.Color(col).multiplyScalar(0.86).getStyle();
      g.p(x + tilt, y, col);
    }
  });
  g.r(9 + tilt, 1, 3, 1, '#ffffff');
  g.p(7 + tilt, 2, '#ffffff');
  outline(c);
  for (const [x, hx] of [[2, hl], [9, hl], [16, hr], [23, hr]]) line(g, x + tilt, 7, hx, 16, STRING);
  return c;
}

/* ---------------- todos los cuadros de animación ---------------- */

export function buildFrames() {
  const one = (s, faceLeft) => {
    const side = (o) => {
      const c = outline(paintSide(s, o));
      return toSprite(faceLeft ? mirror(c) : c);
    };
    const dangle = paintFront(s, { arms: 'up' });
    const [L, R] = upCols(s, X0);
    const handY = dangle.top - 7;
    const hl = 13 - Math.floor((R - L) / 2), hr = hl + (R - L);
    return {
      dangle: toSprite(outline(dangle.c)),
      squat: toSprite(outline(paintFront(s, { legs: 'squat' }).c)),
      stand: side({ arm: 'down' }),
      run: [
        side({ legs: 'run1', arm: 'back' }),
        side({ legs: 'run2', arm: 'down', bob: -1 }),
        side({ legs: 'run3', arm: 'fwd' }),
        side({ legs: 'run4', arm: 'down', bob: -1 }),
      ],
      chute: [-2, 0, 2].map((t) => toSprite(paintChute(s, t, hl, hr))),
      hand: { x: L, y: handY, cx: hl },
    };
  };

  // Abrazo y beso: cada brazo se dibuja al final para que rodee a la otra persona.
  const HUG_OFF = 8;
  // Cada capa lleva su propio contorno: así se distinguen aunque se enciman.
  const couple = (oTu, oElla) => {
    const tuBody = outline(paintSide(TU, { ...oTu, arm: null }));
    const ellaBody = outline(mirror(paintSide(ELLA, { ...oElla, arm: null })));
    const tuArm = outline(paintSide(TU, { ...oTu, onlyArm: true, arm: 'hug' }));
    const ellaArm = outline(mirror(paintSide(ELLA, { ...oElla, onlyArm: true, arm: 'hug' })));
    return toSprite(compose(W + HUG_OFF, [[tuBody, 0], [ellaBody, HUG_OFF], [tuArm, 0], [ellaArm, HUG_OFF]]));
  };

  // Sentados de espaldas viendo el paisaje: ella recarga la cabeza en su
  // hombro y el brazo de él le rodea la espalda.
  const SIT_OFF = 8;
  const sit = (tuHead, ellaHead) => {
    const tu = paintBack(TU, { legs: 'sit', headDx: tuHead[0], headDy: tuHead[1] });
    const ella = paintBack(ELLA, { legs: 'sit', headDx: ellaHead[0], headDy: ellaHead[1] });
    const arm = makeCanvas(W + SIT_OFF, H);
    const g = pen(arm.ctx);
    const [, R] = armCols(TU, X0);
    const [, R2] = armCols(ELLA, X0);
    let k = 0;
    line({ p: (x, y) => g.p(x, y, sleeve(TU, k++)) }, R, tu.top + 1, SIT_OFF + R2 - 1, ella.top + 1);
    g.p(SIT_OFF + R2, ella.top + 1, TU.skin);
    return toSprite(rimLight(compose(W + SIT_OFF, [[outline(tu.c), 0], [outline(ella.c), SIT_OFF], [outline(arm.c), 0]])));
  };
  const standBack = () =>
    toSprite(rimLight(compose(W + 9, [[outline(paintBack(TU).c), 0], [outline(paintBack(ELLA).c), 9]])));

  return {
    tu: one(TU, false),
    ella: one(ELLA, true),
    hug: [
      couple({}, {}),
      couple({ closed: true, blush: true }, { closed: true, blush: true, bob: -1 }),
    ],
    kiss: couple({ closed: true, blush: true, headDx: 1, headDy: 1 }, { closed: true, blush: true, kiss: true, bob: -1 }),
    turn: standBack(),
    sit: [sit([0, 0], [-2, 1]), sit([1, 1], [-2, 1])],
    sitKiss: sit([2, 1], [-3, 0]),
  };
}

/* ---------------- coreografía ---------------- */

const FALL = 5.6;
const RUN_SPEED = 2.3;
export const SIT_SPOT = new THREE.Vector3(-2.1, islandTop(Math.hypot(2.1, 1.7)), 1.7);

export class Pareja {
  constructor(scene) {
    this.f = buildFrames();
    const mk = (spr, ax, ay) => {
      const s = new PixelSprite(spr, { anchorX: ax, anchorY: ay, renderOrder: 3 });
      s.mesh.visible = false;
      scene.add(s.mesh);
      return s;
    };
    this.people = [
      { key: 'tu', dir: -1, f: this.f.tu, ph: 0.3, delay: 1.2 },
      { key: 'ella', dir: 1, f: this.f.ella, ph: 2.1, delay: 0 },
    ].map((p) => ({
      ...p,
      sprite: mk(p.f.dangle, 0.5, 1),
      chute: mk(p.f.chute[1], 0.5, 0.5),
      pos: new THREE.Vector3(),
      from: new THREE.Vector3(p.dir * 9.5, 12.5 + p.delay * 2, 2.2),
      land: new THREE.Vector3(p.dir * 4.3, islandTop(Math.hypot(4.3, 2.2)), 2.2),
      chuteVel: new THREE.Vector3(),
      state: 'oculto',
      t: 0,
      dist: 0,
      frame: -1,
    }));
    this.duo = mk(this.f.hug[0], 0.5, 1);
    this.duo.drawOnTop(5);
    this.state = 'espera';
    this.t = 0;
    this.nextLean = 3;
    this.lean = false;
    this.nextHeart = 6;
    this.press = [new THREE.Vector3(), new THREE.Vector3()];
    this._w = new THREE.Vector3();
  }

  start() {
    this.state = 'llegando';
    for (const p of this.people) {
      p.state = 'cayendo';
      p.t = -p.delay;
      p.pos.copy(p.from);
      p.sprite.set(p.f.dangle);
      p.sprite.drawOnTop(12);
      p.chute.drawOnTop(12);
    }
  }

  // Para ?saltar: ya están sentados.
  seatNow() {
    for (const p of this.people) {
      p.state = 'junto';
      p.sprite.mesh.visible = false;
      p.chute.mesh.visible = false;
    }
    this.state = 'sentados';
    this.t = 0;
    this.duo.set(this.f.sit[0]);
  }

  get seated() {
    return this.state === 'sentados';
  }

  // Punto justo encima de sus cabezas (para corazones y para no tapar el tronco tallado).
  headPoint(out = new THREE.Vector3()) {
    return out.copy(SIT_SPOT).setY(SIT_SPOT.y + 21 * (this.wpp || 0.05));
  }

  hit(px, py) {
    if (!this.seated) return false;
    const r = this.duo.rect;
    return px >= r.x && px <= r.x + r.w && py >= r.y + 6 && py <= r.y + r.h;
  }

  poke(ev) {
    if (!this.seated || this.kissT > 0) return;
    this.kissT = 1;
    ev.kiss?.(this.headPoint());
  }

  update(dt, t, camera, rtW, rtH, ev) {
    this.t += dt;
    this.wpp = this.people[0].sprite.wpp;
    const right = this._w.set(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    for (const p of this.people) this.updatePerson(p, dt, t, camera, rtW, rtH, right, ev);

    if (this.state === 'llegando' && this.people.every((p) => p.state === 'junto')) {
      this.state = 'abrazo';
      this.t = 0;
      for (const p of this.people) p.sprite.mesh.visible = false;
      ev.hug?.(this.headPoint());
    }

    if (this.state === 'abrazo') {
      this.duo.set(this.f.hug[Math.floor(this.t / 0.4) % 2]);
      if (this.t > 1.9) {
        this.state = 'beso';
        this.t = 0;
        ev.kiss?.(this.headPoint());
      }
    } else if (this.state === 'beso') {
      this.duo.set(this.f.kiss);
      if (this.t > 1.5) {
        this.state = 'volteo';
        this.t = 0;
      }
    } else if (this.state === 'volteo') {
      // se dan la vuelta hacia el paisaje y se sientan
      this.duo.set(this.f.turn);
      if (this.t > 0.55) {
        this.state = 'sentados';
        this.t = 0;
        this.nextLean = 3;
        this.nextHeart = 5;
        ev.seated?.(this.headPoint());
      }
    } else if (this.state === 'sentados') {
      // de vez en cuando él recarga la cabeza sobre la de ella
      if (this.t > this.nextLean) {
        this.lean = !this.lean;
        this.nextLean = this.t + (this.lean ? 2.2 : 3.5) + Math.random() * 2;
      }
      if (this.kissT > 0) {
        this.kissT -= dt;
        this.duo.set(this.f.sitKiss);
      } else this.duo.set(this.f.sit[this.lean ? 1 : 0]);
      if (this.t > this.nextHeart) {
        this.nextHeart = this.t + 7 + Math.random() * 5;
        ev.heart?.(this.headPoint());
      }
    }

    const together = ['abrazo', 'beso', 'volteo', 'sentados'].includes(this.state);
    this.duo.mesh.visible = together;
    if (together) this.duo.place(SIT_SPOT, camera, rtW, rtH);

    // la hierba se aplasta bajo sus pies
    this.people.forEach((p, i) => {
      const onGround = p.state === 'aterriza' || p.state === 'corre' || p.state === 'junto';
      const at = together ? SIT_SPOT.clone().addScaledVector(right, (i ? 1 : -1) * 0.35) : p.pos;
      this.press[i].set(at.x, at.z, onGround ? 1 : 0);
    });
  }

  updatePerson(p, dt, t, camera, rtW, rtH, right, ev) {
    if (p.state === 'oculto') return;
    p.t += dt;
    const s = p.sprite;

    if (p.state === 'cayendo') {
      if (p.t < 0) return;
      const k = clamp(p.t / FALL, 0, 1);
      const sway = Math.sin(t * 1.9 + p.ph) * 0.35 * (1 - k * 0.8);
      p.pos.set(
        lerp(p.from.x, p.land.x, easeOutCubic(k)) + sway,
        p.land.y + (p.from.y - p.land.y) * Math.pow(1 - k, 1.15),
        p.land.z,
      );
      s.mesh.visible = true;
      s.set(p.f.dangle);
      s.place(p.pos, camera, rtW, rtH);
      const v = Math.cos(t * 1.9 + p.ph);
      const ch = p.f.chute[v > 0.35 ? 0 : v < -0.35 ? 2 : 1];
      p.chute.set(ch);
      p.chute.mesh.visible = true;
      p.chute.placePx(s.rect.x + p.f.hand.x - p.f.hand.cx, s.rect.y + p.f.hand.y - (ch.h - 1), s.depth, camera, rtW, rtH);
      if (k >= 1) {
        p.state = 'aterriza';
        p.t = 0;
        s.drawOnTop(5);
        s.set(p.f.squat);
        p.chuteVel.set(p.dir * 0.9, 1.7, 0);
        p.chutePos = p.chute.mesh.position.clone();
        p.chuteT = 0;
        ev.land?.(p.pos);
      }
      return;
    }

    // el paracaídas se suelta y se va volando
    if (p.chute.mesh.visible) {
      p.chuteT += dt;
      p.chutePos.addScaledVector(p.chuteVel, dt);
      p.chutePos.x += Math.sin(t * 2.3 + p.ph) * 0.01;
      p.chute.place(p.chutePos, camera, rtW, rtH);
      if (p.chuteT > 4) p.chute.mesh.visible = false;
    }

    if (p.state === 'aterriza') {
      s.set(p.f.squat);
      s.place(p.pos, camera, rtW, rtH);
      if (p.t > 0.4) {
        p.state = 'corre';
        p.t = 0;
        p.dist = 0;
      }
      return;
    }

    const target = this._t || (this._t = new THREE.Vector3());
    target.copy(SIT_SPOT).addScaledVector(right, p.dir * 4 * (s.wpp || 0.05));
    if (p.state === 'corre') {
      const d = target.clone().sub(p.pos);
      d.y = 0;
      const len = d.length();
      const step = RUN_SPEED * dt;
      if (len <= step) {
        p.pos.copy(target);
        p.state = 'junto';
      } else {
        p.pos.addScaledVector(d, step / len);
        p.dist += step;
      }
      p.pos.y = islandTop(Math.hypot(p.pos.x, p.pos.z));
      const fr = Math.floor(p.dist / 0.2) % 4;
      if (fr !== p.frame) {
        p.frame = fr;
        if (fr % 2 === 0) ev.step?.(p.pos);
      }
      s.set(p.state === 'junto' ? p.f.stand : p.f.run[fr]);
    }
    s.place(p.pos, camera, rtW, rtH);
  }
}
