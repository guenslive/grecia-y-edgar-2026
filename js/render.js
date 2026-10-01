import * as THREE from 'three';

const POST_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Paso final: contorno por profundidad (siluetas más oscuras, como en el pixel
// art dibujado a mano), viñeta suave y cuantización con tramado Bayer.
const POST_FS = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uLevels;
uniform float uFade;
varying vec2 vUv;

float lin(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  vec2 pix = floor(vUv * uRes);
  vec2 uv = (pix + 0.5) / uRes;
  vec2 t = 1.0 / uRes;
  vec4 src = texture2D(tColor, uv);
  vec3 c = src.rgb;

  float d = lin(uv);
  float dn = max(
    max(lin(uv + vec2(t.x, 0.0)), lin(uv - vec2(t.x, 0.0))),
    max(lin(uv + vec2(0.0, t.y)), lin(uv - vec2(0.0, t.y)))
  );
  float edge = step(0.6 + d * 0.05, dn - d);
  // las nubes (alfa 0.25) llevan un contorno más suave
  c *= mix(1.0, src.a < 0.4 ? 0.84 : 0.6, edge);

  vec2 q = vUv - 0.5;
  c *= 1.0 - 0.35 * dot(q, q);
  c *= uFade;

  // lo que pide tonos limpios (la luna, con alfa 0.5) se redondea sin tramar
  float b = src.a > 0.4 && src.a < 0.75 ? 0.5 : bayer4(pix);
  c = floor(c * uLevels + b) / uLevels;
  gl_FragColor = vec4(c, 1.0);
}
`;

export class PixelRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    }));
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.setPixelRatio(1);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.BasicShadowMap;

    const depth = new THREE.DepthTexture(2, 2);
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;
    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      depthTexture: depth,
    });

    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: depth },
        uRes: { value: new THREE.Vector2(2, 2) },
        uNear: { value: 0.1 },
        uFar: { value: 500 },
        uLevels: { value: 14 },
        uFade: { value: 1 },
      },
      vertexShader: POST_VS,
      fragmentShader: POST_FS,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.rtW = 2;
    this.rtH = 2;
    this.px = 4;
  }

  // Elige cuántos píxeles de pantalla mide un píxel del mundo y ajusta tamaños.
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const target = Math.max(2, Math.min(Math.round(vh / 260), Math.floor(vw / 170)));
    const S = Math.max(1, Math.round(target * dpr));
    this.rtW = Math.ceil((vw * dpr) / S);
    this.rtH = Math.ceil((vh * dpr) / S);
    this.px = S / dpr;
    this.renderer.setSize(this.rtW * S, this.rtH * S, false);
    this.canvas.style.width = this.rtW * this.px + 'px';
    this.canvas.style.height = this.rtH * this.px + 'px';
    this.rt.setSize(this.rtW, this.rtH);
    this.post.uniforms.uRes.value.set(this.rtW, this.rtH);
    document.documentElement.style.setProperty('--px', this.px + 'px');
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    this.post.uniforms.uNear.value = camera.near;
    this.post.uniforms.uFar.value = camera.far;
    r.render(this.postScene, this.postCam);
  }
}
