import * as sfx from './audio.js';
import { makeCanvas } from './sprites.js';
import { ELLA, paintFront, outline, mirror, buildFrames } from './personitas.js';
import { Rf, P, dith, disc, line, heart, sparkle, stand, gradientSky, BLACK_HEART } from './historieta.js';
import { clamp } from './comun.js';

/* =====================================================================
   Minijuego de "7 razones", dentro de la pantalla de la maquinita arcade:
   ella camina bajo el cerezo y atrapa los corazones que caen; cada uno le
   enseña una razón. No se puede perder: si un corazón llega al pasto se
   queda ahí esperándola. Al final él llega corriendo a abrazarla. Las
   razones viven en config.js.
   ===================================================================== */

const W = 160, H = 96;
const GROUND = 90;          // donde pisa ella
const MIN_X = 20, MAX_X = 150;
const SPEED = 55;           // px/s caminando
const FALL = 13;            // px/s cayendo: lento a propósito
const REST_Y = 84;          // el corazón que llega al pasto se queda aquí
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
// todos los corazones del juego son negros
const HEART = [BLACK_HEART.fill, BLACK_HEART.edge, BLACK_HEART.shine];

/* ---------------- escenario ---------------- */

// números "al azar" pero siempre los mismos, para que el paisaje no cambie
function seeded(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

// cerezo arriba, colinas a lo lejos y pasto con florecitas
function meadowBg(c) {
  const rnd = seeded(11);
  gradientSky(c, [[0, '#7a4a8a'], [22, '#a4588c'], [36, '#cf6d86'], [48, '#ec8f82'], [58, '#f6b48a'], [66, '#fbd3a0']], 80);
  for (const [x, y, w] of [[40, 46, 26], [100, 38, 30], [140, 56, 18]]) {
    Rf(c, x + 4, y - 2, w - 10, 2, '#f8cdb8');
    Rf(c, x, y, w, 3, '#f8cdb8');
    Rf(c, x + 2, y + 3, w - 4, 1, '#e8a797');
  }
  for (let x = 0; x < W; x++) {
    const far = Math.round(66 + Math.sin(x * 0.045) * 4 + Math.sin(x * 0.11 + 1) * 2);
    Rf(c, x, far, 1, 80 - far, '#c98aa8');
    const near = Math.round(72 + Math.sin(x * 0.06 + 2) * 3);
    Rf(c, x, near, 1, 80 - near, '#a86a9a');
  }
  // pasto con briznas y florecitas
  Rf(c, 0, 80, W, 16, '#5f9e5a');
  Rf(c, 0, 80, W, 1, '#8fc68c');
  dith(c, 0, 88, W, 8, '#4d8450');
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rnd() * W), y = 81 + Math.floor(rnd() * 14);
    P(c, x, y, i % 3 ? '#8fc68c' : '#3d6b40');
    if (i % 4 === 0) P(c, x, y - 1, '#8fc68c');
  }
  for (let i = 0; i < 18; i++) {
    P(c, Math.floor(rnd() * W), 82 + Math.floor(rnd() * 13), ['#ffffff', '#ffd27a', '#f7b6c8', '#d8c7f6'][i % 4]);
  }
  // tronco que se ensancha abajo, con sus raíces
  for (let y = 4; y < 90; y++) {
    const w = Math.round(10 + Math.max(0, y - 74) * 0.35);
    Rf(c, 0, y, w, 1, '#6b4430');
    Rf(c, 0, y, 3, 1, '#4a2e20');
    P(c, w - 2, y, '#8a5a3c');
  }
  for (let y = 12; y < 84; y += 7) Rf(c, 5, y, 1, 4, '#4a2e20');
  Rf(c, 6, 46, 2, 2, '#4a2e20');
  Rf(c, 12, 86, 5, 4, '#6b4430');
  Rf(c, 15, 88, 3, 2, '#6b4430');
  // ramas que se meten en la copa
  for (const [x1, y1] of [[46, 9], [92, 14], [140, 8]]) {
    line(c, 6, 14, x1, y1, '#5a3a2a');
    line(c, 6, 15, x1, y1 + 1, '#5a3a2a');
  }
  // la copa: racimos de flores de distintos tamaños
  const clusters = [];
  for (let x = -6; x < W + 8; x += 6 + Math.floor(rnd() * 4)) clusters.push([x, 3 + Math.floor(rnd() * 9), 6 + Math.floor(rnd() * 4)]);
  clusters.forEach(([x, y, r]) => disc(c, x, y + 3, r, '#c95f86'));
  clusters.forEach(([x, y, r]) => disc(c, x, y, r, '#e8819f'));
  clusters.forEach(([x, y, r]) => disc(c, x - 1, y - 2, r - 3, '#f29bbd'));
  clusters.forEach(([x, y, r]) => rnd() < 0.6 && disc(c, x - 2, y - 3, Math.max(1, r - 6), '#f9c3d6'));
  const inCanopy = (x, y) => clusters.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy - 3) ** 2 <= r * r);
  for (let i = 0; i < 300; i++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * 24);
    if (inCanopy(x, y)) P(c, x, y, ['#ffffff', '#fcd5e0', '#b8517a'][i % 3]);
  }
}

