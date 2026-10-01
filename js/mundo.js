import * as THREE from 'three';
import { toonMat, flatGeometry, mulberry32, vnoise2, hash2, lerp } from './comun.js';

export const ISLAND_R = 6.25;
const PROFILE = [
  [0, 0.42], [1.5, 0.4], [3, 0.33], [4.5, 0.22], [5.6, 0.1], [6.3, -0.02], [6.6, -0.25],
  [6.55, -0.6], [6.1, -1.2], [5.5, -2.0], [4.6, -2.9], [3.6, -3.8], [2.5, -4.7],
  [1.4, -5.6], [0.5, -6.3], [0, -6.6],
];

// Altura de la superficie de la isla a una distancia r del centro.
export function islandTop(r) {
  for (let i = 1; i < 6; i++) {
    const [r1, y1] = PROFILE[i];
    if (r <= r1) {
      const [r0, y0] = PROFILE[i - 1];
      return lerp(y0, y1, (r - r0) / (r1 - r0));
    }
  }
  return PROFILE[5][1];
}

// Radio del perfil (sin ruido) a la altura y, en la parte de abajo de la isla.
function profileR(y) {
  for (let i = 6; i < PROFILE.length; i++) {
    const [r0, y0] = PROFILE[i - 1], [r1, y1] = PROFILE[i];
    if (y >= y1) return lerp(r0, r1, (y - y0) / (y1 - y0));
  }
  return 0;
}

// Radio de la roca en el ángulo a y la altura y, con el mismo ruido con el que
// se deforma la isla (ver islandGeometry): ahí se pegan las lianas.
function rockR(a, y) {
  let yp = y;
  for (let it = 0; it < 3; it++) {
    const r0 = profileR(yp);
    yp = y - (yp < -0.7 ? 0.5 * (vnoise2(Math.cos(a) * r0 * 0.7, Math.sin(a) * r0 * 0.7) - 0.5) : 0);
  }
  const r0 = profileR(yp), x = Math.cos(a) * r0, z = Math.sin(a) * r0;
  return r0 * (1 + 0.2 * (vnoise2(x * 0.45 + 5, z * 0.45 + 5) - 0.5) + 0.12 * (vnoise2(yp * 0.9, x * 0.3 + z * 0.3) - 0.5));
}

const C = (h) => new THREE.Color(h);
const NIGHT = {
  zenith: C('#060920'), mid: C('#111a45'), horizon: C('#26336e'),
  seaShadow: C('#121840'), seaMid: C('#1d275a'), seaLight: C('#2e3a76'), haze: C('#222d63'),
  hemiSky: C('#7a8ae0'), hemiGround: C('#2e2650'), hemi: 1.6,
  key: C('#b8c6ff'), keyI: 1.9,
  tint: C('#6f7fc4'),
  cloud: [C('#c8d0f8'), C('#98a1da'), C('#6a72b0'), C('#e8ecff')],
};
const DUSK = {
  zenith: C('#1b1540'), upper: C('#4a2b69'), low: C('#b35a86'), horizon: C('#ffa987'),
  seaShadow: C('#8a5a8e'), seaMid: C('#d68aa6'), seaLight: C('#ffd3c6'), haze: C('#f5a59a'),
  hemiSky: C('#f0c8e8'), hemiGround: C('#6a4660'), hemi: 1.1,
  key: C('#ffe0c8'), keyI: 2.1,
  rim: C('#ff9a6a'), rimI: 1.2,
  tint: C('#fff0ec'),
  cloud: [C('#fff6ee'), C('#ffd6de'), C('#d9a3c6'), C('#ffe2a8')],
};

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
// radio de la luna (en dirección de vista); las estrellas no se asoman encima
const MOON_R = 0.025;

