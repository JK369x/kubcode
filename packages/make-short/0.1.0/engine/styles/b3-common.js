// styles/b3-common.js: small helpers shared by the B3 files (05-flat, 06-woodcut, 08-watercolor, t4, t5, t7).
import { noise2, mulberry32, clamp } from '../core/util.js';
export const TAU = Math.PI * 2;
// canvas with its 2d context attached as .g (rd = CPU-backed, cheap getImageData)
export const mk = (w, h, rd = false) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.g = c.getContext('2d', rd ? { willReadFrequently: true } : undefined); return c; };
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const fbm = (x, y, s = 0) => .56 * noise2(x, y, s) + .28 * noise2(x * 2.07 + 5.1, y * 2.07 + 1.3, s + 3) + .16 * noise2(x * 4.3 + 9.2, y * 4.3 + 3.7, s + 7);
export const mix = (a, b, t) => a + (b - a) * t;
export const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const mixHex = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${Math.round(mix(A[0], B[0], t))},${Math.round(mix(A[1], B[1], t))},${Math.round(mix(A[2], B[2], t))})`; };

// mid-grey noise tile for 'overlay' / 'soft-light' grain (amp = spread in 0..255 levels)
export function greyTile(n, seed, amp = 90) {
  const c = mk(n, n, true), d = c.g.createImageData(n, n), r = mulberry32(seed);
  for (let i = 0; i < n * n; i++) { const v = 128 + (r() + r() + r() - 1.5) * amp; d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; }
  c.g.putImageData(d, 0, 0); return c;
}
// cubic bezier sampled to n+1 points
export function bez(p0, p1, p2, p3, n = 12) {
  const o = [];
  for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t; o.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]); }
  return o;
}
// filled ribbon along a polyline, tapered at both ends (a carved / inked stroke). Builds the path; the caller fills.
export function taper(g, pts, w, prof) {
  const n = pts.length; if (n < 2) return;
  const seg = [0]; let tot = 0; for (let i = 1; i < n; i++) { tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(tot); }
  const Lf = [], Rt = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const t = tot ? seg[i] / tot : 0, hw = .5 * w * (prof ? prof(t) : Math.pow(Math.sin(Math.PI * t), .6));
    Lf.push([pts[i][0] - dy * hw, pts[i][1] + dx * hw]); Rt.push([pts[i][0] + dy * hw, pts[i][1] - dx * hw]);
  }
  g.beginPath(); g.moveTo(Lf[0][0], Lf[0][1]); for (let i = 1; i < n; i++) g.lineTo(Lf[i][0], Lf[i][1]); for (let i = n - 1; i >= 0; i--) g.lineTo(Rt[i][0], Rt[i][1]); g.closePath();
}
// V-gouge cut: blunt entry, tapered exit. From (x,y) at angle a, length len, drawn up to fraction r (a growing scratch)
export function nick(g, x, y, a, len, w, r = 1) {
  if (r <= .02) return; const n = 8, L = len * Math.min(1, r), pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n * L; pts.push([x + Math.cos(a) * t, y + Math.sin(a) * t + Math.sin(i * .9 + x) * 1.2]); }
  taper(g, pts, w, t => (1 - Math.pow(t, 1.7)) * (.5 + .5 * Math.min(1, t * 9)));
}
