import * as THREE from 'three';
import {
  windUniforms, clamp, lerp, smoothstep, easeOutCubic, easeOutBack, easeInOutCubic,
  projectToPixels, windOffsetJS, toonMat, flatGeometry,
} from './comun.js';
import { PixelRenderer } from './render.js';
import { Mundo, islandTop } from './mundo.js';
import { Arbol } from './arbol.js';
import { Particulas } from './particulas.js';
import { Carteles } from './carteles.js';
import { Pareja, SIT_SPOT } from './personitas.js';
import { Avion } from './avion.js';
import { Buzon } from './buzon.js';
import { Carta } from './carta.js';
import { Arcade, arcadeTexture } from './arcade.js';
import { Radio, radioTexture } from './reproductor.js';
import { Libro, comicSignTexture } from './libro.js';
import { PixelSprite, seedTextures, glowTexture, carvedHeart, signTexture } from './sprites.js';
import * as sfx from './audio.js';
import { UI } from './ui.js';

const CFG = window.CONFIG;
const params = new URLSearchParams(location.search);
const SPEED = clamp(parseFloat(params.get('velocidad')) || 1, 0.25, 10);
const SKIP = params.has('saltar');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const G = CFG.duracionCrecimiento || 22;
const FOV = 30;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const GROUND_Y = islandTop(0);

/* ---------------- escena ---------------- */

const canvas = document.getElementById('escena');
const pr = new PixelRenderer(canvas);
pr.resize();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, pr.rtW / pr.rtH, 0.1, 500);
const finalCam = new THREE.PerspectiveCamera(FOV, pr.rtW / pr.rtH, 0.1, 500);

const aspect0 = window.innerWidth / window.innerHeight;
const spread = aspect0 < 0.8 ? 0.55 : aspect0 < 1.2 ? 0.8 : 1;

const mundo = new Mundo(scene);
const arbol = new Arbol(scene, { spread, growTime: G });
const parts = new Particulas(scene);
// La carta no cuelga del árbol: vive en el buzón de la isla.
const SIGNS = CFG.carteles.filter((c) => !c.buzon);
const LETTER = CFG.carteles.find((c) => c.buzon);
const MAIL_NOTE = LETTER?.globo || 'una cartita para ti 🖤';
const LETTER_CFG = CFG.carteles.find((c) => c.carta)?.carta;
// "7 razones" es una maquinita arcade y "Canciones" una grabadora: cuelgan
// igual; de los carteles con historieta cuelga su revistita de cómic
const COMICS = SIGNS.filter((c) => c.historieta);
const hanging = (c, hover) => (
  c.juego ? arcadeTexture(hover)
    : c.canciones ? radioTexture(hover)
      : c.historieta ? comicSignTexture(c.texto, COMICS.indexOf(c) + 1, hover)
        : signTexture(c.texto, hover)
);
const carteles = new Carteles(scene, SIGNS, hanging);
const pareja = new Pareja(scene);
const avion = new Avion(scene, CFG.avion || 'G&E');
const buzon = LETTER ? new Buzon(scene) : null;
const carta = LETTER_CFG ? new Carta(LETTER_CFG) : null;
const GAME_I = SIGNS.findIndex((c) => c.juego);
const arcade = GAME_I >= 0 ? new Arcade(SIGNS[GAME_I].juego, { onClose: () => carteles.poke(GAME_I, 1.2) }) : null;
const RADIO_I = SIGNS.findIndex((c) => c.canciones);
const radio = RADIO_I >= 0 ? new Radio(SIGNS[RADIO_I].canciones, { brand: CFG.avion || 'G&E', onClose: () => carteles.poke(RADIO_I, 1.2) }) : null;
let comicOpen = -1;
const libro = new Libro({ onClose: () => carteles.poke(comicOpen, 1.2) });
// algo abierto en primer plano: la escena no responde
const busy = () => ui.modalOpen || carta?.isOpen || arcade?.isOpen || radio?.isOpen || libro.isOpen;

// Acomoda lo que cuelga del árbol y luego el buzón busca un hueco libre en el
// suelo: ni debajo de un colgante ni encima de la pareja, de preferencia con
// espacio arriba para su nubecita.
function layoutHanging() {
  carteles.layout(arbol, finalCam, pr.rtW, pr.rtH, coupleReserve());
  if (!buzon) return;
  const p = projectToPixels(SIT_SPOT, finalCam, pr.rtW, pr.rtH, {});
  const couple = { x: p.x - 13, y: p.y - 24, w: 26, h: 24 };
  buzon.choose(finalCam, pr.rtW, pr.rtH, [couple, ...carteles.items.map((it) => it.target)], mailNote.footprint(pr.px));
}

