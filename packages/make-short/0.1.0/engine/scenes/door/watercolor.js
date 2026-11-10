// scenes/door/watercolor.js: the door story in the watercolor kit (world 8, 410-470): the low point. He slumps against the door and sits, one tear,
// paint runs down the paper, the tear hits the floor f455 (the ring seam leaves from the splash). Reads core/scene.js; times nothing itself.
import * as SC from '../../core/scene.js';
import * as H from '../../core/hero2d.js';
import { clamp, ease, mulberry32 } from '../../core/util.js';
import { mk, TAU } from '../../styles/b3-common.js';
const sceneAt = (f, tl) => (SC.scene || SC.default)(f, tl);
const anchorsOf = p => H.anchors(p);
let BG = null;
const RUNS = (() => { const r = mulberry32(9), o = []; for (let i = 0; i < 11; i++) o.push({ x: 120 + r() * 1680, y: 1040 + r() * 6, len: 70 + r() * 220, w: 6 + r() * 6, d: r() * .5 }); for (let i = 0; i < 6; i++) o.push({ x: 160 + r() * 1600, y: 560 + r() * 380, len: 120 + r() * 260, w: 4 + r() * 4, d: .15 + r() * .4 }); return o; })();

export default {
  async init(api, K) { BG = mk(1920, 1920); K.hallway(BG.g, { gap: 22 }); },
  render(out, s, K) {
    const g = out.getContext('2d'), p = s.p, f = s.f, sc = sceneAt(f, s.tl), u = clamp(s.u);
    g.drawImage(BG, 0, 0);
    // paint runs: pigment slowly dragged down the paper (sad mood), longer as the world goes on
    for (const r of RUNS) K.run(g, r.x, r.y, r.len * clamp((u - r.d) / .6), r.w, 'rgba(96,122,170,.5)', (r.x | 0) % 13 + 1);
    K.hero(g, p, f, { shadow: true });
    // the tear: leaves the eye, falls to the floor; a wet track on the cheek; the splash stays as a puddle wash
    const A = anchorsOf(p), t = clamp(sc.tear ?? 0), im = sc.impact, ey = A.eyes[1];
    if (t > 0 && t < 1) { K.run(g, sc.tearX, ey[1] + 14, Math.max(0, sc.tearY - ey[1] - 40), 3.2, 'rgba(104,128,172,.38)', 3); K.tearDrop(g, sc.tearX, sc.tearY, (.9 + .3 * t) * Math.min(1, t / .25), Math.min(1, t / .15)); }
    if (t >= 1 && im && im.f >= 0) {
      const age = f - im.f, rr = 14 + 56 * ease.o(clamp(age / 14));
      g.save(); g.globalCompositeOperation = 'multiply'; g.translate(im.x, im.y); g.fillStyle = 'rgba(122,150,192,.42)'; g.beginPath(); g.ellipse(0, 0, rr * 2.3, rr * .55, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(70,96,146,.55)'; g.lineWidth = 3.5; g.beginPath(); g.ellipse(0, 0, rr * 2.3, rr * .55, 0, 0, TAU); g.stroke();
      if (age < 10) for (let i = 0; i < 7; i++) { const a = -Math.PI * (.1 + i * .13), d = 20 + 70 * ease.o(age / 10); g.fillStyle = 'rgba(96,124,172,.6)'; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d * .9 - 10 * age + .9 * age * age, 3.4 - age * .25, 0, TAU); g.fill(); }
      g.restore();
    }
    K.hearts(g, sc.hearts, sc.heartFx);
    K.finish(g, f);
  },
};
