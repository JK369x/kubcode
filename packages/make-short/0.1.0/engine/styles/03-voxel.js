// styles/03-voxel.js (world 3): VOXEL. Everything is built from crisp cubes (about 42 px grain) in a toy palette: mint wall mosaic, terracotta wainscot, cream/peach floor tiles in
// perspective, an ochre door in a walnut frame, brass details. Only the PULL plate, handle and hinges use a finer voxel (5-14 px) so the lettering stays legible. The kid is a
// blocky voxel kid (styles/b2-voxkid.js). Soft shadows, edge-AO between voxels, warm studio light. NOT a game block world: no grass/dirt textures, no trees.
// This file is the generic KIT (export `kit`): stage, voxel builder, hallway, door, toyBlock, kid, hearts, text, ringEdge, vignette. The door story lives in scenes/door/voxel.js;
// render() delegates to it (scenes/<timeline.story>/voxel.js). Camera: horizontal, wall plane z=0 maps 1:1 to master px (eye level y 960, floor line y 1350 = wall base).
import { buildVoxKid } from './b2-voxkid.js';
const FOV = 26, WALL_Y = 1350, TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const hash = (a, b = 0, c = 0) => { const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return n - Math.floor(n); };

export const GX = 380 / 9, GY = 830 / 20, GZ = 42, X0 = 80, FL = -390;       // voxel grain: the door is exactly 9 x 20 voxels; grid anchored at the door's left edge (scene x 80) and the floor (scene y -390)
export const PAL = { mint: ['#8fc9b6', '#82bfab', '#9ad0be', '#78b6a3'], accent: '#f0b897', wain: ['#c97a55', '#d4845d', '#be7050'], cap: '#e3a47e', skirt: '#a95f40', cream: '#f4e4c8', peach: '#ebba90', grout: '#9c7352',
  door: '#e5a24a', panel: '#f1bd66', frame: ['#8b5a3a', '#7d4f33', '#96633f'], brass: '#f2b84b', plate: '#f6ecd2', ink: '#3b2a22', cubes: ['#f2b84b', '#8a5aa8', '#3d8ee0'], heart: ['#ff9aa8', '#e04a6a', '#a82a48'] };