// Franja de pantalla donde se sienta la pareja: ahí no cuelga ningún cartel.
function coupleReserve() {
  const p = projectToPixels(SIT_SPOT, finalCam, pr.rtW, pr.rtH, {});
  return { x0: p.x - 16, x1: p.x + 16 };
}
const ui = new UI(CFG);

// Nubecitas de pensamiento: la del buzón (señala su cajita) y las de la
// grabadora y la maquinita, que piensan de preferencia hacia afuera del árbol.
const mailNote = buzon && ui.nube(MAIL_NOTE, { box: (lado, r) => (lado === 'abajo' ? r : { x: r.x + 5, y: r.y + 1, w: 23, h: 17 }) });
const hangSides = (r, vw) => {
  const [o, i] = r.x + r.w / 2 < vw / 2 ? ['izq', 'der'] : ['der', 'izq'];
  const side = { izq: 'izquierda', der: 'derecha' };
  return [side[o], `abajo-${o}`, `arriba-${o}`, 'abajo', `abajo-${i}`, side[i], 'arriba', `arriba-${i}`];
};
const hangNotes = SIGNS.flatMap((c, i) => {
  const text = c.globo || (c.juego ? 'un jueguito para ti 🖤' : c.canciones ? 'musiquita para ti 🖤' : '');
  return text ? [{ i, nube: ui.nube(text, { sides: hangSides }) }] : [];
});

const seedTex = seedTextures();
const seed = new PixelSprite(seedTex.normal, { anchorX: 0.5, anchorY: 1, renderOrder: 3 });
const glow = new PixelSprite(glowTexture(40), { additive: true, renderOrder: 2, opacity: 0.5 });
scene.add(seed.mesh, glow.mesh);

const mound = new THREE.Mesh(flatGeometry(new THREE.IcosahedronGeometry(1, 1)), toonMat({ color: '#7a4f36' }));
mound.position.set(0, GROUND_Y - 0.03, 0);
mound.scale.setScalar(0);
mound.receiveShadow = true;
scene.add(mound);

const heart = carvedHeart();
heart.revealed = 0;
const heartSprite = new PixelSprite(heart, { renderOrder: 3 });
heartSprite.mesh.visible = false;
scene.add(heartSprite.mesh);

/* ---------------- encuadres de cámara ---------------- */

const bbox = new THREE.Box3();
for (const k of arbol.clusters) {
  bbox.expandByPoint(k.c.clone().addScalar(k.r));
  bbox.expandByPoint(k.c.clone().addScalar(-k.r));
}
const treeTop = bbox.max.y;
const treeHalfW = Math.max(-bbox.min.x, bbox.max.x) + 0.6;

const frames = { intro: null, final: null };
function computeFrames() {
  const a = pr.rtW / pr.rtH;
  // Final: el árbol completo con aire arriba para el título.
  const bottom = -2.6;
  let H = (treeTop - bottom) / 1.5;
  if (H * a < treeHalfW) H = treeHalfW / a;
  const lookY = treeTop - 0.5 * H;
  frames.final = { lookY, H, pitch: 0.06 };
  frames.intro = { lookY: 1.7, H: Math.max(5.2, 6.8 / a), pitch: 0.14 };
}

function setCam(cam, f, shake = 0) {
  const D = f.H / TAN;
  cam.aspect = pr.rtW / pr.rtH;
  cam.updateProjectionMatrix();
  cam.position.set(0, f.lookY + D * f.pitch, D);
  cam.lookAt(0, f.lookY, 0);
  if (shake > 0) {
    cam.position.x += (Math.random() - 0.5) * shake * 0.12;
    cam.position.y += (Math.random() - 0.5) * shake * 0.12;
  }
  cam.updateMatrixWorld();
}

function lerpFrame(a, b, k) {
  return { lookY: lerp(a.lookY, b.lookY, k), H: lerp(a.H, b.H, k), pitch: lerp(a.pitch, b.pitch, k) };
}

/* ---------------- estado ---------------- */

const S = {
  state: 'intro',
  t: 0,
  plantT: 0,
  seedY: 2.4,
  seedV: 0,
  landed: false,
  landT: 0,
  growT: 0,
  holdT: 0,
  bloomT: 0,
  dawn: 0,
  camK: 0,
  shake: 0,
  gust: 0,
  shownLabels: 0,
  music: false,
  finalShown: false,
  signsDropped: false,
  hintAt: Infinity,
  carved: 0,
  nextMeteor: 2.5,
  nextSpark: 0,
  hover: -1,
  hoverHeart: false,
};

