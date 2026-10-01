import * as THREE from 'three';
import { clamp } from './comun.js';
import { islandTop, ISLAND_R } from './mundo.js';
import { heartPointTexture } from './sprites.js';

const VS = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
varying float vSize;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vSize = aSize;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize;
}
`;
const FS = /* glsl */ `
uniform int uShape;
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
varying float vSize;
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  vec2 c = floor(gl_PointCoord * vSize);
  float m = floor(vSize * 0.5);
  float a = vAlpha;
  if (uShape == 1 && vSize > 2.5) {
    if (c.x != m && c.y != m) discard;
  } else if (uShape == 2) {
    if (texture2D(uMap, gl_PointCoord).a < 0.5) discard;
  } else if (uShape == 3) {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (pow(max(0.0, 1.0 - r), 1.5) <= bayer4(gl_FragCoord.xy)) discard;
  }
  gl_FragColor = vec4(vColor, a);
}
`;

// Capa de puntos pixelados; cada sistema la rellena en cada fotograma.
class PointLayer {
  constructor(scene, cap, { shape = 0, additive = false, map = null, renderOrder = 5 } = {}) {
    this.cap = cap;
    this.count = 0;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    const g = (this.geo = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uShape: { value: shape }, uMap: { value: map } },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    scene.add(this.points);
  }
  begin() { this.count = 0; }
  push(x, y, z, c, size, alpha = 1) {
    if (this.count >= this.cap) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.size[i] = size;
    this.alpha[i] = alpha;
  }
  end() {
    this.geo.setDrawRange(0, this.count);
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[k].needsUpdate = true;
  }
}

const PETAL_COLORS = ['#ffd1e1', '#ffb3cc', '#fff0f5', '#f59ab8', '#ffe4ee'].map((h) => new THREE.Color(h));
const DIRT = ['#6e4630', '#8a5a3c', '#4f8a44', '#5a3a28'].map((h) => new THREE.Color(h));
const SPARK = ['#fff4c8', '#ffd27a', '#ffc4dc', '#ffffff'].map((h) => new THREE.Color(h));
const FIREFLY = new THREE.Color('#f4ffa0');
const FIREFLY_HALO = new THREE.Color('#9fd86a');
const HEART = ['#ff6f9f', '#ff8fb5', '#f25a8c'].map((h) => new THREE.Color(h));

export class Particulas {
  constructor(scene) {
    this.petalLayer = new PointLayer(scene, 900, { renderOrder: 6 });
    this.dirtLayer = new PointLayer(scene, 200, { renderOrder: 6 });
    this.sparkLayer = new PointLayer(scene, 700, { shape: 1, additive: true, renderOrder: 7 });
    this.glowLayer = new PointLayer(scene, 80, { shape: 3, additive: true, renderOrder: 6 });
    this.heartLayer = new PointLayer(scene, 80, { shape: 2, map: heartPointTexture(), renderOrder: 8 });
    this.petals = [];
    this.dirt = [];
    this.sparks = [];
    this.hearts = [];
    this.fireflies = [];
    this.meteors = [];
    this.tint = new THREE.Color(1, 1, 1);
    this.rand = Math.random;
    this.cursor = { active: false, origin: new THREE.Vector3(), dir: new THREE.Vector3(), vel: new THREE.Vector3() };
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 5.5;
      this.fireflies.push({
        cx: Math.cos(a) * r, cz: Math.sin(a) * r, cy: 0.6 + Math.random() * 3.5,
        ph: Math.random() * 10, sp: 0.25 + Math.random() * 0.3, amp: 0.6 + Math.random() * 0.9,
      });
    }
    this.fireflyVis = 0;
  }

  petal(x, y, z, burst = false) {
    if (this.petals.length > 850) this.petals.shift();
    const r = this.rand;
    this.petals.push({
      x, y, z,
      vx: burst ? (r() - 0.5) * 2 : 0, vy: burst ? r() * 1.2 : 0, vz: burst ? (r() - 0.5) * 2 : 0,
      ph: r() * 10, fall: 0.3 + r() * 0.25, c: PETAL_COLORS[Math.floor(r() * PETAL_COLORS.length)],
      landed: false, t: 0, life: 12 + r() * 10,
    });
  }

  dirtBurst(x, y, z, n = 26) {
    const r = this.rand;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, s = 0.8 + r() * 1.8;
      this.dirt.push({ x, y: y + 0.05, z, vx: Math.cos(a) * s, vy: 1.5 + r() * 2.5, vz: Math.sin(a) * s * 0.6, t: 0, life: 0.9 + r() * 0.6, c: DIRT[Math.floor(r() * DIRT.length)], s: r() < 0.3 ? 2 : 1 });
    }
  }

  sparkle(x, y, z, n = 10, spread = 0.6, up = 0.6) {
    const r = this.rand;
    for (let i = 0; i < n; i++) {
      this.sparks.push({
        x: x + (r() - 0.5) * spread, y: y + (r() - 0.5) * spread, z: z + (r() - 0.5) * spread,
        vx: (r() - 0.5) * 0.5, vy: up * (0.3 + r()), vz: (r() - 0.5) * 0.5,
        t: -r() * 0.3, life: 0.7 + r() * 0.7, c: SPARK[Math.floor(r() * SPARK.length)],
      });
    }
  }

  // Estrella fugaz desde p con velocidad v (unidades/s). delay: cuánto espera
  // para salir; head: tamaño de la cabeza en px (3: destellito); tail: segundos
  // de estela; step: unidades por píxel a esa distancia (para que la estela
  // sea una rayita continua); glow: qué tanto brilla; warm: estela dorada o rosita.
  meteor(p, v, { delay = 0, life = 1.2, head = 2, tail = 0.19, step = 1, glow = 1, warm = true } = {}) {
    this.meteors.push({ p: p.clone(), v: v.clone(), t: -delay, life, head, tail, step, glow, c: warm ? SPARK[0] : SPARK[2] });
  }

  heart(x, y, z, n = 1) {
    const r = this.rand;
    for (let i = 0; i < n; i++) {
      this.hearts.push({ x: x + (r() - 0.5) * 0.6, y: y + (r() - 0.5) * 0.3, z: z + 0.2, vy: 0.6 + r() * 0.5, ph: r() * 6, t: -i * 0.12, life: 2.2 + r(), c: HEART[Math.floor(r() * HEART.length)] });
    }
  }

  update(dt, t, wind, fireflyTarget) {
    const cur = this.cursor;
    cur.vel.multiplyScalar(Math.exp(-dt * 6));
    this.fireflyVis += (fireflyTarget - this.fireflyVis) * Math.min(1, dt * 0.8);

    // pétalos
    const L = this.petalLayer;
    L.begin();
    const keep = [];
    for (const p of this.petals) {
      p.t += dt;
      if (!p.landed) {
        p.ph += dt * (2.2 + p.fall * 2);
        const tvx = wind * 14 + Math.sin(p.ph * 0.7) * 0.35;
        const tvz = Math.cos(p.ph * 0.5) * 0.25;
        const tvy = -(p.fall + Math.sin(p.ph) * 0.12);
        const k = Math.min(1, dt * 1.8);
        p.vx += (tvx - p.vx) * k;
        p.vz += (tvz - p.vz) * k;
        p.vy += (tvy - p.vy) * k;
        if (cur.active) {
          const dx = p.x - cur.origin.x, dy = p.y - cur.origin.y, dz = p.z - cur.origin.z;
          const along = dx * cur.dir.x + dy * cur.dir.y + dz * cur.dir.z;
          const qx = dx - cur.dir.x * along, qy = dy - cur.dir.y * along, qz = dz - cur.dir.z * along;
          const dist = Math.hypot(qx, qy, qz);
          if (dist < 1.3) {
            const f = (1 - dist / 1.3) * 0.9;
            p.vx += cur.vel.x * f; p.vy += cur.vel.y * f; p.vz += cur.vel.z * f;
          }
        }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const rr = Math.hypot(p.x, p.z);
        if (rr < ISLAND_R && p.y <= islandTop(rr) + 0.04 && p.vy < 0) {
          p.landed = true;
          p.y = islandTop(rr) + 0.05;
          p.t = 0;
        }
        if (p.y < -12) continue;
        L.push(p.x, p.y, p.z, tmpC.copy(p.c).multiply(this.tint), Math.sin(p.ph * 3) > -0.2 ? 2 : 1, 1);
      } else {
        if (p.t > p.life) continue;
        L.push(p.x, p.y, p.z, tmpC.copy(p.c).multiply(this.tint).multiplyScalar(0.92), 1, clamp((p.life - p.t) / 3, 0, 1));
      }
      keep.push(p);
    }
    this.petals = keep;
    L.end();

    // tierra
    const D = this.dirtLayer;
    D.begin();
    this.dirt = this.dirt.filter((p) => {
      p.t += dt;
      if (p.t > p.life) return false;
      p.vy -= 9 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const g = islandTop(Math.hypot(p.x, p.z)) + 0.03;
      if (p.y < g) { p.y = g; p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; }
      D.push(p.x, p.y, p.z, tmpC.copy(p.c).multiply(this.tint), p.s, 1);
      return true;
    });
    D.end();

    // chispas
    const S = this.sparkLayer;
    S.begin();
    this.sparks = this.sparks.filter((p) => {
      p.t += dt;
      if (p.t > p.life) return false;
      if (p.t < 0) return true;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.t / p.life;
      const size = k < 0.2 ? 1 : k < 0.45 ? 3 : k < 0.7 ? 5 : k < 0.85 ? 3 : 1;
      S.push(p.x, p.y, p.z, p.c, size, 1 - k * 0.5);
      return true;
    });

    // estrellas fugaces: la cabeza brillante y una estela de un píxel por paso
    // que crece al arrancar, se afina y se va apagando hacia atrás
    this.meteors = this.meteors.filter((m) => {
      m.t += dt;
      if (m.t > m.life) return false;
      if (m.t < 0) return true;
      m.p.addScaledVector(m.v, dt);
      const fade = m.glow * Math.min(1, m.t / 0.15) * Math.min(1, (m.life - m.t) / 0.3);
      S.push(m.p.x, m.p.y, m.p.z, SPARK[3], m.head, fade);
      const back = Math.min(m.tail, m.t);
      const n = Math.min(60, Math.ceil((m.v.length() * back) / m.step));
      for (let k = 1; k <= n; k++) {
        const s = (k / n) * back;
        const thick = m.head > 1 && k < n * 0.35 ? 2 : 1;
        S.push(m.p.x - m.v.x * s, m.p.y - m.v.y * s, m.p.z - m.v.z * s, k < n * 0.25 ? SPARK[3] : m.c, thick, fade * (1 - k / (n + 1)) ** 1.4);
      }
      return true;
    });

    // luciérnagas: núcleo de 1-2 px con halo tramado
    const G = this.glowLayer;
    G.begin();
    if (this.fireflyVis > 0.02) {
      for (const f of this.fireflies) {
        const tt = t * f.sp + f.ph;
        const x = f.cx + Math.sin(tt * 1.3) * f.amp;
        const y = f.cy + Math.sin(tt * 0.9 + 1.7) * 0.5;
        const z = f.cz + Math.cos(tt * 1.1) * f.amp;
        const glow = Math.pow(Math.max(0, Math.sin(t * 1.6 + f.ph * 3)), 2) * this.fireflyVis;
        if (glow < 0.05) continue;
        S.push(x, y, z, FIREFLY, glow > 0.6 ? 2 : 1, glow);
        G.push(x, y, z, FIREFLY_HALO, 7, glow * 0.35);
      }
    }
    S.end();
    G.end();

    // corazones
    const H = this.heartLayer;
    H.begin();
    this.hearts = this.hearts.filter((p) => {
      p.t += dt;
      if (p.t > p.life) return false;
      if (p.t < 0) return true;
      p.y += p.vy * dt;
      const x = p.x + Math.sin(p.t * 3 + p.ph) * 0.15;
      H.push(x, p.y, p.z, p.c, 7, clamp((p.life - p.t) / 0.6, 0, 1));
      return true;
    });
    H.end();
  }
}
const tmpC = new THREE.Color();
