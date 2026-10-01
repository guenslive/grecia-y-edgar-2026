import { makeCanvas } from './sprites.js';
import { drawText, measure } from './pixelfont.js';

/* =====================================================================
   Calcomanías en pixel art para decorar la maquinita, la grabadora, el
   sobre, la carta y las historietas: casi todas de Kuromi (la favorita de ella) y unas
   cuantas de videojuegos (lo de él), como el casco de Master Chief. Cada
   una lleva su orilla blanca troquelada y una sombrita, como pegada encima.
   ===================================================================== */

const PAL = {
  k: '#1d171f', K: '#3d3446', w: '#ffffff', b: '#ffb3c8',
  // Kuromi: contorno negro, capucha gris muy oscuro, calaverita y chapitas rosas
  n: '#0c0a0e', d: '#241f28', s: '#e889b9', c: '#eba5c9',
  p: '#ff8fb0', r: '#f25a8c',
  l: '#b597e2', L: '#8a6cc2', g: '#8fd3c4', e: '#9a8fa6', v: '#dccbf7',
  // casco de Master Chief: dos verdes y el visor dorado y amarillo
  M: '#1b5e20', m: '#2e7d32', o: '#ffd600', y: '#fff200',
};

// Kuromi, igualita a la imagen de referencia (28×20): orejas anchas,
// capucha negra con su calaverita rosa, la capucha en pico entre los ojos,
// ojos grandes con pestañita, chapitas y naricita rosas
const KUROMI = [
  'nnn......................nnn',
  'ndnnnnnnn..........nnnnnnndn',
  'nndddddddn........ndddddddnn',
  '.ndddddddn........ndddddddn.',
  '.ndddddnnnnnnnnnnnnnndddddn.',
  '.nddddnddddddddddddddnddddn.',
  '.ndddnddddddssssddddddndddn.',
  '.nddnddddddsnssnsddddddnddn.',
  '.ndndddddddsnssnsdddddddndn.',
  '.ndnddddddddssssddddddddndn.',
  '..nndddddnnddssddnndddddnn..',
  '...nddddnwwnddddnwwnddddn...',
  '...ndddnwwwwnddnwwwwndddn...',
  '...nddnwnwwwwnnwwwwnwnddn...',
  '...nddnwwnnwwwwwwnnwwnddn...',
  '...nddnwnnnwwwwwwnnnwnddn...',
  '...nddnwwnnwwwwwwnnwwnddn...',
  '....ndnwccwwwsswwwccwndn....',
  '.....ndnccwwwwwwwwccndn.....',
  '......nnnnnnnnnnnnnnnn......',
];

