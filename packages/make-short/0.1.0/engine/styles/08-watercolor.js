// styles/08-watercolor.js: style 8, watercolor on cold-press cotton paper. KIT only; the door story is scenes/door/watercolor.js (render() delegates).
//   kit = { PAL, GEO, build, hallway(g) [paints the static room once; the scene caches it], door, hero(g,p,f,o), hearts(g,n,f,impactF), text(g,str,x,y,size,o),
//           paintWash, maskFrom, pen, finish(g,f), ringEdge, tearDrop(g,x,y,s), run(g,x,y,len,w,col) }
// What makes it look PAINTED (not a soft digital fill): every wash is optical density on paper (T = exp(-OD), layers multiply like glazes), with
//  * a pencil underdrawing (double-struck graphite, overshoot at the corners) that shows through the paint,
//  * edges that are hard and dark (pigment pooled) on the side facing down-right and soft / lifted on the lit side (wet-in-wet),
//  * value variation inside every shape (gradient + low-frequency noise + a second pigment mixed in), bare paper left for lights (eyes, plate, highlights),
//  * granulation sampled from the PAPER (screen-fixed), not from the object, blooms/backruns, dry-brush streaks, spatter, paint runs.
import { clamp, ease, mulberry32, noise2 } from '../core/util.js';
import { mk, greyTile, fbm, sstep, taper, hex, TAU } from './b3-common.js';
import * as H from '../core/hero2d.js';
import { DOOR, FLOOR, HEARTS, HOME } from '../core/scene.js';

let API = null, SCENE = null, PAPER = null, TOOTH = null, PG = null;
export const PALW = '#f6f1e5';
export const GEO = { floor: FLOOR, door: { x0: DOOR.x0, x1: DOOR.x1, y0: DOOR.y0, y1: DOOR.y1 }, plate: { x0: 1060, x1: 1190, y0: 906, y1: 972 }, handle: DOOR.handle, hinges: DOOR.hinges, handleY: DOOR.handle.y, home: HOME, hearts: { cx: HEARTS.x, y: HEARTS.y, dx: HEARTS.gap } };   // numbers come from core/scene.js
export const PAL = { red: '#d8332b', redD: '#9f1f2e', ink: '#3a2e2c', graphite: 'rgba(72,64,60,', blue: '#5a78a8', ult: '#34467f', sienna: '#a2603c', ochre: '#d4a24c', umber: '#8a5a3c', grey: '#8d8f9c', sage: '#7fa86a', rose: '#e49aa4', sky: '#b9d6ec', violet: '#6a6490', skin: '#f0b898' };

