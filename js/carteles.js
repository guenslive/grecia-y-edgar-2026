import * as THREE from 'three';
import { PixelSprite, signTexture } from './sprites.js';
import { projectToPixels, pixelsToWorld, windOffsetJS, windUniforms, clamp } from './comun.js';
import { islandTop } from './mundo.js';

const ROPE = new THREE.Color('#ead7a4');

export class Carteles {
  // texture(cfg, hover): lo que cuelga; por omisión, un cartel de madera con su texto
  constructor(scene, items, texture = (cfg, hover) => signTexture(cfg.texto, hover)) {
    this.ropeMat = new THREE.LineBasicMaterial({ color: ROPE.clone() });
    this.items = items.map((cfg, i) => {
      const normal = texture(cfg, false);
      const hover = texture(cfg, true);
      const sprite = new PixelSprite(normal, { anchorX: 0.5, anchorY: 0, castShadow: true, renderOrder: 4 });
      sprite.mesh.visible = false;
      scene.add(sprite.mesh);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
      const rope = new THREE.LineSegments(geo, this.ropeMat);
      rope.visible = false;
      rope.frustumCulled = false;
      scene.add(rope);
      return {
        cfg, i, normal, hover, sprite, rope,
        anchor: new THREE.Vector3(), hang: new THREE.Vector3(), anchorSpan: 0.3, L: 1, e: 0, v: 0, phi: 0, om: 0,
        dropAt: Infinity, shown: false, landed: false, landT: Infinity, hovered: false,
      };
    });
    this.right = new THREE.Vector3(1, 0, 0);
    this._w = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._a = new THREE.Vector3();
  }

  // Reparte los carteles bajo la copa, a ambos lados del tronco y a dos alturas.
  layout(arbol, camera, rtW, rtH, reserve = null) {
    if (!this.items.length) return;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const bottom = new Float32Array(rtW).fill(-1);
    let minX = Infinity, maxX = -Infinity;
    const p = {};
    for (const k of arbol.clusters) {
      projectToPixels(k.c, camera, rtW, rtH, p);
      const rpx = k.r / ((2 * p.z * tanH) / rtH);
      minX = Math.min(minX, p.x - rpx);
      maxX = Math.max(maxX, p.x + rpx);
      for (let x = Math.max(0, Math.floor(p.x - rpx)); x <= Math.min(rtW - 1, Math.ceil(p.x + rpx)); x++) {
        const dx = (x - p.x) / rpx;
        bottom[x] = Math.max(bottom[x], p.y + rpx * Math.sqrt(Math.max(0, 1 - dx * dx)) * 0.85);
      }
    }
    const trunk = arbol.trunk;
    const tp = projectToPixels(trunk.pts[1], camera, rtW, rtH, {});
    const trunkHalf = trunk.r0 / ((2 * tp.z * tanH) / rtH) + 3;
    // hueco central: el tronco más el lugar donde se sienta la pareja
    const gap0 = Math.min(tp.x - trunkHalf, reserve ? reserve.x0 : Infinity);
    const gap1 = Math.max(tp.x + trunkHalf, reserve ? reserve.x1 : -Infinity);
    const bottomAt = (x0, x1) => {
      let m = -1;
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(rtW - 1, Math.ceil(x1)); x++) m = Math.max(m, bottom[x]);
      return m < 0 ? rtH * 0.45 : m;
    };

    const N = this.items.length;
    const la = Math.max(2, minX + 4), rb = Math.min(rtW - 2, maxX - 4);
    const lw = Math.max(0, gap0 - la), rw = Math.max(0, rb - gap1);
    const nLeft = clamp(Math.round((N * lw) / Math.max(1, lw + rw)), 0, N);
    const sides = [
      { items: this.items.slice(0, nLeft), a: la, b: gap0 },
      { items: this.items.slice(nLeft), a: gap1, b: rb },
    ];

    // Puntos de rama candidatos para colgar las cuerdas
    const cands = [];
    for (const b of arbol.branches) {
      if (b.root || b.depth < 2 || b.depth > 5) continue;
      for (const pt of b.pts) {
        if (pt.z < -0.4) continue;
        const q = projectToPixels(pt, camera, rtW, rtH, {});
        cands.push({ pt, x: q.x, y: q.y, z: q.z });
      }
    }