computeFrames();
setCam(finalCam, frames.final);
setCam(camera, frames.intro);

ui.createLabels(CFG.anios);
const picks = arbol.pickLabels(CFG.anios.length, finalCam, pr.rtW, pr.rtH);
arbol.setBloomOrigins(picks.map((p) => p.b.pts[p.b.n]));
layoutHanging();
ui.createSignButtons(SIGNS, (i) => openSign(i));

const seedBtn = document.getElementById('semilla-btn');
const heartBtn = document.getElementById('corazon-btn');
const coupleBtn = document.getElementById('pareja-btn');
const mailBtn = document.getElementById('buzon-btn');
seedBtn.addEventListener('click', () => plant());
heartBtn.addEventListener('click', () => tapHeart());
coupleBtn.addEventListener('click', () => pareja.poke(coupleEv));
mailBtn.addEventListener('click', () => openMailbox());

// Lo que pasa en la escena cuando la pareja hace algo
const coupleEv = {
  land(p) {
    sfx.land();
    parts.dirtBurst(p.x, p.y, p.z, 10);
  },
  step(p) {
    sfx.step();
    if (Math.random() < 0.5) parts.dirtBurst(p.x, p.y, p.z, 2);
  },
  hug(p) {
    sfx.hug();
    parts.heart(p.x, p.y, p.z + 0.3, 3);
  },
  kiss(p) {
    sfx.init(CFG.musica);
    sfx.chu();
    parts.heart(p.x, p.y, p.z + 0.3, 5);
    parts.sparkle(p.x, p.y - 0.1, p.z + 0.3, 8, 0.6, 0.6);
  },
  seated() {
    if (S.signsDropped) return;
    S.signsDropped = true;
    carteles.drop(S.t + 0.9);
    S.hintAt = S.t + 0.9 + carteles.items.length * 0.38 + 1.5;
    buzon?.show(S.t + 0.9 + carteles.items.length * 0.38 + 0.6);
  },
  heart(p) {
    parts.heart(p.x, p.y, p.z + 0.3, 1);
  },
};

/* ---------------- acciones ---------------- */

function plant() {
  if (S.state !== 'intro') return;
  sfx.init(CFG.musica);
  sfx.plop();
  S.state = 'plantando';
  S.plantT = 0;
  S.seedV = 0;
  ui.hideIntro();
  seedBtn.hidden = true;
  canvas.style.cursor = '';
}

function startBloom() {
  S.state = 'floreciendo';
  S.bloomT = 0;
  ui.dissolveLabels();
  sfx.bloom();
  for (const p of picks) {
    const tip = p.b.pts[p.b.n];
    parts.sparkle(tip.x, tip.y, tip.z, 14, 0.8, 0.8);
  }
}

function openSign(i) {
  if (busy()) return;
  sfx.init(CFG.musica);
  if (!S.music) {
    S.music = true;
    sfx.startMusic();
  }
  carteles.poke(i, 1.6);
  ui.hideSignHint();
  // si la carta cuelga del árbol (sin buzón), sale volando desde el cartel
  if (SIGNS[i].carta) return carta.play(toScreen(carteles.items[i].sprite.rect));
  if (SIGNS[i].juego) return arcade.play(toScreen(carteles.items[i].sprite.rect));
  if (SIGNS[i].canciones) return radio.play(toScreen(carteles.items[i].sprite.rect));
  if (SIGNS[i].historieta) {
    // vuela la revistita que cuelga del cartel
    const it = carteles.items[i], r = it.sprite.rect, cm = it.normal.comic;
    comicOpen = i;
    return libro.play(SIGNS[i], COMICS.indexOf(SIGNS[i]) + 1, toScreen({ x: r.x + cm.x, y: r.y + cm.y, w: cm.w, h: cm.h }));
  }
  sfx.swish();
  ui.openModal(SIGNS[i]);
}

// rectángulo en píxeles del render → píxeles de la pantalla
const toScreen = (r) => ({ x: r.x * pr.px, y: r.y * pr.px, w: r.w * pr.px, h: r.h * pr.px });

// Se abre la puertita, sale el sobre y vuela hacia la pantalla con la carta.
function openMailbox() {
  if (busy() || buzon?.state !== 'cerrado') return;
  sfx.init(CFG.musica);
  if (!S.music) {
    S.music = true;
    sfx.startMusic();
  }
  sfx.door();
  sfx.sparkle();
  ui.hideSignHint();
  buzon.open((r) => {
    if (!ui.modalOpen) carta.play(toScreen(r));
  });
}