export function build() {
  if (PAPER) return; const r = mulberry32(41); PAPER = mk(1920, 1920); const g = PAPER.g;
  g.fillStyle = PALW; g.fillRect(0, 0, 1920, 1920);
  const lo = greyTile(48, 9, 60); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = .6; g.imageSmoothingEnabled = true; g.drawImage(lo, 0, 0, 1920, 1920);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.lineCap = 'round';
  for (let i = 0; i < 2600; i++) { const x = r() * 1920, y = r() * 1920, l = 10 + r() * 38, a = r() * TAU; g.strokeStyle = r() < .6 ? `rgba(150,130,100,${.05 + r() * .08})` : `rgba(255,252,243,${.12 + r() * .2})`; g.lineWidth = .6 + r(); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 1) * l * .5, y + Math.sin(a + 1) * l * .5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  TOOTH = greyTile(512, 17, 95);
  PG = new Float32Array(512 * 512); for (let i = 0; i < PG.length; i++) PG[i] = (r() + r() + r() - 1.5) / .75;      // paper grain, -2..2, fixed to the sheet
}
// ---- pigment maths: optical density per channel. A wash writes D (0..1+) times the pigment's absorbance; T = exp(-OD) is multiplied onto the paper.
const absorb = h => { const c = hex(h); return c.map(v => -Math.log(Math.max(.03, v / 255))); };
export const makeOD = (w, h) => ({ w, h, r: new Float32Array(w * h), g: new Float32Array(w * h), b: new Float32Array(w * h) });
const CV = new Map(); const cv = (w, h) => { const k = w + 'x' + h; let c = CV.get(k); if (!c) CV.set(k, c = mk(w, h, true)); c.g.setTransform(1, 0, 0, 1, 0, 0); c.g.globalCompositeOperation = 'source-over'; c.g.globalAlpha = 1; c.g.filter = 'none'; c.g.clearRect(0, 0, w, h); return c; };
// rasterise a shape into a float coverage map: drawFn(ctx) draws in white in MASTER coords; the map is at 1/S resolution, origin (ox,oy), blurred by `blur` px
export function maskFrom(drawFn, w, h, ox, oy, S, blur = 2.2) {
  const a = cv(w, h), b = cv(w + 1, h); a.g.save(); a.g.scale(1 / S, 1 / S); a.g.translate(-ox, -oy); a.g.fillStyle = '#fff'; drawFn(a.g); a.g.restore();
  const g = b.g; g.filter = `blur(${blur}px)`; g.drawImage(a, 0, 0); g.filter = 'none';
  const d = g.getImageData(0, 0, w, h).data, A = new Float32Array(w * h); for (let i = 0; i < A.length; i++) A[i] = d[i * 4 + 3] / 255; return A;
}
export function noiseField(w, h, seed, f0 = 1 / 22) { const N = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) N[y * w + x] = fbm(x * f0, y * f0, seed); return N; }
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// the wash shader. A = coverage map (w x h at 1/S res, origin ox,oy), sp = pigment spec, NZ = smooth noise field (same size). Adds density into od.
export function paintWash(od, A, ox, oy, S, sp, NZ, box) {
  const w = od.w, h = od.h, n = w * h, { c, c2 = null, dens = .6, grad = .3, rim = .5, soft = .22, gran = .18, nzAmp = .22, hl = .5, lx = .6, ly = .8, edge = 1 } = sp;
  const a1 = absorb(c), a2 = c2 ? absorb(c2) : a1, X0 = box ? Math.max(1, box[0]) : 1, Y0 = box ? Math.max(1, box[1]) : 1, X1 = box ? Math.min(w - 1, box[2]) : w - 1, Y1 = box ? Math.min(h - 1, box[3]) : h - 1;
  const gh = Math.max(1, Y1 - Y0);
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      const i = y * w + x, a = A[i]; if (a < .03) continue;
      const gx = A[i + 1] - A[i - 1], gy = A[i + w] - A[i - w], mag = Math.sqrt(gx * gx + gy * gy) + 1e-4, s = (-gx / mag) * lx + (-gy / mag) * ly;     // s > 0: the edge faces down-right
      const v = a + NZ[i] * nzAmp - .5, sw = soft * (.3 + .7 * Math.max(0, -s)) + .03, e = sm(-sw, sw * .5, v); if (e <= 0) continue;
      const pool = Math.exp(-((v - .07) * (v - .07)) / .005) * Math.max(0, .2 + s) * edge, lost = Math.exp(-((v - .15) * (v - .15)) / .012) * Math.max(0, -s);
      const pg = PG[(((oy + y * S) | 0) & 511) * 512 + (((ox + x * S) | 0) & 511)], lo = NZ[(i + 4099) % n];
      let d = dens * (1 + grad * ((y - Y0) / gh - .5) * 2) * (1 + .3 * lo) + rim * pool - hl * lost * dens;
      if (sp.lit) d *= 1 - sp.litAmt * sp.lit[i];                                                              // paper lifted on the lit side (bare-paper glow)
      if (sp.bn) { const b = sp.bn[i]; d *= 1 - sp.bloom * sm(.05, .22, b); d += rim * .32 * Math.exp(-((b - .13) * (b - .13)) / .0009); }   // backrun bloom: paler blob, dark cauliflower rim
      d *= 1 + gran * pg; if (d <= 0) continue; d *= e;
      const m = c2 ? Math.min(1, Math.max(0, .5 + 1.4 * NZ[(i + 12345) % n])) : 0;
      od.r[i] += d * (a1[0] + (a2[0] - a1[0]) * m); od.g[i] += d * (a1[1] + (a2[1] - a1[1]) * m); od.b[i] += d * (a1[2] + (a2[2] - a1[2]) * m);
    }
  }
}
// OD -> a canvas of transmittance colours (multiply it onto the paper)
export function odCanvas(od) {
  const c = mk(od.w, od.h, true), id = c.g.createImageData(od.w, od.h), d = id.data;
  for (let i = 0; i < od.w * od.h; i++) { const o = od.r[i] + od.g[i] + od.b[i]; if (o < .004) continue; d[i * 4] = 255 * Math.exp(-od.r[i]); d[i * 4 + 1] = 255 * Math.exp(-od.g[i]); d[i * 4 + 2] = 255 * Math.exp(-od.b[i]); d[i * 4 + 3] = 255; }
  c.g.putImageData(id, 0, 0); return c;
}
// ---- pencil: a double-struck, slightly wandering graphite line with overshoot. pts = polyline in master px
export function pen(g, pts, o = {}) {
  const { w = 1.7, a = .5, seed = 1, over = 8, wob = .9 } = o, r = mulberry32(seed * 7919 + (pts[0][0] * 3 | 0) + (pts[0][1] | 0));
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.globalCompositeOperation = 'multiply';
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = PAL.graphite + (pass ? a * .55 : a) + ')'; g.lineWidth = pass ? w * .6 : w; g.beginPath();
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, nx = -uy, ny = ux, st = Math.max(1, Math.round(L / 40));
      const o0 = (pass ? -1 : 1) * (r() * over), o1 = (pass ? 1 : -1) * (r() * over * .6);
      for (let k = 0; k <= st; k++) { const t = k / st, q = (t * L) - (k === 0 ? o0 * .6 : 0) + (k === st ? o1 : 0), wb = (r() - .5) * 2 * wob + (pass ? .9 : 0); const X = A[0] + ux * q + nx * wb, Y = A[1] + uy * q + ny * wb; k === 0 ? g.moveTo(X, Y) : g.lineTo(X, Y); }
    }
    g.stroke();
  }
  g.restore();
}
export const penRect = (g, x, y, w, h, o = {}) => { pen(g, [[x, y], [x + w, y]], o); pen(g, [[x + w, y], [x + w, y + h]], { ...o, seed: (o.seed || 1) + 1 }); pen(g, [[x + w, y + h], [x, y + h]], { ...o, seed: (o.seed || 1) + 2 }); pen(g, [[x, y + h], [x, y]], { ...o, seed: (o.seed || 1) + 3 }); };
// a wobbly polygon (for washes: paint is never a perfect rectangle)
export function wobPoly(pts, amp, seed, step = 70) { const r = mulberry32(seed), out = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 0; k < n; k++) { const t = k / n; out.push([a[0] + (b[0] - a[0]) * t + (r() - .5) * 2 * amp, a[1] + (b[1] - a[1]) * t + (r() - .5) * 2 * amp]); } } return out; }
const polyPath = pts => g => { g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); g.fill(); };
const rectP = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

