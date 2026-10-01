import * as sfx from './audio.js';
import { makeCanvas, pixelTexture, outlineCanvas, signTexture } from './sprites.js';
import { drawText, measure } from './pixelfont.js';
import { Rf, P, poly, heart, sparkle, BLACK_HEART, createComic } from './historieta.js';
import { sticker, stickerImg } from './calcos.js';

/* =====================================================================
   Las historietas ("Cómo empezó" y "Lo que viene"): de su cartel cuelga
   una revistita de cómic. Al tocarla vuela hacia la pantalla como el sobre
   de la carta, su portada se abre como libro y adentro está la historieta
   con sus viñetas animadas.
   ===================================================================== */

const INK = '#3a1f3d', OUT = '#26141f', OUT_HOVER = '#fff1c8';
const ROPE = '#ead7a4';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const BLACK = [BLACK_HEART.fill, BLACK_HEART.edge, BLACK_HEART.shine];

// una portada de color por historieta: rosa la primera, verde agua (mar) la segunda
const THEMES = [
  { bg: '#f4a6c1', dot: '#ffc4d8', dark: '#b0356b', shadow: '#ffe3ee' },
  { bg: '#8fd3c4', dot: '#b9e8de', dark: '#2f6f8a', shadow: '#e3f7f2' },
];
const theme = (n) => THEMES[(n - 1) % THEMES.length];

// Las calcomanías de cada revista, casi todas de Kuromi: las de la portada
// (con el hueco donde va cada una), dos pegadas en la orilla del marco que
// asoman por fuera, y una en una esquina de abajo de la viñeta, distinta en
// cada página (en la esquina donde no tapa nada del dibujo).
const CALCOS = [
  {
    portada: [['estrella', 'arribaIzq'], ['mono', 'arribaDer'], ['kuromi', 'abajoIzq'], ['ge', 'etiqueta']],
    marco: [['kuromiFeliz', 'arriba', 8], ['calavera', 'abajo', -10]],
    paginas: [['estrella', 'der'], ['corazon', 'izq'], ['fantasma', 'der'], ['murcielago', 'izq'], ['luna', 'der'], ['mono', 'izq'], ['diablito', 'izq']],
  },
  {
    portada: [['luna', 'arribaIzq'], ['diablito', 'arribaDer'], ['kuromiGuino', 'abajoDer'], ['nivel7', 'etiqueta']],
    marco: [['kuromi', 'arriba', 7], ['murcielago', 'abajo', -8]],
    paginas: [['luna', 'der'], ['masterchief', 'izq'], ['corazon', 'der'], ['estrella', 'izq'], ['fantasma', 'der']],
  },
];
const calcos = (n) => CALCOS[(n - 1) % CALCOS.length];

/* ---------------- la chiquita que cuelga del cartel ---------------- */

function paintMini(th, hover) {
  const { c, ctx } = makeCanvas(15, 18);
  const r = (x, y, w, h, col) => Rf(ctx, x, y, w, h, col);
  r(2, 2, 12, 15, '#e8dcc4');              // hojas, asomándose
  r(1, 1, 12, 15, th.bg);                  // portada
  for (let y = 2; y < 15; y += 2) for (let x = 3 + ((y / 2) % 2); x < 12; x += 2) P(ctx, x, y, th.dot);
  r(1, 1, 1, 15, th.dark);                 // lomo
  r(3, 2, 9, 4, '#fff6e8');                // título
  r(4, 3, 7, 1, th.dark);
  r(5, 4, 5, 1, th.dark);
  poly(ctx, [[7.5, 7], [9.5, 9], [11, 10.5], [9.5, 12], [7.5, 14.5], [5.5, 12], [4, 10.5], [5.5, 9]], '#ffd27a');
  heart(ctx, 8, 11, 5, ...BLACK);
  return outlineCanvas(c, hover ? OUT_HOVER : OUT);
}

