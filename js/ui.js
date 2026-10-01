import { createComic } from './historieta.js';

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('es-MX');

export class UI {
  constructor(cfg) {
    this.cfg = cfg;
    this.intro = $('intro');
    this.pista = $('pista');
    this.etiquetas = $('etiquetas');
    this.final = $('final');
    this.pistaCarteles = $('pista-carteles');
    this.globo = $('globo');
    this.nubes = $('nubes');
    this.zonas = $('zonas-carteles');
    this.modal = $('modal');
    this.panel = this.modal.querySelector('.modal__panel');
    this.labels = [];
    this.signButtons = [];

    this.modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-cerrar]')) this.closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (this.modal.hidden) return;
      if (e.key === 'Escape') this.closeModal();
      if (e.key === 'Tab') this.trapFocus(e);
    });
  }

  fmt(s) {
    return (s || '').replaceAll('{nombre}', this.cfg.nombre || '');
  }

  hideLoading() {
    const el = $('cargando');
    if (!el || el.classList.contains('fuera')) return;
    el.classList.add('fuera');
    setTimeout(() => el.remove(), 700);
  }

  typeIntro(speed = 1) {
    const text = this.fmt(this.cfg.intro);
    // el cursor no ocupa lugar (se dibuja encima) y lo que falta por escribirse
    // va invisible: así el cuadro mide desde el principio lo que medirá al
    // final y las palabras no saltan de renglón mientras se escriben
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    cursor.setAttribute('aria-hidden', 'true');
    const out = document.createTextNode('');
    const rest = document.createElement('span');
    rest.className = 'intro__resto';
    rest.textContent = text;
    this.intro.replaceChildren(out, cursor, rest);
    let i = 0;
    return new Promise((resolve) => {
      const step = () => {
        if (this.introGone) return resolve();
        out.textContent = text.slice(0, ++i);
        rest.textContent = text.slice(i);
        if (i < text.length) setTimeout(step, (/[,.]/.test(text[i - 1]) ? 260 : 55) / speed);
        else resolve();
      };
      setTimeout(step, 500 / speed);
    });
  }

  hideIntro() {
    this.introGone = true;
    this.intro.classList.add('fuera');
    this.pista.hidden = true;
  }

  showHint(x, y) {
    if (this.introGone) return;
    if (this.pista.hidden) {
      this.pista.textContent = this.fmt(this.cfg.pista);
      this.pista.hidden = false;
    }
    this.pista.style.left = x + 'px';
    this.pista.style.top = y + 'px';
  }

  createLabels(anios) {
    this.labels = anios.map(({ anio, nota }) => {
      const el = document.createElement('div');
      el.className = 'etiqueta';
      el.hidden = true;
      const box = document.createElement('div');
      box.className = 'etiqueta__caja';
      const y = document.createElement('span');
      y.className = 'etiqueta__anio';
      y.textContent = anio;
      box.append(y);
      if (nota) {
        const n = document.createElement('span');
        n.className = 'etiqueta__nota';
        n.textContent = this.fmt(nota);
        box.append(n);
      }
      el.append(box);
      this.etiquetas.append(el);
      return el;
    });
  }

  showLabel(i) {
    const el = this.labels[i];
    if (el) el.hidden = false;
  }

  placeLabel(i, x, y) {
    const el = this.labels[i];
    if (el && !el.hidden) el.style.transform = `translate(${x}px, ${y}px)`;
  }

  dissolveLabels() {
    this.labels.forEach((el, i) => {
      setTimeout(() => el.classList.add('etiqueta--disuelta'), i * 90);
      setTimeout(() => el.remove(), 1400 + i * 90);
    });
  }

  showFinal() {
    if (!this.final.hidden) return;
    // el título como logo, con el número (el 7) aparte para pintarlo dorado
    $('final-titulo').replaceChildren(...this.fmt(this.cfg.titulo).split(/(\d+)/).filter(Boolean).map((part) => {
      if (!/^\d+$/.test(part)) return part;
      const n = document.createElement('span');
      n.className = 'final__num';
      n.textContent = part;
      return n;
    }));
    $('final-sub').textContent = this.fmt(this.cfg.subtitulo);
    this.final.hidden = false;

    // el contador, como marcador de videojuego: una casilla por unidad (el
    // lector de pantalla lee la frase completa)
    const UNITS = [['día', 'días'], ['hora', 'horas'], ['minuto', 'minutos'], ['segundo', 'segundos']];
    const make = (tag, cls, text) => {
      const e = document.createElement(tag);
      e.className = cls;
      if (text) e.textContent = text;
      return e;
    };
    const lead = make('p', 'final__llevamos', 'llevamos juntos');
    const board = make('div', 'final__marcador');
    lead.setAttribute('aria-hidden', 'true');
    board.setAttribute('aria-hidden', 'true');
    const cells = UNITS.map(() => {
      const num = make('b', 'final__numero'), unit = make('span', 'final__unidad');
      const cell = make('span', 'final__casilla');
      cell.append(num, unit);
      board.append(cell);
      return { num, unit };
    });
    const said = make('p', 'solo-lectores');
    $('final-contador').replaceChildren(lead, board, said);
    const start = new Date(this.cfg.inicio);
    const plural = (n, [a, b]) => `${nf.format(n)} ${n === 1 ? a : b}`;
    const tick = () => {
      let s = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
      const d = Math.floor(s / 86400); s -= d * 86400;
      const h = Math.floor(s / 3600); s -= h * 3600;
      const m = Math.floor(s / 60); s -= m * 60;
      [d, h, m, s].forEach((v, k) => {
        cells[k].num.textContent = k ? String(v).padStart(2, '0') : nf.format(v);
        cells[k].unit.textContent = UNITS[k][v === 1 ? 0 : 1];
      });
      said.textContent = `Llevamos ${plural(d, UNITS[0])}, ${plural(h, UNITS[1])}, ${plural(m, UNITS[2])} y ${plural(s, UNITS[3])} juntos.`;
    };
    tick();
    setInterval(tick, 1000);
  }

  showSignHint() {
    if (this.signHintDone) return;
    this.pistaCarteles.textContent = this.fmt(this.cfg.pistaCarteles);
    this.pistaCarteles.hidden = false;
  }

  hideSignHint() {
    this.signHintDone = true;
    this.pistaCarteles.hidden = true;
  }

  // Botones invisibles sobre los carteles: dan foco con teclado y lector de pantalla.
  createSignButtons(items, onPress) {
    this.signButtons = items.map((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'zona-invisible';
      b.hidden = true;
      b.setAttribute('aria-label', 'Abrir cartel: ' + (it.titulo || it.texto));
      b.addEventListener('click', () => onPress(i));
      this.zonas.append(b);
      return b;
    });
  }

  placeZone(el, rect, px, visible) {
    if (!el) return;
    el.hidden = !visible;
    if (!visible) return;
    el.style.transform = `translate(${rect.x * px}px, ${rect.y * px}px)`;
    el.style.width = rect.w * px + 'px';
    el.style.height = rect.h * px + 'px';
  }

  // Nubecita de pensamiento junto a algo de la escena (ver Nube, abajo).
  nube(text, opts) {
    const el = document.createElement('div');
    el.className = 'nubecita';
    el.setAttribute('aria-hidden', 'true');
    el.hidden = true;
    this.nubes.append(el);
    return new Nube(el, this.fmt(text), opts);
  }

  bubble(text, x, y) {
    this.globo.textContent = text;
    this.globo.hidden = false;
    this.globo.style.left = x + 'px';
    this.globo.style.top = y + 'px';
    this.globo.style.animation = 'none';
    void this.globo.offsetWidth;
    this.globo.style.animation = '';
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => (this.globo.hidden = true), 3200);
  }

  openModal(c) {
    this.lastFocus = document.activeElement;
    $('modal-antetitulo').textContent = this.fmt(c.antetitulo || '');
    $('modal-titulo').textContent = this.fmt(c.titulo || c.texto);
    const body = $('modal-cuerpo');
    body.innerHTML = this.fmt(c.contenido || '');
    if (c.historieta?.length) {
      this.comic = createComic(c.historieta);
      body.prepend(this.comic.el);
    }
    this.panel.classList.toggle('modal__panel--ancho', !!c.historieta?.length);
    if (c.fotos?.length) {
      const grid = document.createElement('div');
      grid.className = 'fotos';
      for (const f of c.fotos) {
        const fig = document.createElement('figure');
        fig.className = 'foto';
        if (f.src) {
          const img = document.createElement('img');
          img.src = f.src;
          img.alt = f.pie || '';
          img.loading = 'lazy';
          fig.append(img);
        } else {
          const ph = document.createElement('div');
          ph.className = 'foto__vacia';
          ph.textContent = 'Aquí va una foto';
          fig.append(ph);
        }
        if (f.pie) {
          const cap = document.createElement('figcaption');
          cap.textContent = this.fmt(f.pie);
          fig.append(cap);
        }
        grid.append(fig);
      }
      body.append(grid);
    }
    this.modal.hidden = false;
    this.panel.scrollTop = 0;
    this.panel.style.animation = 'none';
    void this.panel.offsetWidth;
    this.panel.style.animation = '';
    this.modal.querySelector('.modal__cerrar').focus({ preventScroll: true });
  }

  closeModal() {
    if (this.modal.hidden) return;
    this.modal.hidden = true;
    this.comic?.destroy();
    this.comic = null;
    this.lastFocus?.focus?.({ preventScroll: true });
  }

  get modalOpen() {
    return !this.modal.hidden;
  }

  trapFocus(e) {
    const f = [...this.panel.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

/* ---------------- nubecitas de pensamiento ---------------- */

// De la orilla de la nube a lo que piensa: 1 px de aire, la bolita mediana
// (6 px), 1 px, la chiquita (4 px) y 1 px más.
const TRAIL = 13;
const LADOS = ['arriba', 'arriba-izq', 'arriba-der', 'derecha', 'izquierda', 'abajo'];
let PAL = null;
const palette = () => (PAL ||= {
  paper: '#fff7ea',
  light: '#ffffff',
  shade: '#ecd9bf',
  ink: getComputedStyle(document.documentElement).getPropertyValue('--tinta').trim() || '#3a1f3d',
  shadow: 'rgba(15, 20, 51, .35)',
});

const mk = (tag, cls) => {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
};
const overlapArea = (a, b) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

// Pinta en c una figura de píxeles (mask[y * W + x]) como algodón: relleno
// claro, brillo arriba, sombrita abajo, contorno de tinta y sombra de 2 px.
// Devuelve la orilla del contorno: por columna, su primera y última fila; por
// fila, su primera y última columna (-1: vacía).
function paintPuff(c, W, H, mask) {
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const pal = palette();
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
  const edge = (x, y) => !at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1));
  const top = new Array(W).fill(-1), bottom = new Array(W).fill(-1);
  const left = new Array(H).fill(-1), right = new Array(H).fill(-1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let col;
      if (at(x, y)) col = !at(x, y + 1) ? pal.shade : !at(x, y - 1) ? pal.light : pal.paper;
      else if (edge(x, y)) col = pal.ink;
      else if (at(x, y - 1) || edge(x, y - 1) || at(x, y - 2) || edge(x, y - 2)) col = pal.shadow;
      else continue;
      if (col !== pal.shadow) {
        if (top[x] < 0) top[x] = y;
        bottom[x] = y;
        if (left[y] < 0) left[y] = x;
        right[y] = x;
      }
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return { top, bottom, left, right };
}

// Nube de pensamiento alrededor de un texto de tw×th px: un óvalo cuadradito
// (superelipse) con borreguitos redondos por toda la orilla, más grandes
// arriba, como cúmulo.
function cloudMask(tw, th) {
  const a = tw / 2 + 2, b = th / 2 + 1.5;
  // la orilla del óvalo, con lo que se lleva recorrido en cada punto
  const edge = [];
  let len = 0;
  for (let k = 0; k <= 720; k++) {
    const t = (k / 720) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
    const x = a * Math.sign(c) * Math.sqrt(Math.abs(c)), y = b * Math.sign(sn) * Math.sqrt(Math.abs(sn));
    if (k) len += Math.hypot(x - edge[k - 1][0], y - edge[k - 1][1]);
    edge.push([x, y, len]);
  }
  const n = Math.max(7, Math.round(len / 7.5));
  const puffs = [];
  for (let i = 0, j = 0; i < n; i++) {
    const want = ((i + 0.5) / n) * len;
    while (edge[j][2] < want) j++;
    const [x, y] = edge[j];
    puffs.push([x, y, 4.3 - (y / b) * 0.7 + (i % 2 ? -0.35 : 0.35)]);
  }
  let x0 = -a, x1 = a, y0 = -b, y1 = b;
  for (const [x, y, r] of puffs) {
    x0 = Math.min(x0, x - r);
    x1 = Math.max(x1, x + r);
    y0 = Math.min(y0, y - r);
    y1 = Math.max(y1, y + r);
  }
  const ox = 1 - Math.floor(x0), oy = 1 - Math.floor(y0);
  const W = Math.ceil(x1) + ox + 2, H = Math.ceil(y1) + oy + 4;
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5 - ox, py = y + 0.5 - oy;
      const inside = (px / a) ** 4 + (py / b) ** 4 <= 1 || puffs.some(([bx, by, r]) => (px - bx) ** 2 + (py - by) ** 2 <= r * r);
      mask[y * W + x] = inside ? 1 : 0;
    }
  }
  return { W, H, mask, text: { x: ox - tw / 2, y: oy - th / 2 }, mid: Math.round(oy - 0.5) };
}

