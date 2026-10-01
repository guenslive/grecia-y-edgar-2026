import * as THREE from 'three';
import { makeCanvas, pixelTexture, PixelSprite, outlineCanvas } from './sprites.js';
import { islandTop } from './mundo.js';
import { pixelsToWorld, projectToPixels, clamp, easeOutCubic } from './comun.js';
import { sticker } from './calcos.js';

/* =====================================================================
   Buzón en la isla: ahí vive la carta. Tiene la banderita arriba (hay
   correo); al tocarlo se abre la puertita, baja la bandera y sale volando
   el sobre. Cuando ella cierra la carta, el buzón se vuelve a cerrar.
   ===================================================================== */

// Lugares posibles al frente de la isla, en orden de preferencia: primero del
// lado contrario a la pareja; si ahí cuelgan carteles, busca otro. Después
// va barriendo todo el frente, para dar con cualquier hueco libre.
const PREFERRED = [
  [3, 3.9], [3.6, 3.4], [2.4, 4.3], [4.2, 2.8], [1.7, 4.7],
  [-4.2, 2.6], [-3.8, 3.4], [-4.7, 1.8], [-3.2, 4.1], [-5.2, 1], [5, 1.4],
];
const SWEEP = [];
for (const z of [4.4, 3.6, 2.6, 1.6]) {
  for (let x = -5.2; x <= 5.21; x += 0.4) if (Math.hypot(x, z) <= 5.5) SWEEP.push([x, z]);
}
SWEEP.sort((a, b) => Math.abs(a[0] - 2.5) - Math.abs(b[0] - 2.5));
const SPOTS = [...PREFERRED, ...SWEEP].map(([x, z]) => new THREE.Vector3(x, islandTop(Math.hypot(x, z)), z));

const W = 36, H = 32;
const POST_X = 15;           // columna central del poste
const OUT = '#26141f', OUT_HOVER = '#fff1c8';
const FLY = 0.9;             // lo que tarda el sobre en salir volando

function paintMailbox(open) {
  const { c, ctx } = makeCanvas(W, H);
  const r = (x, y, w, h, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };
  // poste de madera
  r(POST_X - 1, 18, 3, 14, '#8a5a3c');
  r(POST_X - 1, 18, 1, 14, '#a8744f');
  r(POST_X + 1, 18, 1, 14, '#6b4430');
  r(POST_X - 2, 18, 5, 1, '#6b4430');
  // caja lila con la tapa redonda
  r(8, 5, 17, 1, '#d8c7f6');
  r(6, 6, 21, 1, '#c9b3f0');
  r(5, 7, 23, 11, '#b597e2');
  r(5, 17, 23, 1, '#8a6cc2');
  r(5, 7, 1, 10, '#c9b3f0');
  // calcomanías: Kuromi y Master Chief en la caja, la calaverita en el poste
  ctx.drawImage(sticker('kuromiMini'), 6, 7);
  ctx.drawImage(sticker('masterchiefMini'), 16, 8);
  ctx.drawImage(sticker('calaveraMini'), POST_X - 3, 21);
  if (open) {
    // puertita abierta hacia afuera y el hueco oscuro de adentro
    r(26, 7, 2, 10, '#3a2f4a');
    r(27, 6, 1, 1, '#3a2f4a');
    r(28, 16, 7, 2, '#a585d6');
    r(28, 16, 7, 1, '#c9b3f0');
    // banderita abajo
    r(1, 11, 4, 1, '#3a2f3f');
    r(0, 12, 3, 2, '#f25a8c');
  } else {
    r(26, 6, 2, 12, '#a585d6');
    r(27, 11, 1, 1, '#ffd27a');
    // banderita arriba: hay correo
    r(4, 1, 1, 10, '#3a2f3f');
    r(5, 1, 5, 3, '#f25a8c');
    r(5, 1, 5, 1, '#ff8fb0');
  }
  return c;
}

function paintEnvelope() {
  const { c, ctx } = makeCanvas(11, 9);
  ctx.fillStyle = '#fbf1dc';
  ctx.fillRect(1, 1, 9, 7);
  ctx.fillStyle = '#d9c49a';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(1 + i, 1 + i, 1, 1);
    ctx.fillRect(9 - i, 1 + i, 1, 1);
  }
  ctx.fillStyle = '#8a6cc2';
  ctx.fillRect(5, 4, 1, 2);
  ctx.fillRect(4, 5, 3, 1);
  return outlineCanvas(c, OUT);
}

const tex = (c) => ({ tex: pixelTexture(c), w: c.width, h: c.height });

export class Buzon {
  constructor(scene) {
    this.frames = {
      closed: tex(outlineCanvas(paintMailbox(false), OUT)),
      hover: tex(outlineCanvas(paintMailbox(false), OUT_HOVER)),
      open: tex(outlineCanvas(paintMailbox(true), OUT)),
    };
    this.sprite = new PixelSprite(this.frames.closed, { anchorX: (POST_X + 1.5) / W, anchorY: 1, renderOrder: 5 });
    this.sprite.drawOnTop(5);
    this.sprite.mesh.visible = false;
    this.env = new PixelSprite(tex(paintEnvelope()), { anchorX: 0.5, anchorY: 0.5, renderOrder: 12 });
    this.env.drawOnTop(12);
    this.env.mesh.visible = false;
    scene.add(this.sprite.mesh, this.env.mesh);
    this.state = 'oculto';
    this.showAt = Infinity;
    this.t = 0;
    this.hovered = false;
    this.opened = false;
    this.nextSparkle = 0;
    this._p = new THREE.Vector3();
    this.spot = SPOTS[0];
  }