// ---- the room, painted once. Returns nothing; paints into g (1920x1920).
export function hallway(g, o = {}) {
  const { gap = 22 } = o, D = GEO.door, F = GEO.floor, S = 2, W2 = 960, ox = 0, oy = 0, P = GEO.plate;
  g.drawImage(PAPER, 0, 0);
  // 1. pencil underdrawing
  for (const [x, y, w, h] of [[520, 580, 150, 190], [700, 620, 110, 140], [110, 540, 260, 420]]) penRect(g, x, y, w, h, { seed: (x | 0) % 97 + 1, a: .5 });
  pen(g, [[0, 1018], [1920, 1018]], { seed: 3, over: 22 }); pen(g, [[0, 1040], [1920, 1040]], { seed: 4, over: 22 }); pen(g, [[0, 1290], [1920, 1290]], { seed: 5, over: 22 }); pen(g, [[0, F], [1920, F]], { seed: 6, w: 2.2, a: .6, over: 22 });
  for (let x = 60; x < 1920; x += 250) penRect(g, x, 1082, 190, 170, { w: 1.5, a: .42, seed: x });
  for (const dy of [70, 150, 245, 360, 500, 680]) pen(g, [[0, F + dy], [1920, F + dy]], { seed: dy, w: 1.4, a: .3, over: 30 });
  // 2. washes as optical density at half resolution
  const NZ = noiseField(W2, W2, 3), BN = noiseField(W2, W2, 13, 1 / 70), od = makeOD(W2, W2), washes = [];
  const add = (poly, sp, holes = [], blur = 2.4) => { const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), box = [Math.floor((Math.min(...xs) - 40) / S), Math.floor((Math.min(...ys) - 40) / S), Math.ceil((Math.max(...xs) + 40) / S), Math.ceil((Math.max(...ys) + 40) / S)];
    const A = maskFrom(gg => { polyPath(poly)(gg); gg.globalCompositeOperation = 'destination-out'; for (const h of holes) polyPath(h)(gg); gg.globalCompositeOperation = 'source-over'; }, W2, W2, ox, oy, S, blur); paintWash(od, A, ox, oy, S, sp, NZ, box); };
  const wob = (pts, a, s) => wobPoly(pts, a, s);
  add(wob(rectP(-60, -60, 2040, 1078), 10, 1), { c: '#c9b99c', c2: '#d9c0a0', dens: .36, grad: -.5, rim: .5, soft: .5, gran: .2, nzAmp: .3, bn: BN, bloom: .3 });                           // wall, warm grey, darker at the top
  add(wob(rectP(-60, 1040, 2040, 250), 5, 2), { c: '#7f98b4', c2: '#9aa6c0', dens: .62, grad: .3, rim: .9, soft: .1, gran: .3, nzAmp: .14 }, [wob(rectP(60, 1082, 190, 170), 4, 5), ...[310, 560, 810, 1060, 1310, 1560, 1810].map((x, i) => wob(rectP(x, 1082, 190, 170), 4, 6 + i))]);   // wainscot, dry top edge, panels left lighter
  for (let x = 60; x < 1920; x += 250) add(wob(rectP(x, 1082, 190, 170), 4, x), { c: '#a9bad0', dens: .28, grad: .5, rim: .6, soft: .12, gran: .25, nzAmp: .2 });
  add(wob(rectP(-60, 1012, 2040, 28), 3, 7), { c: '#c9a366', dens: .65, rim: .6, soft: .1, gran: .3, nzAmp: .12 });                                                                         // chair rail
  add(wob(rectP(-60, 1290, 2040, 60), 3, 8), { c: '#936244', c2: '#7a4e36', dens: .8, grad: .2, rim: .6, soft: .1, gran: .35, nzAmp: .12 });                                                  // baseboard
  [[F, 70], [F + 70, 80], [F + 150, 95], [F + 245, 115], [F + 360, 140], [F + 500, 180], [F + 680, 260]].forEach(([y, h], i) => add(wob(rectP(-60, y + 4, 2040, h - 8), 4, 10 + i), { c: i % 2 ? '#b68a62' : '#a87c58', c2: '#c9a07a', dens: .5 + (i % 3) * .06, grad: .25, rim: .7, soft: .09, gran: .26, nzAmp: .16 }));   // floor planks, each a brush band
  add(wob(rectP(520, 580, 150, 190), 2, 51), { c: '#7ea6d2', dens: .75, rim: .9, soft: .1, gran: .3 }, [], 1.8); add(wob(rectP(700, 620, 110, 140), 2, 52), { c: '#e0ae3e', dens: .75, rim: .9, soft: .1, gran: .3 }, [], 1.8);
  add(wob(rectP(504, 564, 182, 222), 2, 53), { c: '#8a5a3a', dens: .6, rim: .6, soft: .1 }, [rectP(520, 580, 150, 190)], 1.8); add(wob(rectP(684, 604, 142, 172), 2, 54), { c: '#8a5a3a', dens: .6, rim: .6, soft: .1 }, [rectP(700, 620, 110, 140)], 1.8);
  add(wob(rectP(110, 540, 260, 420), 3, 55), { c: '#b3d4ea', c2: '#d3e4f0', dens: .6, grad: -.4, rim: .7, soft: .12 });
  add(wob(rectP(60, 520, 70, 460), 6, 56), { c: '#d98f9d', dens: .6, grad: .3, rim: .8, soft: .12 }); add(wob(rectP(350, 520, 70, 460), 6, 57), { c: '#d98f9d', dens: .6, grad: .3, rim: .8, soft: .12 });
  add(wob([[1640, 1236], [1560, 1000], [1600, 880], [1660, 900], [1740, 1010], [1700, 1236]], 8, 58), { c: '#7fa86a', c2: '#4f7f52', dens: .7, grad: .4, rim: .8, soft: .14, gran: .3 }); add(wob([[1580, 1232], [1702, 1232], [1682, 1336], [1600, 1336]], 3, 59), { c: '#c4693f', dens: .8, rim: .9, soft: .08 });
  // cool shadow wash along the baseboard and under the door (violet-grey, wet edge)
  add(wob(rectP(-60, F + 2, 2040, 36), 4, 60), { c: '#6a6490', dens: .42, grad: -.6, rim: .5, soft: .2, gran: .2 });
  const T = odCanvas(od); g.save(); g.globalCompositeOperation = 'multiply'; g.imageSmoothingEnabled = true; g.drawImage(T, 0, 0, 1920, 1920); g.restore();
  // 5. spatter
  const r = mulberry32(77);
  for (let i = 0; i < 70; i++) { const x = r() * 1920, y = r() * 1920, rad = .8 + r() * r() * 5, c = [['#6a7fa0', .35], ['#a2603c', .3], ['#7fa86a', .25]][(r() * 3) | 0]; g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = c[0]; g.globalAlpha = c[1] + r() * .2; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); g.restore(); }
  if (o.door !== false) door(g, GEO.door, {}, { gap });
}
// the door, painted on top of whatever is under it (the room's wall wash shows through): pencil, wood wash with a darker panel glaze, casing, hinges, bar handle,
// dry-brush streaks (paper lifted out), the PULL plate. rect = door slab rect, state = {glowPlate, glowHinge}, o = {gap}. state.open / explode are not drawn here.
export function door(g, rect = GEO.door, state = {}, o = {}) {
  const { gap = 22 } = o, D = rect, P = GEO.plate, S = 2, M = 60, ox = D.x0 - 26 - M, oy = D.y0 - 26 - M, w = Math.ceil((D.x1 - D.x0 + 52 + 2 * M) / S), h = Math.ceil((D.y1 - D.y0 + 26 + 2 * M) / S);
  // 1. pencil
  for (const [x, y, ww, hh] of [[D.x0 - 26, D.y0 - 26, D.x1 - D.x0 + 52, D.y1 - D.y0 + 26], [D.x0, D.y0, D.x1 - D.x0, D.y1 - gap - D.y0], [D.x0 + 34, D.y0 + 40, D.x1 - D.x0 - 68, 250], [D.x0 + 34, D.y0 + 330, D.x1 - D.x0 - 68, 220], [D.x0 + 34, D.y0 + 610, D.x1 - D.x0 - 68, D.y1 - gap - D.y0 - 650], [P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0], [GEO.handle.x0, GEO.handle.y - 11, GEO.handle.x1 - GEO.handle.x0, 22]]) penRect(g, x, y, ww, hh, { seed: (x | 0) % 97 + 1, a: .5 });
  for (const hh of GEO.hinges) penRect(g, hh.x - 18, hh.y - 40, 36, 80, { w: 1.4, a: .45, seed: 9 });
  for (let k = 0; k < 14; k++) pen(g, [[D.x0 + 14 + k * 26, D.y0 + 80 + (k * 53) % 300], [D.x0 + 14 + k * 26 + 3, D.y0 + 280 + (k * 71) % 400]], { w: 1.1, a: .22, seed: k + 20, over: 3 });   // wood grain hints
  // 2. washes (own optical-density buffer around the door)
  const NZ = noiseField(w, h, 4), BN = noiseField(w, h, 14, 1 / 70), od = makeOD(w, h), wob = (pts, a, sd) => wobPoly(pts, a, sd);
  const add = (poly, sp, holes = [], blur = 2.4) => { const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]), box = [Math.floor((Math.min(...xs) - 40 - ox) / S), Math.floor((Math.min(...ys) - 40 - oy) / S), Math.ceil((Math.max(...xs) + 40 - ox) / S), Math.ceil((Math.max(...ys) + 40 - oy) / S)];
    const A = maskFrom(gg => { polyPath(poly)(gg); gg.globalCompositeOperation = 'destination-out'; for (const hl of holes) polyPath(hl)(gg); gg.globalCompositeOperation = 'source-over'; }, w, h, ox, oy, S, blur); paintWash(od, A, ox, oy, S, sp, NZ, box); };
  add(wob(rectP(D.x0, D.y0, D.x1 - D.x0, D.y1 - gap - D.y0), 4, 20), { c: '#a35d37', c2: '#7c4429', dens: .85, grad: .5, rim: 1.1, soft: .1, gran: .45, nzAmp: .14, bn: BN, bloom: .22 }, [wob(rectP(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0), 2, 30)]);   // slab, plate left as paper
  for (const [py, ph] of [[D.y0 + 40, 250], [D.y0 + 330, 220], [D.y0 + 610, D.y1 - gap - D.y0 - 650]]) add(wob(rectP(D.x0 + 34, py, D.x1 - D.x0 - 68, ph), 3, py), { c: '#6e3c22', dens: .34, grad: .6, rim: 1, soft: .08, gran: .4, nzAmp: .16, hl: .9 });   // raised panels, a darker glaze
  const cs = { c: '#d1b070', dens: .55, rim: .7, soft: .1, gran: .25 };
  add(wob(rectP(D.x0 - 26, D.y0 - 26, D.x1 - D.x0 + 52, 26), 2, 40), cs); add(wob(rectP(D.x0 - 26, D.y0, 26, D.y1 - D.y0), 2, 41), cs); add(wob(rectP(D.x1, D.y0, 26, D.y1 - D.y0), 2, 42), cs);   // casing: top + two sides
  for (const hh of GEO.hinges) add(wob(rectP(hh.x - 18, hh.y - 40, 36, 80), 1.5, hh.y), { c: state.glowHinge ? '#c9a24a' : '#4f4a58', dens: .95, rim: .8, soft: .08, gran: .3 }, [], 1.6);
  add(wob(rectP(GEO.handle.x0, GEO.handle.y - 11, GEO.handle.x1 - GEO.handle.x0, 22), 1.5, 50), { c: '#c89a3a', dens: .9, rim: .8, soft: .08, gran: .3 }, [], 1.6);
  add(wob(rectP(D.x0 - 10, D.y1 - gap, D.x1 - D.x0 + 20, gap + 22), 3, 61), { c: '#473f66', dens: .9, rim: .6, soft: .08 });                                  // the dark gap under the door
  if ((state.glowPlate || 0) > .02) add(wob(rectP(P.x0 - 40, P.y0 - 30, P.x1 - P.x0 + 80, P.y1 - P.y0 + 60), 8, 62), { c: '#e0b44a', dens: .5 * state.glowPlate, rim: .6, soft: .5, gran: .15 }, [], 5);   // a warm yellow wash behind the plate
  const T = odCanvas(od); g.save(); g.globalCompositeOperation = 'multiply'; g.imageSmoothingEnabled = true; g.drawImage(T, ox, oy, w * S, h * S); g.restore();
  // 3. dry-brush streaks lifted out of the slab (paper showing)
  const r = mulberry32(77); g.save(); g.globalCompositeOperation = 'source-over';
  for (let k = 0; k < 34; k++) { const x = D.x0 + 8 + r() * (D.x1 - D.x0 - 16); let y = D.y0 + 30 + r() * (D.y1 - gap - D.y0 - 330); for (let seg = 0; seg < 3; seg++) { const L = 30 + r() * 110, pts = [[x, y], [x + (r() - .5) * 4, y + L * .5], [x + (r() - .5) * 4, y + L]]; taper(g, pts, 1.2 + r() * 3, t => Math.pow(Math.sin(Math.PI * t), .8)); g.fillStyle = `rgba(246,241,229,${.10 + r() * .22})`; g.fill(); y += L + 20 + r() * 70; } }
  g.restore();
  // 4. the PULL plate: bare paper with a brush-lettered word in dark ink + a graphite guide under it
  g.save(); pen(g, [[P.x0 + 10, P.y1 - 14], [P.x1 - 10, P.y1 - 14]], { w: 1, a: .3, seed: 77, over: 6 }); text(g, 'PULL', (P.x0 + P.x1) / 2, P.y1 - 15, 47, { align: 'center' }); g.restore();
}
// brush lettering: dark ink, a little ragged. o = {align, col}
export function text(g, str, x, y, size, o = {}) {
  g.save(); g.globalCompositeOperation = 'multiply'; g.font = `800 ${size}px Inter, sans-serif`; g.textAlign = o.align || 'left'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  g.filter = 'blur(.5px)'; g.fillStyle = o.col || PAL.ink; g.globalAlpha = .92; g.fillText(str, x, y);
  g.globalAlpha = .45; g.lineWidth = 1.6; g.strokeStyle = o.col || PAL.ink; g.strokeText(str, x + .8, y + .6); g.restore();
}
// ---- the hero: paper reserved, graphite line (grain-broken, two strikes), washes glazed from per-part masks
const NR = 440, RR = NR / 2, OY = 580;                                   // half-res region: 880 master px square; the pelvis sits 580 px below its top (head ~440 above it, soles 158 below)
let LC = null, NZH = null, WRP = null, PMASK = null;
const GROUPS = () => Object.keys(H.GROUPS || { cap: 1, tunic: 1, belt: 1, skin: 1, trousers: 1, boots: 1, face: 1, plank: 1 });
const allFill = c => { const o = {}; for (const k of GROUPS()) o[k] = c; return o; };
// pigment per part group: the PALETTE MAP is the one place to retune for the final rig's part names. glaze = the second, hard-edged layer on the shadow side
export const SPEC = {
  head: { c: '#f1b796', c2: '#e58f84', dens: .5, grad: .5, rim: .9, soft: .2, gran: .12, hl: .8, nzAmp: .3, glaze: '#a8688a', glazeD: .34, lit: .5 },
  hair: { c: '#3d2c28', c2: '#5a4038', dens: .9, grad: .3, rim: 1, soft: .1, gran: .35, nzAmp: .3, glaze: '#1c1418', glazeD: .3, lit: .4 },
  tunic: { c: '#34467f', c2: '#4a5a86', dens: .9, grad: .4, rim: 1.1, soft: .12, gran: .3, hl: .7, nzAmp: .3, glaze: '#1a2658', glazeD: .38, lit: .45 },
  hands: { c: '#e8a940', c2: '#d98a3a', dens: .55, grad: .3, rim: .9, soft: .1, gran: .2, nzAmp: .25, glaze: '#8a4a2a', glazeD: .3, lit: .4 },   // mustard mittens (hero2d PALETTE.mitten)
  legs: { c: '#3d4660', c2: '#2c3550', dens: .9, grad: .4, rim: 1, soft: .12, gran: .25, nzAmp: .25, glaze: '#161c34', glazeD: .35, lit: .35 },
  boots: { c: '#6a4838', dens: .9, grad: .3, rim: .9, soft: .1, gran: .3, nzAmp: .2, glaze: '#2a1a1a', glazeD: .3, lit: .3 },
  scarf: { c: PAL.red, c2: '#a8222f', dens: .98, grad: .35, rim: 1.3, soft: .13, gran: .14, hl: 1, nzAmp: .38, glaze: '#6e0c22', glazeD: .42, lit: .5 },
  prop: { c: '#c79456', c2: '#8a6a4a', dens: .7, rim: .9, soft: .1, gran: .4, nzAmp: .2, glaze: '#5a3a1a', glazeD: .3, lit: .3 },
  face: null,                                                           // eye whites / pupils / shine / teeth: bare paper + ink dabs, no wash
  default: { c: '#c79a7a', dens: .6, rim: .8, soft: .12, gran: .25 },
};
const UNWASHED = new Set(['eyeW', 'pupil', 'shine', 'teeth']), FACE_ON_SKIN = new Set(['brow', 'mouth', 'tongue']);   // brows and mouth sit on the skin wash (ink goes on top), eye whites stay paper
export function hero(g, p, f, o = {}) {
  const sc = o.scale || 1, at = o.at || [p.x, p.y], ox = at[0] - NR, oy = at[1] - OY, sd = H, names = GROUPS(), K = names.length, N2 = NR * NR;
  LC ||= mk(NR, NR, true); NZH ||= [noiseField(NR, NR, 5), noiseField(NR, NR, 6)];
  if (!WRP) { WRP = [noiseField(NR, NR, 21, 1 / 38), noiseField(NR, NR, 22, 1 / 38)]; const m = mk(512, 512, true), id = m.g.createImageData(512, 512); for (let i = 0; i < 512 * 512; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = sm(-.1, -1.5, PG[i]) * .8 * 255; } m.g.putImageData(id, 0, 0); PMASK = m; }
  const nz = NZH[0];                                                      // paint does not boil: one fixed pigment-variation field and one fixed edge-warp field (stable holds)
  // one colour-coded draw (a colour per PART KEY): the draw order resolves occlusion
  const gOf = {}; names.forEach((n, k) => (H.GROUPS[n] || []).forEach(key => gOf[key] = k)); const headK = names.indexOf('head'), faceK = names.indexOf('face');
  const ids = {}; for (const key in gOf) { let k = gOf[key]; if (UNWASHED.has(key)) k = faceK; else if (FACE_ON_SKIN.has(key)) k = headK; ids[key] = `rgb(${30 + k * 20},0,0)`; }
  const lg = LC.g; lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, NR, NR);
  sd.drawHero(lg, p, { fill: { ...ids, _mask: true }, stroke: false, at: [NR / 2, OY / 2], scale: .5 * sc });
  const px = lg.getImageData(0, 0, NR, NR).data, cov = new Float32Array(N2), uni = new Float32Array(N2), gid = new Int8Array(N2).fill(-1);
  for (let i = 0; i < N2; i++) { const a = px[i * 4 + 3]; if (a < 8) continue; uni[i] = a / 255; gid[i] = Math.max(0, Math.min(K - 1, Math.round((px[i * 4] - 30) / 20))); }
  // 1. reserved paper: the union silhouette, grown a few px, shows the paper through (so the room's wash stops at the figure)
  const SIL = cv(NR, NR); { const sg = SIL.g, id = sg.createImageData(NR, NR); const grow = new Float32Array(N2);
    for (let y = 1; y < NR - 1; y++) for (let x = 1; x < NR - 1; x++) { const i = y * NR + x; let m = uni[i]; m = Math.max(m, uni[i - 1], uni[i + 1], uni[i - NR], uni[i + NR], uni[i - NR - 1], uni[i + NR + 1], uni[i - NR + 1], uni[i + NR - 1] * .9); grow[i] = m; }
    for (let i = 0; i < N2; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = grow[i] * 255; } sg.putImageData(id, 0, 0); }
  const pt = cv(2 * NR, 2 * NR); pt.g.drawImage(PAPER, ox, oy, 2 * NR, 2 * NR, 0, 0, 2 * NR, 2 * NR); pt.g.globalCompositeOperation = 'destination-in'; pt.g.imageSmoothingEnabled = true; pt.g.filter = 'blur(1.2px)'; pt.g.drawImage(SIL, 0, 0, 2 * NR, 2 * NR); pt.g.filter = 'none';
  g.drawImage(pt, ox, oy);
  // 2. graphite: white fills hide the hidden lines; two strikes; the line breaks where the paper valleys are (tooth mask); multiplies onto the paper and shows through the washes
  const pc = cv(2 * NR, 2 * NR), c2 = pc.g, hopt = { fill: { ...allFill('#fff'), _mask: true }, at: [NR, OY], scale: sc };
  sd.drawHero(c2, p, { ...hopt, stroke: 'rgba(78,70,66,.9)', strokeWidth: 1.5 }); c2.globalAlpha = .55; sd.drawHero(c2, p, { ...hopt, stroke: 'rgba(78,70,66,.85)', strokeWidth: 1, at: [NR + 1.6, OY + 1.1] }); c2.globalAlpha = 1;
  c2.save(); c2.globalCompositeOperation = 'destination-out'; c2.translate(-ox, -oy); c2.fillStyle = c2.createPattern(PMASK, 'repeat'); c2.fillRect(ox, oy, 2 * NR, 2 * NR); c2.restore();
  g.save(); g.globalCompositeOperation = 'multiply'; g.drawImage(pc, ox, oy); g.restore();
  // 3. washes: per-group coverage (blurred), warped so the paint wanders a few px off the pencil line, glazed into one optical-density buffer
  const od = makeOD(NR, NR), A = new Float32Array(N2), Aw = new Float32Array(N2), wx = WRP[0], wy = WRP[1], cres = new Float32Array(N2), lit = new Float32Array(N2), WA = 4.5;
  for (let k = 0; k < K; k++) {
    const spec = SPEC[names[k]] === undefined ? SPEC.default : SPEC[names[k]]; if (spec === null) continue;
    let any = false; for (let i = 0; i < N2; i++) { const v = gid[i] === k ? uni[i] : 0; A[i] = v; if (v > 0) any = true; } if (!any) continue;
    for (let pass = 0; pass < 2; pass++) { for (let y = 1; y < NR - 1; y++) for (let x = 1; x < NR - 1; x++) { const i = y * NR + x; cov[i] = (A[i - 1] + A[i] * 2 + A[i + 1] + A[i - NR] + A[i + NR]) / 6; } A.set(cov); }
    for (let y = 0; y < NR; y++) for (let x = 0; x < NR; x++) {                       // domain warp (bilinear)
      const i = y * NR + x, sx = Math.min(NR - 1.01, Math.max(0, x + wx[i] * WA)), sy = Math.min(NR - 1.01, Math.max(0, y + wy[i] * WA)), x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, j = y0 * NR + x0;
      Aw[i] = (A[j] * (1 - fx) + A[j + 1] * fx) * (1 - fy) + (A[j + NR] * (1 - fx) + A[j + NR + 1] * fx) * fy;
    }
    cres.fill(0); lit.fill(0);
    for (let y = 8; y < NR - 8; y++) for (let x = 8; x < NR - 8; x++) { const i = y * NR + x, a = Aw[i]; if (a < .03) continue; cres[i] = a * (1 - Aw[i + 7 * NR + 6]); lit[i] = a * (1 - Aw[i - 6 * NR - 5]); }
    paintWash(od, Aw, ox, oy, 2, { ...spec, lit, litAmt: spec.lit || .4 }, nz);
    if (spec.glaze) { for (let y = 1; y < NR - 1; y++) for (let x = 1; x < NR - 1; x++) { const i = y * NR + x; A[i] = (cres[i - 1] + cres[i] * 2 + cres[i + 1] + cres[i - NR] + cres[i + NR]) / 6; } paintWash(od, A, ox, oy, 2, { c: spec.glaze, dens: spec.glazeD, grad: 0, rim: .7, soft: .07, gran: .28, nzAmp: .16, hl: 0, edge: 1.4 }, nz); }
  }
  if (o.shadow) { const fa = H.anchors(p).feet, f0 = [(fa[0][0] + fa[1][0]) / 2, Math.max(fa[0][1], fa[1][1])], SH = maskFrom(gg => { gg.beginPath(); gg.ellipse(f0[0] + 6, f0[1] + 4, 190 * sc, 24, 0, 0, TAU); gg.fill(); }, NR, NR, ox, oy, 2, 3); paintWash(od, SH, ox, oy, 2, { c: PAL.violet, dens: .55, grad: -.2, rim: .6, soft: .3, gran: .15 }, nz); }
  const T = odCanvas(od); g.save(); g.globalCompositeOperation = 'multiply'; g.imageSmoothingEnabled = true; g.drawImage(T, ox, oy, 2 * NR, 2 * NR); g.restore();
  // 4. ink: pupils / brows / mouth as a few dark brush dabs (eye whites stay bare paper)
  g.save(); g.globalCompositeOperation = 'multiply'; g.filter = 'blur(.7px)'; g.globalAlpha = .93;
  sd.drawHero(g, p, { parts: ['face'], fill: { face: '#3a2e30', eyeW: 'rgba(0,0,0,0)', shine: 'rgba(0,0,0,0)', teeth: 'rgba(0,0,0,0)', tongue: '#c0585c' }, stroke: false, at, scale: sc }); g.restore();
}
const heartPath = (cx, cy, s) => g => { g.beginPath(); g.moveTo(cx, cy + s * .95); g.bezierCurveTo(cx - s * 1.55, cy - s * .1, cx - s * .95, cy - s * 1.25, cx, cy - s * .45); g.bezierCurveTo(cx + s * .95, cy - s * 1.25, cx + s * 1.55, cy - s * .1, cx, cy + s * .95); g.closePath(); };
// 10 hearts: a quick red wash each with a pooled rim and a bare-paper highlight, graphite outline; lost ones are pencil only (fx = scene.heartFx 0..1 over 20 f: shake 8 f, then drop)
export function hearts(g, n, fx = 1) {
  const Hh = GEO.hearts, age = fx * 20;
  for (let i = 0; i < 10; i++) {
    const cx = Hh.cx + (i - 4.5) * Hh.dx; let cy = Hh.y, a = 1, rot = 0, dx = 0;
    if (i >= n) {
      if (i === n && fx < 1) { if (age < 8) { dx = Math.sin(age * 2.6) * 5 * (1 - age / 8); cy += Math.cos(age * 3.1) * 2; } else { const t = age - 8; cy += 1.3 * t * t * .5; rot = t * .08; a = clamp(1 - t / 12); } }
      else { g.save(); g.globalCompositeOperation = 'multiply'; g.strokeStyle = PAL.graphite + '.55)'; g.lineWidth = 2; g.setLineDash([4, 5]); heartPath(cx, cy, 16)(g); g.stroke(); g.restore(); continue; }
    }
    g.save(); g.globalAlpha = a; g.translate(cx + dx, cy); g.rotate(rot); g.translate(-cx - dx, -cy); g.globalCompositeOperation = 'multiply'; const hp = heartPath(cx + dx + (i % 2 ? 1.5 : -1), cy + 1, 16);
    g.fillStyle = 'rgba(222,60,56,.78)'; hp(g); g.fill(); g.save(); hp(g); g.clip(); g.strokeStyle = 'rgba(150,24,44,.55)'; g.lineWidth = 7; g.translate(-3, -3); hp(g); g.stroke(); g.restore();
    g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(247,243,232,.85)'; g.beginPath(); g.ellipse(cx + dx - 7, cy - 6, 3.5, 6.5, -.6, 0, TAU); g.fill();
    g.globalCompositeOperation = 'multiply'; g.strokeStyle = PAL.graphite + '.6)'; g.lineWidth = 1.7; heartPath(cx + dx, cy, 16.5)(g); g.stroke(); g.restore();
  }
}
// a tear / water drop: clear blue-grey wash, dark rim, a lifted highlight
export function tearDrop(g, x, y, s = 1, a = 1) {
  const path = gg => { gg.beginPath(); gg.moveTo(x, y - 20 * s); gg.bezierCurveTo(x + 5 * s, y - 8 * s, x + 14 * s, y + 2 * s, x + 14 * s, y + 10 * s); gg.bezierCurveTo(x + 14 * s, y + 22 * s, x - 14 * s, y + 22 * s, x - 14 * s, y + 10 * s); gg.bezierCurveTo(x - 14 * s, y + 2 * s, x - 5 * s, y - 8 * s, x, y - 20 * s); gg.closePath(); };
  g.save(); g.globalAlpha = a; g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(128,158,200,.55)'; path(g); g.fill(); g.save(); path(g); g.clip(); g.strokeStyle = 'rgba(70,100,150,.6)'; g.lineWidth = 6 * s; g.translate(-1.5 * s, -2 * s); path(g); g.stroke(); g.restore();
  g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(247,243,232,.9)'; g.beginPath(); g.ellipse(x - 5 * s, y + 5 * s, 3 * s, 6 * s, .3, 0, TAU); g.fill(); g.restore();
}
// a paint run: pigment dragged down the paper, bead at the end
export function run(g, x, y, len, w, col = 'rgba(110,134,176,.5)', seed = 1) {
  if (len < 3) return; const r = mulberry32(seed * 131), pts = []; for (let i = 0; i <= 10; i++) pts.push([x + Math.sin(i * .7 + seed) * 1.6 * (i / 10), y + len * i / 10]);
  g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = col; taper(g, pts, w, t => (.55 + .45 * (1 - t)) * (t > .92 ? 1.5 : 1) * Math.min(1, t * 8 + .1)); g.fill(); g.beginPath(); g.arc(x, y + len, w * .62, 0, TAU); g.fill(); g.restore();
}
// paper tooth (screen-fixed), faint warm vignette
export function finish(g, f) {
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = .9; g.fillStyle = g.createPattern(TOOTH, 'repeat'); g.fillRect(0, 0, 1920, 1920);
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 1; const v = g.createRadialGradient(960, 960, 700, 960, 960, 1450); v.addColorStop(0, 'rgba(120,100,70,0)'); v.addColorStop(1, 'rgba(120,100,70,.16)'); g.fillStyle = v; g.fillRect(0, 0, 1920, 1920); g.restore();
}
// ring seam edge: a pooled pigment line (blue-grey), darker on its outer side, soft bleed inside, a few granulation specks
export function ringEdge(g, r, cx, cy, s = {}) {
  const n = 140, pts = [], f = s.f || 0; for (let i = 0; i < n; i++) { const a = i / n * TAU, w = 1 + .012 * Math.sin(a * 5 + 2) + .008 * Math.sin(a * 11 + f * .3) + .006 * Math.sin(a * 23); pts.push([cx + Math.cos(a) * r * w, cy + Math.sin(a) * r * w]); }
  const path = gg => { gg.beginPath(); pts.forEach((q, i) => i ? gg.lineTo(q[0], q[1]) : gg.moveTo(q[0], q[1])); gg.closePath(); };
  g.save(); g.globalCompositeOperation = 'multiply'; g.lineJoin = 'round';
  g.filter = 'blur(6px)'; g.strokeStyle = 'rgba(120,146,186,.35)'; g.lineWidth = 26; g.save(); g.scale(1, 1); path(g); g.stroke(); g.restore();
  g.filter = 'blur(1.2px)'; g.strokeStyle = 'rgba(78,100,146,.8)'; g.lineWidth = 7; path(g); g.stroke(); g.filter = 'none';
  g.strokeStyle = 'rgba(52,70,127,.55)'; g.lineWidth = 2.2; g.save(); g.translate(1.6, 1.6); path(g); g.stroke(); g.restore();
  const rg = mulberry32(((s.f || 0) * 13 + 3) >>> 0); g.fillStyle = 'rgba(52,70,127,.5)'; for (let i = 0; i < 90; i++) { const a = rg() * TAU, d = r + (rg() - .5) * 18; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, .8 + rg() * 1.8, 0, TAU); g.fill(); }
  g.restore();
}
export const kit = { PAL, GEO, SPEC, build, hallway, door, hero, hearts, text, tearDrop, run, pen, penRect, paintWash, maskFrom, makeOD, odCanvas, noiseField, finish, ringEdge, heartPath, wobPoly, get paper() { return PAPER; }, get api() { return API; } };

async function loadScene(id, api) {
  let story = 'door'; try { story = (await (await fetch(new URL('../timeline.json', import.meta.url))).json()).story || 'door'; } catch (e) {}
  const m = await import(new URL(`../scenes/${story}/${id}.js`, import.meta.url).href), sc = m.default; if (sc.init) await sc.init(api, kit); return sc;
}
export default {
  id: 'watercolor', kind: '2d', kit, ringEdge,
  async init(api) { API = api; build(); SCENE = await loadScene('watercolor', api); },
  render(out, s) { SCENE.render(out, s, kit); },
};
