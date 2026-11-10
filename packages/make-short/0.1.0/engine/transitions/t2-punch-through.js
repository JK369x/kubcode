// transitions/t2-punch-through.js: blueprint -> voxel. He tears a jagged hole in the sheet at his position; the hole grows until B fills the frame.
// Torn core (paper back colour, fibres), curled lit edge around it, and the sheet's shadow falling into the hole. A is the whole sheet, B is whatever world follows.
import { TAU, clamp, lerp, hash, noise, mulberry32 } from '../core/util.js';

const W = 1920, N = 96;
const RIPS = [[.35, .36], [1.45, .26], [2.55, .4], [3.9, .3], [5.2, .36]];            // spiky tears: angle, strength
const K = Array.from({ length: N }, (_, i) => {                                         // fixed jagged outline, scaled by the growing radius
  const th = i / N * TAU; let k = 1 + .2 * (noise(i * .42, 21) * .55 + noise(i * 1.7, 22) * .3) + (hash(i * 3.7) - .5) * .12;
  for (const [a, st] of RIPS) { const d = Math.abs((((th - a + Math.PI) % TAU) + TAU) % TAU - Math.PI); k += st * Math.exp(-d * d / .014); }
  return k;
});
const WID = Array.from({ length: N }, (_, i) => 9 + 17 * hash(i * 5.3) + 8 * noise(i * .6, 31));   // torn-core width per vertex
const path = (g, pts) => { pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); };

export default {
  id: 't2',
  render(g, A, B, p, s) {
    const P = s.pose || s.p, cx = P.x, cy = P.y - 20;
    const r = 1600 * p * p + 700 * Math.pow(p, 8), es = clamp(r / 420), ex = lerp(.62, 1, es), ey = lerp(1.22, 1, es);
    g.drawImage(A, 0, 0);
    if (p > .02 && r < 70) {                                                              // first frames: cracks radiate from his body
      g.save(); g.strokeStyle = 'rgba(240,248,255,.9)'; g.lineWidth = 3; g.beginPath();
      for (let k = 0; k < 6; k++) { const a = k * 1.05 + .3, l = 36 + 120 * hash(k * 2.1); g.moveTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l + (hash(k) - .5) * 20); }
      g.stroke(); g.restore();
    }
    if (r < 3) return;
    const hole = [], outer = [];
    for (let i = 0; i < N; i++) {
      const th = i / N * TAU, c = Math.cos(th), sn = Math.sin(th), R = r * K[i], w = WID[i] * (.7 + Math.min(.9, r / 500));
      hole.push([cx + c * R * ex, cy + sn * R * ey]); outer.push([cx + c * (R + w) * ex, cy + sn * (R + w) * ey]);
    }
    // ---- the world through the hole + the sheet's shadow falling into it (light from the upper left)
    g.save(); g.beginPath(); path(g, hole); g.clip(); g.drawImage(B, 0, 0);
    g.beginPath(); g.rect(-W, -W, 3 * W, 3 * W); path(g, hole); g.shadowColor = 'rgba(0,0,0,.72)'; g.shadowBlur = 48; g.shadowOffsetX = 18; g.shadowOffsetY = 28; g.fillStyle = '#000'; g.fill('evenodd');
    g.restore();
    // ---- curl: the sheet lifts around the tear (lit on the upper-left, shaded on the lower-right), clipped to outside the torn core
    g.save(); g.beginPath(); g.rect(-W, -W, 3 * W, 3 * W); path(g, outer); g.clip('evenodd');
    const cu = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r); cu.addColorStop(0, 'rgba(205,232,255,.42)'); cu.addColorStop(.5, 'rgba(120,170,230,.12)'); cu.addColorStop(1, 'rgba(2,10,34,.42)');
    g.strokeStyle = cu; g.lineJoin = 'round'; for (const [lw, al] of [[120, .3], [64, .5], [26, .8]]) { g.globalAlpha = al; g.lineWidth = lw; g.beginPath(); path(g, outer); g.stroke(); }
    g.restore();
    // ---- torn core: paper back colour with fibres, ragged on both edges
    g.save(); g.beginPath(); path(g, outer); path(g, hole);
    const co = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r); co.addColorStop(0, '#fbfaf3'); co.addColorStop(.6, '#e6e4d8'); co.addColorStop(1, '#bcc3c4');
    g.fillStyle = co; g.fill('evenodd');
    g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) {
      const q = outer[i], th = i / N * TAU + (hash(i * 3 + k) - .5) * .05, l = 6 + 18 * hash(i * 7.3 + k * 1.9), a = th + (hash(i * 1.3 + k) - .5) * .7;
      g.moveTo(q[0] - Math.cos(a) * l * .4, q[1] - Math.sin(a) * l * .4); g.lineTo(q[0] + Math.cos(a) * l, q[1] + Math.sin(a) * l);
    }
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.42)'; g.lineWidth = 2.5; g.beginPath(); path(g, hole); g.stroke();                 // inner torn edge against the world
    g.strokeStyle = 'rgba(20,40,80,.55)'; g.lineWidth = 1.6; g.beginPath(); path(g, outer); g.stroke();             // outer edge of the white core
    g.restore();
    // ---- paper scraps blown up and out (the world is scrolling up)
    const q = clamp((p - .28) * 1.6);
    if (q > 0) for (let k = 0; k < 16; k++) {
      const th = hash(k * 3.3) * TAU, R = r * (1.1 + .25 * hash(k * 7.7)) * K[Math.floor(th / TAU * N) % N] * .9, tx = cx + Math.cos(th) * (R + 110 * q) * ex, ty = cy + Math.sin(th) * (R + 110 * q) * ey - 380 * q * q * (.5 + hash(k));
      const sz = 9 + 17 * hash(k * 1.7), rot = TAU * hash(k * 9.1) + q * (2 + 5 * hash(k * 5.5)), al = 1 - q * q;
      g.save(); g.translate(tx, ty); g.rotate(rot); g.globalAlpha = Math.max(0, al); g.beginPath();
      for (let v = 0; v < 5; v++) { const a = v / 5 * TAU, rr = sz * (.55 + .6 * hash(k * 13.1 + v)); v ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fillStyle = '#1c4e92'; g.fill(); g.strokeStyle = '#f2f7fb'; g.lineWidth = 3; g.stroke(); g.restore();
    }
  },
};