// Parte el texto en dos renglones parejitos, para que la nube quede redondita.
function twoLines(text) {
  const t = text.trim();
  if (t.length < 14) return t;
  let cut = -1, longest = Infinity;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === ' ' && Math.max(i, t.length - i - 1) < longest) [cut, longest] = [i, Math.max(i, t.length - i - 1)];
  }
  return cut < 0 ? t : `${t.slice(0, cut)}\n${t.slice(cut + 1)}`;
}

// Bolita del rastro de pensamiento: d = 6 (mediana) o 4 (chiquita), con contorno.
function dotMask(d) {
  const W = d, H = d + 2, c = d / 2, r2 = d === 6 ? 3.61 : 1.44;
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) mask[y * W + x] = (x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2 <= r2 ? 1 : 0;
  }
  return { W, H, mask };
}

// Dónde va la nube según el lado: x, y (esquina de su dibujo), el punto de su
// orilla de donde salen las bolitas (bx, by) y el del objeto al que llegan
// (ax, ay). o: la parte del objeto que "piensa"; cl: medidas de la nube.
function spot(lado, o, cl, vw) {
  const [v, h] = lado.split('-');
  const cx = Math.round(o.x + o.w / 2), cy = Math.round(o.y + o.h / 2);
  if (v === 'derecha' || v === 'izquierda') {
    const right = v === 'derecha';
    const ax = right ? o.x + o.w : o.x - 1;
    const bx = right ? ax + TRAIL : ax - TRAIL;
    return { x: bx - (right ? cl.left[cl.mid] : cl.right[cl.mid]), y: cy - cl.mid, ax, ay: cy, bx, by: cy };
  }
  const up = v === 'arriba';
  const ax = h === 'izq' ? o.x + 2 : h === 'der' ? o.x + o.w - 3 : cx;
  const ay = up ? o.y - 1 : o.y + o.h;
  const dx = h === 'izq' ? -6 : h === 'der' ? 6 : 0, dy = h ? 12 : TRAIL;
  // en diagonal las bolitas salen cerca de la punta de la nube; derecho, del centro
  const want = ax + dx;
  let x = h === 'izq' ? want - (cl.xr - 9) : h === 'der' ? want - (cl.xl + 9) : want - Math.round((cl.xl + cl.xr) / 2);
  x = Math.max(3 - cl.xl, Math.min(Math.floor(vw) - 4 - cl.xr, x));
  const col = Math.max(cl.xl + 7, Math.min(cl.xr - 7, want - x));
  const by = up ? ay - dy : ay + dy;
  return { x, y: by - (up ? cl.bottom[col] : cl.top[col]), ax, ay, bx: x + col, by };
}

