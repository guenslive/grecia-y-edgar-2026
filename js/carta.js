import * as sfx from './audio.js';
import { Rf, disc, line, poly, heart, sparkle, BLACK_HEART } from './historieta.js';
import { sticker, stickerImg } from './calcos.js';

/* =====================================================================
   La carta: el sobre que sale del buzón vuela hacia la pantalla, se abre
   en primer plano, la hoja se desdobla y el texto se va escribiendo como
   en una máquina de escribir. El texto vive en config.js.
   ===================================================================== */

const INK = '#3a1f3d';
const BLACK = [BLACK_HEART.fill, BLACK_HEART.edge, BLACK_HEART.shine];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EW = 80, EH = 76;       // lienzo del sobre, en píxeles del dibujo
const ECX = 40, ECY = 50;     // centro del sobre dentro del lienzo
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);

// guion en segundos: vuela, se abre, sale la hoja, se desdobla y se escribe
const T = { fly: 1.1, open: 1.25, seal: 0.35, flap: 0.55, slide: 0.75, paper: 3.05, unfold: 3.4, type: 4.6 };
// calcomanías pegadas a un lado de algunos párrafos (por número de párrafo,
// desde 0), alternando lados: [nombre, lado, giro en grados]
const PEGADAS = { 1: ['murcielago', 'izq', -8], 2: ['corazon', 'der', 6], 4: ['calavera', 'izq', -5], 5: ['control', 'der', 7] };

const CLOSE_ICON = '<svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h2v1H0zM1 1h2v1H1zM2 2h3v3H2zM4 1h2v1H4zM5 0h2v1H5zM1 5h2v1H1zM0 6h2v1H0zM4 5h2v1H4zM5 6h2v1H5z"/></svg>';

