// core/hero3d.js: bean-like three.js build of the kid, driven by the same pose() as hero2d.
//   const rig = build(THREE, {palette?});  scene.add(rig.group);  rig.apply(pose);
// Units = master px, y UP. apply() puts the PELVIS at (p.x-960, -(p.y-960), 0); the rig faces +x and turns toward the camera with
// p.turn (0 = front, +-1 = 3/4). rig.parts = named meshes/groups for per-part materials; rig.scarf = the two tail chains (group space).
import { PALETTE, faceCanvas } from './hero2d.js';
import { HERO, CX, CY } from './pose.js';

export function build(THREE, opts = {}) {
  const pal = { ...PALETTE, ...(opts.palette || {}) }, mats = {}, geos = [];
  const mat = k => mats[k] || (mats[k] = new THREE.MeshStandardMaterial({ color: pal[k], roughness: .65, metalness: 0 }));
  const mesh = (g, k, parent, pos, scl) => { geos.push(g); const m = new THREE.Mesh(g, mat(k)); if (pos) m.position.set(...pos); if (scl) m.scale.set(...scl); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const grp = (parent, pos) => { const g = new THREE.Group(); if (pos) g.position.set(...pos); parent.add(g); return g; };
  const group = new THREE.Group(), root = grp(group), turnG = grp(root), sq = grp(turnG, [0, -HERO.SOLE, 0]);   // sq origin = sole line (squash pivot)
  const V = (x, y, z = 0) => [x, HERO.SOLE - y, z];                                                           // 2D local (y down, pelvis 0) -> sq-local
  const parts = {};
  parts.tunic = mesh(new THREE.CapsuleGeometry(52, 70, 8, 16), 'tunic', sq, V(0, -66), [1, 1, .8]);
  parts.headG = grp(sq, V(...HERO.NECK)); const hv = [HERO.HEAD[0] - HERO.NECK[0], -(HERO.HEAD[1] - HERO.NECK[1])];
  const faceTex = new THREE.CanvasTexture(faceCanvas({ ...opts.pose0, turn: 0 }, 1024)); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 4;
  mats.face = new THREE.MeshStandardMaterial({ map: faceTex, roughness: .7, metalness: 0 });
  parts.head = new THREE.Mesh(new THREE.SphereGeometry(HERO.HR, 48, 32), mats.face); geos.push(parts.head.geometry); parts.head.position.set(hv[0], hv[1], 0); parts.head.castShadow = parts.head.receiveShadow = true; parts.headG.add(parts.head);
  parts.hair = mesh(new THREE.SphereGeometry(HERO.HR + 3, 40, 20, 0, Math.PI * 2, 0, Math.PI * .36), 'hair', parts.headG, [hv[0] - 14, hv[1] + 8, 0]); parts.hair.rotation.z = .5;
  parts.scarfWrap = mesh(new THREE.TorusGeometry(58, 22, 12, 28), 'scarf', sq, V(0, -150), [1, .7, 1]); parts.scarfWrap.rotation.x = Math.PI / 2;
  const limb = (kind, s, z) => {
    const isArm = kind === 'arm', top = grp(sq, isArm ? V(s === 'L' ? -22 : 28, HERO.SHO_Y, z) : V(s === 'L' ? -12 : 12, 0, z)), l1 = isArm ? HERO.UPPER : HERO.THIGH, l2 = isArm ? HERO.FORE : HERO.SHIN;
    const mid = grp(top, [0, -l1, 0]), r = isArm ? 13 : 16, key = isArm ? 'tunic' : 'legs';
    mesh(new THREE.CapsuleGeometry(r, l1 - r, 6, 12), key, top, [0, -l1 / 2, 0]); mesh(new THREE.CapsuleGeometry(r, l2 - r, 6, 12), key, mid, [0, -l2 / 2, 0]);
    if (isArm) mesh(new THREE.SphereGeometry(HERO.MIT, 16, 12), 'mitten', mid, [0, -l2 - 13, 0]); else mesh(new THREE.SphereGeometry(1, 16, 10), 'boots', mid, [12, -l2 - 8, 0], [30, 16, 20]);
    return { top, mid };
  };
  const A = { L: limb('arm', 'L', -40), R: limb('arm', 'R', 40) }, G = { L: limb('leg', 'L', -18), R: limb('leg', 'R', 18) };
  const scarf = { a: [], b: [] };
  for (const k of ['a', 'b']) for (let i = 0; i < 7; i++) scarf[k].push(mesh(new THREE.BoxGeometry(1, 1, 16), i > 4 ? 'scarf2' : 'scarf', group));
  function apply(p) {
    const fc = (p.turn ?? 1) < 0 ? -1 : 1, t = Math.min(1, Math.abs(p.turn ?? 1)), k = p.scale || 1;
    root.position.set(p.x - CX, -(p.y - CY), 0); root.scale.set(fc * k, k, k); root.rotation.z = -(p.rot || 0) * fc;
    turnG.rotation.y = -(Math.PI / 2) * (1 - .55 * t);                                                       // turn 0 = front, 1 = 3/4 (face ~40 deg toward camera)
    const s = p.squash || 1; sq.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    for (const q of ['L', 'R']) { A[q].top.rotation.z = p['arm' + q]; A[q].mid.rotation.z = p['elbow' + q]; G[q].top.rotation.z = p['leg' + q]; G[q].mid.rotation.z = -p['knee' + q]; }
    parts.headG.rotation.z = -(p.headRot || 0);
    faceCanvas(p, 1024); faceTex.needsUpdate = true;                                                         // the 2D face, exactly
    for (const key of ['a', 'b']) { const pts = p.scarf && p.scarf[key]; scarf[key].forEach((m, i) => { const a = pts && pts[i], b = pts && pts[i + 1]; m.visible = !!(a && b); if (!m.visible) return;
      const ax = a[0] - CX, ay = -(a[1] - CY), bx = b[0] - CX, by = -(b[1] - CY); m.position.set((ax + bx) / 2, (ay + by) / 2, -40); m.rotation.z = Math.atan2(by - ay, bx - ax); m.scale.set(Math.hypot(bx - ax, by - ay) + 6, 30 - i * 2, 1); }); }
  }
  const dispose = () => { geos.forEach(g => g.dispose()); Object.values(mats).forEach(m => m.dispose()); };
  return { group, root, parts, scarf, mats, apply, dispose };
}