const SKY_FS = /* glsl */ `
#define MOON_R ${MOON_R}
uniform float uDawn;
uniform vec3 uN0, uN1, uN2, uD0, uD1, uD2, uD3, uBelow;
uniform vec3 uMoonDir, uSunDir;
varying vec3 vDir;

// corazoncito de 7×6 píxeles (p: píxeles desde su esquina de arriba a la izquierda)
bool heartPx(vec2 p) {
  int x = int(floor(p.x)), y = int(floor(p.y));
  if (x < 0 || x > 6 || y < 0 || y > 5) return false;
  int row = y == 0 ? 54 : y < 3 ? 127 : y == 3 ? 62 : y == 4 ? 28 : 8;
  return ((row >> (6 - x)) & 1) == 1;
}
// mar de la luna: un óvalo de orilla ondulada (negativo adentro)
float sea(vec2 p, vec2 c, vec2 r, float k) {
  vec2 q = (p - c) / r;
  return length(q) - 1.0 + 0.12 * sin(atan(q.y, q.x) * 5.0 + k);
}
// cráter: el fondo más oscuro, la pared del lado de la luz en sombra y la
// orilla de enfrente iluminada (L: hacia la luz; px: un píxel, en radios)
void crater(inout vec3 col, vec2 p, vec2 c, float r, vec2 L, float px) {
  vec2 q = (p - c) / r;
  float dq = length(q);
  if (dq < 1.0) col *= dot(q, L) > 0.25 ? 0.72 : 0.88;
  else if (dq < 1.0 + 1.3 * px / r && dot(q, L) < -0.2) col = min(col * 1.1, vec3(1.0));
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 night = mix(uN2, uN1, smoothstep(0.0, 0.18, h));
  night = mix(night, uN0, smoothstep(0.18, 0.6, h));
  vec3 dusk = mix(uD3, uD2, smoothstep(0.0, 0.09, h));
  dusk = mix(dusk, uD1, smoothstep(0.09, 0.26, h));
  dusk = mix(dusk, uD0, smoothstep(0.26, 0.62, h));
  vec3 c = mix(night, dusk, uDawn);
  c = mix(c, uBelow, smoothstep(0.0, -0.06, h));

  // sol que asoma al amanecer
  float s = dot(d, uSunDir);
  c += uDawn * vec3(1.0, 0.6, 0.42) * (pow(max(s, 0.0), 14.0) * 0.4 + pow(max(s, 0.0), 90.0) * 0.35);
  if (s > 0.99962) c = mix(c, vec3(1.0, 0.94, 0.8), uDawn);

  // luna llena en pixel art: luz de arriba a la izquierda en tonos planos,
  // mares, cráteres con su orilla, un corazoncito escondido y su halo
  float m = dot(d, uMoonDir);
  vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, uMoonDir);
  vec2 lp = vec2(dot(d, right), dot(d, up)) / MOON_R;
  float lr = length(lp);
  float px = length(dFdx(lp)) + 1e-4;
  float plain = 1.0;   // 0.5: la pasada final no la trama (tonos limpios)
  c += vec3(0.55, 0.6, 0.85) * pow(max(m, 0.0), 1800.0) * 0.35 * (1.0 - uDawn * 0.6);
  if (m > 0.0 && lr < 1.0 + px * 9.0) {
    if (lr >= 1.0) {
      // halo en tres anillos (la pasada final los trama)
      float g = lr < 1.0 + px * 2.5 ? 0.42 : lr < 1.0 + px * 5.5 ? 0.24 : 0.1;
      c = mix(c, vec3(1.0, 0.96, 0.9), g * (1.0 - uDawn * 0.3));
    } else {
      vec2 L = normalize(vec2(-0.6, 0.55));
      float li = dot(vec3(lp, sqrt(1.0 - lr * lr)), normalize(vec3(L * 0.75, 0.66)));
      vec3 moon = li > 0.78 ? vec3(1.0, 0.985, 0.94)
                : li > 0.5 ? vec3(0.96, 0.915, 0.83)
                : li > 0.2 ? vec3(0.86, 0.78, 0.78)
                : vec3(0.7, 0.62, 0.74);
      float s = min(sea(lp, vec2(-0.28, 0.22), vec2(0.34, 0.24), 0.0), sea(lp, vec2(0.3, 0.12), vec2(0.2, 0.26), 2.0));
      s = min(s, sea(lp, vec2(0.14, -0.5), vec2(0.22, 0.13), 4.0));
      if (s < 0.0) moon *= vec3(0.84, 0.82, 0.88);
      if (heartPx(vec2(lp.x + 0.4, -0.36 - lp.y) / px + vec2(3.5, 3.0))) moon *= vec3(0.93, 0.76, 0.84);
      crater(moon, lp, vec2(0.44, -0.4), 0.17, L, px);
      crater(moon, lp, vec2(-0.08, 0.6), 0.13, L, px);
      crater(moon, lp, vec2(0.58, 0.34), 0.1, L, px);
      crater(moon, lp, vec2(-0.66, -0.02), 0.09, L, px);
      crater(moon, lp, vec2(0.14, -0.08), 0.08, L, px);
      c = mix(c, moon, 1.0 - uDawn * 0.06);
      plain = 0.5;
    }
  }
  gl_FragColor = vec4(c, plain);
}
`;

