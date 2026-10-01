import * as sfx from './audio.js';
import { makeCanvas, pixelTexture, outlineCanvas } from './sprites.js';
import { drawText, measure } from './pixelfont.js';
import { Rf, P, dith, disc, line, heart, BLACK_HEART } from './historieta.js';
import { createGame } from './juego.js';
import { sticker } from './calcos.js';

/* =====================================================================
   La maquinita arcade de "7 razones". Cuelga del árbol como los carteles;
   al tocarla vuela hacia la pantalla, se enciende como tele vieja y el
   juego corre en su pantalla. El joystick y los botones sí funcionan.
   ===================================================================== */

const OUT = '#26141f', OUT_HOVER = '#fff1c8';
const BODY = '#6a4486', BODY_L = '#8a5fa3', BODY_D = '#4a3570', PANEL = '#3b2a5c';
const BLACK = [BLACK_HEART.fill, BLACK_HEART.edge, BLACK_HEART.shine];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);

/* ---------------- la chiquita que cuelga del árbol ---------------- */

export function arcadeTexture(hover = false) {
  const { c, ctx } = makeCanvas(26, 36);
  const r = (x, y, w, h, col) => Rf(ctx, x, y, w, h, col);
  // cuerpo
  r(2, 1, 22, 34, BODY);
  r(2, 1, 1, 34, BODY_L);
  r(23, 1, 1, 34, BODY_D);
  // marquesina iluminada con "7♥"
  r(2, 1, 22, 8, BODY_D);
  r(4, 2, 18, 6, '#fde6bd');
  drawText(ctx, '7', 8, -1, '#b0356b');
  heart(ctx, 15.5, 5, 5, ...BLACK);
  // pantalla con un corazoncito
  r(4, 10, 18, 11, '#1d171f');
  r(6, 12, 14, 7, hover ? '#2f3670' : '#1b2046');
  for (const [x, y] of [[11, 14], [13, 14], [11, 15], [12, 15], [13, 15], [12, 16]]) P(ctx, x, y, '#f25a8c');
  P(ctx, 7, 13, '#8f8ab8');
  // tablero con joystick y botones
  r(1, 22, 24, 2, BODY_L);
  r(1, 24, 24, 2, PANEL);
  r(6, 20, 1, 2, '#1d171f');
  P(ctx, 6, 19, '#f25a8c');
  P(ctx, 16, 22, '#f25a8c');
  P(ctx, 19, 22, '#8fd3c4');
  // puertita de monedas
  r(9, 27, 8, 6, PANEL);
  P(ctx, 11, 29, '#f28a3c');
  P(ctx, 14, 29, '#f28a3c');
  r(3, 34, 4, 1, PANEL);
  r(19, 34, 4, 1, PANEL);
  return { tex: pixelTexture(outlineCanvas(c, hover ? OUT_HOVER : OUT)), w: 26, h: 36 };
}

/* ---------------- la grande, en primer plano ---------------- */

const CW = 184, CH = 204;     // mueble, en píxeles del dibujo
const SX = 12, SY = 36;       // dónde empieza la pantalla (160×96)
// zonas tocables del tablero: [x, y, ancho, alto]
const ZONES = { left: [26, 136, 20, 30], right: [46, 136, 20, 30], a: [118, 138, 22, 22], b: [142, 134, 22, 22] };
// calcomanías pegadas por todos lados: casi todas de Kuromi y unas de videojuegos
const STICKERS = [
  ['murcielago', 11, 10], ['calavera', 160, 9], ['p1p2', 74, 141], ['corazon', 6, 156],
  ['masterchief', 148, 153], ['kuromi', 16, 174], ['kuromiGuino', 128, 174],
];

let title = null;
function titleImage(text) {
  if (title?.text === text) return title.img;
  const b = makeCanvas(measure(text), 9);
  drawText(b.ctx, text, 0, 0, '#b0356b');
  title = { text, img: b.c };
  return b.c;
}

