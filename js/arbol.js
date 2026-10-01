import * as THREE from 'three';
import {
  toonMat, flatGeometry, withWind, windUniforms, WIND_GLSL, mulberry32,
  clamp, lerp, smoothstep, easeOutBack, projectToPixels,
} from './comun.js';
import { islandTop } from './mundo.js';

const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const MAX_DEPTH = 6;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const deg = THREE.MathUtils.degToRad;
const tmpC = new THREE.Color();

const FLOWER_VS = /* glsl */ `
attribute vec3 aNormal;
attribute vec3 aColor;
attribute float aSize;
attribute float aBloom;
uniform float uBloomT;
uniform float uScale;
uniform vec3 uKeyDir;
uniform vec3 uTint;
varying vec3 vColor;
varying float vSize;
${WIND_GLSL}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.xyz += windOffset(wp.xyz);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float k = clamp((uBloomT - aBloom) / 0.35, 0.0, 1.0);
  float px = aSize * uScale / -mv.z * k;
  if (px < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = clamp(floor(px + 0.5), 1.0, 3.0);
  vSize = gl_PointSize;
  float l = dot(normalize(aNormal), uKeyDir);
  float band = l > 0.25 ? 1.0 : (l > -0.25 ? 0.86 : 0.72);
  vColor = aColor * band * uTint;
}
`;
const FLOWER_FS = /* glsl */ `
varying vec3 vColor;
varying float vSize;
void main() {
  if (vSize > 2.5) {
    vec2 c = floor(gl_PointCoord * 3.0);
    if (c.x != 1.0 && c.y != 1.0) discard;
  }
  gl_FragColor = vec4(vColor, 1.0);
}
`;

export class Arbol {
  constructor(scene, { seed = 71019, spread = 1, growTime = 22 } = {}) {
    this.scene = scene;
    this.rng = mulberry32(seed);
    this.spread = spread;
    this.G = growTime;
    this.branches = [];
    this.segCount = 0;
    this.generate();
    this.assignTimes();
    this.buildBranchMesh();
    this.buildLeaves();
    this.buildCanopy();
    this._m = new THREE.Matrix4();
    this._s = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this.lastGrowT = -1;
    this.lastBloomT = -1;
  }

  /* ---------------- generación ---------------- */

  addBranch(o) {
    const rng = this.rng;
    const n = clamp(Math.round(o.len / 0.42), 2, 8);
    const seg = o.len / n;
    const wig = o.wig ?? (o.depth === 0 ? 0.08 : 0.32);
    const up = o.up ?? (o.depth >= 2 ? 0.06 : 0.025);
    const pts = [o.start.clone()];
    const dirs = [];
    const d = o.dir.clone().normalize();
    for (let i = 1; i <= n; i++) {
      if (i > 1) {
        d.x += (rng() - 0.5) * wig;
        d.y += (rng() - 0.5) * wig * 0.6 + up;
        d.z += (rng() - 0.5) * wig;
        d.normalize();
      }
      dirs.push(d.clone());
      pts.push(pts[i - 1].clone().addScaledVector(d, seg));
    }
    const b = {
      ...o,
      id: this.branches.length,
      n, seg, pts, dirs,
      cum: pts.map((_, i) => i * seg),
      rad: pts.map((_, i) => lerp(o.r0, o.r1, i / n)),
      quats: dirs.map((dd) => new THREE.Quaternion().setFromUnitVectors(UP, dd)),
      segStart: this.segCount,
      children: [],
    };
    this.segCount += n;
    this.branches.push(b);
    if (o.parent) o.parent.children.push(b);
    return b;
  }

  pointAt(b, s, out = new THREE.Vector3()) {
    s = clamp(s, 0, b.len);
    const i = Math.min(b.n - 1, Math.floor(s / b.seg));
    return out.copy(b.pts[i]).lerp(b.pts[i + 1], (s - i * b.seg) / b.seg);
  }

  radiusAt(b, s) {
    return lerp(b.r0, b.r1, clamp(s / b.len, 0, 1));
  }