    const placed = [];
    const overlaps = (a, b) =>
      a.x < b.x + b.w + 3 && b.x < a.x + a.w + 3 && a.y < b.y + b.h + 4 && b.y < a.y + a.h + 4;
    // Cuelga el cartel con centro en cx, de la rama más cercana y sin encimarse
    // con los ya colgados. Con strict, null si al topar con el suelo quedaría
    // encimado con otro.
    const tryAt = (it, cx, strict) => {
      const w = it.sprite.w, h = it.sprite.h;
      const canopyY = bottomAt(cx - w / 2, cx + w / 2);
      // rama más cercana a la vertical del cartel, justo por encima de la copa
      let best = null, bestScore = Infinity;
      for (const c of cands) {
        if (c.y > canopyY + 2 || c.y < canopyY - 45) continue;
        const score = Math.abs(c.x - cx) * 2 + (canopyY - c.y) * 0.5;
        if (score < bestScore) { bestScore = score; best = c; }
      }
      const anchor = new THREE.Vector3();
      let anchorPx, depth;
      if (best && Math.abs(best.x - cx) < w * 0.6) {
        anchor.copy(best.pt);
        anchorPx = { x: best.x, y: best.y };
        depth = best.z;
      } else {
        depth = tp.z;
        pixelsToWorld(cx, canopyY - 6, depth, camera, rtW, rtH, anchor);
        anchorPx = { x: cx, y: canopyY - 6 };
      }
      const ground = projectToPixels(
        this._a.set(anchor.x, islandTop(Math.hypot(anchor.x, anchor.z)), anchor.z), camera, rtW, rtH, {},
      ).y;
      // baja el cartel hasta que no choque con ninguno de los ya colgados
      const rect = { x: Math.round(anchorPx.x - w / 2), y: Math.max(canopyY + 1, anchorPx.y + 3), w, h };
      let level = 0;
      for (let guard = 0; guard < 8; guard++) {
        const hit = placed.find((p) => overlaps(rect, p.rect));
        if (!hit) break;
        rect.y = hit.rect.y + hit.rect.h + 4;
        level = Math.max(level, hit.level + 1);
      }
      rect.y = Math.min(rect.y, ground - h - 4);
      if (strict && placed.some((p) => overlaps(rect, p.rect))) return null;
      return { it, anchor, anchorPx, depth, top: rect.y, rect, level };
    };
    for (const side of sides) {
      const other = side === sides[0] ? sides[1] : sides[0];
      const k = side.items.length;
      side.items.forEach((it, j) => {
        const w = it.sprite.w;
        const lo = side.a + w / 2, hi = side.b - w / 2;
        let cx = k === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * j) / (k - 1);
        if (hi < lo) cx = (side.a + side.b) / 2;
        let spot = tryAt(it, cx, true);
        // si ahí quedaría encimado (el suelo no lo deja bajar más), busca un
        // hueco corriéndolo de lado: primero en su lado y luego en el otro
        for (let d = 2; !spot && d < rtW; d += 2) {
          for (const x of [cx - d, cx + d]) {
            if (!spot && x >= lo && x <= hi) spot = tryAt(it, x, true);
          }
          const olo = other.a + w / 2, ohi = other.b - w / 2;
          const ox = other.a < side.a ? ohi - (d - 2) : olo + (d - 2);
          if (!spot && ohi >= olo && ox >= olo && ox <= ohi) spot = tryAt(it, ox, true);
        }
        spot ||= tryAt(it, cx, false);
        it.anchor.copy(spot.anchor);
        it.target = spot.rect;
        placed.push(spot);
      });
    }

    // Los carteles que cuelgan más abajo quedan un poco más atrás: así sus
    // cuerdas pasan por detrás de los de arriba en vez de cruzarlos.
    const front = Math.min(...placed.map((p) => p.depth));
    for (const p of placed) {
      const d = front - 1 + Math.min(p.level, 3) * 0.3;
      const it = p.it;
      pixelsToWorld(p.anchorPx.x, p.anchorPx.y, d, camera, rtW, rtH, it.hang);
      const topW = pixelsToWorld(p.anchorPx.x, p.top, d, camera, rtW, rtH, this._p);
      it.L = Math.max(0.15, it.hang.y - topW.y);
      it.halfSpan = (it.sprite.w / 2 - 2.5) * ((2 * d * tanH) / rtH);
      it.anchorSpan = it.halfSpan * (p.depth / d);
    }
  }

  drop(t0) {
    const order = this.items.map((_, i) => i).sort(() => Math.random() - 0.5);
    order.forEach((idx, k) => (this.items[idx].dropAt = t0 + k * 0.38));
  }

  settle() {
    for (const it of this.items) {
      it.dropAt = -Infinity;
      it.shown = true;
      it.landed = true;
      it.landT = -Infinity;
      it.e = it.L;
      it.v = 0;
    }
  }

  hit(px, py) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!it.shown) continue;
      const r = it.sprite.rect;
      if (px >= r.x - 1 && px <= r.x + r.w + 1 && py >= r.y - 1 && py <= r.y + r.h + 1) return i;
    }
    return -1;
  }

  setHover(i) {
    this.items.forEach((it, k) => {
      const h = k === i;
      if (h && !it.hovered) it.om += (Math.random() < 0.5 ? -1 : 1) * 0.6;
      if (h !== it.hovered) it.sprite.set(h ? it.hover : it.normal);
      it.hovered = h;
    });
  }

  poke(i, s = 1.4) {
    const it = this.items[i];
    if (it) it.om += (it.phi >= 0 ? 1 : -1) * s;
  }

  update(dt, t, camera, rtW, rtH, tint, onLand) {
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.right.y = 0;
    this.right.normalize();
    this.ropeMat.color.copy(ROPE).multiply(tint);
    const W = this._w, P = this._p;
    for (const it of this.items) {
      if (t < it.dropAt) {
        it.sprite.mesh.visible = false;
        it.rope.visible = false;
        continue;
      }
      if (!it.shown) {
        it.shown = true;
        it.e = 0;
        it.v = 0;
      }
      const steps = 3, h = dt / steps;
      for (let s = 0; s < steps; s++) {
        let a = 9;
        if (it.e > it.L) a -= 150 * (it.e - it.L) + 7 * it.v;
        it.v += a * h;
        it.e = Math.max(0, it.e + it.v * h);
        const Leff = Math.max(0.35, it.e);
        const windF = (windUniforms.uWind.value - 0.05) * 3 + Math.sin(t * 0.9 + it.i * 1.7) * 0.06 + windUniforms.uShake.value * Math.sin(t * 20 + it.i) * 10;
        it.om += (-(9 / Leff) * Math.sin(it.phi) - 1.3 * it.om + windF) * h;
        it.phi = clamp(it.phi + it.om * h, -0.7, 0.7);
      }
      if (!it.landed && it.e >= it.L) {
        it.landed = true;
        it.landT = t;
        it.om += (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.5);
        onLand?.(it);
      }

      windOffsetJS(it.anchor, W);
      const base = this._a.copy(it.anchor).add(W);
      P.copy(it.hang).add(W).addScaledVector(this.right, Math.sin(it.phi) * it.e);
      P.y -= Math.cos(it.phi) * it.e;
      it.sprite.place(P, camera, rtW, rtH);
      it.sprite.mesh.visible = true;

      // cuerdas: de la rama a las esquinas superiores del cartel
      const sp = it.sprite;
      const up = sp.h * sp.wpp * 0.5;
      const off = (sp.w / 2 - 2.5) * sp.wpp;
      const arr = it.rope.geometry.attributes.position.array;
      const cx = sp.mesh.position, camUp = _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      for (const [k, sgn] of [[0, -1], [6, 1]]) {
        arr[k] = base.x + this.right.x * sgn * it.anchorSpan;
        arr[k + 1] = base.y;
        arr[k + 2] = base.z + this.right.z * sgn * it.anchorSpan;
        arr[k + 3] = cx.x + camUp.x * up + this.right.x * sgn * off;
        arr[k + 4] = cx.y + camUp.y * up + this.right.y * sgn * off - sp.wpp * 1.5;
        arr[k + 5] = cx.z + camUp.z * up + this.right.z * sgn * off;
      }
      it.rope.geometry.attributes.position.needsUpdate = true;
      it.rope.visible = it.e > 0.02;
    }
  }
}
const _up = new THREE.Vector3();