  // Elige el lugar del buzón: que no quede encima de la pareja (ni de lo que
  // haya en avoid, rectángulos en píxeles con la cámara del encuadre final) y
  // con espacio arriba para su nubecita (note: su tamaño en esos píxeles).
  // Devuelve lo que ocupan los dos, para que ahí no cuelgue nada.
  choose(camera, rtW, rtH, avoid = [], note = { w: 60, h: 12 }) {
    const q = {};
    const area = (r) => {
      let sum = 0;
      for (const a of avoid) {
        if (!a) continue;
        const w = Math.min(r.x + r.w, a.x + a.w + 4) - Math.max(r.x, a.x - 4);
        const h = Math.min(r.y + r.h, a.y + a.h + 4) - Math.max(r.y, a.y - 4);
        if (w > 0 && h > 0) sum += w * h;
      }
      return sum;
    };
    const zone = (v) => {
      projectToPixels(v, camera, rtW, rtH, q);
      const x = q.x - (POST_X + 1.5);
      const body = { x, y: q.y - H, w: W, h: H };
      const nx = Math.max(3, Math.min(rtW - note.w - 3, x + 16 - note.w / 2));
      return { body, top: { x: nx, y: body.y - note.h - 4, w: note.w, h: note.h + 4 } };
    };
    const score = (v) => {
      const { body, top } = zone(v);
      if (body.x < 2 || body.x + W > rtW - 2 || top.y < 2) return Infinity;
      return area(body) * 100 + area(top);
    };
    let best = SPOTS[0], bestScore = Infinity;
    for (const v of SPOTS) {
      const sc = score(v);
      if (sc < bestScore) {
        best = v;
        bestScore = sc;
      }
      if (sc === 0) break;
    }
    this.spot = best;
    const { body, top } = zone(best);
    const x0 = Math.min(body.x, top.x), x1 = Math.max(body.x + body.w, top.x + top.w);
    return { x: x0, y: top.y, w: x1 - x0, h: body.y + body.h - top.y };
  }

  get visible() {
    return this.state !== 'oculto';
  }

  show(at) {
    this.showAt = at;
  }

  // Para ?saltar: ya está en su lugar.
  showNow() {
    this.state = 'cerrado';
    this.t = 1;
  }

  hit(px, py) {
    if (this.state !== 'cerrado') return false;
    const r = this.sprite.rect;
    return px >= r.x + 4 && px <= r.x + 28 && py >= r.y && py <= r.y + r.h;
  }

  setHover(h) {
    if (h === this.hovered) return;
    this.hovered = h;
    if (this.state === 'cerrado') this.sprite.set(h ? this.frames.hover : this.frames.closed);
  }

  // Abre la puertita y saca el sobre; al terminar llama a done() con el
  // rectángulo (en píxeles del render) donde quedó el sobrecito.
  open(done) {
    if (this.state !== 'cerrado') return;
    this.state = 'abriendo';
    this.t = 0;
    this.done = done;
    this.opened = true;
    this.hovered = false;
    this.sprite.set(this.frames.open);
  }

  close() {
    if (this.state !== 'abierto') return;
    this.state = 'cerrado';
    this.t = 0;
    this.sprite.set(this.frames.closed);
  }

  update(dt, t, camera, rtW, rtH, ev) {
    if (this.state === 'oculto') {
      if (t < this.showAt) return;
      this.state = 'apareciendo';
      this.t = 0;
      ev.appear?.(this.spot);
    }
    this.t += dt;
    this.sprite.mesh.visible = true;

    // al aparecer da un saltito
    const bounce = this.state === 'apareciendo' ? Math.round(Math.abs(Math.sin(this.t * 9)) * 6 * (1 - clamp(this.t / 0.6, 0, 1))) : 0;
    if (this.state === 'apareciendo' && this.t > 0.6) this.state = 'cerrado';
    this.sprite.place(this.spot, camera, rtW, rtH);
    if (bounce) this.sprite.placePx(this.sprite.rect.x, this.sprite.rect.y - bounce, this.sprite.depth, camera, rtW, rtH);

    // mientras nadie lo ha abierto, destellitos junto a la bandera
    if (this.state === 'cerrado' && !this.opened && t > this.nextSparkle) {
      this.nextSparkle = t + 2.2;
      const r = this.sprite.rect;
      ev.sparkle?.(pixelsToWorld(r.x + 8, r.y + 2, this.sprite.depth - 0.2, camera, rtW, rtH, this._p));
    }

    // el sobre sale por la puertita y sube en arco
    if (this.state === 'abriendo') {
      const k = clamp(this.t / FLY, 0, 1), e = easeOutCubic(k);
      const r = this.sprite.rect;
      const x = r.x + 28 + e * 8, y = r.y + 11 - e * 28 - Math.sin(k * Math.PI) * 4;
      this.env.mesh.visible = true;
      this.env.placePx(Math.round(x - 5), Math.round(y - 4), this.sprite.depth - 0.3, camera, rtW, rtH);
      if (Math.floor(this.t * 12) !== Math.floor((this.t - dt) * 12)) {
        ev.trail?.(pixelsToWorld(x, y + 3, this.sprite.depth - 0.3, camera, rtW, rtH, this._p));
      }
      if (k >= 1) {
        this.env.mesh.visible = false;
        this.state = 'abierto';
        this.done?.({ ...this.env.rect });
      }
    }
  }
}