const mailEv = {
  appear(p) {
    sfx.plop();
    parts.dirtBurst(p.x, p.y, p.z, 8);
    parts.sparkle(p.x, p.y + 0.5, p.z, 8, 0.4, 0.6);
  },
  sparkle(p) {
    parts.sparkle(p.x, p.y, p.z, 2, 0.15, 0.4);
  },
  trail(p) {
    parts.sparkle(p.x, p.y, p.z, 1, 0.1, 0.3);
  },
};

function tapHeart() {
  if (heart.revealed < heart.total) return;
  sfx.init(CFG.musica);
  const p = heartSprite.mesh.position;
  parts.heart(p.x, p.y + 0.1, p.z, 6);
  sfx.chime(4);
  sfx.chime(6);
  const r = heartSprite.rect;
  ui.bubble(ui.fmt(CFG.corazon), (r.x + r.w / 2) * pr.px, (r.y - 4) * pr.px);
}

// Franja del cielo entre el contador y la copa: por ahí cruza el avión.
function planeBand(h) {
  const fin = document.getElementById('final');
  const titleBottom = fin.hidden ? 0 : fin.getBoundingClientRect().bottom / pr.px;
  const crown = projectToPixels(tmp.set(0, treeTop, 0), camera, pr.rtW, pr.rtH, {}).y;
  const top = Math.round((titleBottom + crown) / 2 - h / 2);
  return Math.max(Math.ceil(titleBottom) + 2, Math.min(top, Math.round(crown - h * 0.4)));
}

const planeEv = {
  pass(dir, dur) {
    sfx.planeHum(dur, dir);
  },
};

function tapPlane() {
  sfx.init(CFG.musica);
  const p = avion.sprite.mesh.position;
  parts.heart(p.x, p.y, p.z, 6);
  parts.sparkle(p.x, p.y, p.z, 10, 2, 1);
  sfx.chime(5);
  sfx.chime(7);
}

function shakeTree(point) {
  S.gust = Math.max(S.gust, 1);
  sfx.sparkle();
  for (let i = 0; i < 26; i++) {
    parts.petal(point.x + (Math.random() - 0.5) * 1.2, point.y + (Math.random() - 0.5) * 0.8, point.z + (Math.random() - 0.5) * 1.2, true);
  }
}

/* ---------------- puntero ---------------- */

const raycaster = new THREE.Raycaster();
const pointer = { px: -1, py: -1, lastT: 0, inside: false };

function toRT(e) {
  return { px: e.clientX / pr.px, py: e.clientY / pr.px };
}

function inRect(r, px, py, pad = 0) {
  return px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad;
}

window.addEventListener('pointermove', (e) => {
  const { px, py } = toRT(e);
  const now = performance.now();
  const dt = Math.max(0.008, (now - pointer.lastT) / 1000);
  if (pointer.inside) {
    const wpp = (2 * camera.position.z * TAN) / pr.rtH;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const vx = clamp(((px - pointer.px) * wpp) / dt, -30, 30);
    const vy = clamp((-(py - pointer.py) * wpp) / dt, -30, 30);
    parts.cursor.vel.copy(right).multiplyScalar(vx * 0.12).addScaledVector(up, vy * 0.12);
  }
  pointer.px = px;
  pointer.py = py;
  pointer.lastT = now;
  pointer.inside = true;
  raycaster.setFromCamera(new THREE.Vector2((px / pr.rtW) * 2 - 1, 1 - (py / pr.rtH) * 2), camera);
  parts.cursor.origin.copy(raycaster.ray.origin);
  parts.cursor.dir.copy(raycaster.ray.direction);
  parts.cursor.active = true;
  updateHover();
});
document.documentElement.addEventListener('pointerleave', () => (parts.cursor.active = false));

function updateHover() {
  if (busy()) return;
  const { px, py } = pointer;
  let cursor = '';
  if (S.state === 'intro') {
    if (inRect(seed.rect, px, py, 8)) cursor = 'pointer';
  } else if (S.state === 'floreciendo') {
    const i = carteles.hit(px, py);
    if (i !== S.hover) {
      if (i >= 0) sfx.tick();
      carteles.setHover(i);
      S.hover = i;
    }
    S.hoverHeart = heartSprite.mesh.visible && inRect(heartSprite.rect, px, py, 3);
    const overMail = !!buzon?.hit(px, py);
    if (overMail && !buzon.hovered) sfx.tick();
    buzon?.setHover(overMail);
    if (i >= 0 || S.hoverHeart || overMail || pareja.hit(px, py) || avion.hit(px, py)) cursor = 'pointer';
  }
  document.body.style.cursor = cursor;
}

