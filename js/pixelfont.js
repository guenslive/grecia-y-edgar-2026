// Fuente bitmap de 5 px de alto para escribir sobre la madera de los carteles.
// Cada glifo es una lista de filas; '#' es un píxel encendido.
const GLYPHS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##.', '#...', '#.##', '#..#', '.##.'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.##.', '#..#', '#..#', '#.#.', '.#.#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  ' ': ['..', '..', '..', '..', '..'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['.', '.', '.', '#', '#'],
  '!': ['#', '#', '#', '.', '#'],
  '¡': ['#', '.', '#', '#', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  '¿': ['.#.', '...', '.#.', '#..', '.##'],
  "'": ['#', '#', '.', '.', '.'],
  '-': ['...', '...', '###', '...', '...'],
  ':': ['.', '#', '.', '#', '.'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '(': ['.#', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '#.'],
  '&': ['.#..', '#.#.', '.#..', '#.#.', '.#.#'],
  '♥': ['.#.#.', '#####', '#####', '.###.', '..#..'],
};

const ACCENTED = {
  Á: ['A', 'agudo'], É: ['E', 'agudo'], Í: ['I', 'agudo'], Ó: ['O', 'agudo'], Ú: ['U', 'agudo'],
  Ü: ['U', 'dieresis'], Ñ: ['N', 'tilde'],
};

// Alto de una línea: 3 filas para acentos + 5 de letra + 1 de aire.
export const LINE_H = 9;

function glyphFor(ch) {
  if (GLYPHS[ch]) return { rows: GLYPHS[ch], accent: null };
  if (ACCENTED[ch]) return { rows: GLYPHS[ACCENTED[ch][0]], accent: ACCENTED[ch][1] };
  return { rows: GLYPHS[' '], accent: null };
}

export function measure(text) {
  const s = text.toUpperCase();
  let w = 0;
  for (const ch of s) w += glyphFor(ch).rows[0].length + 1;
  return Math.max(0, w - 1);
}

// Dibuja texto con la esquina superior izquierda (incluida la zona de acentos) en x, y.
export function drawText(ctx, text, x, y, color) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const { rows, accent } = glyphFor(ch);
    const w = rows[0].length;
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < w; c++) if (rows[r][c] === '#') ctx.fillRect(cx + c, y + 3 + r, 1, 1);
    }
    if (accent === 'agudo') {
      const m = Math.floor(w / 2);
      ctx.fillRect(cx + m + 1, y, 1, 1);
      ctx.fillRect(cx + m, y + 1, 1, 1);
    } else if (accent === 'tilde') {
      ctx.fillRect(cx + 1, y, 1, 1);
      ctx.fillRect(cx + 3, y, 1, 1);
      ctx.fillRect(cx, y + 1, 1, 1);
      ctx.fillRect(cx + 2, y + 1, 1, 1);
    } else if (accent === 'dieresis') {
      ctx.fillRect(cx, y + 1, 1, 1);
      ctx.fillRect(cx + w - 1, y + 1, 1, 1);
    }
    cx += w + 1;
  }
}

// Parte el texto en líneas que no pasen de maxW píxeles.
export function wrap(text, maxW) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (measure(test) <= maxW || !cur) cur = test;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