// Nubecita de pensamiento: una nube esponjosa con su texto y dos bolitas que
// bajan hacia lo que la "piensa" (rectángulos en píxeles del render). Prueba
// los lados en orden y se queda en el primero libre; solo cambia de lado si
// algo se le pone enfrente, para que no brinque mientras los colgantes se mecen.
// box(lado, rect): qué parte del objeto señala; sides: lista de lados o
// función (rect, vw) que la devuelve.
class Nube {
  constructor(el, text, { box = (lado, r) => r, sides = LADOS } = {}) {
    this.el = el;
    this.box = box;
    this.sides = sides;
    this.body = mk('div', 'nubecita__nube');
    this.shape = mk('canvas', 'nubecita__forma');
    this.label = mk('span', 'nubecita__texto');
    this.label.textContent = twoLines(text);
    this.body.append(this.shape, this.label);
    this.big = mk('canvas', 'nubecita__punto nubecita__punto--mediana');
    this.small = mk('canvas', 'nubecita__punto nubecita__punto--chica');
    el.append(this.body, this.big, this.small);
    this.px = 0;
    this.lado = null;
    this.rect = null;
    // si la letra llega después, se vuelve a medir
    document.fonts?.ready.then(() => (this.px = 0));
  }

  // mide el texto y dibuja la nube a la escala de ahora (px CSS por píxel)
  measure(px) {
    if (this.px === px) return;
    this.px = px;
    const el = this.el, was = el.hidden;
    el.style.visibility = 'hidden';
    el.hidden = false;
    const lw = this.label.offsetWidth, lh = this.label.offsetHeight;
    el.hidden = was;
    el.style.visibility = '';
    const tw = Math.ceil(lw / px), th = Math.ceil(lh / px);
    const s = cloudMask(tw, th);
    const { top, bottom, left, right } = paintPuff(this.shape, s.W, s.H, s.mask);
    const cols = top.flatMap((v, x) => (v >= 0 ? [x] : []));
    this.cl = {
      w: s.W, h: s.H, mid: s.mid, top, bottom, left, right,
      xl: cols[0], xr: cols[cols.length - 1],
      y0: Math.min(...cols.map((x) => top[x])), y1: Math.max(...bottom) + 3,
    };
    Object.assign(this.body.style, { width: `${s.W * px}px`, height: `${s.H * px}px` });
    this.label.style.left = `${s.text.x * px + (tw * px - lw) / 2}px`;
    this.label.style.top = `${s.text.y * px + (th * px - lh) / 2}px`;
    for (const [c, d] of [[this.big, 6], [this.small, 4]]) {
      const m = dotMask(d);
      paintPuff(c, m.W, m.H, m.mask);
      Object.assign(c.style, { width: `${m.W * px}px`, height: `${m.H * px}px` });
    }
    this.lado = null;
    this.pos = '';
  }