canvas.addEventListener('pointerdown', (e) => {
  if (busy()) return;
  const { px, py } = toRT(e);
  pointer.px = px;
  pointer.py = py;
  if (S.state === 'intro') {
    if (inRect(seed.rect, px, py, 10)) plant();
    return;
  }
  if (S.state !== 'floreciendo') return;
  sfx.init(CFG.musica);
  if (!S.music && S.bloomT > 1) {
    S.music = true;
    sfx.startMusic();
  }
  const i = carteles.hit(px, py);
  if (i >= 0) return openSign(i);
  if (buzon?.hit(px, py)) return openMailbox();
  if (heartSprite.mesh.visible && inRect(heartSprite.rect, px, py, 3)) return tapHeart();
  if (pareja.hit(px, py)) return pareja.poke(coupleEv);
  if (avion.hit(px, py)) return tapPlane();
  raycaster.setFromCamera(new THREE.Vector2((px / pr.rtW) * 2 - 1, 1 - (py / pr.rtH) * 2), camera);
  const hit = raycaster.intersectObject(arbol.blobMesh, false)[0];
  if (hit) shakeTree(hit.point);
});

/* ---------------- controles ---------------- */

const btnSound = document.getElementById('btn-sonido');
try {
  if (localStorage.getItem('aniv-mute') === '1') {
    sfx.setMuted(true);
    btnSound.setAttribute('aria-pressed', 'true');
  }
} catch {}
btnSound.addEventListener('click', () => {
  const m = !sfx.isMuted();
  sfx.setMuted(m);
  btnSound.setAttribute('aria-pressed', String(m));
  btnSound.setAttribute('aria-label', m ? 'Activar sonido' : 'Silenciar');
  try { localStorage.setItem('aniv-mute', m ? '1' : '0'); } catch {}
});
document.getElementById('btn-repetir').addEventListener('click', () => {
  const u = new URL(location.href);
  u.searchParams.delete('saltar');
  pr.post.uniforms.uFade.value = 1;
  let f = 1;
  const out = setInterval(() => {
    f -= 0.12;
    pr.post.uniforms.uFade.value = Math.max(0, f);
    if (f <= 0) {
      clearInterval(out);
      location.href = u.toString();
    }
  }, 40);
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    pr.resize();
    computeFrames();
    setCam(finalCam, frames.final);
    layoutHanging();
  }, 150);
});

/* ---------------- actualización ---------------- */

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const proj = {};

