import { makeCanvas, pixelTexture, PixelSprite, outlineCanvas } from './sprites.js';
import { drawText, measure } from './pixelfont.js';
import { lerp } from './comun.js';

/* =====================================================================
   Avioneta que cruza el cielo al fondo remolcando una manta con sus
   iniciales dentro de un corazón. Pasa de vez en cuando, detrás del árbol.
   ===================================================================== */

const OUT = '#3a1f3d';
const ROPE = '#6b4a5a';

// Avioneta rosa manejada por Kuromi, mirando a la izquierda: alas lilas,
// cono rosa, corazón negro en el costado y la cola con su estabilizador.
// Kuromi va en la cabina con sus goggles rosas sobre la capucha; la hélice y
// la manita con la que saluda se animan aparte.
const PLANE = [
  '.........................................',
  '............k...........k................',
  '............kk.........kk................',
  '............kKk.......kKk................',
  '.............kKgggkgggKk.................',
  '.............kkgGgkgGgkk.................',
  '............kkkkkkskkkkkk................',
  '............kkkkkkkkkkkkk........hhh.....',
  '............kkkwwwkwwwkkk.......ppppp....',
  '.......llll.kkwwkwwwkwwkk.......ppppp....',
  '......llllllkkwbwwnwwbwkk.k....pppppp....',
  '......Lhhhhhhkkwwwwwwwkkhhkhhh.pppppp....',
  '.....rrhhhhPPPPPPPPPPPPPPPPhhhhhhhhhhh...',
  '....hrrppppppppppppppppppppppppppppppp...',
  '...cprrppkpkppppppppppppppppppllllllllll.',
  '..ccprrpkkkkkppppppppppppppppLLLLLLLLLL..',
  '.cccprrppkkkpppppppppppppppppppPPPPP.....',
  '..ccPrrpppkpppppppppppppppPPPPPPP........',
  '...cPrrPPppppppppppppPPPPPPPP............',
  '.....rrPPPPPPPlllllllllllllll............',
  '.......PPPPPPPPlllllllllllllll...........',
  '................lllllllllllllll..........',
  '.................LLLLLLLLLLLLLL..........',
];
const PAL = {
  k: '#1d171f', K: '#3d3446', w: '#ffffff', b: '#ffb3c8', s: '#ff8fb0', n: '#ff8fb0',
  g: '#ff9cc2', G: '#c9a3e0',
  p: '#f7a8c8', h: '#ffd3e3', P: '#df82ab', r: '#e68fb5', c: '#ffc2d8',
  l: '#c8b4ea', L: '#a690d8',
  y: '#ffe7a0', Y: '#e8c46a', q: '#fff4d0',
};
const TAIL = { x: 39, y: 15 };    // de ahí sale la cuerda
const HAND = [[1, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2], [1, 3]];

function paintPlane(propFrame, phase) {
  const W = PLANE[0].length, H = PLANE.length;
  const { c, ctx } = makeCanvas(W + 2, H + 2);
  const put = (x, y, ch) => {
    if (!PAL[ch]) return;
    ctx.fillStyle = PAL[ch];
    ctx.fillRect(x + 1, y + 1, 1, 1);
  };
  PLANE.forEach((row, y) => [...row].forEach((ch, x) => put(x, y, ch)));
  // la manita saluda: sube y baja, y se ladea tantito
  const up = Math.round(Math.sin(phase) * 0.8), side = Math.sin(phase) > 0.5 ? 1 : 0;
  for (const [dx, dy] of HAND) put(26 + dx + side, 6 + dy - up, 'w');
  // hélice amarilla: larga y borrosa / corta, alternando
  if (propFrame) for (let y = 10; y <= 22; y++) put(0, y, y % 2 ? 'q' : 'y');
  else for (let y = 13; y <= 19; y++) put(0, y, y === 13 || y === 19 ? 'Y' : 'y');
  return outlineCanvas(c, OUT);
}

// Corazón con la ecuación clásica (x² + y² − 1)³ = x²·y³, ajustado a w×h.
function heartMask(w, h) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  const inside = (u, v) => {
    const a = u * u + v * v - 1;
    return a * a * a - u * u * v * v * v <= 0;
  };
  for (let v = -1.5; v <= 1.5; v += 0.01) {
    for (let u = -1.5; u <= 1.5; u += 0.01) {
      if (!inside(u, v)) continue;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u);
      v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
  }
  const m = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = lerp(u0, u1, (x + 0.5) / w);
      const v = lerp(v1, v0, (y + 0.5) / h);
      m.push(inside(u, v));
    }
  }
  return m;
}

// Manta de tela con el corazón y el texto; el palo va del lado del avión.
// La tela tiene pliegues suaves y una costura rosita arriba y abajo; el
// corazón, su brillo.
function paintBanner(text, poleLeft) {
  const HW = 23, HH = 19;
  const W = HW + 10, H = HH + 5;
  const { c, ctx } = makeCanvas(W, H);
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  R(1, 0, W - 2, H, '#fff5e8');
  for (let x = 4; x < W - 2; x += 5) R(x, 1, 1, H - 2, '#f6e6d2');
  R(1, 0, W - 2, 1, '#ffffff');
  R(1, H - 1, W - 2, 1, '#e8d4b8');
  for (let x = 2; x < W - 2; x += 2) {
    R(x, 1, 1, 1, '#f4a6c1');
    R(x, H - 2, 1, 1, '#f4a6c1');
  }
  const pole = poleLeft ? 0 : W - 1;
  R(pole, 0, 1, H, '#8a5530');
  R(pole, 0, 1, 1, '#5a3520');
  R(pole, H - 1, 1, 1, '#5a3520');

  const hx = poleLeft ? 6 : 4, hy = 3;
  const mask = heartMask(HW, HH);
  const at = (x, y) => x >= 0 && y >= 0 && x < HW && y < HH && mask[y * HW + x];
  for (let y = 0; y < HH; y++) {
    for (let x = 0; x < HW; x++) {
      if (!at(x, y)) continue;
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      const shade = !at(x + 1, y + 1) || !at(x + 2, y + 2);
      const shine = (x - 5) ** 2 + (y - 4) ** 2 < 5;
      R(hx + x, hy + y, 1, 1, edge ? '#e0426e' : shine ? '#fff0f5' : shade ? '#f7b3c8' : '#ffd3e0');
    }
  }
  // texto en la franja más ancha del corazón
  const tw = measure(text);
  drawText(ctx, text, hx + Math.round((HW - tw) / 2), hy + 3, '#b0356b');
  return c;
}

