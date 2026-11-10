// styles/10-teardown.js: EXPLODED TEARDOWN look kit + style wrapper. Generic look code only (exported as `kit`); the door story lives in
// scenes/<story>/teardown.js, which receives the kit and reads scene(f). render() delegates to the active scene (timeline.json "story", default "door").
// Look: a grey studio photographed straight-on (on-axis perspective, 1 unit = 1 master px at the wall plane), soft key + cool rim, soft shadows,
// parts that separate along the depth axis with a small camera yaw, one accent colour (#ff5a2e) reserved for measured things, big teardown type.
import { buildStudioRig } from './b4-rig3d.js';

const W = 1920, D = 3200, TAU = Math.PI * 2, ACC = '#ff5a2e', INK = '#13151a';
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = x => { x = clamp(x); return x * x * (3 - 2 * x); };
export const hash = (a, b = 0) => { const n = Math.sin(a * 127.1 + b * 311.7 + 7.7) * 43758.5453; return n - Math.floor(n); };

// ---------------------------------------------------------------- 2D pieces (overlay): type, hearts, leaders, brackets, ring edge
export function text(g, str, x, y, size, o = {}) {              // teardown type: Inter 700 caps, ink with a soft white halo so it reads on any grey
  g.save(); g.font = `${o.weight || 700} ${size}px ${o.mono ? 'JetBrains Mono, JBM, monospace' : 'Inter, sans-serif'}`; g.textAlign = o.align || 'left'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  g.globalAlpha = (o.alpha ?? 1); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = Math.max(8, size * .14); g.strokeText(str, x, y); g.fillStyle = o.color || INK; g.fillText(str, x, y); g.restore();
}
export function hearts(g, n, lost = null, y = 465, x0 = 960, pitch = 60, total = 10) {
  const hp = (s) => { const o = []; for (let i = 0; i < 28; i++) { const t = TAU * i / 28; o.push([16 * Math.pow(Math.sin(t), 3) * s, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s + 2 * s]); } return o; };
  const one = (cx, cy, rot, lit, alpha) => { g.save(); g.globalAlpha = alpha; g.translate(cx, cy); g.rotate(rot); g.beginPath(); hp(1.5).forEach((q, k) => k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); g.fillStyle = lit ? ACC : 'rgba(255,255,255,.35)'; g.fill(); g.lineWidth = 4; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke(); g.restore(); };
  for (let i = 0; i < total; i++) {
    const cx = x0 + (i - (total - 1) / 2) * pitch;
    if (lost && lost.i === i) { const t = lost.t; if (t < .35) one(cx + Math.sin(t * 90) * 5 * (1 - t / .35), y, 0, true, 1); else { one(cx, y, 0, false, 1); const u = (t - .35) / .65; if (u < 1) one(cx, y + 1400 * u * u, u * .9, true, 1 - u); } }
    else one(cx, y, 0, i < n, 1);
  }
}
export function leader(g, pts, prog, o = {}) {                    // accent leader that draws in along a polyline, dot at the part end (pts[0]); optional end dot
  const L = []; let tot = 0; for (let i = 0; i + 1 < pts.length; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); L.push(d); tot += d; }
  let rem = tot * clamp(prog); g.save(); g.strokeStyle = o.color || ACC; g.lineWidth = o.w || 5; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i + 1 < pts.length && rem > 0; i++) { const k = Math.min(1, rem / L[i]); g.lineTo(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k); rem -= L[i]; } g.stroke();
  const dr = (o.dot || 10) * sm(prog * 2); g.fillStyle = o.color || ACC; g.beginPath(); g.arc(pts[0][0], pts[0][1], dr, 0, TAU); g.fill(); g.globalAlpha *= .55; g.lineWidth = 3; g.beginPath(); g.arc(pts[0][0], pts[0][1], dr * 2.2, 0, TAU); g.stroke(); g.restore();
}
export function ringEdge(ctx, r, cx, cy) {                        // the ring seam's rim in teardown: a clean white band with the accent line inside it
  ctx.save(); for (const [w, c, rr] of [[10, 'rgba(255,255,255,.95)', r], [3, ACC, r - 2]]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, Math.max(.5, rr), 0, TAU); ctx.stroke(); } ctx.restore();
}

