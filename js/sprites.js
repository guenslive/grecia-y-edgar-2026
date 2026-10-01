import * as THREE from 'three';
import { mulberry32 } from './comun.js';
import { measure, drawText, wrap, LINE_H } from './pixelfont.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d') };
}

export function pixelTexture(canvas, flipY = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.flipY = flipY;
  return t;
}

function paint(ctx, rows, pal, ox = 0, oy = 0) {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (!pal[ch]) return;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(ox + x, oy + y, 1, 1);
    });
  });
}

// Contorno de 1 px alrededor de todo lo que no es transparente.
export function outlineCanvas(c, color) {
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const w = c.width, h = c.height;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  ctx.fillStyle = color;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/* ---------- Semilla ---------- */

const SEED_PAL = { '#': '#3b2214', h: '#f6cf9a', l: '#d69a5c', m: '#a86a38', d: '#744525' };
const SEED = [
  '...##...',
  '..#hh#..',
  '.#hlmm#.',
  '.#lmmm#.',
  '#lmmmmd#',
  '#mmmmmd#',
  '#mmmmdd#',
  '.#mmdd#.',
  '.#dddd#.',
  '..####..',
];
const SEED_SQUASH = [
  '...####...',
  '..#hhll#..',
  '.#hlmmmm#.',
  '#lmmmmmmd#',
  '#mmmmmmdd#',
  '.#mmmddd#.',
  '..######..',
];

export function seedTextures() {
  const a = makeCanvas(8, 10);
  paint(a.ctx, SEED, SEED_PAL);
  const b = makeCanvas(10, 7);
  paint(b.ctx, SEED_SQUASH, SEED_PAL);
  return {
    normal: { tex: pixelTexture(a.c), w: 8, h: 10 },
    squash: { tex: pixelTexture(b.c), w: 10, h: 7 },
  };
}

/* ---------- Halo tramado ---------- */

export function glowTexture(size = 40, inner = '#fff0d0', mid = '#ffc4d6', outer = '#f28ab8') {
  const { c, ctx } = makeCanvas(size, size);
  const R = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - R, y + 0.5 - R) / R;
      if (d > 1) continue;
      const f = Math.pow(1 - d, 1.5);
      if (f <= bayer(x, y)) continue;
      ctx.fillStyle = d < 0.3 ? inner : d < 0.6 ? mid : outer;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return { tex: pixelTexture(c), w: size, h: size };
}

/* ---------- Corazón tallado en el tronco ---------- */

const HEART_CARVE = [
  '.##...##.',
  '#..#.#..#',
  '#...#...#',
  '#.......#',
  '.#.....#.',
  '..#...#..',
  '...#.#...',
  '....#....',
];

export function carvedHeart() {
  const { c, ctx } = makeCanvas(9, 9);
  const px = [];
  HEART_CARVE.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && px.push([x, y])));
  // Orden de tallado: alrededor del centro empezando por la punta de abajo.
  px.sort((a, b) => ang(a) - ang(b));
  function ang([x, y]) {
    const a = Math.atan2(y - 3.5, x - 4) - Math.PI / 2;
    return (a + Math.PI * 4) % (Math.PI * 2);
  }
  const tex = pixelTexture(c);
  let shown = -1;
  return {
    tex, w: 9, h: 9,
    total: px.length,
    reveal(n) {
      n = Math.min(px.length, Math.floor(n));
      if (n === shown) return;
      shown = n;
      ctx.clearRect(0, 0, 9, 9);
      const on = new Set(px.slice(0, n).map(([x, y]) => x + ',' + y));
      for (const k of on) {
        const [x, y] = k.split(',').map(Number);
        if (!on.has(x + ',' + (y + 1))) {
          ctx.fillStyle = '#c99462';
          ctx.fillRect(x, y + 1, 1, 1);
        }
      }
      ctx.fillStyle = '#2a140c';
      for (const k of on) {
        const [x, y] = k.split(',').map(Number);
        ctx.fillRect(x, y, 1, 1);
      }
      tex.needsUpdate = true;
    },
  };
}

/* ---------- Corazoncito flotante (para partículas) ---------- */

export function heartPointTexture() {
  const { c, ctx } = makeCanvas(7, 7);
  paint(ctx, [
    '.##.##.',
    '#hh####',
    '#h#####',
    '#######',
    '.#####.',
    '..###..',
    '...#...',
  ], { '#': '#ffffff', h: '#ffffff' });
  // el color lo pone la partícula; la textura solo recorta la silueta
  return pixelTexture(c, false);
}

/* ---------- Cartel de madera ---------- */