  // lo que ocupa arriba del objeto (nube y bolitas), en píxeles del render
  footprint(px) {
    this.measure(px);
    return { w: this.cl.xr - this.cl.xl + 1, h: this.cl.y1 - this.cl.y0 + TRAIL };
  }

  // lo que ocupa en cierto lugar (nube, bolitas y un poquito de aire)
  area(s) {
    const cl = this.cl;
    const x0 = Math.min(s.x + cl.xl, Math.min(s.ax, s.bx) - 3), x1 = Math.max(s.x + cl.xr + 1, Math.max(s.ax, s.bx) + 4);
    const y0 = Math.min(s.y + cl.y0, Math.min(s.ay, s.by) - 3), y1 = Math.max(s.y + cl.y1, Math.max(s.ay, s.by) + 4);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  place(rect, px, visible, avoid = []) {
    const el = this.el;
    if (!visible) {
      el.hidden = true;
      this.lado = null;
      this.rect = null;
      return;
    }
    this.measure(px);
    const shown = !el.hidden;
    el.hidden = false;
    const vw = window.innerWidth / px, vh = window.innerHeight / px;
    const at = (lado) => spot(lado, this.box(lado, rect), this.cl, vw);
    // cuánto estorba en cada lado: salirse de la pantalla cuesta mucho más
    // que encimarse un poquito con algo
    const cost = (lado) => {
      const f = this.area(at(lado));
      const r = { x: f.x - 2, y: f.y - 2, w: f.w + 4, h: f.h + 4 };
      let c = (r.w * r.h - overlapArea(r, { x: 0, y: 0, w: vw, h: vh })) * 50;
      for (const a of avoid) if (a) c += overlapArea(r, a);
      return c;
    };
    const now = this.lado ? cost(this.lado) : Infinity;
    if (now > 0) {
      const sides = typeof this.sides === 'function' ? this.sides(rect, vw) : this.sides;
      let best = sides[0], least = Infinity;
      for (const lado of sides) {
        const c = cost(lado);
        if (c < least) [best, least] = [lado, c];
        if (c === 0) break;
      }
      // si en ningún lado cabe del todo, solo se cambia si el otro es mucho mejor
      if (!this.lado || least === 0 || now > least * 1.5 + 20) {
        if (best !== this.lado) {
          if (shown && this.lado) this.pop();
          this.lado = best;
          el.dataset.lado = best;
        }
      }
    }
    const s = at(this.lado);
    this.rect = this.area(s);
    const pos = `${s.x},${s.y},${s.bx},${s.by},${s.ax},${s.ay}`;
    if (pos === this.pos) return;
    this.pos = pos;
    el.style.transform = `translate(${s.x * px}px, ${s.y * px}px)`;
    // las bolitas, de la orilla de la nube hacia el objeto
    const dx = s.ax - s.bx, dy = s.ay - s.by, L = Math.hypot(dx, dy) || 1;
    const put = (c, d, dist) => {
      c.style.left = `${(Math.round(s.bx + 0.5 + (dx * dist) / L - d / 2) - s.x) * px}px`;
      c.style.top = `${(Math.round(s.by + 0.5 + (dy * dist) / L - d / 2) - s.y) * px}px`;
    };
    put(this.big, 6, 4.5);
    put(this.small, 4, 10.5);
    this.body.style.setProperty('--origen', `${(s.bx - s.x + 0.5) * px}px ${(s.by - s.y + 0.5) * px}px`);
  }

  // al cambiarse de lado vuelve a brotar, como un pensamiento nuevo
  pop() {
    for (const n of [this.body, this.big, this.small]) {
      n.style.animation = 'none';
      void n.offsetWidth;
      n.style.animation = '';
    }
  }
}