// La tela ondea: cada columna se mueve un píxel arriba o abajo, más lejos del palo.
function ripple(src, phase, poleLeft) {
  const { c, ctx } = makeCanvas(src.width, src.height + 2);
  for (let x = 0; x < src.width; x++) {
    const d = poleLeft ? x : src.width - 1 - x;
    const amp = Math.min(1.3, d / 12);
    const dy = Math.round(Math.sin(d * 0.45 - phase) * amp);
    ctx.drawImage(src, x, 0, 1, src.height, x, 1 + dy, 1, src.height);
  }
  return outlineCanvas(c, OUT);
}

function mirror(src) {
  const { c, ctx } = makeCanvas(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

// Un cuadro completo: avión + cuerdas + manta, para volar a la izquierda o a
// la derecha. Las dos cuerdas van de la cola a las puntas del palo, en V.
function frame(text, dirLeft, propFrame, phase) {
  let plane = paintPlane(propFrame, phase);
  const banner = ripple(paintBanner(text, dirLeft), phase, dirLeft);
  const rope = 9;
  const tailY = TAIL.y + 1;
  const py = Math.max(0, Math.round(banner.height / 2 - tailY));
  const by = py + tailY - Math.round(banner.height / 2);
  const W = plane.width + rope + banner.width;
  const H = Math.max(py + plane.height, by + banner.height);
  const { c, ctx } = makeCanvas(W, H);
  if (!dirLeft) plane = mirror(plane);
  const planeX = dirLeft ? 0 : banner.width + rope;
  const bannerX = dirLeft ? plane.width + rope : 0;
  const hookX = dirLeft ? TAIL.x + 1 : planeX + plane.width - 1 - (TAIL.x + 1);
  const poleX = dirLeft ? bannerX : banner.width - 1;
  ctx.drawImage(plane, planeX, py);
  ctx.drawImage(banner, bannerX, by);
  ctx.fillStyle = ROPE;
  for (const endY of [by + 2, by + banner.height - 3]) {
    const n = Math.abs(poleX - hookX);
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const x = Math.round(lerp(hookX, poleX, k));
      ctx.fillRect(x, Math.round(lerp(py + tailY, endY, k) + Math.sin(k * Math.PI) * 0.8), 1, 1);
    }
  }
  return { tex: pixelTexture(c), w: c.width, h: c.height };
}

export class Avion {
  constructor(scene, text = 'G&E') {
    const build = (dirLeft) => {
      const out = [];
      for (let r = 0; r < 4; r++) for (let p = 0; p < 2; p++) out.push(frame(text, dirLeft, p, (r * Math.PI) / 2));
      return out;
    };
    this.frames = { left: build(true), right: build(false) };
    this.sprite = new PixelSprite(this.frames.left[0], { renderOrder: 1 });
    this.sprite.mesh.visible = false;
    scene.add(this.sprite.mesh);
    this.next = Infinity;
    this.pass = null;
    this.dir = -1;
  }

  // Primera pasada en el instante t; después vuelve cada 8–16 s.
  schedule(t) {
    if (this.next === Infinity && !this.pass) this.next = t;
  }

  get visible() {
    return this.sprite.mesh.visible;
  }

  hit(px, py) {
    if (!this.visible) return false;
    const r = this.sprite.rect;
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  // band(): fila superior (en píxeles del render) por la que debe volar.
  update(dt, t, camera, rtW, rtH, depth, band, ev) {
    if (!this.pass && t >= this.next) {
      const dur = 11 + rtW / 60;
      this.pass = { t0: t, dir: this.dir, dur, top: band(this.frames.left[0].h) };
      this.dir *= -1;
      ev.pass?.(this.pass.dir, dur);
    }
    if (!this.pass) {
      this.sprite.mesh.visible = false;
      return;
    }
    const p = this.pass;
    const k = (t - p.t0) / p.dur;
    if (k >= 1) {
      this.pass = null;
      this.next = t + 8 + Math.random() * 8;
      this.sprite.mesh.visible = false;
      return;
    }
    const set = p.dir < 0 ? this.frames.left : this.frames.right;
    const f = set[(Math.floor(t / 0.2) % 4) * 2 + (Math.floor(t / 0.05) % 2)];
    this.sprite.set(f);
    const x = p.dir < 0 ? lerp(rtW + 2, -f.w - 2, k) : lerp(-f.w - 2, rtW + 2, k);
    const y = p.top + Math.round(Math.sin(t * 1.3) * 1.5);
    this.sprite.placePx(Math.round(x), y, depth, camera, rtW, rtH);
    this.sprite.mesh.visible = true;
  }
}