// o: { blink, stick (-1, 0, 1), a, b (apretados), title }
function paintCabinet(ctx, o) {
  const r = (x, y, w, h, col) => Rf(ctx, x, y, w, h, col);
  ctx.clearRect(0, 0, CW, CH);
  // silueta: marquesina, pantalla, tablero que sobresale, parte de abajo y patas
  r(1, 1, 182, 31, BODY_D);
  r(5, 32, 174, 106, BODY);
  r(1, 138, 182, 34, BODY_L);
  r(11, 172, 162, 28, BODY);
  r(14, 200, 17, 3, PANEL);
  r(153, 200, 17, 3, PANEL);
  r(5, 32, 2, 106, BODY_L);
  r(177, 32, 2, 106, BODY_D);
  r(11, 172, 2, 28, BODY_L);
  r(171, 172, 2, 28, BODY_D);
  // marquesina con foquitos
  r(8, 5, 168, 23, '#fde6bd');
  dith(ctx, 8, 18, 168, 10, '#fbd3a0');
  const img = titleImage(o.title);
  ctx.drawImage(img, Math.round(92 - img.width), 5, img.width * 2, img.height * 2);
  heart(ctx, 38, 16, 7, ...BLACK);
  heart(ctx, 146, 16, 7, ...BLACK);
  for (let x = 10, i = 0; x < 174; x += 8, i++) {
    const on = (i + o.blink) % 2;
    r(x, 2, 3, 2, on ? '#ffd27a' : '#6b5a7e');
    r(x, 29, 3, 2, on ? '#f28ab2' : '#6b5a7e');
  }
  // bisel y pantalla apagada con su reflejo
  r(9, 33, 166, 102, '#1d171f');
  r(SX - 1, SY - 1, 162, 98, '#3a2f4a');
  r(SX, SY, 160, 96, '#0e0b10');
  line(ctx, SX + 8, SY + 20, SX + 28, SY + 4, '#1f1a28');
  line(ctx, SX + 12, SY + 22, SX + 32, SY + 6, '#1f1a28');
  // tablero: superficie clarita y frente oscuro
  r(1, 138, 182, 1, '#b597e2');
  r(1, 154, 182, 18, PANEL);
  r(1, 154, 182, 1, '#4f3a73');
  // flechitas a los lados del joystick
  for (let k = 0; k < 3; k++) {
    r(31 + k, 150 - k, 1, 1 + k * 2, '#fff4e6');
    r(61 - k, 150 - k, 1, 1 + k * 2, '#fff4e6');
  }
  // joystick: se inclina hacia donde lo empujan
  const sx = o.stick * 4;
  disc(ctx, 46, 151, 7, '#1d171f');
  line(ctx, 46, 150, 46 + sx, 142, '#3a2f3f');
  line(ctx, 47, 150, 47 + sx, 142, '#3a2f3f');
  disc(ctx, 46 + sx, 140, 5, '#f25a8c');
  P(ctx, 44 + sx, 138, '#ff8fb0');
  P(ctx, 45 + sx, 137, '#ff8fb0');
  // botones rosa y verde agua
  const button = (x, y, col, dark, down) => {
    disc(ctx, x, y + 2, 7, dark);
    disc(ctx, x, y + (down ? 2 : 0), 7, col);
    if (!down) P(ctx, x - 3, y - 3, '#ffffff');
  };
  button(129, 147, '#f25a8c', '#9c2f5a', o.a);
  button(153, 143, '#8fd3c4', '#4f8f84', o.b);
  // puertita de monedas y corazón negro
  r(70, 178, 44, 18, PANEL);
  r(72, 180, 40, 14, '#2e2240');
  r(82, 183, 4, 8, '#f28a3c');
  r(98, 183, 4, 8, '#f28a3c');
  heart(ctx, 58, 186, 7, ...BLACK);
  for (const [name, x, y] of STICKERS) ctx.drawImage(sticker(name), x, y);
  outlineCanvas(ctx.canvas, OUT);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const CLOSE_ICON = '<svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h2v1H0zM1 1h2v1H1zM2 2h3v3H2zM4 1h2v1H4zM5 0h2v1H5zM1 5h2v1H1zM0 6h2v1H0zM4 5h2v1H4zM5 6h2v1H5z"/></svg>';

// cfg: la configuración del juego ({ razones, final }); name: lo que dice la marquesina
export class Arcade {
  constructor(cfg, { name = '7 RAZONES', onClose } = {}) {
    this.cfg = cfg;
    this.name = name;
    this.onClose = onClose;
    this.isOpen = false;
  }

  // from: rectángulo en pantalla (px) de la maquinita que cuelga del árbol
  play(from) {
    if (this.isOpen) return;
    this.isOpen = true;
    const vw = innerWidth, vh = innerHeight;
    // tamaño entero de píxel; en pantallas muy chiquitas se encoge un poco
    const fitS = Math.min((vw * 0.96) / CW, (vh * 0.9) / CH);
    const S = Math.max(2, Math.floor(fitS));
    const shrink = Math.min(1, fitS / S);

    const root = el('div', 'arcade-show');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Minijuego: 7 razones');
    const machine = el('div', 'arcade-show__maquina');
    machine.style.width = `${CW * S}px`;
    machine.style.height = `${CH * S}px`;
    machine.style.margin = `${(-CH * S) / 2}px 0 0 ${(-CW * S) / 2}px`;
    const cab = el('canvas', 'arcade-show__mueble');
    cab.width = CW;
    cab.height = CH;
    cab.setAttribute('aria-hidden', 'true');
    const screen = el('div', 'arcade-show__pantalla');
    Object.assign(screen.style, { left: `${SX * S}px`, top: `${SY * S}px`, width: `${160 * S}px`, height: `${96 * S}px` });
    const game = createGame(this.cfg);
    screen.append(game.el);
    machine.append(cab, screen);
    const zone = (key, label) => {
      const b = el('button', 'arcade-show__control');
      b.type = 'button';
      b.setAttribute('aria-label', label);
      const [x, y, w, h] = ZONES[key];
      Object.assign(b.style, { left: `${x * S}px`, top: `${y * S}px`, width: `${w * S}px`, height: `${h * S}px` });
      machine.append(b);
      return b;
    };
    const left = zone('left', 'Caminar a la izquierda');
    const right = zone('right', 'Caminar a la derecha');
    const btnA = zone('a', 'Aceptar');
    const btnB = zone('b', 'Aceptar');
    const closeBtn = el('button', 'arcade-show__cerrar');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Cerrar la maquinita');
    closeBtn.innerHTML = CLOSE_ICON;
    root.append(el('div', 'arcade-show__fondo'), machine, closeBtn);
    document.body.append(root);
    this.root = root;
    this.game = game;
    this.timers = [];

    // el mueble se vuelve a pintar para que parpadeen los foquitos
    const ctx = cab.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const look = { blink: 0, stick: 0, a: false, b: false, title: this.name };
    const paint = () => paintCabinet(ctx, look);
    paint();
    this.blinker = setInterval(() => {
      look.blink ^= 1;
      paint();
    }, 420);

    // joystick: mientras lo detienen, ella camina
    const hold = (btn, dir) => {
      const up = () => {
        game.press(dir, false);
        look.stick = 0;
        paint();
      };
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        game.press(dir, true);
        look.stick = dir === 'left' ? -1 : 1;
        paint();
      });
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
    };
    hold(left, 'left');
    hold(right, 'right');
    const press = (key) => {
      look[key] = true;
      paint();
      sfx.tick();
      game.primary();
      this.timers.push(setTimeout(() => {
        look[key] = false;
        paint();
      }, 160));
    };
    btnA.addEventListener('click', () => press('a'));
    btnB.addEventListener('click', () => press('b'));
    closeBtn.addEventListener('click', () => this.close());

    this.onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Tab') {
        // el foco se queda dentro de la maquinita
        const f = [...root.querySelectorAll('button')].filter((b) => b.offsetParent);
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
      }
    };
    document.addEventListener('keydown', this.onKey);
    sfx.duckMusic(true);

    // se enciende la pantalla y el foco pasa al botón de la tarjeta
    const turnOn = () => {
      screen.classList.add('encendida');
      sfx.coin();
      this.timers.push(setTimeout(() => screen.querySelector('.juego__boton')?.focus({ preventScroll: true }), 450));
    };
    if (REDUCED) {
      machine.style.transform = shrink < 1 ? `scale(${shrink})` : '';
      return turnOn();
    }

    // vuela desde el árbol hasta el centro de la pantalla
    sfx.swish();
    const FLY = 1;
    const fx = from ? from.x + from.w / 2 - vw / 2 : 0, fy = from ? from.y + from.h / 2 - vh / 2 : vh / 2;
    const s0 = from ? from.w / (CW * S) : 0.1;
    const t0 = performance.now();
    const frame = (now) => {
      if (!this.isOpen) return;
      const k = easeInOut(clamp01((now - t0) / 1000 / FLY));
      const arc = Math.sin(k * Math.PI) * Math.min(80, vh * 0.1);
      machine.style.transform = `translate(${lerp(fx, 0, k)}px, ${lerp(fy, 0, k) - arc}px) rotate(${(1 - k) * -12}deg) scale(${lerp(s0, shrink, k)})`;
      if (k < 1) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    this.timers.push(setTimeout(() => {
      machine.style.transform = shrink < 1 ? `scale(${shrink})` : '';
      turnOn();
    }, FLY * 1000 + 60));
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.timers.forEach(clearTimeout);
    clearInterval(this.blinker);
    cancelAnimationFrame(this.raf);
    document.removeEventListener('keydown', this.onKey);
    this.game.destroy();
    sfx.duckMusic(false);
    sfx.swish();
    const root = this.root;
    root.classList.add('saliendo');
    setTimeout(() => root.remove(), 320);
    this.onClose?.();
  }
}