const ART = {
  kuromi: KUROMI,
  // la misma Kuromi guiñando: el ojo derecho cerrado en arquito
  kuromiGuino: KUROMI.map((row, y) => ({
    13: '...nddnwnwwwwnnwwwwwwnddn...',
    14: '...nddnwwnnwwwwwwwwwwnddn...',
    15: '...nddnwnnnwwwwwwnnwwnddn...',
    16: '...nddnwwnnwwwwwnwwnwnddn...',
  })[y] || row),
  // y feliz, con los dos ojitos cerrados
  kuromiFeliz: KUROMI.map((row, y) => ({
    13: '...nddnwwwwwwnnwwwwwwnddn...',
    14: '...nddnwwwwwwwwwwwwwwnddn...',
    15: '...nddnwwnnwwwwwwnnwwnddn...',
    16: '...nddnwnwwnwwwwnwwnwnddn...',
  })[y] || row),
  // moño negro con la calaverita rosa en el nudo
  mono: [
    '.nn.............nn.',
    'nddnn...nnn...nnddn',
    'nddddn.nsssn.nddddn',
    'ndKdddnsssssndddKdn',
    'ndKdddnsnsnsndddKdn',
    'ndddddnsssssndddddn',
    'nddddn.nsnsn.nddddn',
    'nddnn..nnnnn..nnddn',
    '.nn...ndn.ndn...nn.',
    '......ndn.ndn......',
    '.....ndn...ndn.....',
    '.....nn.....nn.....',
  ],
  // lunita lila con su estrellita
  luna: [
    '...lll......',
    '.lllv.......',
    '.llv........',
    'lllv.....o..',
    'lll.....ooo.',
    'lll......o..',
    'lll.........',
    'lll.........',
    'llll......l.',
    '.llll....ll.',
    '.LllllllllL.',
    '..LLllllLL..',
    '....LLLL....',
  ],
  // estrellita rosa con carita
  estrella: [
    '......k......',
    '.....kpk.....',
    '.....kwk.....',
    '....kpwpk....',
    'kkkkkpppkkkkk',
    'kpppppppppppk',
    '.kpppppppppk.',
    '..kpkpppkpk..',
    '..kbpppppbk..',
    '..kpppkpppk..',
    '.kpppkkkpppk.',
    '.kppk...kppk.',
    'kppk.....kppk',
    'kkk.......kkk',
  ],
  // corazón diablito: cuernitos y colita como la de Kuromi
  diablito: [
    'k...........k...',
    '.kk.......kk....',
    '.kkk.....kkk....',
    'kpppk...kpppk...',
    'kpwppk.kppppk...',
    'kpwpppkpppppk...',
    'kpppppppppprk...',
    'kpppppppppprk...',
    '.kpppppppprk....',
    '..kpppppprk..k..',
    '...kpppprk..kkk.',
    '....kpprk....k..',
    '.....krk....k...',
    '......k....k....',
    '.......kkkk.....',
  ],
  // fantasmita lila con chapitas
  fantasma: [
    '...kkkkkk...',
    '..klllllvk..',
    '.klllllllvk.',
    '.kllkllkllk.',
    '.kllkllkllk.',
    'klbllllllblk',
    'kllllkkllllk',
    'kllllllllllk',
    'kLllllllllLk',
    'kLLlllllLLLk',
    'kLkLLkkLLkLk',
    'kk.kk..kk.kk',
  ],
  // su calaverita rosa con moño negro
  calavera: [
    '.kk...kk.',
    '.kkkkkkk.',
    '.kk...kk.',
    '.ppppppp.',
    'ppppppppp',
    'pkkpppkkp',
    'pkkpppkkp',
    'ppppkpppp',
    '.ppppppp.',
    '..p.p.p..',
  ],
  // murcielaguito con chapitas
  murcielago: [
    'K.............K',
    'KK....k.k....KK',
    'KKK..kkkkk..KKK',
    'KKKKkkkkkkkKKKK',
    'KKKkkwkkkwkkKKK',
    '.KKkkbkkkbkkKK.',
    '..K.kkkpkkk.K..',
    '.....k...k.....',
  ],
  // corazón negro con la calaverita rosa
  corazon: [
    '.kkk...kkk.',
    'kKkkk.kkkkk',
    'kKkkkkkkkkk',
    'kkkkpppkkkk',
    'kkkpkpkpkkk',
    '.kkpppppkk.',
    '..kkpkpkk..',
    '...kkkkk...',
    '....kkk....',
    '.....k.....',
  ],
  // casco de Master Chief, igualito a la imagen de referencia (16×17): dos
  // verdes, visor dorado con reflejos blancos y la rejilla de la boca
  masterchief: [
    '....nnnnnnnn....',
    '....nMMmmMMn....',
    '..nnMMmmmmMMnn..',
    '..nnnnnnnnnnnn..',
    '.nMMmmMMMMmmMMn.',
    'nMnnnnnnnnnnnnMn',
    'nMnowwoooowwonMn',
    '.noywyyyyyywyon.',
    '.noywyyyyyywyon.',
    '.noyyyyyyyyyyon.',
    'nmnoyonnnnoyonmn',
    'nmmnnnmmmmnnnmmn',
    '.nMmMnMnnMnMmMn.',
    '..nnmnmmmmnmnn..',
    '...nMnMmmMnMn...',
    '....nnMmmMnn....',
    '......nnnn......',
  ],
  // versiones mini para cosas chiquitas (el buzón): Kuromi con sus orejitas,
  // la calaverita y el casco de Master Chief
  kuromiMini: [
    'n.......n',
    'nn.....nn',
    'nnnnnnnnn',
    'nnnnsnnnn',
    'nnwwnwwnn',
    'nwnwwwnwn',
    'nwcwwwcwn',
    '.nnnnnnn.',
  ],
  calaveraMini: [
    '.ppp.',
    'pkpkp',
    'ppppp',
    '.pkp.',
    '.p.p.',
  ],
  masterchiefMini: [
    '.nnnnn.',
    'nMmmmMn',
    'nnnnnnn',
    'nowyyon',
    'nmnnnmn',
    '.nmmmn.',
    '..nnn..',
  ],
  // control retro con su cruz, dos botones y select/start
  control: [
    '..llllllllllllll..',
    '.llllllllllllllll.',
    'lllkllllllllllplll',
    'llkkkllelellglllll',
    'lllkllllllllllllll',
    'LLLLLLllllllLLLLLL',
    'LLLLL........LLLLL',
    '.LLL..........LLL.',
  ],
};

