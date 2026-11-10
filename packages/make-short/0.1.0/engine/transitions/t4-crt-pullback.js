// transitions/t4-crt-pullback.js (ascii -> flat, boundary 330): the camera pulls back from the CRT. The ASCII frame (A) is the picture on the
// glass of the old TV in the flat living room; the glass bulges and goes round-cornered, the yellow TV, table and room appear around it.
// The cartoon soldier (the flat style's own drawing) pops out of the tube and falls to his place. The room is re-drawn as vectors (crisp at 8x).
import { drawRoom, drawFlatSoldier, finish, glassFX, drawScreen, roomOff, L } from '../styles/05-flat.js';
import { ease, clamp, lerp } from '../core/util.js';
import { sstep } from '../styles/b3-common.js';

// A drawn into the glass square (x,y,w) with a barrel bulge b: corners pulled in, edge middles stay on the rim
function warp(g, A, x, y, w, b) {
  if (b < .004) { g.drawImage(A, x, y, w, w); return; }
  const n = 18, sz = A.width / n, P = (u, v) => { const dx = u - .5, dy = v - .5, k = (1 - 2 * b * (dx * dx + dy * dy)) / (1 - .5 * b); return [x + w * (.5 + dx * k), y + w * (.5 + dy * k)]; };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const c = [P(i / n, j / n), P((i + 1) / n, j / n), P(i / n, (j + 1) / n), P((i + 1) / n, (j + 1) / n)];
    const x0 = Math.min(...c.map(q => q[0])), x1 = Math.max(...c.map(q => q[0])), y0 = Math.min(...c.map(q => q[1])), y1 = Math.max(...c.map(q => q[1]));
    g.drawImage(A, i * sz, j * sz, sz, sz, x0 - .4, y0 - .4, x1 - x0 + .8, y1 - y0 + .8);
  }
}
export default {
  id: 't4', async init() {},
  render(ctx, A, B, p, s) {
    const f = s.f, pose = s.p, off = roomOff(pose, s.tl), T = L.tv, gcx = T.x + T.w / 2, gcy = T.y + T.w / 2 + off;
    const e = ease.io(p), zMax = 960 / (T.w / 2), z = Math.exp(Math.log(zMax) * (1 - e));
    const gx = lerp(960, gcx, e), gy = lerp(960, gcy, e);                                  // where the glass centre sits on screen
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(gx, gy); ctx.scale(z, z); ctx.translate(-gcx, -gcy);
    drawRoom(ctx, { f, off, d: 0, screen: false, lw: 2.2 });
    // the picture on the glass: the real ASCII frame, easing into the TV's own little picture at the end
    const rad = 34 * sstep(.04, .42, p), bulge = .17 * sstep(.05, .6, p), x = T.x, y = T.y + off, w = T.w;
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, w, rad); ctx.clip();
    const hand = sstep(.72, 1, p); if (hand > 0) drawScreen(ctx, f, off);
    ctx.globalAlpha = 1 - hand; warp(ctx, A, x, y, w, bulge); ctx.globalAlpha = 1;
    ctx.restore();
    glassFX(ctx, sstep(.08, .6, p), off);
    ctx.restore();
    // the cartoon soldier shoots out of the tube and takes his place
    const q = clamp((p - .36) / .44);
    if (q > 0) {
      const eo = ease.o3(q), sx = lerp(gx, pose.x, eo), sy = lerp(gy, pose.y, eo), sc = lerp(.12, 1, ease.o(q));
      drawFlatSoldier(ctx, pose, f, { at: [sx, sy], scale: sc, alpha: sstep(0, .18, q) });
    }
    finish(ctx, f, sstep(0, .5, p));
  },
};