// ---------------------------------------------------------------- 3D pieces
export function buildStudio(THREE, o = {}) {
  const R = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  R.setPixelRatio(1); R.setSize(W, W, false); R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.localClippingEnabled = true; R.toneMapping = THREE.NeutralToneMapping || THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), bg = 0xc9cdd3; scene.background = new THREE.Color(bg); scene.fog = new THREE.Fog(bg, 4200, 11000);
  const cam = new THREE.PerspectiveCamera(2 * Math.atan(960 / D) * 180 / Math.PI, 1, 100, 24000);
  const env = new THREE.Scene(); env.add(new THREE.Mesh(new THREE.BoxGeometry(40, 20, 40), new THREE.MeshBasicMaterial({ color: 0x8e949c, side: THREE.BackSide })));
  const panel = (w, h, x, y, z, k, c = 0xffffff) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 6, 0); env.add(m); };
  panel(14, 9, -11, 12, 13, 7); panel(12, 6, 15, 10, -9, 3.5, 0xd6e4ff); panel(34, 3, 0, 9.6, 0, 4); panel(10, 8, 0, 2, 17, 1.6);
  const pm = new THREE.PMREMGenerator(R); scene.environment = pm.fromScene(env, .04).texture; scene.environmentIntensity = .6;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, .6));
  const key = new THREE.DirectionalLight(0xfff3e4, 2.6); key.position.set(-500, 900, 1300); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1300, right: 1300, top: 1100, bottom: -1100, near: 100, far: 5200 }); key.shadow.bias = -.0006; key.shadow.normalBias = 1.5; key.shadow.radius = 6; scene.add(key); scene.add(key.target); key.target.position.set(200, 0, 0);
  const rim = new THREE.DirectionalLight(0xc2d6ff, 1.2); rim.position.set(900, 500, 900); scene.add(rim);
  const floorY = o.floorY ?? -390, wallZ = o.wallZ ?? -70;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26000, 26000), new THREE.MeshStandardMaterial({ color: 0xb6bac1, roughness: .9 })); floor.rotation.x = -Math.PI / 2; floor.position.y = floorY; floor.receiveShadow = true; scene.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd2d5da, roughness: .95 }), top = floorY + 12000, hole = o.hole;
  const wallPiece = (x0, x1, y0, y1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), wallMat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, wallZ); m.receiveShadow = true; scene.add(m); return m; };
  const wall = hole ? (wallPiece(-13000, hole.xl, floorY, top), wallPiece(hole.xr, 13000, floorY, top), wallPiece(hole.xl, hole.xr, hole.top, top)) : wallPiece(-13000, 13000, floorY, top);   // the doorway is a real hole in the wall
  const baseM = new THREE.MeshStandardMaterial({ color: 0xaab0b8, roughness: .6 });
  for (const [a0, a1] of hole ? [[-13000, hole.xl], [hole.xr, 13000]] : [[-13000, 13000]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(a1 - a0, 26, 14), baseM); m.position.set((a0 + a1) / 2, floorY + 13, wallZ + 7); m.castShadow = m.receiveShadow = true; scene.add(m); }
  return { R, scene, cam, key, floor, wall, floorY, wallZ };
}

