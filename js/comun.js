import * as THREE from 'three';

// Trabajamos con los colores tal cual (sin conversión lineal/sRGB) para que
// cada hex de la paleta se vea exactamente como se eligió.
THREE.ColorManagement.enabled = false;

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => {
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

// Rampa de sombreado "toon": 4 escalones duros, como una paleta de pixel art.
const rampa = new Uint8Array([
  80, 80, 80, 255,
  150, 150, 150, 255,
  215, 215, 215, 255,
  255, 255, 255, 255,
]);
export const toonGradient = new THREE.DataTexture(rampa, 4, 1, THREE.RGBAFormat);
toonGradient.minFilter = THREE.NearestFilter;
toonGradient.magFilter = THREE.NearestFilter;
toonGradient.generateMipmaps = false;
toonGradient.needsUpdate = true;

export function toonMat(opts = {}) {
  return new THREE.MeshToonMaterial({ gradientMap: toonGradient, ...opts });
}

export function flatGeometry(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

/* ---------- Viento compartido por el árbol, la hierba y los carteles ---------- */

export const windUniforms = {
  uTime: { value: 0 },
  uWind: { value: 0.05 },
  uShake: { value: 0 },
};

export const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform float uShake;
vec3 windOffset(vec3 p) {
  float h = clamp((p.y - 1.0) / 9.0, 0.0, 1.0);
  h *= h;
  vec3 w = vec3(
    sin(uTime * 1.25 + p.y * 0.45 + p.x * 0.3) + 0.45 * sin(uTime * 2.7 + p.z * 0.8 + p.x * 0.2),
    0.0,
    0.55 * sin(uTime * 1.05 + p.x * 0.4 + 1.3)
  );
  vec3 s = vec3(sin(uTime * 23.0 + p.y * 1.7), 0.0, cos(uTime * 19.0 + p.x * 1.3));
  return (w * uWind + s * uShake) * h;
}
`;

export function windOffsetJS(p, out) {
  const t = windUniforms.uTime.value, W = windUniforms.uWind.value, S = windUniforms.uShake.value;
  let h = clamp((p.y - 1.0) / 9.0, 0, 1);
  h *= h;
  const wx = Math.sin(t * 1.25 + p.y * 0.45 + p.x * 0.3) + 0.45 * Math.sin(t * 2.7 + p.z * 0.8 + p.x * 0.2);
  const wz = 0.55 * Math.sin(t * 1.05 + p.x * 0.4 + 1.3);
  const sx = Math.sin(t * 23.0 + p.y * 1.7), sz = Math.cos(t * 19.0 + p.x * 1.3);
  return out.set((wx * W + sx * S) * h, 0, (wz * W + sz * S) * h);
}

const PROJECT_WIND = /* glsl */ `
vec4 wPos = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  wPos = instanceMatrix * wPos;
#endif
wPos = modelMatrix * wPos;
wPos.xyz += windOffset( wPos.xyz );
vec4 mvPosition = viewMatrix * wPos;
gl_Position = projectionMatrix * mvPosition;
`;

function windHook(shader) {
  shader.uniforms.uTime = windUniforms.uTime;
  shader.uniforms.uWind = windUniforms.uWind;
  shader.uniforms.uShake = windUniforms.uShake;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + WIND_GLSL)
    .replace('#include <project_vertex>', PROJECT_WIND);
}

export function withWind(mat) {
  mat.onBeforeCompile = windHook;
  mat.customProgramCacheKey = () => 'viento';
  return mat;
}

/* ---------- Proyección a píxeles del lienzo de baja resolución ---------- */

const _v = new THREE.Vector3();
// Devuelve {x, y, z} en píxeles del render (origen arriba-izquierda); z = distancia de vista.
export function projectToPixels(world, camera, rtW, rtH, out = {}) {
  _v.copy(world).applyMatrix4(camera.matrixWorldInverse);
  const z = -_v.z;
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  out.x = (_v.x / (z * tanH * camera.aspect) * 0.5 + 0.5) * rtW;
  out.y = (0.5 - (_v.y / (z * tanH)) * 0.5) * rtH;
  out.z = z;
  return out;
}

// Punto del mundo a la distancia de vista z que cae en el píxel (px, py).
export function pixelsToWorld(px, py, z, camera, rtW, rtH, out = new THREE.Vector3()) {
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const vx = (px / rtW - 0.5) * 2 * z * tanH * camera.aspect;
  const vy = (0.5 - py / rtH) * 2 * z * tanH;
  return out.set(vx, vy, -z).applyMatrix4(camera.matrixWorld);
}