function update(dt) {
  S.t += dt;
  const t = S.t;
  windUniforms.uTime.value = t;
  S.gust = Math.max(0, S.gust - dt * 1.4);
  const wind = 0.045 + 0.022 * Math.sin(t * 0.37) + 0.03 * Math.pow(Math.max(0, Math.sin(t * 0.13 + 1)), 6);
  windUniforms.uWind.value = wind;
  windUniforms.uShake.value = S.gust * S.gust * 0.035;
  S.shake = Math.max(0, S.shake - dt * 3.5);

  // cámara (usa el avance del fotograma anterior)
  const f = S.state === 'floreciendo' ? frames.final : lerpFrame(frames.intro, frames.final, S.camK);
  setCam(camera, f, REDUCED ? 0 : S.shake);

  if (S.state === 'intro') updateIntro(dt, t);
  else if (S.state === 'plantando') updatePlanting(dt, t);
  else if (S.state === 'creciendo') updateGrowing(dt, t);
  else if (S.state === 'floreciendo') updateBloom(dt, t);

  // estrellas fugaces: seguido, y de vez en cuando una lluvia de dos o tres
  if (t > S.nextMeteor) {
    const shower = Math.random() < 0.18;
    S.nextMeteor = t + (shower ? 3 : 1.1) + Math.random() * 2.6;
    const dir = Math.random() < 0.72 ? -1 : 1;
    const n = shower ? 2 + Math.floor(Math.random() * 2) : 1;
    for (let i = 0; i < n; i++) shootingStar(i * (0.2 + Math.random() * 0.35), dir);
  }

  mundo.update(dt, t, S.dawn, camera, clamp(S.growT / G, 0, 1), wind, f.lookY);
  parts.tint.copy(mundo.tint);
  arbol.flowerMat.uniforms.uTint.value.copy(mundo.tint);
  arbol.flowerMat.uniforms.uScale.value = pr.rtH / (2 * TAN);
  arbol.flowerMat.uniforms.uKeyDir.value.copy(mundo.key.position).sub(mundo.key.target.position).normalize();
  parts.update(dt, t, wind + S.gust * 0.05, S.state === 'intro' || S.state === 'plantando' ? 1 : 1 - S.dawn * 0.4);

  pareja.update(dt, t, camera, pr.rtW, pr.rtH, coupleEv);
  avion.update(dt, t, camera, pr.rtW, pr.rtH, camera.position.z + 15, planeBand, planeEv);
  if (buzon) {
    buzon.update(dt, t, camera, pr.rtW, pr.rtH, mailEv);
    // cuando ella cierra la carta, el buzón se cierra y la bandera vuelve a subir
    if (buzon.state === 'abierto' && !ui.modalOpen && !carta?.isOpen) {
      buzon.close();
      sfx.wood(3);
    }
  }
  mundo.grassMat.uniforms.uPress1.value.copy(pareja.press[0]);
  mundo.grassMat.uniforms.uPress2.value.copy(pareja.press[1]);

  carteles.update(dt, t, camera, pr.rtW, pr.rtH, mundo.tint, (it) => {
    sfx.wood(it.i);
    const a = it.anchor;
    for (let k = 0; k < 8; k++) parts.petal(a.x + (Math.random() - 0.5) * 0.6, a.y, a.z + 0.2, true);
  });

  // zonas accesibles
  ui.placeZone(seedBtn, seed.rect, pr.px, S.state === 'intro');
  carteles.items.forEach((it, i) => ui.placeZone(ui.signButtons[i], it.sprite.rect, pr.px, it.shown && S.state === 'floreciendo'));
  ui.placeZone(heartBtn, heartSprite.rect, pr.px, heartSprite.mesh.visible && heart.revealed >= heart.total);
  ui.placeZone(coupleBtn, pareja.duo.rect, pr.px, pareja.seated);
  if (buzon) ui.placeZone(mailBtn, buzon.sprite.rect, pr.px, buzon.state === 'cerrado');

  // nubecitas: la del buzón y luego las de lo que cuelga; cada una esquiva a
  // las que ya se acomodaron, a lo que cuelga, a la pareja y al buzón
  const calm = S.state === 'floreciendo' && !busy();
  const avoid = [
    ...carteles.items.filter((it) => it.shown).map((it) => it.sprite.rect),
    pareja.seated && pareja.duo.rect,
    heartSprite.mesh.visible && heartSprite.rect,
  ];
  if (buzon) {
    mailNote.place(buzon.sprite.rect, pr.px, calm && buzon.state === 'cerrado', avoid);
    avoid.push(buzon.visible && buzon.sprite.rect, mailNote.rect);
  }
  for (const n of hangNotes) {
    const it = carteles.items[n.i];
    const rect = it.sprite.rect;
    n.nube.place(rect, pr.px, calm && it.landed && t > it.landT + 0.8, avoid.filter((a) => a !== rect));
    avoid.push(n.nube.rect);
  }
}

// Una estrella fugaz por la parte de arriba del cielo, donde la copa del árbol
// no la tapa (dir: -1 hacia la izquierda, 1 hacia la derecha), de tamaño,
// velocidad e inclinación al azar; las lejanitas salen más chiquitas y tenues.
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3();
function shootingStar(delay, dir) {
  _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const far = Math.random() < 0.25;
  const dist = far ? 190 + Math.random() * 40 : 130 + Math.random() * 50;
  const halfH = dist * TAN, halfW = halfH * camera.aspect;
  const o = camera.position.clone().addScaledVector(_fwd, dist)
    .addScaledVector(_right, (Math.random() * 1.2 - 0.2) * -dir * halfW)
    .addScaledVector(_up, (0.45 + Math.random() * 0.5) * halfH);
  const tilt = 0.22 + Math.random() * 0.4, speed = (0.9 + Math.random() * 0.9) * halfH;
  const v = _right.clone().multiplyScalar(dir * Math.cos(tilt) * speed).addScaledVector(_up, -Math.sin(tilt) * speed);
  parts.meteor(o, v, {
    delay,
    life: 0.8 + Math.random() * 0.8,
    head: far ? 1 : Math.random() < 0.2 ? 3 : 2,
    tail: 0.12 + Math.random() * 0.12,
    step: (2 * dist * TAN) / pr.rtH,
    glow: far ? 0.6 : 1,
    warm: Math.random() < 0.6,
  });
}

