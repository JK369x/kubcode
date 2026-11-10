// styles/07-lidar.js (world 7): LiDAR survey look, three.js Points (additive soft discs) on cold near-black. KIT only (export `kit`): shader materials, height ramp teal -> yellow,
// point-cloud builder (planes, floors, edges, cylinders, canvas-text points), door() as a cloud, hero() as a dense body of points sampled from ANY rig's surfaces, a radial scan
// front (distance from the sensor: floor first, wall rippling out from the centre, seam flash), hearts/text/ringEdge in the same dots idiom. The door-story content is in scenes/door/lidar.js.
// Camera = the voxel world's: horizontal, wall plane z=0 maps 1:1 to master px, eye level y 960, floor line y 1350 (scene y = -390).
import * as H from '../core/hero2d.js';
const FOV = 26;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const hash = (a, b = 0, c = 0) => { const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return n - Math.floor(n); };

const VS = `
uniform float uTime, uR, uD, uBase, uSeam, uGP, uGH, uSz, uGain, uZB;
uniform vec3 uCam;
attribute vec3 aCol; attribute float aSeed, aSize, aDense, aGlow;
varying vec3 vCol; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float r = length(position - uCam);
  mv.z += uZB;
  float cond = 1.0 - smoothstep(uR - 150.0, uR + 6.0, r);
  float seam = exp(-abs(r - uR) / 170.0) * uSeam;
  float tw = 0.76 + 0.24 * sin(uTime * (7.0 + aSeed * 13.0) + aSeed * 61.0);
  float live = mix(1.0, cond, aDense);
  float gp = step(0.5, aGlow) * (1.0 - step(1.5, aGlow)) * uGP, gh = step(1.5, aGlow) * uGH, g = max(gp, gh);
  vA = ((uBase + (1.0 - uBase) * cond) * tw * live + g * 0.55) * uGain;
  vec3 c = mix(aCol, vec3(1.0, 0.6, 0.16), g);
  vCol = mix(c, vec3(0.83, 1.0, 0.94), clamp(seam * 0.85, 0.0, 1.0)) * (1.0 + 2.0 * seam + 0.5 * g);
  gl_PointSize = max(1.7, aSize * uSz * (uD / -mv.z) * (1.0 + 0.7 * seam + 0.9 * g + 0.45 * cond * aDense));
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
varying vec3 vCol; varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.1, d) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}`;
const LVS = `
uniform float uR; uniform vec3 uCam;
attribute vec3 aCol;
varying vec3 vCol; varying float vA;
void main() {
  float r = length(position - uCam), cond = 1.0 - smoothstep(uR - 150.0, uR + 6.0, r);
  vCol = aCol; vA = cond * 0.3;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const LFS = `varying vec3 vCol; varying float vA; void main() { if (vA < 0.01) discard; gl_FragColor = vec4(vCol, vA); }`;

const STOPS = [[0, 10, 70, 82], [.28, 14, 150, 160], [.55, 50, 205, 165], [.78, 198, 226, 84], [1, 255, 233, 106]];
export function ramp(t, c) {
  t = clamp(t); let i = 1; while (i < STOPS.length - 1 && t > STOPS[i][0]) i++;
  const a = STOPS[i - 1], b = STOPS[i], k = (t - a[0]) / (b[0] - a[0]);
  c[0] = lerp(a[1], b[1], k) / 255; c[1] = lerp(a[2], b[2], k) / 255; c[2] = lerp(a[3], b[3], k) / 255; return c;
}

// ---- stage
export function stage(THREE) {
  const F = 960 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)), glc = document.createElement('canvas'); glc.width = glc.height = 1920;
  const ren = new THREE.WebGLRenderer({ canvas: glc, antialias: false, alpha: false, preserveDrawingBuffer: true }); ren.setPixelRatio(1); ren.setSize(1920, 1920, false);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(FOV, 1, 50, 20000); cam.position.set(0, 0, F);
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'), r = g.createRadialGradient(256, 290, 40, 256, 256, 420);
  r.addColorStop(0, '#0a1620'); r.addColorStop(.55, '#060d14'); r.addColorStop(1, '#03070b'); g.fillStyle = r; g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
  return { THREE, ren, glc, scene, cam, F, mats: [], lmats: [] };
}
function ptMat(S, base, size = 1) {
  const { THREE } = S, m = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uR: { value: 0 }, uD: { value: S.F }, uBase: { value: base }, uSeam: { value: 0 }, uGP: { value: 0 }, uGH: { value: 0 }, uSz: { value: size }, uGain: { value: 1 }, uZB: { value: 0 }, uCam: { value: new THREE.Vector3(0, 0, S.F) } },
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  S.mats.push(m); return m;
}
function lnMat(S) { const { THREE } = S, m = new THREE.ShaderMaterial({ uniforms: { uR: { value: 0 }, uCam: { value: new THREE.Vector3(0, 0, S.F) } }, vertexShader: LVS, fragmentShader: LFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); S.lmats.push(m); return m; }
function pointsObj(S, a, mat, dynamic = false) {
  const { THREE } = S, g = new THREE.BufferGeometry(), pos = new THREE.BufferAttribute(new Float32Array(a.pos), 3), col = new THREE.BufferAttribute(new Float32Array(a.col), 3);
  if (dynamic) { pos.setUsage(THREE.DynamicDrawUsage); col.setUsage(THREE.DynamicDrawUsage); }
  g.setAttribute('position', pos); g.setAttribute('aCol', col);
  for (const [k, v] of [['aSeed', a.seed], ['aSize', a.size], ['aDense', a.dense], ['aGlow', a.glow]]) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(v), 1));
  const o = new THREE.Points(g, mat); o.frustumCulled = false; return o;
}

// ---- point-cloud builder (world coordinates = scene units; heights coloured by the ramp unless a colour is given)
export function cloud(S) {
  const a = { pos: [], col: [], seed: [], size: [], dense: [], glow: [] }, L = { pos: [], col: [] }, c = [0, 0, 0];
  const yT = y => clamp((y + 390) / 930);
  const B = {
    add(x, y, z, o = {}) { const col = o.color || ramp(o.t ?? yT(y), c), k = (o.k ?? 1) * (.75 + .35 * hash(x * .37, y * .53, z * .29)); a.pos.push(x, y, z); a.col.push(col[0] * k, col[1] * k, col[2] * k); a.seed.push(hash(x, y, z)); a.size.push(o.size ?? 2.8); a.dense.push(o.dense ?? 0); a.glow.push(o.glow ?? 0); },
    plane(x0, y0, x1, y1, z, sp, o = {}) { for (let y = y0; y < y1; y += sp) for (let x = x0; x < x1; x += sp) { const j = o.jit ?? .8; B.add(x + (hash(x, y, z) - .5) * sp * j, y + (hash(y, x, z + 1) - .5) * sp * j, z, o); } },
    floor(x0, x1, z0, z1, y, sp, o = {}) { for (let z = z0; z < z1; z += sp) for (let x = x0; x < x1; x += sp) B.add(x + (hash(x, z, 3) - .5) * sp * .8, y, z + (hash(z, x, 4) - .5) * sp * .8, { ...o, t: o.t ?? .06 + .1 * hash(x, z, 9) }); },
    line(x0, y0, z0, x1, y1, z1, sp, o = {}) { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0, z1 - z0) / sp)); for (let i = 0; i <= n; i++) { const t = i / n; B.add(lerp(x0, x1, t), lerp(y0, y1, t), lerp(z0, z1, t), o); } },
    rect(x0, y0, x1, y1, z, sp, o = {}) { B.line(x0, y0, z, x1, y0, z, sp, o); B.line(x1, y0, z, x1, y1, z, sp, o); B.line(x1, y1, z, x0, y1, z, sp, o); B.line(x0, y1, z, x0, y0, z, sp, o); },
    cyl(x, y0, y1, z, r, sp, o = {}) { const n = Math.max(8, Math.round(2 * Math.PI * r / sp)); for (let y = y0; y <= y1; y += sp) for (let i = 0; i < n; i++) { const t = i / n * 6.283; B.add(x + Math.cos(t) * r, y, z + Math.sin(t) * r, o); } },
    text(str, x0, y0, x1, y1, z, sp, o = {}) {                                                              // canvas-text points: dense where the glyphs are
      const w = Math.round((x1 - x0) / 1.5), h = Math.round((y1 - y0) / 1.5), cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.font = `800 ${Math.round(h * .86)}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(str, w / 2, h * .86); const d = g.getImageData(0, 0, w, h).data;
      for (let py = 0; py < h; py += 1) for (let px = 0; px < w; px += 1) if (d[(py * w + px) * 4 + 3] > 128 && (hash(px, py, 5) < 1.5 / sp * .9)) B.add(x0 + px * 1.5, y1 - py * 1.5, z, { ...o, jit: 0 });
    },
    rays(hit, o = {}) {                                                                                  // hit(dx,dy,dz) -> [x,y,z,t(0..1 ramp),gain] | null; direction = unit vector from the sensor (azimuth 0 = toward -z)
      const de = o.de ?? .026, da = o.da ?? .0035, el0 = o.el0 ?? -1.2, el1 = o.el1 ?? .7, a0 = o.a0 ?? -1.6, a1 = o.a1 ?? 1.6;
      let ring = 0;
      for (let el = el0; el <= el1; el += de, ring++) { const ce = Math.cos(el), se = Math.sin(el);
        for (let a = a0 + (ring & 1) * da / 2; a <= a1; a += da) { const h = hit(ce * Math.sin(a), se, -ce * Math.cos(a)); if (h) B.add(h[0], h[1], h[2], { t: h[3], k: (h[4] ?? 1) * (o.k ?? 1), size: o.size ?? 2.8, dense: 1, glow: 0 }); }
      }
    },
    seg(x0, y0, z0, x1, y1, z1, col) { for (const [x, y, z] of [[x0, y0, z0], [x1, y1, z1]]) { L.pos.push(x, y, z); L.col.push(col[0], col[1], col[2]); } },
    build(base, size = 1) { const m = ptMat(S, base, size), o = pointsObj(S, a, m); S.scene.add(o); return { obj: o, mat: m, n: a.pos.length / 3 }; },
    buildLines() { if (!L.pos.length) return null; const { THREE } = S, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(L.pos), 3)); g.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(L.col), 3)); const o = new THREE.LineSegments(g, lnMat(S)); o.frustumCulled = false; S.scene.add(o); return o; },
  };
  return B;
}