// El cartel de madera con su historieta colgando de dos hilitos.
// n: qué historieta es (1, 2…), para su color. comic: dónde quedó la revistita.
export function comicSignTexture(text, n, hover = false) {
  const sign = signTexture(text, hover);
  const mini = paintMini(theme(n), hover);
  const W = Math.max(sign.w, mini.width), H = sign.h + 2 + mini.height;
  const { c, ctx } = makeCanvas(W, H);
  ctx.drawImage(sign.tex.image, Math.round((W - sign.w) / 2), 0);
  const mx = Math.round((W - mini.width) / 2);
  ctx.fillStyle = ROPE;
  ctx.fillRect(mx + 4, sign.h - 1, 1, 4);
  ctx.fillRect(mx + mini.width - 5, sign.h - 1, 1, 4);
  ctx.drawImage(mini, mx, sign.h + 2);
  sign.tex.dispose();
  return { tex: pixelTexture(c), w: W, h: H, comic: { x: mx, y: sign.h + 2, w: mini.width, h: mini.height } };
}

/* ---------------- la portada grande ---------------- */

// Texto en letras grandes (z veces), con su sombra clarita de logo de cómic.
function bigText(ctx, text, cx, y, z, col, shadow) {
  const w = measure(text) * z;
  for (const [dx, dy, c] of [[1, 1, shadow], [0, 0, col]]) {
    ctx.save();
    ctx.translate(Math.round(cx - w / 2) + dx, y + dy);
    ctx.scale(z, z);
    drawText(ctx, text, 0, 0, c);
    ctx.restore();
  }
}

// La portada, del mismo tamaño que la página (W×H píxeles de la revista):
// trama de puntitos, lomo, título de logo, estallido con corazón, número y
// código de barras.
function paintCover(title, n, th, W, H) {
  const { c, ctx } = makeCanvas(W, H);
  const r = (x, y, w, h, col) => Rf(ctx, x, y, w, h, col);
  r(0, 0, W, H, INK);
  r(1, 1, W - 2, H - 2, th.bg);
  for (let y = 3; y < H - 2; y += 3) for (let x = 5 + ((y / 3) % 2) * 1.5; x < W - 2; x += 3) P(ctx, Math.round(x), y, th.dot);
  r(1, 1, 3, H - 2, th.dark);
  for (let y = 5; y < H - 4; y += 6) P(ctx, 2, y, th.dot);
  // título en dos renglones, tan grande como quepa
  const words = title.toUpperCase().split(/\s+/);
  const cut = words.length > 1 ? (words[0].length <= 2 ? 2 : 1) : 1;
  const lines = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')].filter(Boolean);
  let z = 3;
  while (z > 1 && Math.max(...lines.map(measure)) * z > W - 16) z--;
  const band = lines.length * 8 * z + 4;
  r(6, 4, W - 10, band, '#fff6e8');
  r(6, 4, W - 10, 1, INK);
  r(6, 4 + band - 1, W - 10, 1, INK);
  lines.forEach((line, i) => bigText(ctx, line, W / 2 + 2, 6 + i * 8 * z, z, th.dark, th.dot));
  // estallido de cómic con un corazón negro, en medio de lo que queda
  const top = 4 + band, bottom = H - 16;
  const cx = W / 2 + 2, cy = Math.round((top + bottom) / 2);
  const R = Math.max(12, Math.min((W - 18) / 2.4, (bottom - top) / 2 - 3));
  const burst = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, rr = k % 2 ? R * 0.62 : R;
    burst.push([cx + Math.cos(a) * rr * 1.15, cy + Math.sin(a) * rr]);
  }
  poly(ctx, burst.map(([x, y]) => [x + 1, y + 1]), '#f28a3c');
  poly(ctx, burst, '#ffd27a');
  const hz = R >= 18 ? 2 : 1;
  ctx.save();
  ctx.translate(Math.round(cx), cy);
  ctx.scale(hz, hz);
  heart(ctx, 0, 0, 9, ...BLACK);
  ctx.restore();
  for (const [x, y] of [[cx - R * 1.3, cy - R * 0.7], [cx + R * 1.25, cy - R * 0.8], [cx + R * 1.2, cy + R * 0.6]]) sparkle(ctx, x, y, 0.8, '#ffffff');
  // número de la revista y código de barras
  const issue = `NO.${n}`;
  r(7, H - 13, measure(issue) + 4, 9, '#fff6e8');
  r(7, H - 13, measure(issue) + 4, 1, INK);
  drawText(ctx, issue, 9, H - 14, INK);
  r(W - 17, H - 13, 12, 9, '#ffffff');
  for (let x = 0; x < 10; x++) if ((x * 7) % 3) r(W - 16 + x, H - 12, 1, 6, INK);
  // las calcomanías, pegadas encima en las esquinas alrededor del estallido;
  // el letrerito, abajo entre el número y el código (si cabe)
  const gap = [7 + measure(issue) + 6, W - 19];
  for (const [name, spot] of calcos(n).portada) {
    const s = sticker(name);
    const at = {
      arribaIzq: [5, top + 1],
      arribaDer: [W - s.width - 3, top + 1],
      abajoIzq: [5, bottom - s.height + 1],
      abajoDer: [W - s.width - 3, bottom - s.height + 1],
      etiqueta: [Math.round((gap[0] + gap[1] - s.width) / 2), H - 14],
    }[spot];
    if (spot === 'etiqueta' && s.width > gap[1] - gap[0]) continue;
    ctx.drawImage(s, ...at);
  }
  return c;
}

