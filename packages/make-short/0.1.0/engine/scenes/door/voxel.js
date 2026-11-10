// scenes/door/voxel.js (B2): the door story in the voxel world (world 3, frames 110-170): he stacks 3 blocks to climb over, the tower wobbles and collapses, a block BONKs his head.
// Contract (same as every style): default export { init(api, kit), render(out, s, kit) }. It only DRAWS what core/scene.js says (hearts, door state, cubes[]) and what the pose says
// (the voxel kid is driven by the same pose fields as hero3d); it times nothing. The kit comes from styles/03-voxel.js.
import * as SC from '../../core/scene.js';

const sceneAt = (f, tl) => (SC.scene || SC.default)(f, tl), ZH = 64;                // kid / blocks stand 64 px in front of the wall (feet line projects to y 1350)
let S, door, kid, blocks;
export default {
  async init(api, kit) {
    S = kit.stage(api.THREE);
    kit.hallway(S);
    door = kit.door(S, SC.DOOR); kid = kit.kid(S);
    kid.group.scale.setScalar(S.sc(ZH)); kid.group.position.z = ZH; S.scene.add(kid.group);
    blocks = kit.PAL.cubes.map((c, i) => { const m = kit.toyBlock(S, SC.CUBE, c, i); m.visible = false; S.scene.add(m); return m; });
  },
  render(out, s, kit) {
    const sc = s.sc || sceneAt(s.f, s.tl);
    kid.apply(s.p); door.apply(sc.door);
    blocks.forEach((m, i) => {
      const c = (sc.cubes || [])[i]; m.visible = !!c && c.a > .01; if (!m.visible) return;
      const k = S.sc(ZH) * ((c.s || SC.CUBE) / SC.CUBE); m.position.copy(S.P(c.x, c.y, ZH)); m.rotation.set(0, 0, -(c.rot || 0)); m.scale.setScalar(k);
      m.material.transparent = c.a < 1; m.material.opacity = c.a;
    });
    S.ren.render(S.scene, S.cam);
    const g = out.getContext('2d'); g.drawImage(S.glc, 0, 0); kit.vignette(g); kit.hearts(g, sc.hearts, sc.heartFx);
  },
};
