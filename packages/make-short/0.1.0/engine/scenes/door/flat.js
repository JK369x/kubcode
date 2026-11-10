// scenes/door/flat.js: the door story in the flat cartoon kit (world 5, 230-290). Squash-slide under the door gap is the gag: he flattens, slides in,
// gets stuck (only the scarf gets through), pops back, BONK. Reads core/scene.js; draws what it says, times nothing itself.
import * as SC from '../../core/scene.js';
import * as H from '../../core/hero2d.js';
import { clamp, ease } from '../../core/util.js';
const sceneAt = (f, tl) => (SC.scene || SC.default)(f, tl);
// pose guard (DROP 2 numbers): the dive/stuck keys put the pancaked pelvis at mid-door height (head y ~1060, floor 1350), so the kid would slide THROUGH the door, not under it.
// While he is flat, rest the lying body on the floor line (weight fades in/out with p.flat, scarf points follow from the knot to the floor). A no-op once pose.js puts him on the floor.
function grounded(p, K) {
  const fl = p.flat || 0; if (fl < .25) return p;
  const A = H.anchors(p), low = Math.max(A.head[1] + 42, A.feet[0][1] + 22, A.feet[1][1] + 22), w = clamp((fl - .25) / .5), dy = Math.max(0, Math.min(420, (K.GEO.floor - 6) - low)) * w * w * (3 - 2 * w);
  if (dy < 6) return p;
  const k = 1 - .8 * fl, FL = K.GEO.floor - 6, pts = (a, rigid) => a && a.map((q, i) => { const wg = rigid ? 1 : 1 - Math.pow(i / Math.max(1, a.length - 1), 2); return [q[0], Math.min(Math.max(q[1], FL), q[1] + dy * wg)]; });   // tail A: knot follows the body, the rest keeps lying on the floor; tail B moves with the body; nothing goes below the floor
  return { ...p, y: p.y + dy / k, scarf: p.scarf && { ...p.scarf, a: pts(p.scarf.a, false), b: pts(p.scarf.b, true) } };
}
const GAP = 72;                                         // the gap under the door in this world (px, inside the door rect)

export default {
  async init() {},
  render(out, s, K) {
    const g = out.getContext('2d'), p0 = s.p, f = s.f, sc = sceneAt(f, s.tl), D = K.GEO.door;
    K.setBoil(f);
    const p = grounded(p0, K);
    K.hallway(g, { gap: GAP });
    const under = (sc.slide ?? 0) > 0;                           // while he slides the door's bottom edge is drawn OVER him, so his head really goes under the door
    if (under) K.hero(g, p, f);
    K.door(g, D, sc.door, { gap: GAP });
    // speed streaks and dust while he slides; the star burst at the bonk
    const sl = sc.slide ?? 0;
    if (sl > .03 && sl < .98) {
      const y0 = D.y1 - 28;
      for (let i = 0; i < 6; i++) { const x = p.x - 360 + i * 38 - (sl * 90) % 38, w = 120 + (i * 41) % 70; g.fillStyle = 'rgba(255,244,224,.75)'; g.beginPath(); g.moveTo(x, y0 - 70 + i * 22); g.lineTo(x - w, y0 - 66 + i * 22); g.lineTo(x - w, y0 - 60 + i * 22); g.lineTo(x, y0 - 58 + i * 22); g.fill(); }
      if (sl < .4) K.poof(g, p.x - 150, D.y1 - 12, (sl - .03) / .37);
    }
    if (!under) K.hero(g, p, f);
    if (sc.impact && sc.impact.f >= 0) K.bonk(g, sc.impact, f - sc.impact.f);
    K.hearts(g, sc.hearts, sc.heartFx);
    K.finish(g, f);
  },
};