  generate() {
    const rng = this.rng;
    const sp = this.spread;
    const base = new THREE.Vector3(0, islandTop(0) - 0.05, 0);
    const trunk = this.addBranch({
      parent: null, start: base, dir: new THREE.Vector3(0.07, 1, 0.03),
      len: 3.7, r0: 0.58, r1: 0.4, depth: 0,
    });
    this.trunk = trunk;

    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2) + 0.4 + rng() * 0.5;
      this.addBranch({
        parent: null, root: true, start: base.clone().add(new THREE.Vector3(0, 0.12, 0)),
        dir: new THREE.Vector3(Math.cos(a), -0.35, Math.sin(a)),
        len: 0.8 + rng() * 0.4, r0: 0.26, r1: 0.06, depth: 0, wig: 0.05, up: -0.02,
      });
    }

    const tip = trunk.pts[trunk.n];
    const a0 = rng() * Math.PI * 2;
    const nL = 4;
    for (let i = 0; i < nL; i++) {
      const leader = i === nL - 1;
      const az = a0 + (i * Math.PI * 2) / (nL - 1) + (rng() - 0.5) * 0.5;
      const el = leader ? deg(72 + rng() * 8) : deg(30 + (1 - sp) * 45 + rng() * 12);
      const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      const r0 = trunk.r1 * (leader ? 0.78 : 0.85);
      const limb = this.addBranch({
        parent: trunk, start: tip, dir, len: leader ? 2.4 : 2.7 + rng() * 0.5,
        r0, r1: r0 * 0.6, depth: 1,
      });
      this.grow(limb);
    }
  }

  grow(b) {
    if (b.depth >= MAX_DEPTH) return;
    const rng = this.rng;
    const sp = this.spread;
    const d = b.depth;
    const tip = b.pts[b.n];
    const dir = b.dirs[b.n - 1];
    const u = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? UP : X).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u);
    const out = new THREE.Vector3(tip.x, 0, tip.z);
    if (out.lengthSq() > 1e-4) out.normalize();

    const nk = d < 2 ? (rng() < 0.5 ? 3 : 2) : rng() < 0.22 ? 3 : 2;
    const az0 = rng() * Math.PI * 2;
    for (let k = 0; k < nk; k++) {
      const ang = deg(20 + rng() * 22);
      const az = az0 + (k * Math.PI * 2) / nk + (rng() - 0.5) * 0.6;
      const nd = dir.clone().multiplyScalar(Math.cos(ang))
        .addScaledVector(u, Math.sin(ang) * Math.cos(az))
        .addScaledVector(v, Math.sin(ang) * Math.sin(az))
        .addScaledVector(out, 0.18 * sp);
      nd.y += 0.1;
      if (nd.y < -0.05) nd.y = -0.05;
      nd.normalize();
      const child = this.addBranch({
        parent: b, start: tip, dir: nd, len: b.len * (0.7 + rng() * 0.14),
        r0: b.r1, r1: b.r1 * 0.62, depth: d + 1,
      });
      this.grow(child);
    }

    if (d >= 1 && d <= 3) {
      const ns = rng() < 0.5 ? 1 : 2;
      for (let s = 0; s < ns; s++) {
        const f = 0.3 + rng() * 0.45;
        const i = Math.min(b.n - 1, Math.floor(f * b.n));
        const bd = b.dirs[i];
        const bu = new THREE.Vector3().crossVectors(bd, Math.abs(bd.y) < 0.9 ? UP : X).normalize();
        const bv = new THREE.Vector3().crossVectors(bd, bu);
        const ang = deg(50 + rng() * 15);
        const az = rng() * Math.PI * 2;
        const nd = bd.clone().multiplyScalar(Math.cos(ang))
          .addScaledVector(bu, Math.sin(ang) * Math.cos(az))
          .addScaledVector(bv, Math.sin(ang) * Math.sin(az))
          .addScaledVector(out, 0.15 * sp);
        nd.y += 0.15;
        if (nd.y < -0.05) nd.y = -0.05;
        nd.normalize();
        const r0 = this.radiusAt(b, f * b.len) * 0.55;
        const child = this.addBranch({
          parent: b, side: true, attach: f, start: this.pointAt(b, f * b.len),
          dir: nd, len: b.len * (0.38 + rng() * 0.15), r0, r1: r0 * 0.5, depth: d + 2,
        });
        this.grow(child);
      }
    }
  }

  assignTimes() {
    const rng = this.rng;
    for (const b of this.branches) {
      if (!b.parent) {
        b.t0 = b.root ? 0.05 : 0;
        b.dur = b.root ? 1.3 : 1;
      } else if (b.side) {
        const p = b.parent;
        b.t0 = p.t0 + (1 - Math.sqrt(1 - b.attach)) * p.dur;
        b.dur = 0.75 + rng() * 0.2;
      } else {
        b.t0 = b.parent.t0 + b.parent.dur;
        b.dur = 0.85 + rng() * 0.3;
      }
    }
    const end = Math.max(...this.branches.map((b) => b.t0 + b.dur));
    const k = this.G / end;
    for (const b of this.branches) {
      b.t0 *= k;
      b.dur *= k;
    }
    this.unit = k;
  }

  /* ---------------- mallas ---------------- */

  buildBranchMesh() {
    const cyl = flatGeometry(new THREE.CylinderGeometry(0.88, 1, 1, 6, 1).translate(0, 0.5, 0));
    const joint = flatGeometry(new THREE.IcosahedronGeometry(1, 0));
    const mat = withWind(toonMat({ color: '#ffffff' }));
    this.segMesh = new THREE.InstancedMesh(cyl, mat, this.segCount);
    this.jointMesh = new THREE.InstancedMesh(joint, mat, this.segCount);
    const c = new THREE.Color();
    const dark = new THREE.Color('#4e3226');
    const young = new THREE.Color('#8a4636');
    for (const b of this.branches) {
      for (let i = 0; i < b.n; i++) {
        c.copy(dark).lerp(young, clamp((b.depth - 1) / 5, 0, 1));
        c.offsetHSL(0, 0, (this.rng() - 0.5) * 0.04);
        this.segMesh.setColorAt(b.segStart + i, c);
        this.jointMesh.setColorAt(b.segStart + i, c);
        this.segMesh.setMatrixAt(b.segStart + i, ZERO);
        this.jointMesh.setMatrixAt(b.segStart + i, ZERO);
      }
    }
    for (const m of [this.segMesh, this.jointMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.scene.add(m);
    }
  }

  buildLeaves() {
    const geo = flatGeometry(new THREE.IcosahedronGeometry(1, 0));
    this.leafMesh = new THREE.InstancedMesh(geo, withWind(toonMat({ color: '#8fd06a' })), this.branches.length + 2);
    this.leafMesh.frustumCulled = false;
    for (let i = 0; i < this.leafMesh.count; i++) this.leafMesh.setMatrixAt(i, ZERO);
    this.scene.add(this.leafMesh);
  }

  buildCanopy() {
    const rng = this.rng;
    const cl = [];
    const tmp = new THREE.Vector3();
    const tone = (b) => {
      while (b.parent && b.depth > 2) b = b.parent;
      return 0.9 + 0.16 * mulberry32(b.id * 7919 + 13)();
    };
    for (const b of this.branches) {
      if (b.root || b.depth < 2) continue;
      const g = tone(b);
      const tip = b.pts[b.n];
      if (b.depth === 2) {
        cl.push({ c: tip.clone().add(new THREE.Vector3(0, 0.15, 0)), r: 0.5 + rng() * 0.15, g });
        continue;
      }
      cl.push({
        c: tip.clone().add(new THREE.Vector3((rng() - 0.5) * 0.2, 0.1 + rng() * 0.1, (rng() - 0.5) * 0.2)),
        r: 0.42 + rng() * 0.3,
        g,
      });
      for (let s = b.len * 0.4; s < b.len - 0.2; s += 0.5) {
        this.pointAt(b, s, tmp);
        cl.push({
          c: tmp.clone().add(new THREE.Vector3((rng() - 0.5) * 0.3, 0.12 + rng() * 0.1, (rng() - 0.5) * 0.3)),
          r: 0.3 + rng() * 0.18,
          g,
        });
      }
    }
    this.clusters = cl;

    const pinks = ['#f9b3cb', '#f59ab9', '#ffc7d8', '#f7a5c2', '#fbd0de', '#ee8db2', '#f4a0bf'].map((h) => new THREE.Color(h));
    const geo = flatGeometry(new THREE.IcosahedronGeometry(1, 1));
    this.blobMesh = new THREE.InstancedMesh(geo, withWind(toonMat({ color: '#ffffff' })), cl.length);
    this.blobMesh.castShadow = true;
    this.blobMesh.frustumCulled = false;
    cl.forEach((k, i) => {
      k.q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
      k.bs = 999;
      this.blobMesh.setColorAt(i, tmpC.copy(pinks[Math.floor(rng() * pinks.length)]).multiplyScalar(k.g));
      this.blobMesh.setMatrixAt(i, ZERO);
    });
    this.scene.add(this.blobMesh);

    // Flores sueltas sobre la copa: puntitos de 1 a 3 píxeles
    const light = ['#ffe4ee', '#fff2f6', '#ffd2e2'].map((h) => new THREE.Color(h));
    const deep = new THREE.Color('#e8699a');
    const mid = new THREE.Color('#f7a1c0');
    const leaf = new THREE.Color('#8fbf6e');
    const pos = [], nor = [], col = [], size = [], owner = [];
    const dir = new THREE.Vector3();
    cl.forEach((k, ci) => {
      const count = Math.round(5 + k.r * 16);
      for (let j = 0; j < count; j++) {
        dir.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
        if (dir.lengthSq() < 1e-3) dir.set(0, 1, 0);
        dir.normalize();
        if (dir.y < -0.3) dir.y *= 0.4;
        dir.normalize();
        const rr = k.r * (0.82 + rng() * 0.3);
        pos.push(k.c.x + dir.x * rr, k.c.y + dir.y * rr, k.c.z + dir.z * rr);
        nor.push(dir.x, dir.y, dir.z);
        const r = rng();
        const c = r < 0.68 ? light[Math.floor(rng() * 3)] : r < 0.83 ? mid : r < 0.97 ? deep : leaf;
        const f = c === leaf ? 1 : lerp(1, k.g, 0.6);
        col.push(Math.min(1, c.r * f), Math.min(1, c.g * f), Math.min(1, c.b * f));
        size.push(0.1 + rng() * 0.07);
        owner.push(ci);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aNormal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    g.setAttribute('aBloom', new THREE.Float32BufferAttribute(new Float32Array(size.length).fill(999), 1));
    this.flowerOwner = owner;
    this.flowerMat = new THREE.ShaderMaterial({
      uniforms: {
        ...windUniforms,
        uBloomT: { value: -1 },
        uScale: { value: 500 },
        uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
        uTint: { value: new THREE.Color(1, 1, 1) },
      },
      vertexShader: FLOWER_VS,
      fragmentShader: FLOWER_FS,
      depthWrite: false,
    });
    this.flowers = new THREE.Points(g, this.flowerMat);
    this.flowers.frustumCulled = false;
    this.scene.add(this.flowers);
  }

  /* ---------------- tiempos y posiciones ---------------- */

  maturity(t) {
    return 0.1 + 0.9 * smoothstep(0, this.G, t);
  }

  grownLen(b, t) {
    const p = clamp((t - b.t0) / b.dur, 0, 1);
    return (1 - (1 - p) * (1 - p)) * b.len;
  }

  // Punta actual de una rama en el instante t de crecimiento.
  tipAt(b, t, out = new THREE.Vector3()) {
    return this.pointAt(b, Math.max(0.001, this.grownLen(b, t)), out);
  }

  // Elige qué rama lleva la etiqueta de cada año y cuándo aparece.
  pickLabels(n, camera, rtW, rtH) {
    const proj = {};
    const tips = this.branches.filter((b) => !b.root).map((b) => {
      const p = projectToPixels(b.pts[b.n], camera, rtW, rtH, {});
      return { b, x: p.x, y: p.y, z: b.pts[b.n].z };
    });
    const minX = Math.min(...tips.map((t) => t.x)), maxX = Math.max(...tips.map((t) => t.x));
    const minY = Math.min(...tips.map((t) => t.y)), maxY = Math.max(...tips.map((t) => t.y));
    const cx = (minX + maxX) / 2, hw = (maxX - minX) / 2;
    const picks = [{ b: this.trunk, t: 0 }];
    const used = [projectToPixels(this.trunk.pts[this.trunk.n], camera, rtW, rtH, proj)].map((p) => ({ x: p.x, y: p.y }));
    const minGap = Math.max(26, rtW * 0.07);
    // lo que mide un letrerito de año (en píxeles del mundo; va arriba de su
    // punta): que no quede encimado sobre otro
    const LW = 46, LH = 18;
    for (let i = 1; i < n; i++) {
      const last = i === n - 1;
      const T = (this.G * i) / (n - 1);
      const f = n > 2 ? (i - 1) / Math.max(1, n - 2) : 0;
      const side = i % 2 ? -1 : 1;
      const tx = last ? cx : cx + side * lerp(0.78, 0.4, f) * hw;
      const ty = last ? minY : minY + lerp(0.7, 0.18, f) * (maxY - minY);
      let best = null, bestScore = Infinity;
      for (const t of tips) {
        const b = t.b;
        if (b === this.trunk) continue;
        if (last) {
          if (b.children.length) continue;
        } else if (b.t0 < T - 0.6 * this.unit || b.t0 > T + 0.25 * this.unit) continue;
        let score = Math.hypot(t.x - tx, t.y - ty);
        for (const u of used) {
          if (Math.hypot(t.x - u.x, t.y - u.y) < minGap) score += 400;
          if (Math.abs(t.x - u.x) < LW && Math.abs(t.y - u.y) < LH) score += 300;
        }
        if (t.z < -1) score += 60;
        if (score < bestScore) { bestScore = score; best = t; }
      }
      if (!best) best = tips[tips.length - 1];
      used.push({ x: best.x, y: best.y });
      picks.push({ b: best.b, t: last ? this.G - 0.15 : Math.max(T, best.b.t0 + 0.1 * best.b.dur) });
    }
    return picks;
  }

  // La floración se contagia desde las puntas donde estuvieron las etiquetas.
  setBloomOrigins(points) {
    const rng = mulberry32(7);
    let maxBs = 0;
    for (const k of this.clusters) {
      let d = Infinity;
      for (const p of points) d = Math.min(d, k.c.distanceTo(p));
      k.bs = d / 3.4 + rng() * 0.25;
      maxBs = Math.max(maxBs, k.bs);
    }
    const a = this.flowers.geometry.attributes.aBloom;
    for (let i = 0; i < a.count; i++) a.array[i] = this.clusters[this.flowerOwner[i]].bs + 0.15 + rng() * 0.35;
    a.needsUpdate = true;
    this.bloomEnd = maxBs + 1.2;
  }

  /* ---------------- actualización por fotograma ---------------- */

  updateGrowth(t) {
    if (t === this.lastGrowT) return;
    this.lastGrowT = t;
    const m = this.maturity(t);
    const M = this._m, S = this._s;
    for (const b of this.branches) {
      const grown = this.grownLen(b, t);
      const growing = grown < b.len - 1e-4;
      for (let i = 0; i < b.n; i++) {
        const idx = b.segStart + i;
        const s0 = b.cum[i];
        if (grown <= s0 + 1e-4) {
          this.segMesh.setMatrixAt(idx, ZERO);
          this.jointMesh.setMatrixAt(idx, ZERO);
          continue;
        }
        const sl = Math.min(grown, b.cum[i + 1]) - s0;
        let r = b.rad[i] * m;
        if (growing) r *= clamp((grown - s0) / (0.5 + b.len * 0.25), 0.3, 1);
        r = Math.max(r, 0.028);
        M.compose(b.pts[i], b.quats[i], S.set(r, sl, r));
        this.segMesh.setMatrixAt(idx, M);
        M.compose(b.pts[i], b.quats[i], S.set(r, r, r));
        this.jointMesh.setMatrixAt(idx, M);
      }
    }
    this.segMesh.instanceMatrix.needsUpdate = true;
    this.jointMesh.instanceMatrix.needsUpdate = true;
  }

  updateLeaves(t, fade) {
    const M = this._m, S = this._s, P = this._p, Q = this._q.identity();
    let i = 0;
    for (const b of this.branches) {
      let show = false;
      if (!b.root && b.depth >= 1 && t > b.t0 && fade > 0) {
        show = !b.children.some((c) => !c.side && t > c.t0);
      }
      if (show) {
        const p = clamp((t - b.t0) / b.dur, 0, 1);
        this.tipAt(b, t, P);
        const s = (0.1 + b.depth * 0.008) * Math.min(1, p * 3) * fade;
        M.compose(P, Q, S.set(s, s * 0.8, s));
        this.leafMesh.setMatrixAt(i, M);
      } else this.leafMesh.setMatrixAt(i, ZERO);
      i++;
    }
    // cotiledones del brote
    const tp = clamp(t / this.trunk.dur, 0, 1);
    const sprout = t > 0.05 && tp < 0.55 ? Math.min(1, t * 2.5) * (1 - smoothstep(0.35, 0.55, tp)) * fade : 0;
    this.tipAt(this.trunk, t, P);
    for (const side of [-1, 1]) {
      if (sprout > 0) {
        this._q.setFromEuler(new THREE.Euler(0, 0, side * 0.5));
        M.compose(P.clone().add(new THREE.Vector3(side * 0.13, -0.02, 0)), this._q, S.set(0.15 * sprout, 0.05 * sprout, 0.09 * sprout));
        this.leafMesh.setMatrixAt(i, M);
      } else this.leafMesh.setMatrixAt(i, ZERO);
      i++;
    }
    this.leafMesh.instanceMatrix.needsUpdate = true;
  }

  updateBloom(bt) {
    if (bt === this.lastBloomT) return;
    this.lastBloomT = bt;
    const M = this._m, S = this._s;
    this.clusters.forEach((k, i) => {
      const p = clamp((bt - k.bs) / 0.55, 0, 1);
      if (p <= 0) {
        this.blobMesh.setMatrixAt(i, ZERO);
        return;
      }
      const s = easeOutBack(p) * k.r * 0.86;
      M.compose(k.c, k.q, S.set(s, s * 0.85, s));
      this.blobMesh.setMatrixAt(i, M);
    });
    this.blobMesh.instanceMatrix.needsUpdate = true;
    this.flowerMat.uniforms.uBloomT.value = bt;
  }
}