export function door3d(THREE, D, o = {}) {                      // D = scene DOOR geometry (x0..y1, handle bar, plate, hinges); builds a hinged door with named parts
  const { x0, y0, x1, y1 } = D, w = x1 - x0, h = y1 - y0, X = x => x - 960, Y = y => 960 - y, cx = X((x0 + x1) / 2), cy = Y((y0 + y1) / 2), pivX = X(x1);
  const steel = () => new THREE.MeshPhysicalMaterial({ color: 0xb9bec6, metalness: .95, roughness: .28, clearcoat: .2, emissive: new THREE.Color(0xff5a2e), emissiveIntensity: 0 });
  const paint = c => new THREE.MeshPhysicalMaterial({ color: c, roughness: .55, clearcoat: .3, clearcoatRoughness: .4 });
  const mesh = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const root = new THREE.Group(), leafG = new THREE.Group(), fixed = new THREE.Group(); root.add(fixed); root.add(leafG); leafG.position.set(pivX, 0, 0);
  const slate = paint(0x41607a), pan = paint(0x4d7190);
  mesh(new THREE.BoxGeometry(w, h, 44), slate, leafG, cx - pivX, cy, -22);
  [[y0 + 100, 170], [y0 + 450, 480], [y0 + 805, 520]].forEach(([yy, hh]) => { const ph = Math.min(hh, y1 - yy - 40); mesh(new THREE.BoxGeometry(w - 70, ph, 6), pan, leafG, cx - pivX, Y(yy + ph / 2), 3); });   // raised panels
  const frame = paint(0xaeb3bb), fr = new THREE.Group(); fixed.add(fr);
  mesh(new THREE.BoxGeometry(38, h + 34, 64), frame, fr, X(x0) - 19, cy + 17, -20); mesh(new THREE.BoxGeometry(38, h + 34, 64), frame, fr, X(x1) + 19, cy + 17, -20); mesh(new THREE.BoxGeometry(w + 76, 34, 64), frame, fr, cx, Y(y0) + 17, -20);
  // hinges on the RIGHT edge (visible on our side): barrel + plate that spans leaf and jamb
  const hinges = D.hinges.map(hh => { const g = new THREE.Group(), m = steel(); mesh(new THREE.CylinderGeometry(12, 12, 108, 20), m, g, pivX - 4, Y(hh.y), 8); mesh(new THREE.BoxGeometry(70, 18, 6), m, g, pivX - 20, Y(hh.y), 5); fixed.add(g); g.userData.m = m; g.userData.y = Y(hh.y); return g; });
  // horizontal bar handle on the left edge (standoffs along z), PULL plate above it
  const H = D.handle, hlen = H.x1 - H.x0, hxc = X((H.x0 + H.x1) / 2) - pivX, hy = Y(H.y), handle = new THREE.Group(), hm = steel();
  mesh(new THREE.CylinderGeometry(9, 9, hlen, 16), hm, handle, hxc, hy, 36).rotation.z = Math.PI / 2;
  for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(5, 5, 34, 12), hm, handle, hxc + sx * (hlen / 2 - 8), hy, 18).rotation.x = Math.PI / 2;
  leafG.add(handle);
  const P = D.plate, pw = P.x1 - P.x0, ph = P.y1 - P.y0, pcx = X((P.x0 + P.x1) / 2), pcy = Y((P.y0 + P.y1) / 2);
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * ph / pw); const g2 = cv.getContext('2d'), gr = g2.createLinearGradient(0, 0, 512, cv.height); gr.addColorStop(0, '#d9dde3'); gr.addColorStop(.5, '#aeb4bd'); gr.addColorStop(1, '#cfd3da'); g2.fillStyle = gr; g2.fillRect(0, 0, 512, cv.height);
  for (let i = 0; i < cv.height; i++) { g2.fillStyle = `rgba(255,255,255,${.04 + (i % 7) * .01})`; g2.fillRect(0, i, 512, 1); } g2.strokeStyle = '#6a707a'; g2.lineWidth = 8; g2.strokeRect(10, 10, 492, cv.height - 20); g2.fillStyle = '#20242b'; g2.font = '800 150px Inter, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('PULL', 256, cv.height / 2 + 6);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
  const plateM = new THREE.MeshPhysicalMaterial({ map: tx, metalness: .55, roughness: .35, emissive: new THREE.Color(0xff5a2e), emissiveIntensity: 0 }); const plate = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 8), plateM); plate.position.set(pcx - pivX, pcy, 4); plate.castShadow = plate.receiveShadow = true; leafG.add(plate);
  const light = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2000), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); light.position.set(cx, cy, -420); root.add(light);
  const V = THREE.Vector3, plate0 = new V(pcx - pivX, pcy, 4);
  const homes = { hinge: D.hinges.map(hh => new V(pivX - 4, Y(hh.y), 8)), handle: new V(X((H.x0 + H.x1) / 2), hy, 36), plate: new V(pcx, pcy, 4) };   // assembled centres, world
  const part = { leaf: leafG, frame: fr, handle, plate, hinges, light, handleAnchor: new V(hxc, hy, 36) };
  const LEAF_BACK = 90;
  function apply(st) {                                            // st = scene.door {open, explode, glowHinge, glowPlate}: swing, glow, dimming (placement of the parts: explode())
    const e = sm(st.explode || 0);
    leafG.rotation.y = (st.open || 0) * 1.85;
    hinges.forEach(hg => { hg.userData.m.emissiveIntensity = 2.4 * (st.glowHinge || 0); });
    hm.emissiveIntensity = 0; plateM.emissiveIntensity = 1.6 * (st.glowPlate || 0);
    slate.color.setHex(0x41607a).multiplyScalar(1 - .3 * e); pan.color.setHex(0x4d7190).multiplyScalar(1 - .3 * e);
  }
  function explode(e, T) {                                        // e 0..1 (already eased by the caller), T = target world centres {hinge[3], handle, plate} at e = 1; the leaf recedes
    leafG.position.z = -LEAF_BACK * e; const lz = new V(0, 0, -LEAF_BACK * e);
    hinges.forEach((hg, i) => hg.position.copy(T.hinge[i]).sub(homes.hinge[i]).multiplyScalar(e));
    handle.position.copy(T.handle).sub(homes.handle).multiplyScalar(e).sub(lz);
    plate.position.copy(plate0).add(T.plate.clone().sub(homes.plate).multiplyScalar(e).sub(lz));
  }
  return { root, part, apply, explode, homes, leafBack: LEAF_BACK, X, Y, pivX, rect: [x0, y0, x1, y1] };
}

export const kit = { text, hearts, leader, ringEdge, buildStudio, door3d, buildStudioRig, ACC, INK, sm, clamp, hash };

// ---------------------------------------------------------------- style wrapper: delegates to the active story's scene
let SCENE = null;
export default {
  id: 'teardown', kind: 'webgl',
  async init(api) {
    let story = 'door'; try { const tl = await (await fetch(new URL('../timeline.json', import.meta.url))).json(); story = tl.story || 'door'; } catch (e) { /* default */ }
    SCENE = (await import(`../scenes/${story}/teardown.js`)).default; if (SCENE.init) await SCENE.init(api, kit);
  },
  render(out, s) { SCENE.render(out, s, kit); },
  ringEdge,
};