// Sobre de 64×40 centrado en (cx, cy). flap: 1 cerrada … -0.8 abierta hacia
// atrás; slide: cuánto ha salido la hoja; seal: tamaño del sello (0 = roto).
function envelope(c, cx, cy, flap, slide, seal) {
  const x0 = cx - 32, y0 = cy - 20, x1 = cx + 31, y1 = cy + 19;
  const tipY = y0 + Math.round(24 * flap);
  // por dentro, y la solapa cuando ya quedó para atrás
  Rf(c, x0, y0, 64, 40, '#e3cda3');
  Rf(c, x0 - 1, y0 - 1, 66, 1, INK);
  if (flap < 0) {
    poly(c, [[x0, y0], [x1 + 1, y0], [cx, tipY]], '#efdcb6');
    line(c, x0, y0 - 1, cx, tipY - 1, INK);
    line(c, x1, y0 - 1, cx, tipY - 1, INK);
  }
  // la hoja que va saliendo, ya escrita a máquina
  if (slide > 0) {
    const top = Math.round(y0 + 4 - slide);
    Rf(c, cx - 27, top - 1, 54, 36, INK);
    Rf(c, cx - 26, top, 52, 35, '#fbf6ea');
    for (let y = top + 9; y < top + 34; y += 4) Rf(c, cx - 22, y, 44 - ((y * 7) % 13), 1, '#d9d0c0');
    heart(c, cx, top + 4, 5, ...BLACK);
  }
  // el frente: solapas de los lados y de abajo
  poly(c, [[x0, y0], [cx - 1, cy + 3], [x0, y1 + 1]], '#f3e6c8');
  poly(c, [[x1 + 1, y0], [cx + 1, cy + 3], [x1 + 1, y1 + 1]], '#f3e6c8');
  poly(c, [[x0, y1 + 1], [cx, cy + 1], [x1 + 1, y1 + 1]], '#fbf1dc');
  line(c, x0, y1, cx, cy + 1, '#d9c49a');
  line(c, x1, y1, cx, cy + 1, '#d9c49a');
  Rf(c, x0 - 1, y1 + 1, 66, 1, INK);
  Rf(c, x0 - 1, y0, 1, 40, INK);
  Rf(c, x1 + 1, y0, 1, 40, INK);
  // calcomanías en el frente: Kuromi guiñando y su calaverita
  c.drawImage(sticker('kuromiGuino'), x0 - 2, y1 - 21);
  c.drawImage(sticker('calavera'), x1 - 14, y1 - 13);
  // la solapa cerrada o a medio abrir va por delante
  if (flap >= 0) {
    poly(c, [[x0, y0], [x1 + 1, y0], [cx, tipY]], '#f7ebcf');
    line(c, x0, y0, cx, tipY, INK);
    line(c, x1, y0, cx, tipY, INK);
  }
  // sello lila con un corazón negro
  if (seal > 0) {
    const r = Math.round(6 * seal);
    disc(c, cx, tipY, r + 1, '#4a3570');
    disc(c, cx, tipY, r, '#8a6cc2');
    if (r > 2) {
      disc(c, cx - 1, tipY - 1, r - 2, '#b597e2');
      heart(c, cx, tipY, 5, ...BLACK);
    }
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// cfg: { saludo, parrafos: [...], despedida, firma }
export class Carta {
  constructor(cfg, { onClose } = {}) {
    this.cfg = cfg;
    this.onClose = onClose;
    this.isOpen = false;
  }

  // from: rectángulo en pantalla (px) del sobrecito que salió del buzón
  play(from) {
    if (this.isOpen) return;
    this.isOpen = true;
    const cfg = this.cfg;
    const blocks = [
      cfg.saludo && ['carta-show__saludo', cfg.saludo],
      ...(cfg.parrafos || []).map((t, i) => ['', t, PEGADAS[i]]),
      cfg.despedida && ['carta-show__despedida', cfg.despedida],
      cfg.firma && ['carta-show__firma', cfg.firma],
    ].filter(Boolean);

    const vw = innerWidth, vh = innerHeight;
    const S = Math.max(3, Math.min(9, Math.floor(Math.min((vw * 0.78) / 64, (vh * 0.42) / 40))));

    const root = el('div', 'carta-show');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Una carta para ti');
    const canvas = el('canvas', 'carta-show__sobre');
    canvas.width = EW;
    canvas.height = EH;
    canvas.style.width = `${EW * S}px`;
    canvas.style.height = `${EH * S}px`;
    canvas.style.transformOrigin = `${ECX * S}px ${ECY * S}px`;
    canvas.setAttribute('aria-hidden', 'true');
    // la hoja doblada en tres, para desdoblarla
    const folds = el('div', 'carta-show__pliegues');
    const p2 = el('div', 'carta-show__pliegue dos');
    p2.append(el('div', 'carta-show__pliegue tres'));
    folds.append(el('div', 'carta-show__pliegue uno'), p2);
    const sheet = el('div', 'carta-show__hoja');
    sheet.hidden = true;
    const text = el('div', 'carta-show__texto');
    text.setAttribute('aria-hidden', 'true');
    // Kuromi pegada en la esquina de la hoja
    sheet.append(stickerImg('kuromi', 3, 'calco--esquina'), text);
    const hint = el('p', 'carta-show__pista', 'Toca la hoja para verla completa');
    hint.hidden = true;
    const closeBtn = el('button', 'carta-show__cerrar');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Cerrar la carta');
    closeBtn.innerHTML = CLOSE_ICON;
    const spoken = el('div', 'solo-lectores', blocks.map((b) => b[1]).join('\n\n'));
    root.append(el('div', 'carta-show__fondo'), canvas, folds, sheet, hint, closeBtn, spoken);
    document.body.append(root);
    this.root = root;
    this.timers = [];
    closeBtn.addEventListener('click', () => this.close());
    closeBtn.focus({ preventScroll: true });
    sfx.duckMusic(true);

    /* --- la máquina de escribir --- */
    const cursor = el('span', 'carta-show__cursor');
    let bi = 0, chars = null, ci = 0, node = null, typing = false, done = false;
    // un párrafo, con su calcomanía a un lado si le toca; si se va a escribir
    // a máquina empieza vacío y la calcomanía se pega con su "plop"
    const paragraph = ([cls, str, pegada], typing) => {
      const p = el('p', cls, typing ? null : str);
      if (pegada) {
        const [name, side, turn] = pegada;
        const img = stickerImg(name, 4, `calco--flota calco--${side}`);
        img.style.setProperty('--giro', `${turn}deg`);
        p.prepend(img);
        if (typing) sfx.plop();
      }
      return p;
    };
    const newBlock = () => {
      const p = paragraph(blocks[bi], true);
      node = document.createTextNode('');
      p.append(node, cursor);
      text.append(p);
      chars = Array.from(blocks[bi][1]);
      ci = 0;
    };
    const finish = (natural) => {
      if (done) return;
      done = true;
      typing = false;
      clearTimeout(this.typeTimer);
      if (!natural) {
        text.replaceChildren(...blocks.map((b) => paragraph(b, false)));
        text.lastElementChild?.append(cursor);
      }
      hint.hidden = true;
      sfx.chime(5);
      // al final se van pegando unas calcomanías, una por una
      const follow = sheet.scrollTop + sheet.clientHeight >= sheet.scrollHeight - 48;
      const row = el('div', 'carta-show__calcos');
      ['kuromiGuino', 'p1p2', 'masterchief'].forEach((name, i) => {
        const img = stickerImg(name, 3);
        img.style.setProperty('--giro', `${[-8, 3, 9][i]}deg`);
        img.style.animationDelay = `${0.4 + i * 0.3}s`;
        row.append(img);
        if (!REDUCED) this.timers.push(setTimeout(() => sfx.plop(), 400 + i * 300));
      });
      sheet.append(row);
      if (follow) sheet.scrollTo({ top: sheet.scrollHeight, behavior: REDUCED ? 'auto' : 'smooth' });
    };
    const step = () => {
      if (!this.isOpen || done) return;
      if (!node) newBlock();
      // si ella se quedó leyendo más arriba, no la movemos
      const follow = sheet.scrollTop + sheet.clientHeight >= sheet.scrollHeight - 48;
      const ch = chars[ci++];
      node.data += ch;
      if (ch.trim()) sfx.key();
      if (follow) sheet.scrollTop = sheet.scrollHeight;
      let wait = ch === ' ' ? 20 : /[,;:]/.test(ch) ? 150 : /[.!?…]/.test(ch) ? 300 : 24 + Math.random() * 26;
      if (ci >= chars.length) {
        // fin del párrafo: una pausa y sigue en otro renglón
        node = null;
        if (++bi >= blocks.length) return finish(true);
        wait = 750;
      }
      this.typeTimer = setTimeout(step, wait);
    };
    const startTyping = () => {
      folds.remove();
      sheet.hidden = false;
      if (REDUCED) return finish(false);
      hint.hidden = false;
      typing = true;
      step();
    };
    sheet.addEventListener('click', () => typing && finish(false));
    this.onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if ((e.key === 'Enter' || e.key === ' ') && typing) {
        e.preventDefault();
        finish(false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        closeBtn.focus();
      }
    };
    document.addEventListener('keydown', this.onKey);

    if (REDUCED) {
      canvas.remove();
      return startTyping();
    }

    /* --- el sobre vuela hacia la pantalla y se abre --- */
    const at = (s, fn) => this.timers.push(setTimeout(fn, s * 1000));
    sfx.swish();
    at(T.fly, () => sfx.sparkle());
    at(T.open, () => sfx.plop());
    at(T.open + T.seal, () => sfx.paper());
    at(T.open + T.seal + T.flap, () => sfx.paper());
    at(T.paper, () => folds.classList.add('entra'));
    at(T.unfold, () => {
      folds.classList.add('abierta');
      sfx.paper();
    });
    at(T.unfold + 0.45, () => sfx.paper());
    at(T.type, startTyping);

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const t0 = performance.now();
    const fx = from ? from.x + from.w / 2 : vw / 2, fy = from ? from.y + from.h / 2 : vh;
    const s0 = from ? from.w / 66 : 0.5;
    const tx = vw / 2, ty = vh / 2 + 10;
    const frame = (now) => {
      if (!this.isOpen) return;
      const t = (now - t0) / 1000;
      const k = easeInOut(clamp01(t / T.fly));
      const s = lerp(s0, S, k);
      const cx = lerp(fx, tx, k), cy = lerp(fy, ty, k) - Math.sin(k * Math.PI) * Math.min(90, vh * 0.12);
      const wob = t > T.fly && t < T.fly + 0.5 ? Math.sin((t - T.fly) * 18) * 2.5 * (1 - (t - T.fly) / 0.5) : 0;
      // cuando sale la hoja, el sobre baja y se desvanece
      const out = clamp01((t - T.paper) / 0.45);
      canvas.style.transform = `translate(${cx - ECX * S}px, ${cy - ECY * S + out * 70}px) rotate(${(1 - k) * -16 + wob}deg) scale(${s / S})`;
      canvas.style.opacity = String(1 - out);

      const ko = t - T.open;
      const seal = ko < 0 ? 1 : 1 - clamp01(ko / T.seal);
      const flap = ko < T.seal ? 1 : 1 - 1.8 * easeOut(clamp01((ko - T.seal) / T.flap));
      const slide = ko < T.seal + T.flap ? 0 : 30 * easeOut(clamp01((ko - T.seal - T.flap) / T.slide));
      ctx.clearRect(0, 0, EW, EH);
      envelope(ctx, ECX, ECY, flap, slide, seal);
      // destellos al llegar y al romperse el sello
      const ka = (t - T.fly + 0.1) / 0.8;
      if (ka > 0 && ka < 1) for (let i = 0; i < 8; i++) sparkle(ctx, ECX + Math.cos(i * 0.785) * 37, ECY + Math.sin(i * 0.785) * 24, ka);
      if (ko > 0 && ko < 0.6) for (let i = 0; i < 6; i++) sparkle(ctx, ECX + Math.cos(i * 1.05) * (4 + ko * 24), ECY + 4 + Math.sin(i * 1.05) * (3 + ko * 16), ko / 0.6);
      if (out < 1) this.raf = requestAnimationFrame(frame);
      else canvas.remove();
    };
    this.raf = requestAnimationFrame(frame);
    // por si el navegador deja de animar, que el sobre no se quede estorbando
    at(T.paper + 0.6, () => canvas.remove());
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.timers.forEach(clearTimeout);
    clearTimeout(this.typeTimer);
    cancelAnimationFrame(this.raf);
    document.removeEventListener('keydown', this.onKey);
    sfx.duckMusic(false);
    sfx.swish();
    const root = this.root;
    root.classList.add('saliendo');
    setTimeout(() => root.remove(), 320);
    this.onClose?.();
  }
}
