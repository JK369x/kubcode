// scenes/door/teardown.js: the door story in the exploded teardown (world 10, 530-690). Reads scene(f); draws with the teardown kit; never times anything itself.
// EXPLODED VIEW (scene.door.explode): the leaf recedes into the hall, the 3 hinges, the handle and the PULL plate lift off along depth and settle at planned
// screen spots (solved through the real camera, which yaws ~11 deg so the layers separate), with dashed assembly lines back to their homes. HINGES glow and carry
// the one sentence the film teaches: "HINGES ON YOUR SIDE = PULL" (biggest type on screen + bracket); HANDLE and PLATE are tagged on the floor strip.
// The parts reassemble before the pull; the door then swings toward him and white light floods the frame (ends pure white, ready for the sheet).
import { loadState, DOOR, FLOOR, lostHeart } from './b4-standin.js';

const W = 1920, D = 3200, YAW = .2;
// where the parts hover at the peak (master px of their centres) and how far they float toward the camera (world z)
const EXP = { hinge: [[1362, 574], [1362, 935], [1362, 1296]], hingeZ: 300, handle: [1125, 1125], handleZ: 380, plate: [1195, 770], plateZ: 480 };
let ST, THREE, V3, S, rig, door, H3, T, cx, cy;

export default {
  async init(api, kit) {
    THREE = api.THREE; V3 = THREE.Vector3; ST = await loadState();
    S = kit.buildStudio(THREE, { floorY: -(FLOOR - 960), wallZ: -70, hole: { xl: DOOR.x0 - 960, xr: DOOR.x1 - 960, top: 960 - DOOR.y0 } });
    door = kit.door3d(THREE, DOOR); S.scene.add(door.root);
    H3 = await import('../../core/hero3d.js'); rig = H3.build(THREE); rig.group.position.z = 24; S.scene.add(rig.group);
    cx = door.X((DOOR.x0 + DOOR.x1) / 2); cy = door.Y((DOOR.y0 + DOOR.y1) / 2);
    // solve the peak positions through the e = 1 camera: the world point on plane z that projects to the wanted screen spot
    this.cam(1); const solve = (sx, sy, z) => { const o = S.cam.position, d = new V3((sx / W) * 2 - 1, 1 - (sy / W) * 2, .5).unproject(S.cam).sub(o).normalize(); return o.clone().add(d.multiplyScalar((z - o.z) / d.z)); };
    T = { hinge: EXP.hinge.map(q => solve(q[0], q[1], EXP.hingeZ)), handle: solve(EXP.handle[0], EXP.handle[1], EXP.handleZ), plate: solve(EXP.plate[0], EXP.plate[1], EXP.plateZ) };
  },
  cam(e) {                                                          // straight-on at rest; yaws about the leaf plane while exploded (the leaf stays where it is on screen)
    const th = -YAW * e, tz = -door.leafBack * e; S.cam.position.set(cx + D * Math.sin(th), cy, tz + D * Math.cos(th)); S.cam.lookAt(cx, cy, tz); S.cam.setViewOffset(W, W, -cx, cy, W, W); S.cam.updateMatrixWorld(true);
  },
  render(out, s, kit) {
    const { f, tl } = s, sc = ST.sceneAt(f, tl), p = ST.heroAt(f, s), g = out.getContext('2d'), sm = kit.sm, clamp = kit.clamp, e = sm(sc.door.explode || 0);
    // the scene ramps glows and labels over ~6 f: smooth them with an 8-frame trailing mean (stateless, random access) so they ease in over ~13 f and never read as a pop
    const mean = fn => { let a = 0; for (let k = 0; k < 8; k++) a += fn(k ? ST.sceneAt(f - k, tl) : sc); return a / 8; };
    const dr = { ...sc.door, glowHinge: mean(q => q.door.glowHinge || 0), glowPlate: mean(q => q.door.glowPlate || 0) };
    rig.apply(p);                                                   // hero3d turns itself (turn 1 = 3/4, face wears the exact 2D face texture)
    door.apply(dr); door.explode(e, T);
    const lt = sc.light || 0, dl = door.part.light.material; dl.opacity = clamp((sc.door.open || 0) * 1.4); dl.color.setRGB(.62 + .38 * lt, .64 + .36 * lt, .68 + .32 * lt);
    this.cam(e); S.key.position.set(-500 + cx, 900, 1300); S.key.target.position.set(cx, 0, 0);
    door.root.updateMatrixWorld(true); rig.group.updateMatrixWorld(true);
    S.R.render(S.scene, S.cam);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.drawImage(S.R.domElement, 0, 0);
    const pr = v => { const q = v.clone().project(S.cam); return [(q.x * .5 + .5) * W, (1 - (q.y * .5 + .5)) * W]; };
    const hg = door.part.hinges.map(h => pr(h.localToWorld(new V3(door.pivX - 4, h.userData.y, 8))));
    const ha = pr(door.part.handle.localToWorld(door.part.handleAnchor.clone())), pa = pr(door.part.plate.getWorldPosition(new V3()));
    // dashed assembly lines: each exploded part back to its home on the (receded) leaf / jamb
    if (e > .08) {
      const lz = new V3(0, 0, -door.leafBack * e), homes = [[hg[0], pr(door.homes.hinge[0])], [hg[1], pr(door.homes.hinge[1])], [hg[2], pr(door.homes.hinge[2])], [ha, pr(door.homes.handle.clone().add(lz))], [pa, pr(door.homes.plate.clone().add(lz))]];
      g.save(); g.strokeStyle = 'rgba(19,21,26,.8)'; g.lineWidth = 4; g.setLineDash([14, 10]); g.globalAlpha = clamp((e - .08) * 2); homes.forEach(([a, b]) => { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }); g.restore();
    }
    // glow halos (additive) on the parts the film is about
    g.save(); g.globalCompositeOperation = 'lighter';
    const halo = (q, r, a) => { if (a <= .01) return; const rg = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], r); rg.addColorStop(0, `rgba(255,120,60,${.85 * a})`); rg.addColorStop(1, 'rgba(255,90,40,0)'); g.fillStyle = rg; g.fillRect(q[0] - r, q[1] - r, 2 * r, 2 * r); };
    hg.forEach(q => halo(q, 120, dr.glowHinge)); halo(pa, 130, dr.glowPlate); g.restore();
    // hearts (1 left), type, leaders
    kit.hearts(g, sc.hearts, lostHeart(sc));
    const L = id => { const a = mean(q => { const l = q.labels.find(z => z.id === id); return l ? (l.a ?? l.show ?? 0) : 0; }); return a * a * (3 - 2 * a); };   // labels ease in
    const hs = L('hinges');
    if (hs > .01) {
      const lp = clamp(hs * 1.5), tp = clamp((hs - .3) / .7), xb = Math.min(1472, Math.max(...hg.map(q => q[0])) + 62), y0 = 546;
      kit.leader(g, [hg[0], [xb, hg[0][1]], [xb, y0], [990, y0]], lp, { dot: 11 }); kit.leader(g, [hg[1], [xb, hg[1][1]], [xb, hg[0][1]]], lp, { dot: 11 }); kit.leader(g, [hg[2], [xb, hg[2][1]], [xb, hg[1][1]]], lp, { dot: 11 });
      const sl = (1 - tp) * -14;
      kit.text(g, 'HINGES ON', 470 + sl, 576, 84, { alpha: tp }); kit.text(g, 'YOUR SIDE', 470 + sl, 664, 84, { alpha: tp }); kit.text(g, '= PULL', 470 + sl, 752, 96, { alpha: tp, color: kit.ACC });
    }
    const tag = (id, str, ax, ay, tx, ty, ex, ey) => { const sh = L(id); if (sh <= .01) return; const tp = clamp((sh - .3) / .7); kit.leader(g, [[ax, ay], [ex, ey]], clamp(sh * 1.5), { dot: 10 }); kit.text(g, str, tx, ty, 74, { alpha: tp }); };
    tag('handle', 'HANDLE', ha[0], ha[1], 470, 1452, 800, 1424); tag('plate', 'PLATE', pa[0], pa[1], 1220, 1452, 1355, 1382);
    // light flood: white rises from the doorway outward, ends pure white
    if (lt > 0) {
      const dc = pr(new V3(cx, cy, -90)), a = sm(lt); g.save(); g.globalCompositeOperation = 'lighter'; const r = 200 + 2400 * a, rg = g.createRadialGradient(dc[0], dc[1], 0, dc[0], dc[1], r); rg.addColorStop(0, `rgba(255,255,250,${.95 * a})`); rg.addColorStop(.6, `rgba(255,250,235,${.5 * a})`); rg.addColorStop(1, 'rgba(255,250,235,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, W); g.restore();
      g.fillStyle = `rgba(255,255,255,${Math.pow(a, 1.6)})`; g.fillRect(0, 0, W, W);
    }
  },
};
