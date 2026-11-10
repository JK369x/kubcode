// scenes/door/woodcut.js: the door story in the woodcut kit (world 6, 290-350): chisel and mallet at the door, the chisel snaps, a carved "THUNK",
// BONK f335. Reads core/scene.js; draws what it says, times nothing itself. The hallway + door are carved once (cached), the door rect never moves.
import * as SC from '../../core/scene.js';
import * as H from '../../core/hero2d.js';
import { clamp, ease, mulberry32 } from '../../core/util.js';
import { mk, TAU } from '../../styles/b3-common.js';
const sceneAt = (f, tl) => (SC.scene || SC.default)(f, tl);
let BG = null;

const handOf = p => H.anchors(p).hand.L;                    // far hand holds the chisel, near hand the mallet (both drawn by the hero rig)
export default {
  async init(api, K) { BG = mk(1920, 1920); K.hallway(BG.g, { gap: 22 }); },
  render(out, s, K) {
    const g = out.getContext('2d'), p = s.p, f = s.f, sc = sceneAt(f, s.tl), P = K.PAL, D = K.GEO.door;
    g.drawImage(BG, 0, 0);
    // his shadow: black gouges on the floor under his feet
    for (let i = 0; i < 6; i++) K.cut(g, [[p.x - 170 + i * 22, K.GEO.floor + 22 + i * 7], [p.x + 20, K.GEO.floor + 18 + i * 7], [p.x + 190 - i * 18, K.GEO.floor + 24 + i * 7]], 8, P.ink);
    // the chisel work: a carved groove grows down the door edge, chips fly at each strike
    const ch = clamp(sc.chisel ?? 0), th = clamp(sc.thunk ?? 0), strikes = 7, ph = (ch * strikes) % 1, working = ch > 0 && ch < 1;
    const hd = handOf(p), gy = Math.max(960, Math.min(1150, hd[1] - 20));
    if (ch > 0) { const L = 240 * Math.min(1, ch); K.cut(g, [[D.x0 + 14, gy], [D.x0 + 18, gy + L * .5], [D.x0 + 12, gy + L]], 12, P.cream); K.keyPoly(g, [[D.x0 + 8, gy - 6], [D.x0 + 24, gy - 6], [D.x0 + 24, gy + L + 6], [D.x0 + 8, gy + L + 6]], 3, { col: P.ink, amp: .6, seed: 11 }); }
    K.hero(g, p, f);
    if (working && ph > .6 && ph < .95) for (let i = 0; i < 5; i++) { const t = (ph - .6) / .35, a = -.4 - i * .5, y0 = gy + ch * 240; K.cut(g, [[D.x0 + 8, y0], [D.x0 + 8 + Math.cos(a) * 60 * t, y0 + Math.sin(a) * 60 * t]], 7, P.cream); }
    if (ch >= 1 && th > 0 && th < 1) { const t = th, x = D.x0 + 20 - 300 * t, y = gy - 40 * t + 420 * t * t; g.save(); g.translate(x, y); g.rotate(8 * t); K.keyPoly(g, [[0, -6], [40, -3], [30, 7], [0, 6]], 4, { fill: P.indigoL, amp: .3, seed: 6 }); g.restore(); }
    // carved THUNK on the door
    if (th > 0) {
      const a = clamp(th * 4), pop = 1 + .5 * (1 - ease.o(clamp(th * 3))); g.save(); g.globalAlpha = a; g.translate(1230, 690); g.rotate(-.08); g.scale(pop, pop);
      K.text(g, 'THUNK', 0, 36, 94, { align: 'center', col: P.cream, stroke: P.ink });
      for (let i = 0; i < 9; i++) { const an = -Math.PI * (.05 + i * .115), r0 = 190, r1 = 230 + (i % 3) * 20; K.cut(g, [[Math.cos(an) * r0, Math.sin(an) * r0 * .55 - 30], [Math.cos(an) * r1, Math.sin(an) * r1 * .55 - 30]], 7, P.cream); }
      g.restore();
    }
    if (sc.impact && sc.impact.f >= 0) K.bonk(g, sc.impact, f - sc.impact.f);
    K.hearts(g, sc.hearts, sc.heartFx);
    K.overlays(g);
  },
};