// Encabezado de la página: el título con la misma letra y colores de la
// portada, en su banda blanca, y el número de la revista en su recuadro.
function paintLogo(title, n, th) {
  const text = title.toUpperCase(), issue = `NO.${n}`;
  const tw = measure(text), iw = measure(issue);
  const W = tw + iw + 17, H = 13;
  const { c, ctx } = makeCanvas(W, H);
  const r = (x, y, w, h, col) => Rf(ctx, x, y, w, h, col);
  r(0, 0, W, H, INK);
  r(0, 1, W, H - 2, '#fff6e8');
  drawText(ctx, text, 4, 2, th.dot);
  drawText(ctx, text, 3, 1, th.dark);
  r(W - iw - 8, 2, iw + 6, H - 4, INK);
  r(W - iw - 7, 3, iw + 4, H - 6, th.bg);
  drawText(ctx, issue, W - iw - 5, 1, INK);
  return c;
}

/* ---------------- la historieta en primer plano ---------------- */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const CLOSE_ICON = '<svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h2v1H0zM1 1h2v1H1zM2 2h3v3H2zM4 1h2v1H4zM5 0h2v1H5zM1 5h2v1H1zM0 6h2v1H0zM4 5h2v1H4zM5 6h2v1H5z"/></svg>';
const T = { fly: 1, open: 1.2, done: 2.3 };

export class Libro {
  constructor({ onClose } = {}) {
    this.onClose = onClose;
    this.isOpen = false;
  }