const STAR_VS = /* glsl */ `
#define MOON_R ${MOON_R}
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uVis;
uniform vec3 uMoonDir;
varying float vA;
varying float vSize;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.5 + 0.5 * sin(uTime * (0.8 + aPhase * 2.5) + aPhase * 40.0);
  vec3 dir = normalize(position);
  vA = uVis * (0.35 + 0.65 * tw) * smoothstep(0.02, 0.2, dir.y);
  if (dot(dir, uMoonDir) > cos(MOON_R * 1.35)) vA = 0.0;
  float s = aSize;
  if (aSize > 2.5) s = tw > 0.7 ? 3.0 : 1.0;
  gl_PointSize = s;
  vSize = s;
}
`;
const STAR_FS = /* glsl */ `
varying float vA;
varying float vSize;
void main() {
  if (vSize > 2.5) {
    vec2 c = floor(gl_PointCoord * 3.0);
    if (c.x != 1.0 && c.y != 1.0) discard;
  }
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * vA, 1.0);
}
`;

const SEA_VS = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const SEA_FS = /* glsl */ `
uniform float uTime;
uniform vec3 uShadow, uMid, uLight, uHaze;
varying vec3 vW;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = vW.xz;
  float v = fbm(p * 0.035 + vec2(uTime * 0.012, 0.0)) + 0.3 * fbm(p * 0.11 - vec2(0.0, uTime * 0.02));
  vec3 c = v < 0.62 ? uShadow : (v < 0.78 ? uMid : uLight);
  float dist = length(vW.xz - cameraPosition.xz);
  c = mix(c, uHaze, smoothstep(30.0, 230.0, dist));
  gl_FragColor = vec4(c, 1.0);
}
`;

// Nubes: tonos planos de luz, medio y sombra, una orillita encendida del lado
// de la luz y un poco de bruma con la distancia. Alfa 0.25: la pasada final
// les pone un contorno más suave que al resto.
const CLOUD_VS = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const CLOUD_FS = /* glsl */ `
uniform vec3 uLight;   // de dónde viene la luz (espacio de vista)
uniform vec2 uSide;    // hacia qué lado de la pantalla está el sol o la luna
uniform float uHazeK;
uniform vec3 uHi, uMid, uLo, uRim, uHaze;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  float l = dot(n, uLight);
  vec3 c = l > 0.55 ? uHi : l > 0.1 ? uMid : uLo;
  if (n.z < 0.35 && dot(normalize(n.xy), uSide) > 0.3) c = uRim;
  c = mix(c, uHaze, smoothstep(45.0, 130.0, length(vW - cameraPosition)) * uHazeK);
  gl_FragColor = vec4(c, 0.25);
}
`;

const GRASS_VS = /* glsl */ `
attribute vec3 aPos;
attribute vec2 aHW;
attribute float aYaw;
attribute vec2 aLean;
attribute vec3 aCol;
uniform float uTime;
uniform float uWind;
uniform float uTree;
uniform vec3 uTint;
uniform vec3 uPress1;
uniform vec3 uPress2;
varying vec3 vCol;
float pressAt(vec3 P) { return P.z * (1.0 - smoothstep(0.25, 0.7, length(aPos.xz - P.xy))); }
void main() {
  float c = cos(aYaw), s = sin(aYaw);
  float squash = max(pressAt(uPress1), pressAt(uPress2));
  vec3 p = vec3(position.x * aHW.y * c, position.y * aHW.x * (1.0 - 0.75 * squash), position.x * aHW.y * s);
  float bend = position.y * position.y;
  // cada hoja se ladea (y la punta baja tantito); las de la orilla cuelgan por el borde
  p.xz += aLean * bend * aHW.x;
  p.y *= 1.0 - 0.45 * dot(aLean, aLean) * position.y;
  float sway = sin(uTime * 1.8 + aPos.x * 0.9 + aPos.z * 0.7) * 0.5 + sin(uTime * 3.1 + aPos.z * 1.3) * 0.25;
  p.x += sway * bend * aHW.x * (0.3 + uWind * 3.0);
  vec4 wp = modelMatrix * vec4(aPos + p, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  float r = length(aPos.xz);
  float shade = mix(1.0, mix(0.6, 1.0, smoothstep(1.0, 4.8, r)), uTree);
  vCol = mix(aCol * 0.5, aCol * 1.08, position.y) * uTint * shade;
}
`;
const GRASS_FS = /* glsl */ `
varying vec3 vCol;
void main() { gl_FragColor = vec4(vCol, 1.0); }
`;

