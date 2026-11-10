// styles/b4-rig3d.js: studio build of the soldier (same pose driver and proportions as core/soldier3d.js) with named part groups for the
// teardown (cap / head / tunic / legs / plank), bevelled paint-look materials, a bigger readable face, and optional tint + clipping plane
// (used for the submerged copy under the water line).   const rig = buildStudioRig(THREE, {tint?, clip?, sub?});  rig.apply(pose);  rig.setExplode({cap,head,tunic,legs})
import { PALETTE } from '../core/soldier2d.js';
import { FEET, CX, CY } from '../core/pose.js';

function rbox(THREE, w, h, d, r = 8) {          // bevelled block, centred
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2, P = Math.PI;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -P / 2, 0); s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, P / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, P / 2, P); s.lineTo(x, y + r); s.absarc(x + r, y + r, r, P, P * 1.5);
  const b = Math.min(r * .6, d * .3), g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 3, curveSegments: 8 });
  g.translate(0, 0, -(d - 2 * b) / 2); return g;
}

export function buildStudioRig(THREE, opts = {}) {
  const pal = { ...PALETTE, ...(opts.palette || {}) }, mats = {}, geos = [], sub = !!opts.sub;
  const mat = k => {
    if (!mats[k]) {
      const m = new THREE.MeshPhysicalMaterial({ color: pal[k], roughness: k === 'eyeW' ? .25 : k === 'pupil' ? .2 : .52, metalness: 0, clearcoat: k === 'eyeW' || k === 'pupil' ? 1 : .3, clearcoatRoughness: .4 });
      if (opts.tint) { m.color.multiply(opts.tint); m.emissive = new THREE.Color(0x0b3040); m.emissiveIntensity = .5; }
      if (opts.clip) { m.clippingPlanes = [opts.clip]; m.clipShadows = false; }
      mats[k] = m;
    } return mats[k];
  };
  const geo = g => (geos.push(g), g);
  const group = new THREE.Group(), root = new THREE.Group(), sq = new THREE.Group();
  group.add(root); root.add(sq); sq.position.set(0, -FEET, 0);
  const P = (x, y, z = 0) => new THREE.Vector3(x, FEET - y, z);
  const grp = (parent, pos) => { const g = new THREE.Group(); if (pos) g.position.copy(pos); parent.add(g); return g; };
  const mesh = (g, k, parent, pos, rot) => { const m = new THREE.Mesh(geo(g), mat(k)); if (pos) m.position.copy(pos); if (rot) m.rotation.set(...rot); m.castShadow = !sub; m.receiveShadow = true; parent.add(m); return m; };
  const ex = { cap: grp(sq), head: grp(sq), tunic: grp(sq), legs: grp(sq) };
  const parts = { ex };

  // tunic: torso block, cross belts, belt + buckle, arms
  parts.torso = mesh(rbox(THREE, 84, 118, 58, 16), 'tunic', ex.tunic, P(4, 4));
  for (const s of [1, -1]) mesh(new THREE.BoxGeometry(14, 112, 4), 'belt', ex.tunic, P(8, -8, 30.5), [0, 0, s * .43]);
  mesh(rbox(THREE, 92, 16, 62, 5), 'belt', ex.tunic, P(4, 42)); mesh(rbox(THREE, 18, 20, 6, 3), 'buckle', ex.tunic, P(30, 42, 32));
  // head + face (bigger eyes / brows / mouth so the deadpan reads from a phone)
  parts.head = grp(ex.head, P(8, -104));
  mesh(new THREE.SphereGeometry(54, 40, 24), 'skin', parts.head);
  mesh(new THREE.CylinderGeometry(15, 17, 26, 16), 'skin', ex.head, P(8, -52));
  const face = grp(parts.head); face.rotation.y = .5;
  const eyes = [], pupils = [], brows = [];
  for (const [x, rx, ry] of [[-18, 12, 16], [18, 14, 19]]) {
    const e = mesh(new THREE.SphereGeometry(1, 24, 16), 'eyeW', face, new THREE.Vector3(x, 4, 48)); e.scale.set(rx * 1.2, ry * 1.2, 6); eyes.push(e);
    const pu = mesh(new THREE.SphereGeometry(1, 16, 12), 'pupil', face, new THREE.Vector3(x, 4, 53)); pu.scale.set(7.5, 7.5, 3); pupils.push(pu);
    const b = mesh(rbox(THREE, 34, 8, 7, 3), 'brow', face, new THREE.Vector3(x, 32, 50)); brows.push(b);
  }
  const lids = [-18, 18].map(x => mesh(rbox(THREE, 30, 6, 6, 2.5), 'brow', face, new THREE.Vector3(x, 2, 52)));   // closed eye = dark lid line
  const mouths = { flat: mesh(rbox(THREE, 38, 8, 6, 3), 'mouth', face, new THREE.Vector3(0, -32, 51)),
    o: mesh(new THREE.SphereGeometry(1, 16, 12), 'mouth', face, new THREE.Vector3(0, -34, 50)), smirk: mesh(rbox(THREE, 38, 8, 6, 3), 'mouth', face, new THREE.Vector3(0, -32, 51), [0, 0, .2]) };
  mouths.o.scale.set(10, 13, 4);
  mesh(new THREE.SphereGeometry(9, 14, 10), 'skin', face, new THREE.Vector3(0, -6, 55));
  mesh(new THREE.SphereGeometry(11, 12, 8), 'skin2', parts.head, new THREE.Vector3(-46, -4, 0));
  // cap
  const capBase = P(12, -150); parts.cap = grp(ex.cap, capBase);
  const dome = mesh(new THREE.SphereGeometry(57, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), 'cap', parts.cap); dome.scale.set(1, .85, 1);
  mesh(new THREE.CylinderGeometry(58.5, 58.5, 13, 32), 'capBand', parts.cap, new THREE.Vector3(0, 2, 0));
  const visor = mesh(new THREE.CylinderGeometry(34, 34, 6, 24), 'visor', parts.cap, new THREE.Vector3(48, 4, 0)); visor.scale.set(1.3, 1, 1);
  mesh(new THREE.SphereGeometry(7, 12, 8), 'capBand', parts.cap, new THREE.Vector3(0, 47, 0));
  // limbs
  const limb = (kind, hip, z, topKey, topR, parent) => {
    const top = grp(parent, hip.clone().setZ(z)), mid = grp(top, new THREE.Vector3(0, -(kind === 'arm' ? 50 : 60), 0)), len = kind === 'arm' ? 50 : 60, len2 = kind === 'arm' ? 46 : 60, r = topR;
    mesh(new THREE.CapsuleGeometry(r, len - 2 * r, 6, 14), topKey, top, new THREE.Vector3(0, -len / 2, 0));
    mesh(new THREE.CapsuleGeometry(r, len2 - 2 * r, 6, 14), topKey, mid, new THREE.Vector3(0, -len2 / 2, 0));
    if (kind === 'arm') mesh(new THREE.SphereGeometry(13, 16, 12), 'glove', mid, new THREE.Vector3(0, -len2 - 6, 0));
    else mesh(rbox(THREE, 60, 26, 34, 9), 'boots', mid, new THREE.Vector3(14, -len2 - 2, 0));
    return { top, mid };
  };
  const A = { L: limb('arm', P(-8, -46), -26, 'tunic', 13, ex.tunic), R: limb('arm', P(10, -46), 26, 'tunic', 13, ex.tunic) };
  const Lg = { L: limb('leg', P(-8, 52), -14, 'trousers', 16, ex.legs), R: limb('leg', P(8, 52), 14, 'trousers', 16, ex.legs) };
  const plank = new THREE.Group(); group.add(plank);
  mesh(rbox(THREE, 210, 30, 16, 6), 'plank', plank);
  for (const x of [-96, 96]) mesh(new THREE.CylinderGeometry(4.5, 4.5, 18, 10), 'nail', plank, new THREE.Vector3(x, 0, 0), [Math.PI / 2, 0, 0]);
  parts.plank = plank;

  function apply(p) {
    root.position.set(p.x - CX, -(p.y - CY), 0); root.rotation.z = -p.rot; root.scale.setScalar(p.scale);
    const sy = p.squash; sq.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    for (const s of ['L', 'R']) { A[s].top.rotation.z = p['arm' + s]; A[s].mid.rotation.z = p['elbow' + s]; Lg[s].top.rotation.z = p['leg' + s]; Lg[s].mid.rotation.z = -p['knee' + s]; }
    parts.cap.position.set(capBase.x + p.cap.dx, capBase.y - p.cap.dy, 0); parts.cap.rotation.z = -p.cap.rot;
    const lid = p.eyes === 'closed' ? 1 : (p.lid || 0), wide = p.eyes === 'wide' ? 1.2 : 1, [lx, ly] = p.look || [0, 0];
    eyes.forEach((e, i) => { const rx = (i ? 14 : 12) * 1.2, ry = (i ? 19 : 16) * 1.2; e.scale.set(rx * wide, Math.max(1.6, ry * wide * (1 - lid)), 6); pupils[i].scale.set(wide > 1 ? 5.6 : 7.5, Math.min(7.5, Math.max(.5, 7.5 * (1 - lid))), 3); pupils[i].position.set(e.position.x + lx * rx * .42, 4 - ly * ry * .38, 53); pupils[i].visible = lid < .93; e.visible = lid < .93; lids[i].visible = lid >= .93; });
    brows.forEach((b, i) => { b.position.y = 4 + 24 + 15 * p.brows; b.rotation.z = (p.brows - .4) * (i ? -.25 : .25); });
    mouths.flat.visible = p.mouth === 'flat'; mouths.o.visible = p.mouth === 'o'; mouths.smirk.visible = p.mouth === 'smirk';
    plank.position.set(p.plank.x - CX, -(p.plank.y - CY), 0); plank.rotation.z = -p.plank.rot;
  }
  const setExplode = o => { for (const k in ex) ex[k].position.y = (o && o[k]) || 0; };
  const dispose = () => { geos.forEach(g => g.dispose()); Object.values(mats).forEach(m => m.dispose()); };
  return { group, root, sq, plank, parts, ex, limbs: { A, Lg }, mats, apply, setExplode, dispose };
}
