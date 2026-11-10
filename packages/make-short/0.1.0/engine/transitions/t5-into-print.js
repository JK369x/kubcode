// transitions/t5-into-print.js (flat -> woodcut, boundary 408): he bounces INTO the framed print. The camera pushes into the picture (the room is
// re-drawn as vectors, the print stays crisp), the frame edge sweeps past the lens, then black ink floods out of the print with a thick noisy
// rim and the woodcut world (B) fills the frame. The cartoon soldier stays his size on screen; the flood swaps him for his woodcut self.
import { drawRoom, drawFlatSoldier, finish, roomOff, L } from '../styles/05-flat.js';
import { ease, clamp, lerp, noise2 } from '../core/util.js';
import { sstep, TAU } from '../styles/b3-common.js';

const ZEND = 5.0;
export default {
  id: 't5', async init() {},
  render(ctx, A, B, p, s) {
    const f = s.f, pose = s.p, off = roomOff(pose, s.tl), P = L.print, pcx = P.cx, pcy = P.cy + off;
    const zk = ease.io(clamp(p / .8)), z = Math.exp(Math.log(ZEND) * zk), mv = ease.io(clamp(p / .85));
    const gx = lerp(pcx, 960, mv), gy = lerp(pcy, 960, mv);                                // where the print centre sits on screen
    const lw = lerp(.5, 1, clamp((z - 1) / 3.36)) / (P.w / 1920 * z);                      // keep the key line readable while it is small
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(gx, gy); ctx.scale(z, z); ctx.translate(-pcx, -pcy);
    drawRoom(ctx, { f, off, d: 0, screen: 'ascii', lw });
    ctx.restore();
    drawFlatSoldier(ctx, pose, f);
    finish(ctx, f);
    // the ink flood: B through a wobbling blob that grows out of the print, black rim + paper gap
    const k = sstep(.2, .94, p), Rr = 2250 * ease.i(k);
    if (Rr > 4) {
      const pts = [], n = 140;
      for (let i = 0; i < n; i++) { const a = i / n * TAU, cx = Math.cos(a), sy = Math.sin(a), w = 1 + .20 * noise2(cx * 1.3 + 3, sy * 1.3, 1) + .11 * noise2(cx * 3 + 7, sy * 3 + f * .06, 7) + .05 * noise2(cx * 7, sy * 7 + f * .1, 2); pts.push([gx + Math.cos(a) * Rr * w, gy + Math.sin(a) * Rr * 1.04 * w]); }
      const path = g => { g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); };
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.lineJoin = 'round'; ctx.strokeStyle = '#16111b'; ctx.lineWidth = Math.min(64, 12 + Rr * .09); path(ctx); ctx.stroke();               // ink swelling at the edge
      ctx.save(); path(ctx); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
      ctx.restore();
    }
  },
};