  // cfg: el cartel (texto, titulo, historieta); n: qué historieta es (1, 2…);
  // from: rectángulo en pantalla (px) de la revistita que cuelga del cartel
  play(cfg, n, from) {
    if (this.isOpen) return;
    this.isOpen = true;
    const th = theme(n);
    const vw = innerWidth, vh = innerHeight;
    // un píxel de la revista (el mismo en la portada y en la página)
    const p = Math.max(3, Math.min(5, Math.floor(Math.min((vw * 0.62) / 62, (vh * 0.62) / 84))));
    // y el de las calcomanías, más finito
    const sp = (this.sp = Math.max(2, p - 2));

    const root = el('div', 'libro-show');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', cfg.titulo || cfg.texto);
    for (const [k, v] of [['--p', `${p}px`], ['--tema', th.bg], ['--tema-oscuro', th.dark], ['--tema-punto', th.dot], ['--tema-claro', th.shadow]]) {
      root.style.setProperty(k, v);
    }
    // el libro: la página con la historieta ya adentro y, encima, la portada
    const book = el('div', 'libro-show__libro');
    const page = el('div', 'libro-show__hoja');
    const paper = el('div', 'libro-show__papel');
    const logo = paintLogo(cfg.titulo || cfg.texto, n, th);
    logo.className = 'libro-show__logo';
    logo.setAttribute('aria-hidden', 'true');
    logo.style.width = `${logo.width * p}px`;
    paper.append(el('h2', 'solo-lectores', cfg.titulo || cfg.texto), logo);
    page.append(paper);
    book.append(page);
    const closeBtn = el('button', 'libro-show__cerrar');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Cerrar la historieta');
    closeBtn.innerHTML = CLOSE_ICON;
    root.append(el('div', 'libro-show__fondo'), book, closeBtn);
    document.body.append(root);
    this.root = root;
    this.timers = [];
    closeBtn.addEventListener('click', () => this.close());

    // la historieta, quieta hasta que se abre la portada; al cambiar de
    // viñeta se voltea la hoja
    this.comic = createComic(cfg.historieta, {
      paused: true,
      turn: (dir, swap) => this.turnPage(page, paper, dir, swap),
      onShow: (i, frame) => this.pageSticker(frame, n, i),
    });
    paper.append(this.comic.el);
    // los botones y el número de página van afuera del libro, abajo
    const nav = this.comic.el.querySelector('.comic__nav');
    nav.classList.add('libro-show__nav');
    root.append(nav);
    // ancho fijo, en píxeles de la revista
    const bw = Math.floor(Math.min(vw * 0.94, 576) / p) * p;
    book.style.width = `${bw}px`;
    window.dispatchEvent(new Event('resize'));
    // que todas las páginas midan lo mismo y quepan completas, sin scroll: el
    // recuadro del texto y la nota apartan el lugar del más largo
    for (const [sel, key] of [['.comic__texto', 'texto'], ['.comic__nota', 'nota']]) {
      const box = paper.querySelector(sel);
      const probe = box.cloneNode(false);
      probe.hidden = false;
      probe.style.visibility = 'hidden';
      box.after(probe);
      let tallest = 0;
      for (const panel of cfg.historieta) {
        probe.textContent = panel[key] || '';
        tallest = Math.max(tallest, probe.offsetHeight);
      }
      probe.remove();
      box.style.minHeight = `${tallest}px`;
    }
    // alto: el papel completo más el marco de arriba y de abajo
    const pad = getComputedStyle(page);
    const bh = Math.ceil((parseFloat(pad.paddingTop) + paper.offsetHeight + parseFloat(pad.paddingBottom)) / p) * p;
    book.style.height = `${bh}px`;
    // centrado con los botones abajo; si no cabe, el libro se encoge
    const thick = p * 3, gap = 18, navH = nav.offsetHeight;
    const fz = Math.min(1, (vh * 0.95 - thick - gap - navH) / bh, (vw * 0.96) / (bw + thick));
    const top = Math.max(6, (vh - (bh * fz + thick + gap + navH)) / 2);
    const tx = (vw - bw) / 2, ty = top + (bh * fz) / 2 - bh / 2;
    const rest = `translate(${tx}px, ${ty}px) scale(${fz})`;
    Object.assign(nav.style, { top: `${top + bh * fz + thick + gap}px`, width: `${Math.min(bw * fz, vw - 24)}px` });
    // dos calcomanías pegadas en la orilla del marco, asomándose por fuera
    // hasta donde deje el espacio libre alrededor del libro
    const roomX = (vw - bw * fz) / 2 / fz - 6, roomY = top / fz - 6;
    const out = (size, k, room) => `${-Math.max(0, Math.min(Math.round(size * k), room))}px`;
    const stuck = calcos(n).marco.map(([name, where, rot]) => {
      const img = stickerImg(name, sp, 'calco--marco');
      if (where === 'arriba') {
        img.style.right = out(img.width, 0.36, roomX);
        img.style.top = out(img.height, 0.5, roomY);
      } else {
        img.style.left = out(img.width, 0.18, roomX);
        img.style.bottom = out(img.height, 0.34, Infinity);
      }
      img.style.setProperty('--giro', `${rot}deg`);
      page.append(img);
      return img;
    });

    this.onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Tab') {
        // el foco se queda dentro de la historieta
        const f = [...root.querySelectorAll('button:not([disabled])')].filter((b) => b.tabIndex >= 0);
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
      }
    };
    document.addEventListener('keydown', this.onKey);
    closeBtn.focus({ preventScroll: true });
    const ready = () => nav.querySelector('.comic__boton--siguiente')?.focus({ preventScroll: true });

    if (REDUCED || !from) {
      book.style.transform = rest;
      this.comic.play();
      return ready();
    }
    nav.classList.add('oculta');

    // la portada, al tamaño exacto de la página, con su reverso
    const lid = el('div', 'libro-show__tapa');
    const front = paintCover(cfg.texto, n, th, bw / p, bh / p);
    front.className = 'libro-show__frente';
    front.setAttribute('aria-hidden', 'true');
    lid.append(front, el('div', 'libro-show__dorso'));
    book.append(lid);

    // vuela desde el cartel hasta el centro, se asienta y se abre como libro:
    // al abrirse, la historieta ya está ahí y empieza a contarse
    const at = (s, fn) => this.timers.push(setTimeout(fn, s * 1000));
    sfx.swish();
    at(T.fly, () => sfx.sparkle());
    at(T.open, () => {
      this.comic.play();
      lid.classList.add('abierta');
      nav.classList.remove('oculta');
      sfx.paper();
    });
    // las del marco se pegan ya que se abrió la portada
    stuck.forEach((img, k) => {
      img.hidden = true;
      at(T.open + 0.55 + k * 0.25, () => {
        img.hidden = false;
        img.classList.add('pega');
        sfx.plop();
      });
    });
    at(T.done, () => {
      lid.remove();
      ready();
    });

    const fx = from.x + from.w / 2, fy = from.y + from.h / 2, s0 = from.w / bw;
    const t0 = performance.now();
    let last = 0;
    const frame = (now) => {
      if (!this.isOpen) return;
      const t = (now - t0) / 1000;
      last = t;
      const k = easeInOut(clamp01(t / T.fly));
      const s = lerp(s0, fz, k);
      const cx = lerp(fx, tx + bw / 2, k), cy = lerp(fy, ty + bh / 2, k) - Math.sin(k * Math.PI) * Math.min(90, vh * 0.12);
      const wob = t > T.fly && t < T.fly + 0.35 ? Math.sin((t - T.fly) * 18) * 2 * (1 - (t - T.fly) / 0.35) : 0;
      book.style.transform = `translate(${cx - bw / 2}px, ${cy - bh / 2}px) scale(${s}) rotate(${(1 - k) * 14 + wob}deg)`;
      if (t < T.fly + 0.4) this.raf = requestAnimationFrame(frame);
      else book.style.transform = rest;
    };
    this.raf = requestAnimationFrame(frame);
    // por si el navegador deja de animar, que el libro quede en su lugar
    at(T.fly + 0.45, () => {
      if (last < T.fly + 0.4) book.style.transform = rest;
    });
  }

  // La calcomanía de la página i, en una esquina de abajo de la viñeta: al
  // voltear la hoja se va con ella y en la que sigue ya está la suya.
  pageSticker(frame, n, i) {
    frame.querySelector('.calco')?.remove();
    const list = calcos(n).paginas, [name, side] = list[i % list.length], der = side === 'der';
    const img = stickerImg(name, this.sp, 'calco--vineta');
    img.style[der ? 'right' : 'left'] = `${-Math.round(img.width * 0.45)}px`;
    img.style.bottom = `${-Math.round(img.height * 0.5)}px`;
    img.style.setProperty('--giro', `${(der ? 1 : -1) * (6 + ((i * 3) % 5))}deg`);
    frame.append(img);
  }

  // Voltea la hoja: una copia de cómo se ve ahora se levanta desde la orilla y
  // gira sobre el lomo (hacia atrás, sobre la otra orilla), y debajo ya está
  // la siguiente viñeta.
  turnPage(page, paper, dir, swap) {
    this.sheet?.remove();
    const ghost = paper.cloneNode(true);
    ghost.setAttribute('aria-hidden', 'true');
    ghost.querySelectorAll('button').forEach((b) => (b.tabIndex = -1));
    const src = paper.querySelectorAll('canvas'), dst = ghost.querySelectorAll('canvas');
    src.forEach((c, k) => dst[k].getContext('2d').drawImage(c, 0, 0));
    const sheet = el('div', 'libro-show__vuelta');
    Object.assign(sheet.style, {
      left: `${paper.offsetLeft}px`, top: `${paper.offsetTop}px`,
      width: `${paper.offsetWidth}px`, height: `${paper.offsetHeight}px`,
      transformOrigin: dir > 0 ? 'left center' : 'right center',
    });
    sheet.append(ghost);
    page.append(sheet);
    this.sheet = sheet;
    swap();
    sfx.paper();
    if (REDUCED) return sheet.remove();
    sheet.animate(
      [
        { transform: 'rotateY(0deg)', filter: 'brightness(1)' },
        { transform: `rotateY(${dir > 0 ? -100 : 100}deg)`, filter: 'brightness(.65)' },
      ],
      { duration: 560, easing: 'cubic-bezier(.45, 0, .75, .55)' },
    ).onfinish = () => sheet.remove();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.timers.forEach(clearTimeout);
    cancelAnimationFrame(this.raf);
    document.removeEventListener('keydown', this.onKey);
    this.comic?.destroy();
    this.comic = null;
    this.sheet = null;
    sfx.swish();
    const root = this.root;
    root.classList.add('saliendo');
    setTimeout(() => root.remove(), 320);
    this.onClose?.();
  }
}