// ---- hero: a dense body of points sampled from the surfaces of ANY three.js rig (hero3d, soldier3d, stand-in); re-posed every frame from rig.apply(pose)
function lcolor(THREE, c) {
  const h = {}; c.getHSL(h);
  if (h.s > .5 && (h.h < .04 || h.h > .94) && h.l > .22) return [1, .36, .3];                                // red (scarf, tunic) -> coral, same red family in every style
  if (h.l < .3) return [.55, .63, 1];                                                                          // dark cool tunic -> bright periwinkle
  if (h.l > .82) return [1, .96, .86];
  if (h.h > .04 && h.h < .13 && h.l > .55) return [1, .88, .74];                                               // skin
  const o = new THREE.Color().setHSL(h.h, Math.max(.6, h.s), Math.max(.62, h.l)); return [o.r, o.g, o.b];
}
const KEYCOL = { skin: '#ffe0c4', skin2: '#ffc9a0', blush: '#ff9a8a', hair: '#e0a050', eyeW: '#ffffff', brow: '#e0aa5a', mouth: '#ff7b86', tongue: '#ff8a8a', teeth: '#ffffff', tunic: '#7088ff', tunic2: '#5a70e0', trim: '#90a6ff',
  mitten: '#fff1d0', legs: '#8a7dff', boots: '#ffb347', sole: '#e09a3a', scarf: '#ff4a3a', scarf2: '#e03a2c', wood: '#ffd36a', wood2: '#e0a64a', metal: '#cfe8ff', pencil: '#ffd35a' };
