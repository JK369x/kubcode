// core/soldier3d.js: simple three.js rig (capsules + boxes) driven by the same pose() object as soldier2d.
//   const rig = build(THREE, {palette?});  scene.add(rig.group);  rig.apply(pose);
// Units = master px (soldier 380 tall at scale 1, y UP, +x = facing). rig.group holds root (soldier) and plank (world-space prop);
// apply() puts the soldier at (p.x-960, -(p.y-960)) so the style only has to scale / place rig.group and aim its camera.
// rig.root.rotation.y can be set by the style for a 3/4 turn. rig.parts = named meshes/groups for per-part material swaps.
import { PALETTE } from './soldier2d.js';
import { FEET, CX, CY } from './pose.js';

export function build(THREE, opts = {}) {
  const pal = { ...PALETTE, ...(opts.palette || {}) }, mats = {}, geos = [];
  const mat = k => mats[k] || (mats[k] = new THREE.MeshStandardMaterial({ color: pal[k], roughness: .72, metalness: 0 }));
  const geo = g => (geos.push(g), g);
  const group = new THREE.Group(), root = new THREE.Group(), sq = new THREE.Group();      // sq: origin at the feet, squash pivot
  group.add(root); root.add(sq); sq.position.set(0, -FEET, 0);
  const P = (x, y, z = 0) => new THREE.Vector3(x, FEET - y, z);                              // 2D local (y down) -> sq-local (y up)
  const mesh = (g, k, parent, pos, rot) => { const m = new THREE.Mesh(geo(g), mat(k)); if (pos) m.position.copy(pos); if (rot) m.rotation.set(...rot); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const grp = (parent, pos) => { const g = new THREE.Group(); if (pos) g.position.copy(pos); parent.add(g); return g; };
  const parts = {};
  // torso + belts
  parts.torso = mesh(new THREE.BoxGeometry(84, 118, 54), 'tunic', sq, P(4, 4));
  for (const s of [1, -1]) mesh(new THREE.BoxGeometry(14, 150, 4), 'belt', sq, P(8, -8, 28), [0, 0, s * .43]);
  mesh(new THREE.BoxGeometry(92, 16, 58), 'belt', sq, P(4, 42)); mesh(new THREE.BoxGeometry(16, 18, 4), 'buckle', sq, P(30, 42, 30));
  // head, face
  parts.head = grp(sq, P(8, -104));
  mesh(new THREE.SphereGeometry(54, 32, 20), 'skin', parts.head);
  mesh(new THREE.CylinderGeometry(15, 17, 26, 16), 'skin', sq, P(8, -52));
  const face = grp(parts.head); face.rotation.y = .6;
  const eyes = [], pupils = [], brows = [];
  for (const [x, rx, ry] of [[-17, 11, 15], [17, 13, 18]]) {
    const e = mesh(new THREE.SphereGeometry(1, 16, 12), 'eyeW', face, new THREE.Vector3(x, 4, 49)); e.scale.set(rx, ry, 5); eyes.push(e);
    const pu = mesh(new THREE.SphereGeometry(1, 12, 10), 'pupil', face, new THREE.Vector3(x, 4, 53)); pu.scale.set(6.5, 6.5, 3); pupils.push(pu);
    const b = mesh(new THREE.BoxGeometry(26, 6, 5), 'brow', face, new THREE.Vector3(x, 30, 50)); brows.push(b);
  }
  const mouths = { flat: mesh(new THREE.BoxGeometry(30, 6, 4), 'mouth', face, new THREE.Vector3(0, -32, 51)),
    o: mesh(new THREE.SphereGeometry(1, 14, 10), 'mouth', face, new THREE.Vector3(0, -34, 50)), smirk: mesh(new THREE.BoxGeometry(30, 6, 4), 'mouth', face, new THREE.Vector3(0, -32, 51), [0, 0, .2]) };
  mouths.o.scale.set(9, 12, 4);
  mesh(new THREE.SphereGeometry(9, 12, 8), 'skin', face, new THREE.Vector3(0, -6, 55));
  mesh(new THREE.SphereGeometry(11, 12, 8), 'skin2', parts.head, new THREE.Vector3(-46, -4, 0));
  // cap
  parts.cap = grp(sq, P(12, -150)); const capBase = P(12, -150);
  const dome = mesh(new THREE.SphereGeometry(57, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), 'cap', parts.cap); dome.scale.set(1, .85, 1);
  mesh(new THREE.CylinderGeometry(58, 58, 13, 24), 'capBand', parts.cap, new THREE.Vector3(0, 2, 0));
  const visor = mesh(new THREE.CylinderGeometry(34, 34, 6, 20), 'visor', parts.cap, new THREE.Vector3(48, 4, 0)); visor.scale.set(1.3, 1, 1);
  // limbs
  const limb = (kind, hip, z, topKey, topR) => {
    const top = grp(sq, hip.clone().setZ(z)), mid = grp(top, new THREE.Vector3(0, -(kind === 'arm' ? 50 : 60), 0));
    const len = kind === 'arm' ? 50 : 60, len2 = kind === 'arm' ? 46 : 60, r = topR;
    mesh(new THREE.CapsuleGeometry(r, len - 2 * r, 6, 12), topKey, top, new THREE.Vector3(0, -len / 2, 0));
    mesh(new THREE.CapsuleGeometry(r, len2 - 2 * r, 6, 12), topKey, mid, new THREE.Vector3(0, -len2 / 2, 0));
    if (kind === 'arm') mesh(new THREE.SphereGeometry(13, 14, 10), 'glove', mid, new THREE.Vector3(0, -len2 - 6, 0));
    else mesh(new THREE.BoxGeometry(60, 26, 34), 'boots', mid, new THREE.Vector3(14, -len2 - 2, 0));
    return { top, mid };
  };
  const A = { L: limb('arm', P(-8, -46), -26, 'tunic', 13), R: limb('arm', P(10, -46), 26, 'tunic', 13) };
  const Lg = { L: limb('leg', P(-8, 52), -14, 'trousers', 16), R: limb('leg', P(8, 52), 14, 'trousers', 16) };
  const plank = new THREE.Group(); group.add(plank);
  mesh(new THREE.BoxGeometry(210, 30, 14), 'plank', plank);
  for (const x of [-96, 96]) mesh(new THREE.CylinderGeometry(4, 4, 16, 8), 'nail', plank, new THREE.Vector3(x, 0, 0), [Math.PI / 2, 0, 0]);

  function apply(p) {
    root.position.set(p.x - CX, -(p.y - CY), 0); root.rotation.z = -p.rot; root.scale.setScalar(p.scale);
    const sy = p.squash; sq.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    for (const s of ['L', 'R']) { A[s].top.rotation.z = p['arm' + s]; A[s].mid.rotation.z = p['elbow' + s]; Lg[s].top.rotation.z = p['leg' + s]; Lg[s].mid.rotation.z = -p['knee' + s]; }
    parts.cap.position.set(capBase.x + p.cap.dx, capBase.y - p.cap.dy, 0); parts.cap.rotation.z = -p.cap.rot;
    const lid = p.eyes === 'closed' ? 1 : (p.lid || 0), wide = p.eyes === 'wide' ? 1.22 : 1, [lx, ly] = p.look || [0, 0];
    eyes.forEach((e, i) => { const rx = i ? 13 : 11, ry = i ? 18 : 15; e.scale.set(rx * wide, Math.max(1.5, ry * wide * (1 - lid)), 5); pupils[i].scale.set(wide > 1 ? 4.7 : 6.5, Math.min(6.5, Math.max(.5, 6.5 * (1 - lid))), 3); pupils[i].position.set(e.position.x + lx * rx * .45, 4 - ly * ry * .4, 53); });
    brows.forEach((b, i) => { b.position.y = 4 + 22 + 15 * p.brows; b.rotation.z = (p.brows - .4) * (i ? -.25 : .25); });
    mouths.flat.visible = p.mouth === 'flat'; mouths.o.visible = p.mouth === 'o'; mouths.smirk.visible = p.mouth === 'smirk';
    plank.position.set(p.plank.x - CX, -(p.plank.y - CY), 0); plank.rotation.z = -p.plank.rot;
  }
  const dispose = () => { geos.forEach(g => g.dispose()); Object.values(mats).forEach(m => m.dispose()); };
  return { group, root, plank, parts, mats, apply, dispose };
}