export class Mundo {
  constructor(scene) {
    this.scene = scene;
    this.rng = mulberry32(20191001);
    this.tint = new THREE.Color();
    this.buildSky();
    this.buildSea();
    this.buildIsland();
    this.buildGrass();
    this.buildDetails();
    this.buildClouds();
    this.buildLights();
    this.update(0, 0, 0, null);
  }

  buildSky() {
    this.skyGroup = new THREE.Group();
    this.scene.add(this.skyGroup);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uDawn: { value: 0 },
        uN0: { value: NIGHT.zenith }, uN1: { value: NIGHT.mid }, uN2: { value: NIGHT.horizon },
        uD0: { value: DUSK.zenith }, uD1: { value: DUSK.upper }, uD2: { value: DUSK.low }, uD3: { value: DUSK.horizon },
        uBelow: { value: new THREE.Color() },
        uMoonDir: { value: new THREE.Vector3(0.36, 0.3, -0.88).normalize() },
        uSunDir: { value: new THREE.Vector3(-0.42, -0.03, -0.9).normalize() },
      },
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.skyGroup.add(sky);

    const n = 900;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const y = 0.03 + Math.pow(this.rng(), 0.8) * 0.97;
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 300, y * 300, Math.sin(a) * r * 300], i * 3);
      const k = this.rng();
      size[i] = k > 0.97 ? 3 : k > 0.8 ? 2 : 1;
      phase[i] = this.rng();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uVis: { value: 1 }, uMoonDir: this.skyMat.uniforms.uMoonDir },
      vertexShader: STAR_VS,
      fragmentShader: STAR_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(g, this.starMat);
    stars.renderOrder = -9;
    stars.frustumCulled = false;
    this.skyGroup.add(stars);
  }

  buildSea() {
    this.seaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uShadow: { value: new THREE.Color() }, uMid: { value: new THREE.Color() },
        uLight: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() },
      },
      vertexShader: SEA_VS,
      fragmentShader: SEA_FS,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), this.seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -10;
    this.scene.add(sea);
  }

  islandGeometry(seed = 0) {
    let g = new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 30);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y > -0.1) continue;
      const k = 1 + 0.2 * (vnoise2(x * 0.45 + 5 + seed, z * 0.45 + 5) - 0.5) + 0.12 * (vnoise2(y * 0.9, x * 0.3 + z * 0.3) - 0.5);
      const dy = y < -0.7 ? 0.5 * (vnoise2(x * 0.7 + seed, z * 0.7) - 0.5) : 0;
      p.setXYZ(i, x * k, y + dy, z * k);
    }
    g = flatGeometry(g);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grass = ['#5e9c4c', '#67a653', '#5a9448', '#6fae58'];
    const band = ['#8a5a3c', '#744a32', '#5f3c2b'];
    const rock = ['#5d4a55', '#4c3d4a', '#6a5560'];
    for (let i = 0; i < pos.count; i += 3) {
      const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const h = hash2(Math.round(cx * 10), Math.round(cz * 10 + cy * 7));
      if (cy > -0.1) c.set(grass[Math.floor(h * 4)]);
      else if (cy > -0.55) c.set(h > 0.5 ? '#4f8a44' : '#44793c');
      else if (cy > -1.3) c.set(h > 0.5 ? '#7a4f36' : '#6e4630');
      else if (cy > -3.2) c.set(band[Math.abs(Math.floor(cy * 1.3 + h * 0.8)) % 3]);
      else c.set(rock[Math.floor(h * 3)]);
      for (let k = 0; k < 3; k++) c.toArray(col, (i + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }

  buildIsland() {
    const island = new THREE.Mesh(this.islandGeometry(), toonMat({ vertexColors: true }));
    island.receiveShadow = true;
    island.castShadow = true;
    this.scene.add(island);

    // Lianas: unas cuelgan del borde del pasto y otras salen de la roca, más
    // abajo; llevan hojitas a los lados y algunas una florecita en la punta
    this.vines = [];
    this.vineMat = new THREE.LineBasicMaterial({ vertexColors: true });
    const pick = (list) => list[Math.floor(this.rng() * list.length)];
    const greens = ['#3f7a45', '#4a8a4a', '#35693b'].map(C);
    const leaves = ['#5e9c4c', '#6fae58', '#4f8a44', '#78b85e'].map(C);
    const blooms = ['#f4a6c1', '#b597e2', '#ffe3ee'].map(C);
    const dots = [];
    const N = 38;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (this.rng() - 0.5) * 0.3;
      const fromRock = this.rng() < 0.28;
      const y0 = fromRock ? -0.9 - this.rng() * 1.3 : -0.3;
      const len = fromRock ? 0.5 + this.rng() * 1.5 : this.rng() < 0.3 ? 2.2 + this.rng() * 1.6 : 0.5 + this.rng() * 1.6;
      const n = Math.max(4, Math.round(len * 3.5));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const col = new Float32Array(n * 3);
      const green = pick(greens);
      for (let j = 0; j < n; j++) green.toArray(col, j * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const line = new THREE.Line(g, this.vineMat);
      line.frustumCulled = false;
      this.scene.add(line);
      // las del borde se asoman por la orilla; las de la roca salen de adentro
      const v = { line, a, y0, len, n, r: rockR(a, y0) + (fromRock ? -0.2 : 0.04), lip: fromRock ? 0 : 0.12, ph: this.rng() * 6 };
      this.vines.push(v);
      for (let j = 1; j < n; j += 1 + Math.floor(this.rng() * 2)) dots.push({ v, j, side: dots.length % 2 ? 1 : -1, col: pick(leaves) });
      if (this.rng() < 0.22) dots.push({ v, j: n - 1, side: 0, col: pick(blooms) });
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dots.length * 3), 3));
    const dc = new Float32Array(dots.length * 3);
    dots.forEach((d, k) => d.col.toArray(dc, k * 3));
    dg.setAttribute('color', new THREE.BufferAttribute(dc, 3));
    this.leafMat = new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true });
    this.leaves = new THREE.Points(dg, this.leafMat);
    this.leaves.frustumCulled = false;
    this.scene.add(this.leaves);
    this.vineDots = dots;
  }

  buildGrass() {
    // Pasto en matitas: varias hojas que brotan juntas y se abren como abanico.
    // En la orilla, matas más largas que se asoman y cuelgan tantito por el
    // borde; junto a la semilla (en el centro), bajito.
    const greens = ['#6db35a', '#7cc466', '#5ea34f', '#8fd072', '#69ad55', '#4f9443', '#9ad97a'].map(C);
    const blades = [];
    for (let i = 0; i < 1500; i++) {
      const edge = i < 280;
      const a = this.rng() * Math.PI * 2;
      const r = edge ? 5.9 + this.rng() * 0.45 : Math.sqrt(0.02 + this.rng() * 0.98) * 6.0;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const k = (edge ? 5 : 3) + Math.floor(this.rng() * 4);
      const tall = (r < 1.2 ? 0.55 : 1) * (edge ? 1.25 : this.rng() < 0.15 ? 1.4 : 1);
      const tone = Math.floor(this.rng() * greens.length);
      const spin = this.rng() * Math.PI * 2;
      for (let j = 0; j < k; j++) {
        const d = spin + (j / k) * Math.PI * 2 + (this.rng() - 0.5) * 0.8;
        const open = 0.2 + this.rng() * 0.35;
        const out = edge ? 0.45 + this.rng() * 0.45 : 0;
        blades.push({
          x: cx + Math.cos(d) * this.rng() * 0.07,
          z: cz + Math.sin(d) * this.rng() * 0.07,
          h: (0.16 + this.rng() * 0.2) * tall,
          w: 0.06 + this.rng() * 0.06,
          lean: [Math.cos(d) * open + Math.cos(a) * out, Math.sin(d) * open + Math.sin(a) * out],
          col: greens[(tone + Math.floor(this.rng() * 3) + greens.length - 1) % greens.length],
        });
      }
    }
    const n = blades.length;
    const base = new THREE.BufferGeometry();
    base.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0]), 3));
    const g = new THREE.InstancedBufferGeometry();
    g.index = null;
    g.setAttribute('position', base.attributes.position);
    const aPos = new Float32Array(n * 3), aHW = new Float32Array(n * 2), aYaw = new Float32Array(n);
    const aLean = new Float32Array(n * 2), aCol = new Float32Array(n * 3);
    blades.forEach((b, i) => {
      aPos.set([b.x, islandTop(Math.hypot(b.x, b.z)) - 0.02, b.z], i * 3);
      aHW.set([b.h, b.w], i * 2);
      aYaw[i] = this.rng() * Math.PI;
      aLean.set(b.lean, i * 2);
      b.col.toArray(aCol, i * 3);
    });
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
    g.setAttribute('aHW', new THREE.InstancedBufferAttribute(aHW, 2));
    g.setAttribute('aYaw', new THREE.InstancedBufferAttribute(aYaw, 1));
    g.setAttribute('aLean', new THREE.InstancedBufferAttribute(aLean, 2));
    g.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
    g.instanceCount = n;
    this.grassMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uWind: { value: 0.05 }, uTree: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) },
        uPress1: { value: new THREE.Vector3() }, uPress2: { value: new THREE.Vector3() },
      },
      vertexShader: GRASS_VS,
      fragmentShader: GRASS_FS,
      side: THREE.DoubleSide,
    });
    const grass = new THREE.Mesh(g, this.grassMat);
    grass.frustumCulled = false;
    this.scene.add(grass);
  }

  buildDetails() {
    // florecitas entre la hierba (asomadas por encima de las matitas)
    const n = 150;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const tones = ['#fff6f0', '#ffe070', '#ff9fc4', '#c9a8ff', '#fff6f0'].map(C);
    for (let i = 0; i < n; i++) {
      const r = 1 + Math.sqrt(this.rng()) * 5.1;
      const a = this.rng() * Math.PI * 2;
      pos.set([Math.cos(a) * r, islandTop(r) + 0.22 + this.rng() * 0.14, Math.sin(a) * r], i * 3);
      tones[Math.floor(this.rng() * tones.length)].toArray(col, i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.flowerMat = new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, depthWrite: false });
    const flowers = new THREE.Points(g, this.flowerMat);
    this.scene.add(flowers);

    // piedras
    const rockMat = toonMat({ color: '#8a7b8e' });
    for (let i = 0; i < 7; i++) {
      const r = 3.8 + this.rng() * 2.2;
      const a = this.rng() * Math.PI * 2;
      const s = 0.18 + this.rng() * 0.28;
      const m = new THREE.Mesh(flatGeometry(new THREE.DodecahedronGeometry(s, 0)), rockMat);
      m.position.set(Math.cos(a) * r, islandTop(r) - s * 0.3, Math.sin(a) * r);
      m.rotation.set(this.rng() * 3, this.rng() * 3, this.rng() * 3);
      m.scale.y = 0.7;
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }

    // islitas lejanas con su propio cerezo
    this.miniIslands = [];
    const blossom = toonMat({ color: '#f7a8c6' });
    const bark = toonMat({ color: '#5a3a2c' });
    const geo = this.islandGeometry(9);
    for (const [x, y, z, s, ph] of [[-34, 1.5, -52, 0.26, 0], [38, -2, -70, 0.3, 2], [-58, 6, -110, 0.34, 4]]) {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(geo, toonMat({ vertexColors: true })));
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 3, 5), bark);
      trunk.position.y = 1.8;
      grp.add(trunk);
      const crown = new THREE.Mesh(flatGeometry(new THREE.IcosahedronGeometry(2.6, 0)), blossom);
      crown.position.y = 4.2;
      crown.scale.y = 0.75;
      grp.add(crown);
      grp.position.set(x, y, z);
      grp.scale.setScalar(s);
      this.scene.add(grp);
      this.miniIslands.push({ grp, y, ph });
    }
  }

  buildClouds() {
    // Nubes esponjosas tipo cúmulo: una base plana de borreguitos, otros más
    // grandes encima y uno en la punta
    this.clouds = [];
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        uLight: { value: new THREE.Vector3(0, 1, 0) }, uSide: { value: new THREE.Vector2(1, 0) }, uHazeK: { value: 0.1 },
        uHi: { value: new THREE.Color() }, uMid: { value: new THREE.Color() },
        uLo: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() },
      },
      vertexShader: CLOUD_VS,
      fragmentShader: CLOUD_FS,
    });
    const puff = new THREE.SphereGeometry(1, 14, 10);
    const spots = [
      [-26, 4, -42, 2.2], [28, 8, -58, 2.8], [-15, -4.5, -20, 1.4], [17, -5.5, -12, 1.3],
      [-44, 13, -86, 3.6], [8, 15, -96, 3.1], [44, 1, -40, 2.0], [-8, 24, -122, 3.4], [58, 12, -104, 3.0],
    ];
    for (const [x, y, z, s] of spots) {
      const grp = new THREE.Group();
      const add = (px, py, pz, r) => {
        const m = new THREE.Mesh(puff, this.cloudMat);
        m.position.set(px, py, pz);
        m.scale.set(r * 1.1, r * 0.85, r);
        grp.add(m);
      };
      const nb = 4 + Math.floor(this.rng() * 3);
      for (let i = 0; i < nb; i++) {
        const u = (i / (nb - 1)) * 2 - 1;
        const r = 0.75 + this.rng() * 0.3 - Math.abs(u) * 0.15;
        add(u * 2.3, r * 0.5, (this.rng() - 0.5) * 0.6, r);
      }
      const nm = 2 + Math.floor(this.rng() * 2);
      for (let i = 0; i < nm; i++) {
        const u = (i / (nm - 1)) * 2 - 1;
        add(u * 1.1 + (this.rng() - 0.5) * 0.4, 1 + this.rng() * 0.25, (this.rng() - 0.5) * 0.5 - 0.2, 1.05 + this.rng() * 0.35);
      }
      add((this.rng() - 0.5) * 0.8, 1.75 + this.rng() * 0.25, -0.3, 0.9 + this.rng() * 0.3);
      grp.position.set(x, y, z);
      grp.scale.setScalar(s);
      this.scene.add(grp);
      this.clouds.push({ grp, speed: 0.12 + this.rng() * 0.1 });
    }
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight('#ffffff', '#000000', 1);
    this.scene.add(this.hemi);

    this.key = new THREE.DirectionalLight('#ffffff', 1);
    this.key.position.set(-7, 15, 10);
    this.key.target.position.set(0, 3.5, 0);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    const sc = this.key.shadow.camera;
    sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 50;
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.03;
    this.scene.add(this.key, this.key.target);

    this.rim = new THREE.DirectionalLight(DUSK.rim, 0);
    this.rim.position.set(-12, 3, -14);
    this.scene.add(this.rim);

    this.seedLight = new THREE.PointLight('#ffc9a0', 0, 9, 1.4);
    this.seedLight.position.set(0, 1, 0);
    this.scene.add(this.seedLight);
  }

  update(dt, t, dawn, camera, treeGrowth = 0, wind = 0.05, lookY = 4) {
    this.lookY = lookY;
    if (camera) this.skyGroup.position.copy(camera.position);
    const u = this.skyMat.uniforms;
    u.uDawn.value = dawn;
    u.uBelow.value.copy(NIGHT.haze).lerp(DUSK.haze, dawn);
    if (camera) {
      // luna y sol siempre dentro del encuadre, aunque la pantalla sea vertical
      const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
      const pitch = Math.atan2(camera.position.y - this.lookY, camera.position.z);
      const top = THREE.MathUtils.degToRad(camera.fov / 2) - pitch;
      const dir = (az, el, out) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      dir(half * 0.6, top - 0.11, u.uMoonDir.value);
      dir(-half * 0.55, lerp(-0.07, 0.02, dawn), u.uSunDir.value);
    }
    this.starMat.uniforms.uTime.value = t;
    this.starMat.uniforms.uVis.value = 1 - 0.62 * dawn;

    const s = this.seaMat.uniforms;
    s.uTime.value = t;
    s.uShadow.value.copy(NIGHT.seaShadow).lerp(DUSK.seaShadow, dawn);
    s.uMid.value.copy(NIGHT.seaMid).lerp(DUSK.seaMid, dawn);
    s.uLight.value.copy(NIGHT.seaLight).lerp(DUSK.seaLight, dawn);
    s.uHaze.value.copy(u.uBelow.value);

    this.hemi.color.copy(NIGHT.hemiSky).lerp(DUSK.hemiSky, dawn);
    this.hemi.groundColor.copy(NIGHT.hemiGround).lerp(DUSK.hemiGround, dawn);
    this.hemi.intensity = lerp(NIGHT.hemi, DUSK.hemi, dawn);
    this.key.color.copy(NIGHT.key).lerp(DUSK.key, dawn);
    this.key.intensity = lerp(NIGHT.keyI, DUSK.keyI, dawn);
    this.rim.intensity = DUSK.rimI * dawn;

    this.tint.copy(NIGHT.tint).lerp(DUSK.tint, dawn);
    const gm = this.grassMat.uniforms;
    gm.uTime.value = t;
    gm.uWind.value = wind;
    gm.uTree.value = treeGrowth;
    gm.uTint.value.copy(this.tint);
    this.flowerMat.color.copy(this.tint);

    // nubes: sus tonos según la hora; la luz les llega de arriba y un poco de
    // frente, del lado de la luna (de noche, a la derecha) o del sol (al
    // amanecer, a la izquierda), que también les enciende la orilla
    const cu = this.cloudMat.uniforms;
    ['uHi', 'uMid', 'uLo', 'uRim'].forEach((k, i) => cu[k].value.copy(NIGHT.cloud[i]).lerp(DUSK.cloud[i], dawn));
    cu.uHaze.value.copy(u.uBelow.value);
    cu.uHazeK.value = lerp(0.1, 0.25, dawn);
    const side = lerp(1, -1, dawn);
    cu.uSide.value.set(Math.sign(side) || 1, 0.35).normalize();
    if (camera) cu.uLight.value.set(side * 0.45, 0.9, 0.5).normalize().transformDirection(camera.matrixWorldInverse);
    for (const c of this.clouds) {
      c.grp.position.x += c.speed * dt;
      if (c.grp.position.x > 70) c.grp.position.x = -70;
    }
    for (const m of this.miniIslands) m.grp.position.y = m.y + Math.sin(t * 0.4 + m.ph) * 0.35;

    // lianas: se mecen más entre más abajo; las hojitas y flores las siguen
    this.vineMat.color.copy(this.tint);
    this.leafMat.color.copy(this.tint);
    for (const v of this.vines) {
      const arr = v.line.geometry.attributes.position.array;
      for (let i = 0; i < v.n; i++) {
        const k = i / (v.n - 1);
        const sway = Math.sin(t * 0.9 + v.ph + k * 1.5) * 0.12 * k * k;
        const r = v.r + v.lip * Math.min(1, k * 4);
        arr[i * 3] = Math.cos(v.a) * r + sway;
        arr[i * 3 + 1] = v.y0 - k * v.len;
        arr[i * 3 + 2] = Math.sin(v.a) * r;
      }
      v.line.geometry.attributes.position.needsUpdate = true;
    }
    const lp = this.leaves.geometry.attributes.position.array;
    this.vineDots.forEach((d, k) => {
      const src = d.v.line.geometry.attributes.position.array;
      lp[k * 3] = src[d.j * 3] - Math.sin(d.v.a) * d.side * 0.07;
      lp[k * 3 + 1] = src[d.j * 3 + 1] + (d.side ? 0.03 : -0.05);
      lp[k * 3 + 2] = src[d.j * 3 + 2] + Math.cos(d.v.a) * d.side * 0.07;
    });
    this.leaves.geometry.attributes.position.needsUpdate = true;
  }
}