export function signTexture(text, hover = false) {
  const lines = wrap(text, 62);
  const tw = Math.max(...lines.map(measure));
  const W = tw + 10;
  const H = LINE_H * lines.length + 3;
  const { c, ctx } = makeCanvas(W, H);
  const rng = mulberry32([...text].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));

  const edge = hover ? '#fff1c8' : '#3a2114';
  const base = hover ? '#c98d52' : '#b87a44';
  const light = hover ? '#ecb97a' : '#d9a066';
  const dark = hover ? '#9c6338' : '#8a5530';
  const grain = hover ? '#ad7143' : '#9c6338';

  ctx.fillStyle = base;
  ctx.fillRect(1, 1, W - 2, H - 2);
  ctx.fillStyle = light;
  ctx.fillRect(1, 1, W - 2, 1);
  ctx.fillStyle = dark;
  ctx.fillRect(1, H - 2, W - 2, 1);

  // vetas
  for (let y = 2; y < H - 2; y++) {
    let x = 1 + Math.floor(rng() * 4);
    while (x < W - 2) {
      const len = 2 + Math.floor(rng() * 6);
      if (rng() < 0.55) {
        ctx.fillStyle = rng() < 0.7 ? grain : light;
        ctx.fillRect(x, y, Math.min(len, W - 2 - x), 1);
      }
      x += len + 2 + Math.floor(rng() * 6);
    }
  }
  // nudo de la madera
  const kx = rng() < 0.5 ? 3 : W - 6;
  const ky = Math.floor(H / 2);
  ctx.fillStyle = dark;
  ctx.fillRect(kx, ky, 3, 1);
  ctx.fillStyle = '#6e4122';
  ctx.fillRect(kx + 1, ky, 1, 1);

  // borde con esquinas redondeadas
  ctx.fillStyle = edge;
  ctx.fillRect(1, 0, W - 2, 1);
  ctx.fillRect(1, H - 1, W - 2, 1);
  ctx.fillRect(0, 1, 1, H - 2);
  ctx.fillRect(W - 1, 1, 1, H - 2);

  // clavos
  for (const nx of [2, W - 3]) {
    ctx.fillStyle = '#dfe3e8';
    ctx.fillRect(nx, 2, 1, 1);
    ctx.fillStyle = '#5b4a44';
    ctx.fillRect(nx, 3, 1, 1);
  }

  // texto grabado: luz debajo, surco encima
  lines.forEach((line, i) => {
    const lx = Math.round((W - measure(line)) / 2);
    const ly = 1 + i * LINE_H;
    drawText(ctx, line, lx, ly + 1, hover ? '#ffd69a' : '#e3aa6d');
    drawText(ctx, line, lx, ly, '#43240f');
  });

  return { tex: pixelTexture(c), w: W, h: H };
}

/* ---------- Sprite pegado a la rejilla de píxeles ---------- */

const PLANE = new THREE.PlaneGeometry(1, 1);

// Un plano siempre de frente a la cámara, escalado para que cada texel mida
// exactamente un píxel del render y alineado a la rejilla: el pixel art se
// mantiene nítido aunque esté dentro de una escena 3D.
export class PixelSprite {
  constructor(sprite, { anchorX = 0.5, anchorY = 0.5, additive = false, castShadow = false, renderOrder = 0, opacity = 1 } = {}) {
    this.w = sprite.w;
    this.h = sprite.h;
    this.ax = anchorX;
    this.ay = anchorY;
    this.material = new THREE.MeshBasicMaterial({
      map: sprite.tex,
      transparent: additive || opacity < 1,
      alphaTest: additive ? 0 : 0.5,
      depthWrite: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      opacity,
    });
    this.mesh = new THREE.Mesh(PLANE, this.material);
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = castShadow;
    this.rect = { x: 0, y: 0, w: this.w, h: this.h };
    this.wpp = 0.05;
    this.depth = 10;
  }

  set(sprite) {
    this.material.map = sprite.tex;
    this.w = sprite.w;
    this.h = sprite.h;
  }

  place(world, camera, rtW, rtH) {
    const v = _v.copy(world).applyMatrix4(camera.matrixWorldInverse);
    const z = -v.z;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const sx = (v.x / (z * tanH * camera.aspect) * 0.5 + 0.5) * rtW;
    const sy = (0.5 - (v.y / (z * tanH)) * 0.5) * rtH;
    const left = Math.round(sx - this.w * this.ax);
    const top = Math.round(sy - this.h * this.ay);
    const cx = left + this.w / 2;
    const cy = top + this.h / 2;
    const wpp = (2 * z * tanH) / rtH;
    this.mesh.position.set(
      (cx / rtW - 0.5) * 2 * z * tanH * camera.aspect,
      (0.5 - cy / rtH) * 2 * z * tanH,
      -z,
    ).applyMatrix4(camera.matrixWorld);
    this.mesh.quaternion.copy(camera.quaternion);
    this.mesh.scale.set(this.w * wpp, this.h * wpp, 1);
    this.rect.x = left;
    this.rect.y = top;
    this.rect.w = this.w;
    this.rect.h = this.h;
    this.wpp = wpp;
    this.depth = z;
  }

  // Coloca la esquina superior izquierda exactamente en el píxel (left, top) a la distancia z.
  placePx(left, top, z, camera, rtW, rtH) {
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const wpp = (2 * z * tanH) / rtH;
    const cx = left + this.w / 2;
    const cy = top + this.h / 2;
    this.mesh.position.set(
      (cx / rtW - 0.5) * 2 * z * tanH * camera.aspect,
      (0.5 - cy / rtH) * 2 * z * tanH,
      -z,
    ).applyMatrix4(camera.matrixWorld);
    this.mesh.quaternion.copy(camera.quaternion);
    this.mesh.scale.set(this.w * wpp, this.h * wpp, 1);
    this.rect.x = left;
    this.rect.y = top;
    this.rect.w = this.w;
    this.rect.h = this.h;
    this.wpp = wpp;
    this.depth = z;
  }

  // Sin prueba de profundidad: se dibuja encima de lo que tenga menor renderOrder
  // (en el aire, encima de todo; en el suelo, encima de la hierba).
  drawOnTop(renderOrder) {
    this.material.depthTest = false;
    this.mesh.renderOrder = renderOrder;
  }
}
const _v = new THREE.Vector3();
