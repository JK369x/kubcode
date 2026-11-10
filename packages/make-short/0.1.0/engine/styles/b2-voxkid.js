// styles/b2-voxkid.js (B2): the kid built from boxes (voxel world): a CUBE head with the 2D face (b2-face.js / hero2d.faceCanvas) as its front texture, hair slabs, a box body,
// box limbs with joint cubes, mitten cubes, a collar of 4 red boxes and two scarf tails of red cube segments. Same API and the same pose mapping as core/hero3d.js:
//   const kid = buildVoxKid(THREE, {ao}); scene.add(kid.group); kid.apply(pose);   units = master px, y up, apply() puts the PELVIS at (x-960, -(y-960)).
// The head is yawed toward the camera more than the body (like the 2D 3/4 face), so the face stays readable in profile.
import { PALETTE } from '../core/hero2d.js';
import { HERO, CX, CY } from '../core/pose.js';
import { faceInto } from './b2-face.js';

export function buildVoxKid(THREE, opts = {}) {
  const mats = {}, geos = [];
  const mat = k => mats[k] || (mats[k] = new THREE.MeshStandardMaterial({ color: PALETTE[k], roughness: .85, metalness: 0, map: opts.ao || null }));
  const box = (w, h, d, k, parent, pos) => { const g = new THREE.BoxGeometry(w, h, d); geos.push(g); const m = new THREE.Mesh(g, mat(k)); if (pos) m.position.set(...pos); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const grp = (parent, pos) => { const g = new THREE.Group(); if (pos) g.position.set(...pos); parent.add(g); return g; };
  const group = new THREE.Group(), root = grp(group), turnG = grp(root), sq = grp(turnG, [0, -HERO.SOLE, 0]);
  const V = (x, y, z = 0) => [x, HERO.SOLE - y, z], parts = {};
  parts.tunic = box(104, 150, 84, 'tunic', sq, V(0, -66)); box(44, 26, 44, 'skin', sq, V(0, -146));
  parts.headG = grp(sq, V(...HERO.NECK)); const hv = [HERO.HEAD[0] - HERO.NECK[0], -(HERO.HEAD[1] - HERO.NECK[1])];
  parts.headC = grp(parts.headG, [hv[0], hv[1], 0]);
  const HS = 2 * HERO.HR - 14;                                                                  // head cube side (236)
  parts.head = box(HS, HS, HS, 'skin', parts.headC);
  box(HS + 14, 46, HS + 14, 'hair', parts.headC, [0, HS / 2 + 8, 0]); box(46, HS - 40, HS + 14, 'hair', parts.headC, [-(HS / 2 + 10), 18, 0]);
  for (const z of [-1, 1]) box(28, 46, 22, 'skin2', parts.headC, [-8, -12, z * (HS / 2 + 9)]);
  const fc = document.createElement('canvas'); fc.width = fc.height = 256; const faceTex = new THREE.CanvasTexture(fc); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 8;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(HS, HS), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })); face.rotation.y = Math.PI / 2; face.position.set(HS / 2 + .6, 0, 0); face.receiveShadow = true; parts.headC.add(face);
  box(124, 46, 34, 'scarf', sq, V(0, -150, 58)); box(124, 46, 34, 'scarf', sq, V(0, -150, -58)); box(34, 46, 84, 'scarf', sq, V(-56, -150, 0)); box(34, 46, 84, 'scarf', sq, V(56, -150, 0));
  const limb = (kind, s, z) => {
    const isArm = kind === 'arm', top = grp(sq, isArm ? V(s === 'L' ? -22 : 28, HERO.SHO_Y, z) : V(s === 'L' ? -12 : 12, 0, z)), l1 = isArm ? HERO.UPPER : HERO.THIGH, l2 = isArm ? HERO.FORE : HERO.SHIN;
    const mid = grp(top, [0, -l1, 0]), w = isArm ? 30 : 36, key = isArm ? 'tunic' : 'legs';
    box(w, l1, w, key, top, [0, -l1 / 2, 0]); box(w + 6, w + 6, w + 6, key, top); box(w - 2, l2, w - 2, key, mid, [0, -l2 / 2, 0]); box(w + 4, w + 4, w + 4, key, mid);
    if (isArm) box(46, 46, 46, 'mitten', mid, [0, -l2 - 10, 0]); else box(68, 32, 44, 'boots', mid, [14, -l2 - 10, 0]);
    return { top, mid };
  };
  const A = { L: limb('arm', 'L', -40), R: limb('arm', 'R', 40) }, G = { L: limb('leg', 'L', -18), R: limb('leg', 'R', 18) };
  const scarf = { a: [], b: [] };
  for (const k of ['a', 'b']) for (let i = 0; i < 7; i++) scarf[k].push(box(1, 1, 1, i > 4 ? 'scarf2' : 'scarf', group));
  function apply(p) {
    const f = (p.turn ?? 1) < 0 ? -1 : 1, t = Math.min(1, Math.abs(p.turn ?? 1)), k = p.scale || 1;
    root.position.set(p.x - CX, -(p.y - CY), 0); root.scale.set(f * k, k, k); root.rotation.z = -(p.rot || 0) * f;
    turnG.rotation.y = -(Math.PI / 2) * (1 - t) * .9;
    const s = p.squash || 1; sq.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    for (const q of ['L', 'R']) { A[q].top.rotation.z = p['arm' + q]; A[q].mid.rotation.z = p['elbow' + q]; G[q].top.rotation.z = p['leg' + q]; G[q].mid.rotation.z = -p['knee' + q]; }
    parts.headG.rotation.z = -(p.headRot || 0); parts.headC.rotation.y = -(55 * Math.PI / 180) * t;
    faceInto(fc, p); faceTex.needsUpdate = true;
    for (const key of ['a', 'b']) { const pts = p.scarf && p.scarf[key]; scarf[key].forEach((m, i) => { const a = pts && pts[i], b = pts && pts[i + 1]; m.visible = !!(a && b); if (!m.visible) return;
      const ax = a[0] - CX, ay = -(a[1] - CY), bx = b[0] - CX, by = -(b[1] - CY); m.position.set((ax + bx) / 2, (ay + by) / 2, -40); m.rotation.z = Math.atan2(by - ay, bx - ax); m.scale.set(Math.hypot(bx - ax, by - ay) * .94 + 4, 32 - i * 2, 32 - i * 2); }); }
  }
  const dispose = () => { geos.forEach(g => g.dispose()); Object.values(mats).forEach(m => m.dispose()); faceTex.dispose(); };
  return { group, root, parts, scarf, mats, apply, dispose, faceCanvas: fc };
}
