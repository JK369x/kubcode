// scenes/door/lidar.js (B2): the door story as a LiDAR scan (world 7, frames 350-410). The room exists as a dim sparse return; the radial scan front (scene.scan 0..1, emitted from a
// sensor in front of the door) reveals it: rings of constant elevation land on the wall as hyperbolas and on the floor as circles, the door edges go crisp, the seam flashes. The PULL plate
// glows (door.glowPlate) while he looks away. Contract (same as every style): default export { init(api, kit), render(out, s, kit) }; it draws only what scene(f) and the pose say.
// Hero: core/hero3d.js (api.hero3d) sampled into points; his own surface is a depth-only occluder, so only his front surfaces return and the room behind him is hidden.
import * as SC from '../../core/scene.js';
import { pose as poseOf } from '../../core/pose.js';

const POSE_KEYS = ['x', 'y', 'rot', 'squash', 'turn', 'armL', 'armR', 'elbowL', 'elbowR', 'legL', 'legR', 'kneeL', 'kneeR', 'headRot', 'headDy'];
const ZH = 40, YB = -390, DOOR = SC.DOOR, SENSOR = [-140, 150, 460], sceneAt = (f, tl) => (SC.scene || SC.default)(f, tl);
let S, rig, hero, ghost, mats, lm, sensor, API;
export default {
  async init(api, kit) {
    API = api; const THREE = api.THREE; S = kit.stage(THREE); sensor = new THREE.Vector3(...SENSOR);
    const B = kit.cloud(S), F = S.F, X0 = DOOR.x0 - 960, X1 = DOOR.x1 - 960, DYT = 960 - DOOR.y0, inDoor = (x, y) => x > X0 - 56 && x < X1 + 56 && y < DYT + 70;
    // ---- room (dim base layer, visible before the scan): wall (skips the door opening), baseboard, rail, cornice, frames, pillars, floor + joints
    for (const [sp, o] of [[18, { k: .95, size: 2.7 }], [24, { k: 1.1, size: 2.4, dense: 1 }]]) for (let y = YB; y < 1000; y += sp) for (let x = -2500; x < 2500; x += sp) {
      const xx = x + (Math.sin(x * 12.9 + y * 78.2) * 43758 % 1) * 6, yy = y + (Math.sin(x * 39.3 + y * 11.1) * 24634 % 1) * 6; if (!inDoor(xx, yy)) B.add(xx, yy, 0, { ...o });
    }
    B.plane(-2500, YB, 2500, YB + 56, 46, 11, { k: 1.2, size: 2.6 }); B.line(-2500, YB + 56, 14, 2500, YB + 56, 14, 5, { k: 1.4, size: 2.6 }); B.line(-2500, YB + 56, 46, 2500, YB + 56, 46, 5, { k: 1.4, size: 2.6 });
    for (const y of [70, 860]) for (let x = -2500; x < 2500; x += 6) if (!inDoor(x, y)) B.add(x, y, 16, { k: 1.3, size: 2.6 });
    for (const [x0, y0, x1, y1] of [[-1500, 120, -1120, 470], [650, 150, 930, 470]]) { B.rect(x0, y0, x1, y1, 12, 4, { k: 1.3, size: 2.7 }); B.plane(x0 + 14, y0 + 14, x1 - 14, y1 - 14, 10, 24, { k: .8, size: 2.2, dense: 1 }); }
    for (const px of [-880, 900]) {                                                                                  // two foreground pillars: depth cue at the 16:9 edges
      B.plane(px - 70, YB, px + 70, 1000, 380, 9, { k: 1.25, size: 3 }); B.plane(px - 70, YB, px + 70, 1000, 380, 9, { k: 1.1, size: 2.6, dense: 1 });
      for (const x of [px - 70, px + 70]) B.line(x, YB, 380, x, 1000, 380, 4, { k: 2, size: 3 });
    }
    B.floor(-2600, 2600, 40, 2600, YB, 27, { k: 1, size: 2.8 });
    for (let z = 40; z <= 2600; z += 240) B.line(-2600, YB, z, 2600, YB, z, 6, { t: .22, k: 1.2, size: 2.4 });
    for (let x = -2600; x <= 2600; x += 240) B.line(x, YB, 40, x, YB, 2600, 6, { t: .22, k: 1.2, size: 2.4 });
    for (let z = 40; z <= 2600; z += 240) B.line(-2600, YB, z, 2600, YB, z, 4, { t: .3, k: 1.6, size: 2.8, dense: 1 });                  // crisp tile joints after the scan
    for (let x = -2600; x <= 2600; x += 240) B.line(x, YB, 40, x, YB, 2600, 4, { t: .3, k: 1.6, size: 2.8, dense: 1 });
    B.line(-2500, YB, 0, 2500, YB, 0, 3, { t: .25, k: 2.4, size: 3.2, dense: 1 });                                                     // wall / floor junction
    B.floor(-2600, 2600, 0, 2600, 860, 36, { t: .95, k: .8, size: 2.4 });
    kit.door(S, B, DOOR);
    B.build(.36); B.buildLines();
    // ---- the scan itself (appears behind the front: base 0): rings of constant elevation from the sensor
    const R2 = kit.cloud(S);
    const hit = (dx, dy, dz) => {
      if (dz > -1e-3) return null;
      const tw = (0 - SENSOR[2]) / dz, x = SENSOR[0] + tw * dx, y = SENSOR[1] + tw * dy;
      if (!(y > YB && y < 1000 && Math.abs(x) < 2600)) return null;
      const td = (34 - SENSOR[2]) / dz, xd = SENSOR[0] + td * dx, yd = SENSOR[1] + td * dy;
      if (xd > X0 && xd < X1 && yd > YB && yd < DYT) return [xd, yd, 34, .35 + .65 * (yd - YB) / (1000 - YB), 1.5];                    // the door slab stands in front of the wall
      return [x, y, 0, (y - YB) / (1000 - YB), 1];
    };
    R2.rays(hit, { de: .024, da: .0032, el0: -.88, el1: 1.05, a0: -1.7, a1: 1.7, size: 2.9, k: 1.3 });                                // wall: hyperbolas
    for (let k = 0, r = 70; r < 3100; r += 80, k++) {                                                                                  // floor: concentric rings, dotted every ~7 px
      const n = Math.round(6.283 * r / 7);
      for (let j = 0; j < n; j++) { const a = (j + (k & 1) * .5) / n * 6.283, x = SENSOR[0] + r * Math.sin(a), z = SENSOR[2] - r * Math.cos(a); if (z < 8 || z > 3000 || Math.abs(x) > 2800) continue; R2.add(x, YB, z, { t: .06 + .22 * Math.min(1, z / 2600), k: 1.25, size: 2.9, dense: 1 }); }
    }
    R2.build(0);
    rig = api.hero3d.build(THREE); rig.group.scale.setScalar((F - ZH) / F); rig.group.position.z = ZH;
  },
  render(out, s, kit) {
    if (!hero) {                                                                      // the hero cloud is sampled on the first render, from the real pose (scarf, scale)
      const fo = { rng: API.rng(5), area: 15, edge: 3.2, faceMeshes: rig.parts && rig.parts.head ? [rig.parts.head] : [] };
      ghost = kit.heroCloud(S, rig, s.p, { ...fo, depth: false }); hero = kit.heroCloud(S, rig, s.p, fo); mats = [...S.mats]; lm = [...S.lmats];     // ghost first: the hero swaps the rig materials for the depth pass
    }
    const f = s.f, sce = s.sc || sceneAt(f, s.tl), p = s.p, scan = sce.scan ?? 0, R = 150 + 3050 * kit.sstep(scan), seam = kit.sstep(scan * 8) * (1 - kit.sstep((scan - .9) / .1));
    for (const m of mats) { const u = m.uniforms; u.uTime.value = f / 30; u.uR.value = R; u.uCam.value.copy(sensor); u.uSeam.value = m === hero.mat || m === ghost.mat ? seam * .25 : seam; u.uGP.value = sce.door?.glowPlate || 0; u.uGH.value = sce.door?.glowHinge || 0; }
    for (const m of lm) { m.uniforms.uR.value = R; m.uniforms.uCam.value.copy(sensor); }
    // scan persistence: on a pose step the previous pose lingers one frame at low gain (the hero steps on twos; this splits each step over two frames, no pop)
    const pv = s.tl ? poseOf(Math.max(0, f - 1), s.tl) : null, moved = !!pv && POSE_KEYS.some(k => Math.abs((pv[k] ?? 0) - (p[k] ?? 0)) > 1e-6);
    hero.mat.uniforms.uGain.value = moved ? .8 : 1; ghost.obj.visible = moved; ghost.mat.uniforms.uGain.value = .45;
    if (moved) ghost.update(pv);
    hero.update(p); S.ren.render(S.scene, S.cam);
    const g = out.getContext('2d'); kit.post(g, S.glc); kit.hearts(g, sce.hearts, sce.heartFx);
  },
};