// ---- stage: renderer + horizontal camera (wall plane z=0 = master px) + lights
export function stage(THREE) {
  const F = 960 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)), glc = document.createElement('canvas'); glc.width = glc.height = 1920;
  const ren = new THREE.WebGLRenderer({ canvas: glc, antialias: true, preserveDrawingBuffer: true }); ren.setPixelRatio(1); ren.setSize(1920, 1920, false);
  ren.shadowMap.enabled = true; ren.shadowMap.type = THREE.PCFSoftShadowMap; ren.toneMapping = THREE.ACESFilmicToneMapping; ren.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(FOV, 1, 50, 20000); cam.position.set(0, 0, F);
  scene.background = new THREE.Color('#2f6a66');
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x86b8a8, 1.15));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.3); key.position.set(-1300, 1700, 1700); key.target.position.set(100, -100, 0); scene.add(key, key.target);
  key.castShadow = true; key.shadow.mapSize.set(4096, 4096); Object.assign(key.shadow.camera, { left: -1700, right: 1700, top: 1700, bottom: -1700, near: 300, far: 6000 }); key.shadow.bias = -.0005; key.shadow.normalBias = 1.6;
  const fill = new THREE.DirectionalLight(0xcfe4ff, .55); fill.position.set(1500, 500, 1200); scene.add(fill);
  const S = { THREE, ren, glc, scene, cam, F, key, sc: z => (F - z) / F, P: (mx, my, z = 0) => new THREE.Vector3((mx - 960) * (F - z) / F, (960 - my) * (F - z) / F, z) };
  S.ao = aoTexture(THREE); return S;
}
function aoTexture(THREE) {                                                       // soft darkening toward every cube edge (ambient occlusion between voxels)
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  for (const [x0, y0, x1, y1] of [[0, 0, 0, 12], [0, 64, 0, 52], [0, 0, 12, 0], [64, 0, 52, 0]]) { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(40,30,20,.34)'); gr.addColorStop(1, 'rgba(40,30,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
export const voxMat = (S, o = {}) => new S.THREE.MeshStandardMaterial({ map: S.ao, roughness: .82, metalness: 0, ...o });
export function voxels(S) {                                                       // instanced cubes/boxes: add(x,y,z, sx,sy,sz, colour) then build(parent, {mat})
  const { THREE } = S, L = [], geo = new THREE.BoxGeometry(1, 1, 1);
  return { add(x, y, z, sx, sy, sz, c) { L.push([x, y, z, sx, sy, sz, c]); }, get n() { return L.length; },
    build(parent, o = {}) {
      const m = new THREE.InstancedMesh(geo, o.mat || voxMat(S), L.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), P = new THREE.Vector3(), Sc = new THREE.Vector3(), C = new THREE.Color();
      L.forEach((b, i) => { P.set(b[0], b[1], b[2]); Sc.set(b[3], b[4], b[5]); M.compose(P, q, Sc); m.setMatrixAt(i, M); C.set(b[6]); m.setColorAt(i, C); });
      m.castShadow = o.cast !== false; m.receiveShadow = true; m.frustumCulled = false; parent.add(m); return m;
    } };
}
const tint = (THREE, hex, k) => new THREE.Color(hex).multiplyScalar(k);

// ---- hallway: wall mosaic (the door opening + frame columns left to door()), wainscot with skirting and cap, floor of cube tiles in perspective
export function hallway(S) {
  const { THREE, scene } = S, g = new THREE.Group(), I0 = -62, I1 = 62; scene.add(g);
  const W = voxels(S), Fl = voxels(S), inDoor = (i, j) => i >= -1 && i <= 9 && j <= 20;
  for (let j = 0; j < 34; j++) for (let i = I0; i <= I1; i++) {
    if (inDoor(i, j)) continue;
    const x = X0 + (i + .5) * GX, y = FL + (j + .5) * GY, h = hash(i, j, 5), col = tint(THREE, hash(i, j, 3) > .96 ? PAL.accent : PAL.mint[Math.floor(h * 4)], .93 + .14 * hash(i, j, 7));
    W.add(x, y, -GZ / 2, GX, GY, GZ, col);
    if (j <= 4 && (i < -1 || i > 9)) { const wz = j === 0 ? 26 : j === 4 ? 26 : 18; W.add(x, y, wz / 2, GX, GY, wz, tint(THREE, j === 0 ? PAL.skirt : j === 4 ? PAL.cap : PAL.wain[Math.floor(hash(i, j, 9) * 3)], .94 + .1 * hash(i, j, 2))); }
  }
  W.build(g);
  for (let k = 0; k < 62; k++) for (let i = I0; i <= I1; i++) Fl.add(X0 + (i + .5) * GX, FL - 15, (k + .5) * GZ, GX - 1.6, 30, GZ - 1.6, tint(THREE, (i + k) & 1 ? PAL.cream : PAL.peach, .95 + .1 * hash(i, k, 2)));
  Fl.build(g);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(7000, 30, 5200), new THREE.MeshStandardMaterial({ color: PAL.grout, roughness: .95 })); slab.position.set(0, FL - 33, 2500); slab.receiveShadow = true; g.add(slab);
  return g;
}

// ---- door (real DOOR rect from core/scene.js): frame, hinged slab of voxels (swings toward the camera), raised panels, PULL plate in fine voxels (can glow), bar handle, 3 hinges (can glow)
const nd = d => ({ x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1, plate: Array.isArray(d.plate) ? d.plate : [d.plate.x0, d.plate.y0, d.plate.x1, d.plate.y1],
  handle: Array.isArray(d.handle) ? { x0: d.handle[0] - 10, x1: d.handle[0] + 90, y: d.handle[1] } : d.handle, hinges: (d.hinges || d.hingeY.map(y => ({ x: d.x1, y }))).map(h => typeof h === 'number' ? { x: d.x1, y: h } : h) });
const FONT = { P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'], U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'], L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'] };
export function door(S, rect0) {
  const { THREE, scene } = S, rect = nd(rect0), grp = new THREE.Group(); scene.add(grp);
  const X1 = rect.x1 - 960, jy = j => FL + (j + .5) * GY;
  const Fr = voxels(S); for (let j = 0; j <= 20; j++) for (const i of [-1, 9]) Fr.add(X0 + (i + .5) * GX, jy(j), -GZ / 4, GX, GY, GZ * 1.5, tint(THREE, PAL.frame[Math.floor(hash(i, j, 1) * 3)], .96 + .08 * hash(i, j, 2)));
  for (let i = 0; i < 9; i++) Fr.add(X0 + (i + .5) * GX, jy(20), -GZ / 4, GX, GY, GZ * 1.5, tint(THREE, PAL.frame[Math.floor(hash(i, 20, 1) * 3)], .96 + .08 * hash(i, 20, 2))); Fr.build(grp);
  const pivot = new THREE.Group(); pivot.position.set(X1, 0, 24); grp.add(pivot);                                  // hinge axis = right edge
  const D = voxels(S), px = i => (i + .5) * GX - 380;
  for (let j = 0; j < 20; j++) for (let i = 0; i < 9; i++) D.add(px(i), jy(j), 0, GX, GY, 30, tint(THREE, PAL.door, .94 + .12 * hash(i, j, 4)));
  for (const [a, b] of [[11, 17], [2, 8]]) for (let j = a; j <= b; j++) for (let i = 1; i <= 7; i++) D.add(px(i), jy(j), 22, GX, GY, 14, tint(THREE, PAL.panel, .95 + .1 * hash(i, j, 6)));
  D.build(pivot);
  // PULL plate: 25 x 11 fine voxels (4.8 x 5 px); letters 5 x 7 in dark ink, raised 4 px
  const pl = rect.plate, pw = pl[2] - pl[0], ph = pl[3] - pl[1], cw = pw / 25, ch = ph / 11, Pb = voxels(S), Pl = voxels(S), word = 'PULL', ink = new THREE.Color(PAL.ink);
  for (let r = 0; r < 11; r++) for (let c = 0; c < 25; c++) { const x = pl[0] - 960 - X1 + (c + .5) * cw, y = 960 - pl[1] - (r + .5) * ch; Pb.add(x, y, 22 + 4.5, cw, ch, 9, tint(THREE, PAL.plate, .96 + .06 * hash(c, r, 3))); }
  word.split('').forEach((chr, n) => FONT[chr].forEach((row, r) => [...row].forEach((v, c) => { if (v === '1') { const cc = 1 + n * 6 + c, rr = 2 + r; Pl.add(pl[0] - 960 - X1 + (cc + .5) * cw, 960 - pl[1] - (rr + .5) * ch, 22 + 9 + 3, cw, ch, 7, ink); } })));
  const plMat = voxMat(S, { emissive: new THREE.Color('#ffb347'), emissiveIntensity: 0 }); Pb.build(pivot, { mat: plMat }); Pl.build(pivot);
  const Hd = voxels(S), h = rect.handle, hy = 960 - h.y, hn = 9, hc = (h.x1 - h.x0) / hn, br = new THREE.Color(PAL.brass);                       // horizontal bar on the left edge, 9 x 2 voxels of 11 px
  for (let c = 0; c < hn; c++) for (const dy of [-5.5, 5.5]) Hd.add(h.x0 - 960 - X1 + (c + .5) * hc, hy + dy, 15 + 30, hc, 11, 11, tint(THREE, PAL.brass, .94 + .12 * hash(c, dy, 2)));
  for (const x of [h.x0 + 6, h.x1 - 6]) Hd.add(x - 960 - X1, hy, 15 + 15, 11, 22, 22, br); Hd.build(pivot);
  const hingeMat = voxMat(S, { emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0 }), Hn = voxels(S);
  rect.hinges.forEach(hh => { const y0 = 960 - hh.y; for (let r = -3; r <= 3; r++) { for (const dx of [-7, 7]) for (const dz of [-7, 7]) Hn.add(-9 + dx, y0 + r * 14, 15 + 14 + dz, 14, 14, 14, br); for (let c = 0; c < 4; c++) Hn.add(-14 - c * 14, y0 + r * 14, 15 + 4, 14, 14, 8, tint(THREE, PAL.brass, .92 + .12 * hash(c, r, 5))); } });
  Hn.build(pivot, { mat: hingeMat });
  return { group: grp, pivot, plateMat: plMat, hingeMat, apply(st = {}) { pivot.rotation.y = (st.open || 0) * 1.95; plMat.emissiveIntensity = (st.glowPlate || 0) * 1.1; hingeMat.emissiveIntensity = (st.glowHinge || 0) * 1.1; } };
}

// ---- toy block: crisp cube with a pixel emblem (circle / triangle / square) on every face
export function toyBlock(S, size, color, sym = 0) {
  const { THREE } = S, N = 16, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), base = new THREE.Color(color), lt = base.clone().multiplyScalar(1.35), dk = base.clone().multiplyScalar(.7);
  g.fillStyle = '#' + dk.getHexString(); g.fillRect(0, 0, N, N); g.fillStyle = '#' + base.getHexString(); g.fillRect(1, 1, N - 2, N - 2); g.fillStyle = '#' + lt.getHexString(); g.fillRect(1, 1, N - 2, 1); g.fillRect(1, 1, 1, N - 2);
  g.fillStyle = '#' + lt.getHexString();
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) { const dx = x - 7.5, dy = y - 7.5, s = sym % 3; if ((s === 0 && dx * dx + dy * dy < 17) || (s === 1 && y >= 3 && Math.abs(dx) <= (y - 3) * .6 + .5) || (s === 2 && Math.abs(dx) < 3.2 && Math.abs(dy) < 3.2)) g.fillRect(x, y, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial({ map: t, roughness: .8 })); m.castShadow = m.receiveShadow = true; return m;
}
export const kid = (S) => buildVoxKid(S.THREE, { ao: S.ao });

// ---- 2D kit pieces (drawn over the render): pixel hearts, text, ringEdge, vignette
const HEART = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'];
function pixHeart(g, cx, cy, cell, a = 1, ghost = false) {
  const w = HEART[0].length, h = HEART.length, x0 = cx - w * cell / 2, y0 = cy - h * cell / 2, on = (c, r) => HEART[r] && HEART[r][c] === 'X';
  g.save(); g.globalAlpha = a;
  if (!ghost) { g.fillStyle = 'rgba(40,20,30,.35)'; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (on(c, r)) g.fillRect(x0 + c * cell + 3, y0 + r * cell + 4, cell + .5, cell + .5); }
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (on(c, r)) {
    g.fillStyle = ghost ? 'rgba(255,255,255,.28)' : (!on(c, r - 1) || !on(c - 1, r)) ? PAL.heart[0] : (!on(c, r + 1) || !on(c + 1, r)) ? PAL.heart[2] : PAL.heart[1];
    g.fillRect(x0 + c * cell, y0 + r * cell, cell + .5, cell + .5);
  }
  g.restore();
}
export function hearts(g, n, fx = 1) {                                                                           // 10 slots centred on x 960, y 465, 60 px apart; heartFx 0..1 = the lost heart (slot n) shakes, then drops
  for (let i = 0; i < 10; i++) pixHeart(g, 960 + (i - 4.5) * 60, 465, 5.4, i < n ? 1 : .6, i >= n);
  if (fx < 1 && n < 10) { const cx = 960 + (n - 4.5) * 60, sh = fx < .3 ? Math.sin(fx * 150) * 4 * (1 - fx / .3) : 0, u = clamp((fx - .3) / .7); g.save(); g.translate(cx + sh, 465 + 380 * u * u); g.rotate(u * .9); pixHeart(g, 0, 0, 5.4, 1 - u * u); g.restore(); }
}
export function text(g, str, x, y, size, o = {}) {                                                              // chunky lettering: stepped extrusion in the palette
  g.save(); g.font = `800 ${size}px Inter, sans-serif`; g.textBaseline = 'alphabetic'; g.textAlign = o.align || 'left';
  for (let k = 8; k > 0; k--) { g.fillStyle = k > 4 ? '#5b3a2a' : '#8b5a3a'; g.fillText(str, x + k, y + k); }
  g.fillStyle = o.color || PAL.brass; g.fillText(str, x, y); g.restore();
}
export function ringEdge(g, r, cx, cy) {                                                                        // the seam's circle edge as a ring of 10 px cubes (stepped), two-tone with a highlight
  const n = Math.min(1500, Math.round(TAU * r / 9)), s = 10;
  g.save();
  for (const pass of [0, 1]) for (let i = 0; i < n; i++) {
    const t = i / n * TAU, x = Math.round((cx + Math.cos(t) * r) / 5) * 5, y = Math.round((cy + Math.sin(t) * r) / 5) * 5; if (x < -20 || y < -20 || x > 1940 || y > 1940) continue;
    if (!pass) { g.fillStyle = 'rgba(40,25,10,.4)'; g.fillRect(x - s / 2 + 3, y - s / 2 + 5, s, s); }
    else { g.fillStyle = '#9c6a2e'; g.fillRect(x - s / 2, y - s / 2, s, s); g.fillStyle = PAL.brass; g.fillRect(x - s / 2, y - s / 2, s - 2, s - 2); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x - s / 2, y - s / 2, s - 2, 2); }
  }
  g.restore();
}
export function vignette(g, a = .16) { const rg = g.createRadialGradient(960, 980, 700, 960, 980, 1450); rg.addColorStop(0, 'rgba(40,20,0,0)'); rg.addColorStop(1, `rgba(40,20,0,${a})`); g.fillStyle = rg; g.fillRect(0, 0, 1920, 1920); }

export const kit = { PAL, FOV, WALL_Y, GX, GY, GZ, stage, voxels, voxMat, hallway, door, toyBlock, kid, hearts, text, ringEdge, vignette, accent: '#f2b84b' };

export default {
  id: 'voxel', kind: 'webgl', kit, ringEdge,
  async init(api) {                                                                  // the scene module comes from scenes/<timeline.story>/voxel.js: { init(api, kit), render(out, s, kit) }
    this.api = api; const tl = await (await fetch(new URL('../timeline.json', import.meta.url))).json();
    this.scene = (await import(`../scenes/${tl.story || 'door'}/voxel.js`)).default; await this.scene.init(api, kit);
  },
  render(out, s) { this.scene.render(out, s, kit); },
};