function paintArt(rows) {
  const { c, ctx } = makeCanvas(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!PAL[ch]) return;
    ctx.fillStyle = PAL[ch];
    ctx.fillRect(x, y, 1, 1);
  }));
  return c;
}

// Letrerito en pastilla, como "P1 ♥ P2" (el ♥ va en rojo).
function paintLabel(text, bg, ink) {
  const w = measure(text) + 6, h = 9;
  const { c, ctx } = makeCanvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(1, 0, w - 2, h);
  ctx.fillRect(0, 1, w, h - 2);
  let x = 3;
  for (const part of text.split(/(♥)/)) {
    if (!part) continue;
    drawText(ctx, part, x, -1, part === '♥' ? PAL.r : ink);
    x += measure(part) + 1;
  }
  return c;
}

// De dibujo a calcomanía: orilla blanca troquelada y sombrita abajo a la derecha.
function dieCut(src) {
  const W = src.width + 3, H = src.height + 3;
  const { c, ctx } = makeCanvas(W, H);
  ctx.drawImage(src, 1, 1);
  const a = ctx.getImageData(0, 0, W, H).data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && a[(y * W + x) * 4 + 3] > 0;
  const edge = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (solid(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = solid(x + dx, y + dy);
      if (near) edge.push([x, y]);
    }
  }
  ctx.fillStyle = '#ffffff';
  for (const [x, y] of edge) ctx.fillRect(x, y, 1, 1);
  const b = ctx.getImageData(0, 0, W, H).data;
  const filled = (x, y) => x >= 0 && y >= 0 && x < W && y < H && b[(y * W + x) * 4 + 3] > 0;
  ctx.fillStyle = 'rgba(58, 31, 61, .35)';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!filled(x, y) && filled(x - 1, y - 1)) ctx.fillRect(x, y, 1, 1);
  return c;
}

const LABELS = {
  p1p2: ['P1 ♥ P2', '#ffd3e0', '#3a1f3d'],
  // sus iniciales, como en la manta del avión
  ge: ['G ♥ E', '#e3d4ff', '#3a1f3d'],
  // 7 años juntos: nivel 7, como en los videojuegos
  nivel7: ['NIVEL 7 ♥', '#3a1f3d', '#fff6e8'],
};

const cache = new Map();

// La calcomanía lista (un lienzo), por nombre: kuromi, kuromiGuino, kuromiFeliz,
// calavera, murcielago, corazon, diablito, mono, luna, estrella, fantasma,
// masterchief, control, los letreritos (p1p2, ge, nivel7) y las mini
// (kuromiMini, calaveraMini, masterchiefMini).
export function sticker(name) {
  if (!cache.has(name)) {
    const art = ART[name] ? paintArt(ART[name]) : paintLabel(...LABELS[name]);
    cache.set(name, dieCut(art));
  }
  return cache.get(name);
}

// Para la carta (HTML): una <img> pixelada, a `scale` px por píxel.
export function stickerImg(name, scale, cls = '') {
  const c = sticker(name);
  const img = new Image();
  img.src = c.toDataURL();
  img.alt = '';
  img.width = c.width * scale;
  img.height = c.height * scale;
  img.className = `calco ${cls}`.trim();
  img.setAttribute('aria-hidden', 'true');
  return img;
}
