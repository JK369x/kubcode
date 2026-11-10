// styles/b2-voxsoldier.js: the soldier as boxes only (cube-world look). Same API and the same pose mapping as core/soldier3d.js:
//   const rig = buildVox(THREE); scene.add(rig.group); rig.apply(pose);   units = master px, y up, apply() puts him at (x-960, -(y-960)).
// Body in profile facing +x (root yawed a little toward the camera), head cube turned to the camera, cap lags via pose.cap, squash about the feet.
import { PALETTE } from '../core/soldier2d.js';
import { FEET, CX, CY } from '../core/pose.js';

export function buildVox(THREE, opts = {}) {
  const pal = { ...PALETTE, tunic: '#e2433b', tunic2: '#b8302f', belt: '#f7f2e4', buckle: '#f2bb3a', glove: '#f7f2e4', trousers: '#33407c', boots: '#3a2b2f',
    skin: '#f5c59b', skin2: '#dd9f78', cap: '#2f58a6', capBand: '#f2bb3a', visor: '#22366e', ...(opts.palette || {}) };
  const mats = {}, geos = [];
  const mat = k => mats[k] || (mats[k] = new THREE.MeshLambertMaterial({ color: pal[k] }));
  const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
  const P = (x, y, z = 0) => V(x, FEET - y, z);                                  // 2D local (y down, origin = bbox centre) -> sq-local (y up, origin = feet)
  const bx = (w, h, d, k, parent, pos, rot) => {
    const g = new THREE.BoxGeometry(w, h, d); geos.push(g);
    const m = new THREE.Mesh(g, typeof k === 'string' ? mat(k) : k); if (pos) m.position.copy(pos); if (rot) m.rotation.set(...rot);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  const grp = (parent, pos) => { const g = new THREE.Group(); if (pos) g.position.copy(pos); parent.add(g); return g; };

  const group = new THREE.Group(), root = new THREE.Group(), sq = new THREE.Group();
  group.add(root); root.add(sq); sq.position.set(0, -FEET, 0);
  root.rotation.order = 'ZYX'; root.rotation.y = -.3;                             // yaw first, then the screen-plane roll from pose.rot
  const parts = {};

  // torso, straps, belt
  parts.torso = bx(88, 118, 58, 'tunic', sq, P(4, 4));
  for (const s of [1, -1]) bx(13, 140, 3, 'belt', sq, P(6, -8, 30), [0, 0, s * .5]);
  bx(96, 16, 62, 'belt', sq, P(4, 42)); bx(18, 18, 6, 'buckle', sq, P(34, 42, 32));
  bx(28, 26, 28, 'skin', sq, P(8, -54));
  // head cube (turned to the camera), block eyes, brows, mouth, nose, chin strap
  parts.head = grp(sq, P(8, -106)); parts.head.rotation.y = .6;
  const head = parts.head;
  bx(96, 96, 96, 'skin', head);
  const eyes = [], pupils = [], lids = [], brows = [];
  for (const ex of [-23, 23]) {
    eyes.push(bx(23, 27, 4, 'eyeW', head, V(ex, 5, 49)));
    pupils.push(bx(15, 20, 4, 'pupil', head, V(ex, 5, 51.5)));
    lids.push(bx(26, 5, 4, 'brow', head, V(ex, 3, 49.5)));
    brows.push(bx(28, 6, 4, 'brow', head, V(ex, 29, 49)));
  }
  const mouths = { flat: bx(34, 6, 3, 'mouth', head, V(0, -29, 49)), o: bx(18, 22, 3, 'mouth', head, V(0, -30, 49)), smirk: bx(34, 6, 3, 'mouth', head, V(0, -29, 49), [0, 0, .2]) };
  bx(15, 15, 15, 'skin2', head, V(0, -7, 53));
  bx(92, 5, 3, 'strap', head, V(0, -41, 49)); bx(3, 60, 9, 'strap', head, V(48.5, -8, 24));
  // cap: yawed with the head, lags via pose.cap
  parts.cap = grp(sq, P(12, -152)); const capBase = P(12, -152), capY = grp(parts.cap); capY.rotation.y = .6;
  bx(112, 13, 112, 'capBand', capY, V(0, 2, 0)); bx(104, 34, 104, 'cap', capY, V(0, 24, 0)); bx(14, 10, 14, 'capBand', capY, V(0, 46, 0)); bx(76, 6, 60, 'visor', capY, V(0, 2, 74));
  // limbs: boxes with joint cubes so bent limbs stay closed
  const limb = (kind, hip, z, key) => {
    const arm = kind === 'arm', len = arm ? 50 : 60, len2 = arm ? 46 : 60, w = arm ? 26 : 32;
    const top = grp(sq, hip.clone().setZ(z)), mid = grp(top, V(0, -len, 0));
    bx(w, len, w, key, top, V(0, -len / 2, 0)); bx(w + 4, w + 4, w + 4, key, top);
    bx(w - 2, len2, w - 2, key, mid, V(0, -len2 / 2, 0)); bx(w + 2, w + 2, w + 2, key, mid);
    if (arm) bx(w + 2, w + 2, w + 2, 'glove', mid, V(0, -len2 - 4, 0)); else bx(62, 26, 38, 'boots', mid, V(14, -len2 - 2, 0));
    return { top, mid };
  };
  const A = { L: limb('arm', P(-8, -46), -36, 'tunic'), R: limb('arm', P(10, -46), 36, 'tunic') };
  const Lg = { L: limb('leg', P(-8, 52), -16, 'trousers'), R: limb('leg', P(8, 52), 16, 'trousers') };
  // plank: world-space prop (child of group)
  const wc = document.createElement('canvas'); wc.width = 64; wc.height = 8; { const g = wc.getContext('2d'); g.fillStyle = '#cf9b5e'; g.fillRect(0, 0, 64, 8);
    for (let i = 0; i < 40; i++) { g.fillStyle = i % 3 ? '#b8824a' : '#dcae72'; g.fillRect((i * 37) % 64, (i * 5) % 8, 5 + (i % 7), 1); }
    g.fillStyle = 'rgba(80,40,10,.55)'; g.fillRect(0, 0, 64, 1); g.fillRect(0, 7, 64, 1); }
  const wt = new THREE.CanvasTexture(wc); wt.colorSpace = THREE.SRGBColorSpace; wt.magFilter = THREE.NearestFilter; wt.minFilter = THREE.LinearFilter; wt.generateMipmaps = false;
  const plank = new THREE.Group(); group.add(plank);
  bx(210, 30, 18, new THREE.MeshLambertMaterial({ map: wt }), plank);
  for (const x of [-96, 96]) { bx(22, 32, 20, 'plank2', plank, V(x, 0, 0)); }

  function apply(p) {
    root.position.set(p.x - CX, -(p.y - CY), 0); root.rotation.z = -p.rot; root.scale.setScalar(p.scale);
    const sy = p.squash; sq.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    for (const s of ['L', 'R']) { A[s].top.rotation.z = p['arm' + s]; A[s].mid.rotation.z = p['elbow' + s]; Lg[s].top.rotation.z = p['leg' + s]; Lg[s].mid.rotation.z = -p['knee' + s]; }
    parts.cap.position.set(capBase.x + p.cap.dx, capBase.y - p.cap.dy, 0); parts.cap.rotation.z = -p.cap.rot;
    const lid = p.eyes === 'closed' ? 1 : (p.lid || 0), wide = p.eyes === 'wide' ? 1.2 : 1, [lx, ly] = p.look || [0, 0], shut = lid >= .85;
    eyes.forEach((e, i) => {
      e.visible = !shut; e.scale.set(wide, Math.max(.12, wide * (1 - lid)), 1);
      pupils[i].visible = !shut && lid < .7; pupils[i].position.set(e.position.x + lx * 3.5, 5 - ly * 4, 51.5); pupils[i].scale.set(wide > 1 ? .75 : 1, Math.max(.25, 1 - lid), 1);
      lids[i].visible = shut;
    });
    brows.forEach((b, i) => { b.position.y = 27 + 10 * (p.brows - .4); b.rotation.z = (p.brows - .4) * (i ? -.3 : .3); });
    mouths.flat.visible = p.mouth === 'flat'; mouths.o.visible = p.mouth === 'o'; mouths.smirk.visible = p.mouth === 'smirk';
    plank.position.set(p.plank.x - CX, -(p.plank.y - CY), 0); plank.rotation.z = -p.plank.rot;
  }
  const dispose = () => { geos.forEach(g => g.dispose()); Object.values(mats).forEach(m => m.dispose()); wt.dispose(); };
  return { group, root, plank, parts, mats, apply, dispose };
}