const SKIP = new Set(['pupil', 'shine']), SKIPF = new Set(['eyeW', 'brow', 'mouth', 'tongue', 'teeth']);
function faceCol(r, g, b) {                                                       // 0..255 face pixel -> [r,g,b,keep] with its own gain (keep = share of the points drawn), or null (pupil / outline gap)
  const mn = Math.min(r, g, b), lum = (.3 * r + .59 * g + .11 * b) / 255;
  if (mn > 226) return [1.35, 1.38, 1.4, 1];                                       // sclera, teeth, shine: the brightest, fully dense
  if (lum < .3) {
    if (b > r + 6) return null;                                                    // pupil / outline
    if (r > g + 38) return [1.2, .4, .5, 1];                                       // mouth
    return [1.1, .66, .2, 1];                                                      // brows: amber
  }
  if (r > 225 && g < 175) return [1, .52, .5, .8];                                 // blush, tongue
  return [.78, .54, .34, .4];                                                      // skin: dim amber-peach, thinned
}
export function heroCloud(S, rig, pose, o = {}) {
  const { THREE } = S, rnd = o.rng || (() => Math.random()), area = o.area || 11, esp = o.edge || 3, meshes = [], out = { lp: [], ln: [], mi: [], col: [], edge: [], seed: [], fd: [], face: [], fuv: [] }, faceSet = new Set(o.faceMeshes || []);
  rig.apply(pose); if (o.postApply) o.postApply(rig, pose); rig.group.updateMatrixWorld(true); rig.group.traverse(m => { if (m.isMesh) meshes.push(m); });
  const keyOf = m => { const mm = Array.isArray(m.material) ? m.material[0] : m.material; return rig.mats ? (Object.entries(rig.mats).find(([, v]) => v === mm) || [])[0] : undefined; };
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  meshes.forEach((m, mi) => {
    const mat = Array.isArray(m.material) ? m.material[0] : m.material; if (!mat || !mat.color) return; const key = keyOf(m); if (SKIP.has(key) || (faceSet.size && SKIPF.has(key))) return; const isFace = faceSet.has(m);
    const col = KEYCOL[key] ? (c => [c.r, c.g, c.b])(new THREE.Color(KEYCOL[key])) : lcolor(THREE, mat.color), g = m.geometry, pa = g.attributes.position, nn = g.attributes.normal, ix = g.index, nT = (ix ? ix.count : pa.count) / 3, sc = m.matrixWorld.getMaxScaleOnAxis(), cum = []; let tot = 0;
    const I = (t, k) => ix ? ix.getX(t * 3 + k) : t * 3 + k;
    for (let t = 0; t < nT; t++) { va.fromBufferAttribute(pa, I(t, 0)); vb.fromBufferAttribute(pa, I(t, 1)); vc.fromBufferAttribute(pa, I(t, 2)); e1.subVectors(vb, va); e2.subVectors(vc, va); tot += e1.cross(e2).length() * .5 * sc * sc; cum.push(tot); }
    const n = Math.max(6, Math.round(tot / (isFace ? area * .42 : area)));
    for (let k = 0; k < n; k++) {
      const r = rnd() * tot; let lo = 0, hi = nT - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
      va.fromBufferAttribute(pa, I(lo, 0)); vb.fromBufferAttribute(pa, I(lo, 1)); vc.fromBufferAttribute(pa, I(lo, 2)); if (nn) { na.fromBufferAttribute(nn, I(lo, 0)); nb.fromBufferAttribute(nn, I(lo, 1)); nc.fromBufferAttribute(nn, I(lo, 2)); } else { na.set(0, 0, 1); nb.copy(na); nc.copy(na); }
      const u = Math.sqrt(rnd()), v = rnd(), w0 = 1 - u, w1 = u * (1 - v), w2 = u * v;
      out.lp.push(va.x * w0 + vb.x * w1 + vc.x * w2, va.y * w0 + vb.y * w1 + vc.y * w2, va.z * w0 + vb.z * w1 + vc.z * w2); out.ln.push(na.x * w0 + nb.x * w1 + nc.x * w2, na.y * w0 + nb.y * w1 + nc.y * w2, na.z * w0 + nb.z * w1 + nc.z * w2);
      out.mi.push(mi); out.col.push(col[0], col[1], col[2]); out.edge.push(0); out.seed.push(rnd());
      const lx = out.lp[out.lp.length - 3], ly = out.lp[out.lp.length - 2], lz = out.lp[out.lp.length - 1], ll = Math.hypot(lx, ly, lz) || 1; out.face.push(isFace ? 1 : 0); out.fd.push(isFace ? lx / ll : 0, isFace ? ly / ll : 0, isFace ? lz / ll : 0);
      const ua = g.attributes.uv; out.fuv.push(isFace && ua ? ua.getX(I(lo, 0)) * w0 + ua.getX(I(lo, 1)) * w1 + ua.getX(I(lo, 2)) * w2 : 0, isFace && ua ? ua.getY(I(lo, 0)) * w0 + ua.getY(I(lo, 1)) * w1 + ua.getY(I(lo, 2)) * w2 : 0);
    }
    const eg = new THREE.EdgesGeometry(g, 28), ep = eg.attributes.position;
    for (let q = 0; q + 1 < ep.count; q += 2) {
      va.fromBufferAttribute(ep, q); vb.fromBufferAttribute(ep, q + 1); const len = va.distanceTo(vb) * sc, cnt = Math.max(1, Math.round(len / esp));
      for (let k = 0; k < cnt; k++) { const w = (k + rnd() * .6) / cnt; out.lp.push(lerp(va.x, vb.x, w), lerp(va.y, vb.y, w), lerp(va.z, vb.z, w)); out.ln.push(0, 0, 1); out.mi.push(mi); out.col.push(col[0], col[1], col[2]); out.edge.push(1); out.seed.push(rnd()); out.face.push(0); out.fd.push(0, 0, 0); out.fuv.push(0, 0); }
    }
  });
  for (let i = 0; i < out.face.length; i++) if (out.face[i] && (out.fd[3 * i] < -.25 || out.fd[3 * i + 1] > .72)) { const c = new THREE.Color(KEYCOL.hair); out.col[3 * i] = c.r; out.col[3 * i + 1] = c.g; out.col[3 * i + 2] = c.b; }
  const N = out.mi.length, sd = new Float32Array(out.seed), fuv = new Float32Array(out.fuv), isFace = new Uint8Array(out.face), FW = 512, FHt = 256, lp = new Float32Array(out.lp), ln = new Float32Array(out.ln), mi = new Uint16Array(out.mi), base = new Float32Array(out.col), edge = new Uint8Array(out.edge);
  const mat = ptMat(S, .96, 1), obj = pointsObj(S, { pos: new Float32Array(N * 3), col: new Float32Array(N * 3), seed: out.seed, size: Array.from({ length: N }, (_, i) => out.edge[i] ? 2.9 : isFace[i] ? 3.6 : 3.5), dense: new Array(N).fill(0), glow: new Array(N).fill(0) }, mat, true);
  S.scene.add(obj);
  if (o.depth !== false) {                                                         // the rig itself becomes a depth-only occluder: back surfaces and the room behind him return nothing, like a real scan
    const dm = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 });
    meshes.forEach(m => { m.material = dm; m.castShadow = m.receiveShadow = false; }); rig.group.visible = true; if (!rig.group.parent) S.scene.add(rig.group); mat.uniforms.uZB.value = 6;
  } else mat.depthTest = false;
  return { obj, mat, N, update(p) {
    let fdata = null; if (faceSet.size && H.faceCanvas) { const fc = H.faceCanvas(p, FW); fdata = fc.getContext('2d').getImageData(0, 0, FW, FHt).data; }          // the 2D face, equirect, redrawn per pose
    rig.apply(p); if (o.postApply) o.postApply(rig, p); rig.group.updateMatrixWorld(true);
    const pos = obj.geometry.attributes.position, col = obj.geometry.attributes.aCol, E = meshes.map(m => m.matrixWorld.elements), V = meshes.map(m => { for (let q = m; q; q = q.parent) if (!q.visible) return 0; return 1; });
    for (let i = 0; i < N; i++) {
      const e = E[mi[i]], x = lp[3 * i], y = lp[3 * i + 1], z = lp[3 * i + 2], nx = ln[3 * i], ny = ln[3 * i + 1], nz = ln[3 * i + 2];
      pos.array[3 * i] = e[0] * x + e[4] * y + e[8] * z + e[12]; pos.array[3 * i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; pos.array[3 * i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      let k = 1.1;
      if (!edge[i]) { const wx = e[0] * nx + e[4] * ny + e[8] * nz, wy = e[1] * nx + e[5] * ny + e[9] * nz, wz = e[2] * nx + e[6] * ny + e[10] * nz, Ln = Math.hypot(wx, wy, wz) || 1, f = clamp(.5 + .5 * wz / Ln); k = .38 + .62 * f * f + .12 * clamp(.5 + .5 * wy / Ln); }
      if (!V[mi[i]]) k = 0;
      let cr = base[3 * i], cg = base[3 * i + 1], cb = base[3 * i + 2];
      if (isFace[i] && fdata) { const u = fuv[2 * i], v = fuv[2 * i + 1], q = ((Math.min(FHt - 1, Math.max(0, ((1 - v) * FHt) | 0))) * FW + Math.min(FW - 1, Math.max(0, (u * FW) | 0))) * 4, c = faceCol(fdata[q], fdata[q + 1], fdata[q + 2]); if (c && sd[i] < c[3]) { cr = c[0]; cg = c[1]; cb = c[2]; } else k = 0; }
      col.array[3 * i] = cr * k * .8; col.array[3 * i + 1] = cg * k * .8; col.array[3 * i + 2] = cb * k * .8;
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  } };
}

// ---- door as a cloud: frame, slab face, panels, handle, hinges (glow group 2), PULL plate (glow group 1, letters denser than the plate fill)
const nd = d => ({ x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1,
  plate: Array.isArray(d.plate) ? d.plate : [d.plate.x0, d.plate.y0, d.plate.x1, d.plate.y1],
  handle: Array.isArray(d.handle) ? { x0: d.handle[0] - 10, x1: d.handle[0] + 90, y: d.handle[1] } : d.handle,
  hinges: (d.hinges || d.hingeY.map(y => ({ x: d.x1, y }))).map(h => typeof h === 'number' ? { x: d.x1, y: h } : h) });
export function door(S, B, rect0) {
  const rect = nd(rect0), X0 = rect.x0 - 960, X1 = rect.x1 - 960, YB = 960 - rect.y1, YT = 960 - rect.y0, zf = 34, hot = { k: 1.35, dense: 0 };
  B.plane(X0, YB, X1, YT, zf, 9.5, { ...hot, size: 3 });                                                         // slab face (denser than the wall: the door reads as an object)
  B.plane(X0, YB, X1, YT, zf, 9.5, { ...hot, size: 2.4, dense: 1 });
  B.rect(X0, YB, X1, YT, zf, 4, { k: 1.8, size: 3.2 }); B.rect(X0, YB, X1, YT, zf, 2.2, { k: 2.6, size: 3.6, dense: 1 }); B.rect(X0 - 40, YB, X1 + 40, YT + 56, 62, 2.4, { k: 2.4, size: 3.4, dense: 1 });
  for (const [a, b] of [[40, 340], [-375, -85]]) { B.rect(X0 + 45, a, X1 - 45, b, zf + 4, 4.2, { k: 1.5, size: 2.8 }); B.plane(X0 + 45, a, X1 - 45, b, zf + 4, 16, { k: 1, size: 2.4, dense: 1 }); }
  for (const x of [X0 - 40, X1 + 4]) { B.plane(x, YB, x + 36, YT + 56, 62, 8, { k: 1.1, size: 2.8 }); B.line(x, YB, 62, x, YT + 56, 62, 4, { k: 1.7 }); B.line(x + 36, YB, 62, x + 36, YT + 56, 62, 4, { k: 1.7 }); }
  B.plane(X0 - 40, YT, X1 + 40, YT + 56, 62, 8, { k: 1.1, size: 2.8 }); B.line(X0 - 40, YT + 56, 62, X1 + 40, YT + 56, 62, 4, { k: 1.7 });
  const h = rect.handle, hy = 960 - h.y;                                                                           // horizontal bar on the left edge
  for (const dy of [0, 9, -9]) B.line(h.x0 - 960, hy + dy, 68, h.x1 - 960, hy + dy, 68, 3.4, { k: dy ? 1.5 : 1.8, size: 3.2 });
  rect.hinges.forEach(hh => B.cyl(X1 - 6, 960 - hh.y - 50, 960 - hh.y + 50, 70, 16, 3.8, { k: 1.5, size: 3.2, glow: 2 }));
  const pl = rect.plate, px0 = pl[0] - 960, px1 = pl[2] - 960, py0 = 960 - pl[3], py1 = 960 - pl[1];
  B.plane(px0, py0, px1, py1, zf + 14, 4.6, { k: 1.25, size: 2.5, glow: 1, jit: .5 }); B.rect(px0, py0, px1, py1, zf + 14, 2.6, { k: 1.8, size: 2.6, glow: 1 });
  B.text('PULL', px0 + 8, py0 + 6, px1 - 8, py1 - 6, zf + 16, 2.2, { k: 2, size: 2.7, glow: 1 });
}

// ---- 2D kit pieces
export function hearts(g, n, fx = 1) {                                                                           // dot-matrix hearts, teal -> amber, 10 slots; heartFx 0..1 = the lost heart (slot n) shakes, then drops and scatters
  const dots = (cx, cy, s, col, a, jit) => { for (let y = -s * 1.1; y < s * 1.1; y += 4.6) for (let x = -s * 1.5; x < s * 1.5; x += 4.6) { const X = x / s, Y = -y / s; if (Math.pow(X * X + Y * Y - 1, 3) - X * X * Y * Y * Y < 0) { g.fillStyle = col; g.globalAlpha = a * (.7 + .3 * hash(x, y, 1)); g.fillRect(cx + x + jit * (hash(x, y, 2) - .5) - 1.4, cy + y + jit * (hash(y, x, 3) - .5) - 1.4, 2.8, 2.8); } } };
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 10; i++) { const cx = 960 + (i - 4.5) * 60, cy = 470; if (i < n) { g.shadowColor = '#3ee6d0'; g.shadowBlur = 10; dots(cx, cy, 19, '#7ff5df', 1, 0); } else { g.shadowBlur = 0; dots(cx, cy, 19, '#3a6f78', .35, 0); } }
  if (fx < 1 && n < 10) { const cx = 960 + (n - 4.5) * 60, sh = fx < .3 ? Math.sin(fx * 150) * 4 * (1 - fx / .3) : 0, u = clamp((fx - .3) / .7); g.shadowColor = '#ffb347'; g.shadowBlur = 12; dots(cx + sh, 470 + 380 * u * u, 19, '#ffb347', 1 - u * u, 26 * u); }
  g.restore();
}
export function text(g, str, x, y, size, o = {}) { g.save(); g.font = `500 ${size}px JBM, monospace`; g.textBaseline = 'alphabetic'; g.textAlign = o.align || 'left'; g.lineWidth = 7; g.strokeStyle = 'rgba(2,6,10,.75)'; g.lineJoin = 'round'; g.strokeText(str, x, y); g.fillStyle = o.color || '#ffb347'; g.fillText(str, x, y); g.restore(); }
export function ringEdge(g, r, cx, cy) {                                                                          // the seam's circle edge as a band of glowing points + a hairline (about 9 px)
  g.save(); g.globalCompositeOperation = 'lighter'; const n = Math.min(900, Math.round(2 * Math.PI * r / 5.5));
  g.shadowColor = '#3ee6d0'; g.shadowBlur = 12; for (let i = 0; i < n; i++) { const t = i / n * 6.283, rr = r + (hash(i, 1, 2) - .5) * 9, s = 1.5 + 1.8 * hash(i, 3, 4); g.fillStyle = hash(i, 5, 6) > .8 ? '#ffe98a' : '#9ffbe8'; g.globalAlpha = .55 + .45 * hash(i, 7, 8); g.fillRect(cx + Math.cos(t) * rr - s / 2, cy + Math.sin(t) * rr - s / 2, s, s); }
  g.shadowBlur = 0; g.globalAlpha = .8; g.strokeStyle = '#d4fff0'; g.lineWidth = 1.6; g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.stroke(); g.restore();
}
export function post(g, glc, o = {}) {                                                                            // bloom (blurred additive copy) + vignette
  g.drawImage(glc, 0, 0); g.save(); g.globalCompositeOperation = 'lighter'; g.filter = 'blur(14px)'; g.globalAlpha = o.bloom ?? .6; g.drawImage(glc, 0, 0); g.restore();
  const vg = g.createRadialGradient(960, 960, 700, 960, 960, 1400); vg.addColorStop(0, 'rgba(2,5,8,0)'); vg.addColorStop(1, 'rgba(2,5,8,.55)'); g.fillStyle = vg; g.fillRect(0, 0, 1920, 1920);
}

export const kit = { FOV, ramp, stage, cloud, heroCloud, door, hearts, text, ringEdge, post, sstep, accent: '#3ee6d0' };

export default {
  id: 'lidar', kind: 'webgl', kit, ringEdge,
  async init(api) {                                                                  // the scene module comes from scenes/<timeline.story>/lidar.js: { init(api, kit), render(out, s, kit) }
    this.api = api; const tl = await (await fetch(new URL('../timeline.json', import.meta.url))).json();
    this.scene = (await import(`../scenes/${tl.story || 'door'}/lidar.js`)).default; await this.scene.init(api, kit);
  },
  render(out, s) { this.scene.render(out, s, kit); },
};