const ARROW = ['.###.', '.###.', '.###.', '#####', '.###.', '..#..'];
// flechita que señala el corazón cuando lleva rato esperando en el pasto
function arrow(c, x, y) {
  const x0 = Math.round(x) - 2;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    ARROW.forEach((r, j) => [...r].forEach((ch, i) => ch === '#' && P(c, x0 + i + dx, y + j + dy, '#3a1f3d')));
  }
  ARROW.forEach((r, j) => [...r].forEach((ch, i) => ch === '#' && P(c, x0 + i, y + j, '#fff4c8')));
}

function newPetal(y) {
  return {
    x: Math.random() * W,
    y,
    v: 7 + Math.random() * 8,
    ph: Math.random() * 6,
    col: Math.random() < 0.5 ? '#fcd5e0' : '#f7b6c8',
  };
}

/* ---------------- personajes ---------------- */

function buildSprites() {
  const f = buildFrames();
  const cv = (s) => s.tex.image;
  const front = (o = {}) => outline(paintFront(ELLA, o).c);
  const ella = {
    idle: front(),
    blink: front({ closed: true }),
    cheer: front({ arms: 'up', closed: true, laugh: true, blush: true }),
    runL: f.ella.run.map(cv),
    sideL: cv(f.ella.stand),
  };
  ella.runR = ella.runL.map((c) => mirror(c));
  ella.sideR = mirror(ella.sideL);
  const tu = { runR: f.tu.run.map(cv) };
  tu.runL = tu.runR.map((c) => mirror(c));
  // abrazo y beso con él a la izquierda (R) o a la derecha (L)
  const hugR = f.hug.map(cv);
  const kissR = cv(f.kiss);
  return { ella, tu, hugR, hugL: hugR.map((c) => mirror(c)), kissR, kissL: mirror(kissR) };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* ---------------- el juego ---------------- */

// cfg: { razones: [...], final }
export function createGame(cfg = {}) {
  const reasons = (cfg.razones || []).filter(Boolean);
  const total = reasons.length;
  const S = buildSprites();
  const bg = makeCanvas(W, H);
  meadowBg(bg.ctx);

  const root = el('div', 'juego');
  const canvas = el('canvas', 'juego__lienzo');
  canvas.width = W;
  canvas.height = H;
  canvas.setAttribute('aria-hidden', 'true');
  const card = el('div', 'juego__carta');
  card.hidden = true;
  const spoken = el('p', 'solo-lectores');
  spoken.setAttribute('aria-live', 'polite');
  root.append(canvas, card, spoken);

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let state = 'intro';        // intro → play ⇄ razon → final
  let got = 0, t = 0, last = performance.now(), raf = 0;
  let goal = null, spawnAt = 0, cardAt = 0, burst = null, him = null;
  let target = null;
  const keys = { left: false, right: false };
  const her = { x: 80, dir: 1, moving: false, cheer: 0, face: 0 };
  const petals = Array.from({ length: REDUCED ? 6 : 16 }, (_, i) => newPetal((i * 6.3) % H));

  // buttons: [[texto, al tocar], …]; body: texto o un elemento (la lista)
  function showCard(kicker, body, buttons, note) {
    card.replaceChildren();
    if (kicker) card.append(el('p', 'juego__antetitulo', kicker));
    card.append(typeof body === 'string' ? el('p', 'juego__razon', body) : body);
    const row = el('div', 'juego__botones');
    for (const [label, onClick] of buttons) {
      const b = el('button', 'comic__boton juego__boton', label);
      b.type = 'button';
      b.addEventListener('click', () => {
        sfx.swish();
        onClick();
      });
      row.append(b);
    }
    card.append(row);
    if (note) card.append(el('p', 'juego__nota', note));
    card.hidden = false;
    card.scrollTop = 0;
    card.classList.remove('entra');
    void card.offsetWidth;
    card.classList.add('entra');
    row.firstElementChild.focus({ preventScroll: true });
    spoken.textContent = [kicker, typeof body === 'string' ? body : body.textContent].filter(Boolean).join('. ');
  }

  const finalCard = () =>
    showCard('', cfg.final || 'Te amo ♥', [['Jugar otra vez', reset], ['Ver las razones', showList]]);

  // todas las razones juntas, para volver a leerlas
  function showList() {
    const ol = el('ol', 'juego__lista');
    reasons.forEach((r) => ol.append(el('li', '', r)));
    showCard(`Las ${total} razones`, ol, [['Volver', finalCard]]);
  }

  function play() {
    card.hidden = true;
    state = 'play';
    spawnAt = t + 0.5;
  }

  function reset() {
    got = 0;
    goal = null;
    him = null;
    burst = null;
    Object.assign(her, { x: 80, dir: 1, moving: false, cheer: 0, face: 0 });
    play();
  }

  // El primero cae cerquita de ella, para que aprenda; los demás, de un lado y del otro.
  function spawnGoal() {
    const side = her.x > 85 ? -1 : 1;
    const dist = got === 0 ? 18 : 34 + Math.random() * 36;
    const x = clamp(her.x + side * (got % 2 ? -1 : 1) * dist, MIN_X + 6, MAX_X - 6);
    goal = { x, x0: x, y: 18, born: t, rest: 0 };
  }

  function catchGoal() {
    got++;
    goal = null;
    target = null;
    her.moving = false;
    her.cheer = 1;
    burst = { x: her.x, y: 70, t: 0 };
    sfx.sparkle();
    sfx.chime(got + 1);
    state = 'razon';
    cardAt = t + 0.6;
  }

  function showReason() {
    cardAt = 0;
    const lastOne = got >= total;
    showCard(`Razón ${got} de ${total}`, reasons[got - 1], [[lastOne ? 'Seguir ♥' : 'Seguir', lastOne ? startEnding : play]]);
  }

  // Él sale corriendo desde el lado donde hay más espacio y la abraza.
  function startEnding() {
    card.hidden = true;
    state = 'final';
    const fromLeft = her.x >= 70;
    him = { x: fromLeft ? -10 : W + 10, dir: fromLeft ? 1 : -1, stop: her.x + (fromLeft ? -8 : 8), fromLeft, at: 0, hugAt: 0 };
    her.face = fromLeft ? -1 : 1;
    her.cheer = 0;
  }

  function updateEnding(dt) {
    him.at += dt;
    if (!him.hugAt) {
      him.x += him.dir * 62 * dt;
      if ((him.dir > 0 && him.x >= him.stop) || (him.dir < 0 && him.x <= him.stop)) {
        him.x = him.stop;
        him.hugAt = him.at;
        sfx.hug();
      }
      return;
    }
    const k = him.at - him.hugAt;
    if (k > 1.6 && !him.kissed) {
      him.kissed = true;
      sfx.chu();
    }
    if (k > 3.2 && !him.done) {
      him.done = true;
      sfx.bloom();
      finalCard();
    }
  }

  function update(dt) {
    t += dt;
    for (const p of petals) {
      p.y += p.v * dt;
      p.x += (Math.sin(t * 1.3 + p.ph) * 6 + 4) * dt;
      if (p.y > H + 2 || p.x > W + 2) Object.assign(p, newPetal(-2));
    }
    her.cheer = Math.max(0, her.cheer - dt);
    if (burst) burst.t += dt;
    if (state === 'razon' && cardAt && t >= cardAt) showReason();
    if (state === 'final') updateEnding(dt);
    if (state !== 'play') return;

    let step = 0;
    if (keys.left !== keys.right) {
      step = (keys.left ? -SPEED : SPEED) * dt;
      target = null;
    } else if (target != null) {
      const dx = target - her.x;
      if (Math.abs(dx) > 1) step = Math.sign(dx) * Math.min(Math.abs(dx), SPEED * dt);
    }
    her.x = clamp(her.x + step, MIN_X, MAX_X);
    her.moving = step !== 0;
    if (step) her.dir = Math.sign(step);

    if (!goal && t >= spawnAt) spawnGoal();
    if (goal) {
      if (goal.y < REST_Y) {
        goal.y = Math.min(REST_Y, goal.y + FALL * dt);
        goal.x = goal.x0 + Math.sin((t - goal.born) * 1.6) * 5;
      } else {
        goal.rest += dt;
      }
      if (Math.abs(goal.x - her.x) < 11 && goal.y > 62) catchGoal();
    }
  }

  function drawHer() {
    let img;
    if (her.cheer > 0) img = S.ella.cheer;
    else if (her.moving) img = (her.dir < 0 ? S.ella.runL : S.ella.runR)[Math.floor(t * 9) % 4];
    else if (her.face) img = her.face < 0 ? S.ella.sideL : S.ella.sideR;
    else img = t % 3.2 < 0.15 ? S.ella.blink : S.ella.idle;
    stand(ctx, img, her.x, GROUND);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg.c, 0, 0);
    for (const p of petals) Rf(ctx, p.x, p.y, 2, 1, p.col);

    if (him?.hugAt) {
      const k = him.at - him.hugAt;
      const kiss = k > 1.6 && k < 3.2;
      const img = kiss ? (him.fromLeft ? S.kissR : S.kissL) : (him.fromLeft ? S.hugR : S.hugL)[Math.floor(t * 2) % 2];
      stand(ctx, img, (him.x + her.x) / 2, GROUND);
      for (let i = 0; i < 6; i++) {
        const ph = (k - i * 0.35) % 2.6;
        if (ph < 0) continue;
        heart(ctx, (him.x + her.x) / 2 + Math.sin(ph * 3 + i * 2) * 11, 64 - ph * 14, i % 2 ? 5 : 7, ...HEART);
      }
    } else {
      if (him) stand(ctx, (him.dir > 0 ? S.tu.runR : S.tu.runL)[Math.floor(t * 9) % 4], him.x, GROUND);
      drawHer();
    }

    if (goal) {
      if (goal.rest > 2.5 && Math.abs(goal.x - her.x) > 14) arrow(ctx, goal.x, 66 + (Math.floor(t * 3) % 2));
      heart(ctx, goal.x, goal.y, goal.y >= REST_Y && Math.floor(t * 3) % 2 ? 7 : 9, ...HEART);
      for (let i = 0; i < 3; i++) {
        const a = t * 2 + (i * Math.PI * 2) / 3;
        sparkle(ctx, goal.x + Math.cos(a) * 9, goal.y + Math.sin(a) * 7, (t * 1.5 + i / 3) % 1);
      }
    }

    if (burst && burst.t < 0.9) {
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3, r = 6 + burst.t * 18;
        sparkle(ctx, burst.x + Math.cos(a) * r, burst.y + Math.sin(a) * r * 0.7, burst.t / 0.9);
      }
    }

    // un corazón por razón: se van llenando
    for (let i = 0; i < total; i++) {
      const x = W - 6 - (total - 1 - i) * 8;
      if (i < got) heart(ctx, x, 30, 5, ...HEART);
      else heart(ctx, x, 30, 5, '#f3d3df', BLACK_HEART.edge, '#f3d3df');
    }
  }

  function loop(now) {
    // aunque el teléfono vaya lento, el juego avanza a tiempo real
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }

  // Ella camina hacia donde toques o apuntes con el mouse.
  const toX = (e) => {
    const r = canvas.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * W;
  };
  canvas.addEventListener('pointerdown', (e) => {
    target = toX(e);
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.buttons) target = toX(e);
  });
  const onKey = (e) => {
    const left = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
    const right = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
    if (!left && !right) return;
    const down = e.type === 'keydown';
    if (down && state !== 'play') return;
    if (down) e.preventDefault();
    keys[left ? 'left' : 'right'] = down;
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);

  showCard(
    'Atrapa los corazones',
    `Atrapa los ${total} corazones que caen del cerezo.`,
    [['¡Jugar!', play]],
    'Toca la pantalla o usa ◀ ▶ para caminar',
  );
  requestAnimationFrame(() => {
    last = performance.now();
    raf = requestAnimationFrame(loop);
  });

  return {
    el: root,
    // el joystick de la maquinita
    press(dir, down) {
      if (down && state !== 'play') return;
      keys[dir] = down;
    },
    // el botón rosa: lo mismo que tocar el botón de la tarjeta que se ve
    primary() {
      if (!card.hidden) card.querySelector('.juego__boton')?.click();
    },
    destroy() {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKey);
    },
  };
}