function updateIntro(dt, t) {
  S.seedY = 2.4 + Math.sin(t * 2) * 0.07;
  placeSeed(seedTex.normal);
  glow.material.opacity = 0.38 + 0.14 * Math.sin(t * 3);
  mundo.seedLight.position.set(0, S.seedY + 0.2, 0.3);
  mundo.seedLight.intensity = 1.6 + 0.5 * Math.sin(t * 3);
  if (t > S.nextSpark) {
    S.nextSpark = t + 0.22;
    const a = Math.random() * Math.PI * 2;
    parts.sparkle(Math.cos(a) * 0.45, S.seedY + 0.25 + Math.sin(a) * 0.35, 0.2, 1, 0.1, 0.3);
  }
  camera.updateMatrixWorld();
  projectToPixels(tmp.set(0, S.seedY, 0), camera, pr.rtW, pr.rtH, proj);
  ui.showHint(proj.x * pr.px, (proj.y + 12) * pr.px);
}

function placeSeed(tex) {
  seed.set(tex);
  seed.place(tmp.set(0, S.seedY, 0), camera, pr.rtW, pr.rtH);
  glow.place(tmp.set(0, S.seedY + 0.25, 0), camera, pr.rtW, pr.rtH);
}

function updatePlanting(dt, t) {
  S.plantT += dt;
  const p = S.plantT;
  if (p < 0.28) {
    S.seedY = lerp(S.seedY, 2.75, easeOutCubic(p / 0.28) * 0.35);
  } else if (!S.landed) {
    S.seedV -= 16 * dt;
    S.seedY += S.seedV * dt;
    if (S.seedY <= GROUND_Y) {
      S.seedY = GROUND_Y;
      S.landed = true;
      S.landT = p;
      S.shake = 1;
      sfx.thud();
      parts.dirtBurst(0, GROUND_Y, 0.1);
    }
  }
  S.camK = 0;
  const lt = S.landed ? p - S.landT : -1;
  if (lt < 0) {
    placeSeed(seedTex.normal);
  } else {
    S.seedY = GROUND_Y - clamp((lt - 0.15) / 0.6, 0, 1) * 0.45;
    placeSeed(lt < 0.14 ? seedTex.squash : seedTex.normal);
    const ms = easeOutBack(clamp(lt / 0.5, 0, 1));
    mound.scale.set(0.5 * ms, 0.14 * ms, 0.5 * ms);
  }
  glow.material.opacity = S.landed ? 0.5 * (1 - clamp(lt / 0.7, 0, 1)) : 0.55;
  const soil = lt > 0.55 ? Math.sin(Math.PI * clamp((lt - 0.55) / 1.1, 0, 1)) : 0;
  mundo.seedLight.position.set(0, S.landed ? GROUND_Y + 0.35 : S.seedY + 0.2, 0.3);
  mundo.seedLight.intensity = S.landed ? 1.2 * (1 - clamp(lt / 0.4, 0, 1)) + soil * 3 : 2;
  if (soil > 0.2 && t > S.nextSpark) {
    S.nextSpark = t + 0.06;
    parts.sparkle((Math.random() - 0.5) * 0.5, GROUND_Y + 0.1, (Math.random() - 0.5) * 0.4, 1, 0.1, 1.2);
  }
  if (lt > 1.6) {
    S.state = 'creciendo';
    S.growT = 0;
    seed.mesh.visible = false;
    glow.mesh.visible = false;
  }
}

function updateGrowing(dt, t) {
  S.growT = Math.min(G, S.growT + dt);
  const g = S.growT;
  arbol.updateGrowth(g);
  arbol.updateLeaves(g, 1);
  S.dawn = smoothstep(0, G + 1, g);
  S.camK = easeInOutCubic(clamp(g / (G * 0.9), 0, 1));
  mundo.seedLight.intensity = Math.max(0, mundo.seedLight.intensity - dt * 1.2);
  const ms = 1 - 0.4 * smoothstep(0.2, 1, g / (arbol.trunk.dur * 1.5));
  mound.scale.set(0.5 * ms, 0.14 * ms, 0.5 * ms);

  while (S.shownLabels < picks.length && g >= picks[S.shownLabels].t) {
    const i = S.shownLabels++;
    ui.showLabel(i);
    sfx.chime(i);
    arbol.tipAt(picks[i].b, g, tmp);
    parts.sparkle(tmp.x, tmp.y, tmp.z, 10, 0.5, 0.7);
  }
  placeLabels(g);

  if (g >= G) {
    S.holdT += dt;
    if (S.holdT > 1.1) startBloom();
  }
}

