// transitions/t7-ink-drop.js = the DROP BLOOM seam (lidar -> watercolor, door story boundary 410, frames 402..417).
// One water drop falls from above through the dark point cloud (A) onto the glowing PULL plate. Where it hits, the watercolor world (B) blooms: an
// irregular, feathered, wet-edged blob (pooled pigment rim, a backrun ring) that spreads until it fills the frame.
// No pop: the bloom is driven by the FRAME COVERAGE, not by the radius. The blob's outline is r = T * w(angle); T is looked up in the sorted
// distance distribution of the frame's own pixels (quantile), so c(t) = covered fraction rises steadily (max ~14% of the frame per frame over 9 f)
// whatever the plate's distance to the corners. The last bloom frame is B alone, the first frame is A plus a faint drop.
import { ease, clamp, lerp, noise2 } from '../core/util.js';
import { mk, sstep, TAU } from '../styles/b3-common.js';

let MK = null, MF = null, TP = null, SCN = null;
const QT = new Map();
const PLATE = { x: 1125, y: 936 };                                   // BUILD-SPEC-DOOR.md: PULL plate centre (x 1060-1190, y 904-968)
const HIT = .40;                                                     // p of the impact: drop falls 6 f, bloom spreads 9 f
// outline wobble, a smooth function of angle (and very slowly of time); the quantile table uses f = 0
const wAt = (a, f) => { const cx = Math.cos(a), sy = Math.sin(a); return 1 + .20 * noise2(cx * 1.2 + 9, sy * 1.2, 4) + .10 * noise2(cx * 2.6 + 2, sy * 2.6 + f * .02, 5) + .04 * noise2(cx * 5.5, sy * 5.5 + f * .03, 3); };
function quant(hx, hy) {                                             // sorted normalised distances of the frame's pixels to the hit point
  const k = hx + ',' + hy; let q = QT.get(k); if (q) return q; const a = [];
  for (let y = 6; y < 1920; y += 24) for (let x = 6; x < 1920; x += 24) a.push(Math.hypot(x - hx, y - hy) / wAt(Math.atan2(y - hy, x - hx), 0));
  a.sort((u, v) => u - v); QT.set(k, a); return a;
}
export default {
  id: 't7', async init() { MK = mk(1920, 1920); MF = mk(1920, 1920); TP = mk(1920, 1920); try { SCN = await import('../core/scene.js'); } catch (e) {} },
  render(ctx, A, B, p, s) {
    const f = s.f, sc = SCN && (SCN.scene || SCN.default) ? (SCN.scene || SCN.default)(f, s.tl) : null, hit = (sc && sc.drop) || PLATE, hx = hit.x, hy = hit.y;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(A, 0, 0);
    // the falling drop (bright so it reads on the dark cloud): glow, short streak, teardrop with a highlight
    if (p < HIT + .03) {
      const t = clamp(p / HIT), y = lerp(380, hy, .35 * t + .65 * t * t), x = hx, stretch = 1 + .35 * t, vis = clamp(p / .12);
      const gl = ctx.createRadialGradient(x, y, 4, x, y, 150); gl.addColorStop(0, 'rgba(190,230,255,.55)'); gl.addColorStop(1, 'rgba(190,230,255,0)'); ctx.globalAlpha = vis; ctx.fillStyle = gl; ctx.fillRect(x - 160, y - 160, 320, 320); ctx.globalAlpha = 1;
      const tr = ctx.createLinearGradient(0, y - 190, 0, y); tr.addColorStop(0, 'rgba(190,230,255,0)'); tr.addColorStop(1, 'rgba(190,230,255,.45)'); ctx.globalAlpha = vis; ctx.fillStyle = tr; ctx.beginPath(); ctx.moveTo(x - 9, y - 20); ctx.lineTo(x + 9, y - 20); ctx.lineTo(x, y - 150 * t - 40); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.globalAlpha = vis; ctx.translate(x, y); ctx.scale(1, stretch);
      ctx.beginPath(); ctx.moveTo(0, -46); ctx.bezierCurveTo(10, -22, 30, -2, 30, 16); ctx.bezierCurveTo(30, 36, 16, 48, 0, 48); ctx.bezierCurveTo(-16, 48, -30, 36, -30, 16); ctx.bezierCurveTo(-30, -2, -10, -22, 0, -46); ctx.closePath();
      const dg = ctx.createLinearGradient(-30, -30, 30, 40); dg.addColorStop(0, '#e6f6ff'); dg.addColorStop(1, '#7fb4d6'); ctx.fillStyle = dg; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(-11, 8, 5, 12, .35, 0, TAU); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1;
    }
    // splash ring + flung droplets at the impact (fade out by k = .5)
    const k = (p - HIT) / (1 - HIT);
    if (k > 0 && k < .5) {
      const a = 1 - k / .5; ctx.strokeStyle = `rgba(214,238,252,${.85 * a})`; ctx.lineWidth = 7 * a + 1; ctx.beginPath(); ctx.ellipse(hx, hy + 6, 40 + 380 * ease.o(k * 2), 14 + 90 * ease.o(k * 2), 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(214,238,252,${a})`; for (let i = 0; i < 9; i++) { const an = -Math.PI * (.08 + i * .105), d = 60 + 300 * ease.o(k * 2) * (.6 + .4 * ((i * 37) % 10) / 10); ctx.beginPath(); ctx.arc(hx + Math.cos(an) * d, hy + Math.sin(an) * d * .8 + 120 * k * k, 7 * a + 1, 0, TAU); ctx.fill(); }
    }
    // the bloom: B through a feathered irregular blob whose COVERAGE rises steadily (blend of linear and smoothstep: max slope 1.25 / 9 f)
    if (k > 0) {
      const kk = clamp(k), c = lerp(kk, kk * kk * (3 - 2 * kk), .5), q = quant(hx, hy), T = c >= 1 ? q[q.length - 1] * 1.06 : q[Math.min(q.length - 1, Math.floor(c * q.length))], pts = [], n = 180;
      for (let i = 0; i < n; i++) { const a = i / n * TAU, w = wAt(a, f); pts.push([hx + Math.cos(a) * T * w, hy + Math.sin(a) * T * w]); }
      const path = g => { g.beginPath(); pts.forEach((qq, i) => i ? g.lineTo(qq[0], qq[1]) : g.moveTo(qq[0], qq[1])); g.closePath(); };
      const m = MK.g; m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, 1920, 1920); m.fillStyle = '#fff'; path(m); m.fill();
      const fg = MF.g; fg.setTransform(1, 0, 0, 1, 0, 0); fg.clearRect(0, 0, 1920, 1920); fg.filter = `blur(${Math.min(22, 5 + T * .02)}px)`; fg.drawImage(MK, 0, 0); fg.filter = 'none';   // wet, feathered edge
      const t = TP.g; t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, 1920, 1920); t.drawImage(B, 0, 0); t.globalCompositeOperation = 'destination-in'; t.drawImage(MF, 0, 0); t.globalCompositeOperation = 'source-over';
      ctx.drawImage(TP, 0, 0);
      // wet stain pooling inside the edge, pooled pigment rim and a faint backrun ring (all fade away as the blob leaves the frame)
      const fade = c >= 1 ? 0 : clamp(1.2 - kk), rim = clamp(1 - kk * 1.1) * .38 + .16;
      ctx.save(); path(ctx); ctx.clip(); ctx.globalCompositeOperation = 'multiply'; ctx.filter = 'blur(20px)'; ctx.strokeStyle = `rgba(112,146,190,${.42 * fade})`; ctx.lineWidth = 130; ctx.lineJoin = 'round'; path(ctx); ctx.stroke(); ctx.restore();
      ctx.globalCompositeOperation = 'multiply'; ctx.lineJoin = 'round';
      ctx.save(); ctx.filter = 'blur(2.5px)'; ctx.strokeStyle = `rgba(88,112,150,${rim * fade})`; ctx.lineWidth = 10; path(ctx); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.filter = 'blur(5px)'; ctx.strokeStyle = `rgba(120,140,175,${rim * .55 * fade})`; ctx.lineWidth = 26; ctx.translate(hx, hy); ctx.scale(.9, .9); ctx.translate(-hx, -hy); path(ctx); ctx.stroke(); ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  },
};