function placeLabels(g) {
  camera.updateMatrixWorld();
  for (let i = 0; i < S.shownLabels; i++) {
    arbol.tipAt(picks[i].b, g, tmp);
    tmp.add(windOffsetJS(tmp, tmp2));
    projectToPixels(tmp, camera, pr.rtW, pr.rtH, proj);
    ui.placeLabel(i, Math.round(proj.x) * pr.px, Math.round(proj.y) * pr.px);
  }
}

function updateBloom(dt, t) {
  S.bloomT += dt;
  const b = S.bloomT;
  S.dawn = 1;
  S.camK = 1;
  if (!S.bloomDone) {
    arbol.updateBloom(b);
    arbol.updateLeaves(G, 1 - clamp(b / 1.6, 0, 1));
    if (b > arbol.bloomEnd) S.bloomDone = true;
  }
  if (b < 1.5) placeLabels(G);

  // pétalos que caen de la copa
  const rate = 7 * smoothstep(0.6, 2.6, b) + S.gust * 30;
  let n = rate * dt + (Math.random() < (rate * dt) % 1 ? 1 : 0);
  while (n-- >= 1) {
    const k = arbol.clusters[Math.floor(Math.random() * arbol.clusters.length)];
    if (b < k.bs + 0.4) continue;
    parts.petal(k.c.x + (Math.random() - 0.5) * k.r, k.c.y - k.r * 0.5, k.c.z + (Math.random() - 0.5) * k.r);
  }

  if (!S.music && b > 1) {
    S.music = true;
    sfx.startMusic();
  }
  if (!S.finalShown && b > 1.6) {
    S.finalShown = true;
    ui.showFinal();
  }

  // corazón tallado en el tronco
  if (b > 2.2) {
    const minY = pareja.headPoint(tmp2).y + 0.25;
    const s = clamp(Math.max(1.95, minY - arbol.trunk.pts[0].y), 0, arbol.trunk.len * 0.8);
    arbol.pointAt(arbol.trunk, s, tmp);
    const r = arbol.radiusAt(arbol.trunk, s);
    tmp2.set(camera.position.x - tmp.x, 0, camera.position.z - tmp.z).normalize();
    tmp.addScaledVector(tmp2, r + 0.03);
    heartSprite.mesh.visible = true;
    heartSprite.place(tmp, camera, pr.rtW, pr.rtH);
    const want = Math.floor(clamp((b - 2.2) / 1.3, 0, 1) * heart.total);
    if (want > S.carved) {
      S.carved = want;
      sfx.carve(want);
      if (want % 3 === 0) parts.sparkle(tmp.x, tmp.y, tmp.z + 0.1, 1, 0.2, 0.3);
    }
    heart.reveal(want);
    heart.revealed = want;
  }

  if (!S.coupleStarted && b > 3.4) {
    S.coupleStarted = true;
    pareja.start();
  }
  if (t > S.hintAt) {
    S.hintAt = Infinity;
    ui.showSignHint();
    avion.schedule(t + 3);
  }
}

/* ---------------- arranque ---------------- */

function skipToEnd() {
  S.state = 'floreciendo';
  S.growT = G;
  S.dawn = 1;
  S.camK = 1;
  S.shownLabels = picks.length;
  arbol.updateGrowth(G);
  arbol.updateLeaves(G, 0);
  arbol.updateBloom(arbol.bloomEnd + 1);
  S.bloomDone = true;
  S.bloomT = 4;
  S.finalShown = true;
  S.signsDropped = true;
  S.carved = heart.total;
  ui.hideIntro();
  ui.labels.forEach((el) => el.remove());
  ui.showFinal();
  seed.mesh.visible = false;
  glow.mesh.visible = false;
  mound.scale.set(0.3, 0.08, 0.3);
  mundo.seedLight.intensity = 0;
  carteles.settle();
  pareja.seatNow();
  buzon?.showNow();
  S.coupleStarted = true;
  S.hintAt = 1.5;
  for (let i = 0; i < 160; i++) {
    const k = arbol.clusters[Math.floor(Math.random() * arbol.clusters.length)];
    parts.petal(k.c.x + (Math.random() - 0.5) * 6, k.c.y - Math.random() * 6, k.c.z + (Math.random() - 0.5) * 3);
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * SPEED;
  last = now;
  update(dt);
  pr.render(scene, camera);
  requestAnimationFrame(loop);
}

if (SKIP) skipToEnd();
else ui.typeIntro(SPEED);
// con la letra ya cargada, el buzón vuelve a buscar lugar con el tamaño real de su nubecita
document.fonts?.ready.then(() => {
  ui.hideLoading();
  layoutHanging();
}, () => ui.hideLoading());
setTimeout(() => ui.hideLoading(), 2500);
requestAnimationFrame(loop);

