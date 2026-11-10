// styles/b3-print.js: the ORIGINAL carved print ("Falling Through the Print"): red sun, jagged mountain range, mist bands,
// rows of hooked waves, then deep indigo water. World coordinates: x 0..1920, wy 0..4500. The print on the living-room wall shows
// wy 0..1309; the woodcut style scrolls down through all of it. Colour fills are printed a few px off the black key line (misregistration).
import { mulberry32 } from '../core/util.js';
import { bez, taper, sstep, mixHex, TAU } from './b3-common.js';

export const PAL = { ink: '#16111b', indigo: '#27479b', indigoD: '#14275c', indigoM: '#3b61b6', indigoL: '#93a8d4', cream: '#efe3c8', red: '#cf3a2c' };
const RX = 3, RY = 2.2;
const poly = pts => g => { g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); };
function obj(g, fill, path, lwPx) {
  if (fill) { g.save(); g.translate(RX, RY); g.fillStyle = fill; path(g); g.fill(); g.restore(); }
  if (lwPx > 0) { g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = PAL.ink; g.lineWidth = lwPx; path(g); g.stroke(); }
}
function cut(g, pts, w, col = PAL.cream) { taper(g, pts, w); g.fillStyle = col; g.fill(); }

function mountain(apexX, apexY, baseY, x0, x1, seed) {
  const r = mulberry32(seed), L = [], R = [], N = 15;
  for (let i = 0; i <= N; i++) { const t = i / N, e = i > 0 && i < N; L.push([x0 + (apexX - x0) * t + (e ? (r() - .5) * 20 : 0), baseY + (apexY - baseY) * Math.pow(t, 1.15) + (e ? (r() - .5) * 28 : 0)]); }
  for (let i = 0; i <= N; i++) { const t = i / N, e = i > 0 && i < N; R.push([apexX + (x1 - apexX) * t + (e ? (r() - .5) * 20 : 0), apexY + (baseY - apexY) * Math.pow(t, .9) + (e ? (r() - .5) * 28 : 0)]); }
  return { L, R, apex: [apexX, apexY], baseY, x0, x1, seed };
}
function drawMountain(g, m, lw, fill, snow = true) {
  const body = poly([...m.L, ...m.R, [m.x1, m.baseY + 80], [m.x0, m.baseY + 80]]);
  obj(g, fill, body, 7.5 * lw);
  g.save(); body(g); g.clip();
  // dark face right of the ridge
  g.save(); g.translate(RX, RY); g.fillStyle = PAL.indigoD; poly([m.apex, ...m.R, [m.x1, m.baseY + 80], [m.apex[0] + 90, m.baseY + 80]])(g); g.fill(); g.restore();
  // carved light strokes on the lit face, parallel to the left slope
  const r = mulberry32(m.seed + 5), dx = m.apex[0] - m.x0, dy = m.apex[1] - m.baseY, dl = Math.hypot(dx, dy);
  for (let k = 0; k < 11; k++) {
    const sx = m.x0 + 60 + k * ((m.apex[0] - m.x0) * .9 / 11) + r() * 20, sy = m.baseY - 10 - r() * 40, len = 160 + r() * 260, pts = [];
    for (let i = 0; i <= 7; i++) { const t = i / 7; pts.push([sx + dx / dl * len * t + Math.sin(t * 3 + k) * 6, sy + dy / dl * len * t]); }
    cut(g, pts, (6 + r() * 4) * lw);
  }
  // dark carved strokes on the dark face (V-gouge hatching, light = cream)
  for (let k = 0; k < 9; k++) { const sx = m.apex[0] + 40 + k * ((m.x1 - m.apex[0]) * .8 / 9), sy = m.apex[1] + 120 + r() * 160, pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([sx + t * 50, sy + t * (150 + r() * 80)]); } cut(g, pts, 5 * lw, PAL.indigoM); }
  g.restore();
  if (snow) {
    const ys = m.apex[1] + .38 * (m.baseY - m.apex[1]), Lp = m.L.filter(p => p[1] <= ys), Rp = m.R.filter(p => p[1] <= ys), r2 = mulberry32(m.seed + 9), zz = [];
    const a = Rp[Rp.length - 1], b = Lp[0];
    for (let i = 0; i <= 9; i++) { const t = i / 9; zz.push([a[0] + (b[0] - a[0]) * t, ys + (i % 2 ? 60 + r2() * 24 : -6 + r2() * 18)]); }
    obj(g, PAL.cream, poly([...Lp, ...Rp, ...zz]), 6 * lw);
  }
}
function mist(g, x0, x1, y, h) {                                                // a flat cream slip with pointed ends (suyari-gasumi)
  const m = (x0 + x1) / 2, path = gg => { gg.beginPath(); gg.moveTo(x0, y + h / 2); gg.quadraticCurveTo(x0 + (m - x0) * .35, y - h * .1, m, y); gg.quadraticCurveTo(x1 - (x1 - m) * .35, y - h * .1, x1, y + h / 2); gg.quadraticCurveTo(x1 - (x1 - m) * .35, y + h * 1.1, m, y + h); gg.quadraticCurveTo(x0 + (m - x0) * .35, y + h * 1.1, x0, y + h / 2); gg.closePath(); };
  g.save(); g.translate(RX, RY); g.fillStyle = PAL.cream; path(g); g.fill(); g.restore();
}
// one hooked wave (unit shape: x 0..1, y 0 = crest top .. 1 = base)
function crest(g, x, base, w, h, seed, lw, fill) {
  const r = mulberry32(seed), P = (ux, uy) => [x + ux * w, base - h + uy * h];
  const segs = [[[.16, .98], [.30, .52], [.46, .24]], [[.56, .06], [.72, -.04], [.86, .06]], [[1.0, .14], [1.05, .34], [1.0, .46]], [[.96, .40], [.92, .34], [.86, .34]], [[.74, .34], [.66, .52], [.72, .70]], [[.78, .82], [.92, .92], [1.0, 1.0]]];
  const path = gg => { gg.beginPath(); gg.moveTo(...P(0, 1)); for (const s of segs) gg.bezierCurveTo(...P(...s[0]), ...P(...s[1]), ...P(...s[2])); gg.closePath(); };
  obj(g, fill, path, 7 * lw);
  g.save(); path(g); g.clip();
  // carved contour lines following the back of the wave
  const back = [...bez(P(0, 1), P(.16, .98), P(.30, .52), P(.46, .24), 10), ...bez(P(.46, .24), P(.56, .06), P(.72, -.04), P(.86, .06), 10).slice(1)], C = P(.8, 1.05);
  for (let k = 0; k < 6; k++) {
    const s = .93 - k * .115, pts = back.map(q => [C[0] + (q[0] - C[0]) * s, C[1] + (q[1] - C[1]) * s]), a = Math.floor(2 + r() * 3), b = pts.length - Math.floor(r() * 4);
    cut(g, pts.slice(a, b), (7 - k * .5) * lw);
  }
  g.restore();
  // foam claws along the lip
  const lip = bez(P(.86, .06), P(1.0, .14), P(1.05, .34), P(1.0, .46), 8);
  for (let i = 1; i < lip.length - 1; i++) {
    const [bx, by] = lip[i], ang = (i / lip.length) * 1.6 + .1, len = (.10 + .07 * r()) * w, wd = len * .34, tx = bx + Math.cos(ang) * len, ty = by + Math.sin(ang) * len, nx = -Math.sin(ang), ny = Math.cos(ang);
    const claw = gg => { gg.beginPath(); gg.moveTo(bx - nx * wd * .5, by - ny * wd * .5); gg.quadraticCurveTo(bx + Math.cos(ang) * len * .55 - nx * wd, by + Math.sin(ang) * len * .55 - ny * wd, tx, ty); gg.quadraticCurveTo(bx + Math.cos(ang) * len * .45 + nx * wd * 1.1, by + Math.sin(ang) * len * .45 + ny * wd * 1.1, bx + nx * wd * .5, by + ny * wd * .5); gg.closePath(); };
    obj(g, PAL.cream, claw, 4.2 * lw);
  }
  g.fillStyle = PAL.cream; for (let i = 0; i < 7; i++) { const sx = x + (1.02 + r() * .22) * w, sy = base - h + (r() * .7) * h; g.beginPath(); g.arc(sx, sy, (3 + r() * 6) * lw, 0, TAU); g.fill(); }
}
// rows of crests: [base wy, height, width, spacing, x0, seed]
const ROWS = [[1015, 150, 380, 420, -120, 11], [1205, 240, 520, 560, -60, 23], [1450, 320, 640, 700, -330, 31], [1760, 360, 720, 780, -120, 47], [2110, 380, 760, 800, -430, 59], [2470, 400, 800, 830, -200, 71], [2830, 410, 820, 860, -520, 83]];
// bubbles / currents in the deep
const DEEP = (() => { const r = mulberry32(5), o = []; for (let i = 0; i < 26; i++) o.push({ x: 80 + r() * 1760, y: 2650 + r() * 1850, len: 220 + r() * 360, amp: 30 + r() * 60, ph: r() * 6, bub: r() < .45, rad: 12 + r() * 30 }); return o; })();

// paint the print world: screen y = wy - S. H = visible height (cull). lw = outline weight multiplier (small print uses ~2.2).
export function paintWorld(g, o) {
  const { S = 0, H = 1920, lw = 1 } = o, W = 1920, top = S - 200, bot = S + H + 200;
  g.save(); g.translate(0, -S);
  // sky: paper + indigo bokashi fading down
  g.fillStyle = PAL.cream; g.fillRect(-50, top, W + 100, Math.min(bot, 1000) - top);
  const sk = g.createLinearGradient(0, -900, 0, 640); sk.addColorStop(0, 'rgba(39,71,155,1)'); sk.addColorStop(.55, 'rgba(59,97,182,.62)'); sk.addColorStop(1, 'rgba(147,168,212,0)');
  g.fillStyle = sk; g.fillRect(-50, Math.max(top, -900), W + 100, Math.min(bot, 700) - Math.max(top, -900));
  // long cream cloud slips in the sky
  g.fillStyle = PAL.cream; for (const [cx, cy, cw] of [[300, 90, 520], [1250, 200, 620], [700, 470, 480]]) { const gr = g.createLinearGradient(cx, 0, cx + cw, 0); gr.addColorStop(0, 'rgba(239,227,200,0)'); gr.addColorStop(.2, PAL.cream); gr.addColorStop(.8, PAL.cream); gr.addColorStop(1, 'rgba(239,227,200,0)'); g.fillStyle = gr; g.beginPath(); g.roundRect(cx, cy, cw, 34, 17); g.fill(); }
  if (top < 700) {
    // the one red: a sun
    g.save(); g.translate(RX, RY); g.fillStyle = PAL.red; g.beginPath(); g.arc(1460, 345, 150, 0, TAU); g.fill(); g.restore();
    g.strokeStyle = PAL.cream; g.lineWidth = 5 * lw; g.beginPath(); g.arc(1460, 345, 128, .3, 2.4); g.stroke();
    // far pale range, then the two main peaks
    const far = mountain(930, 600, 960, 300, 1700, 7); drawMountain(g, far, lw * .6, PAL.indigoL, false);
    drawMountain(g, mountain(560, 250, 960, -140, 1190, 3), lw, PAL.indigo, true);
    drawMountain(g, mountain(1290, 470, 960, 820, 1800, 4), lw, PAL.indigoM, true);
    mist(g, 120, 980, 790, 52); mist(g, 760, 1700, 850, 56); mist(g, -60, 640, 905, 50);
  }
  // sea
  const sea = g.createLinearGradient(0, 930, 0, 4500); sea.addColorStop(0, '#2f52a8'); sea.addColorStop(.3, '#233f8c'); sea.addColorStop(.6, '#142458'); sea.addColorStop(1, '#0a1130');
  const top0 = []; for (let x = -60; x <= W + 60; x += 40) top0.push([x, 940 + Math.sin(x * .013) * 9]);
  obj(g, sea, gg => { gg.beginPath(); top0.forEach((q, i) => i ? gg.lineTo(q[0], q[1]) : gg.moveTo(q[0], q[1])); gg.lineTo(W + 60, 4700); gg.lineTo(-60, 4700); gg.closePath(); }, 7 * lw);
  const rr = mulberry32(99);
  for (let i = 0; i < 70; i++) { const x = rr() * W, y = 960 + rr() * 2300, l = 60 + rr() * 90; if (y < top || y > bot) continue; const pts = []; for (let j = 0; j <= 6; j++) { const t = j / 6; pts.push([x + t * l, y - Math.sin(t * Math.PI) * 14]); } cut(g, pts, 4.5 * lw, y < 1800 ? PAL.indigoL : PAL.indigoM); }
  for (const [base, h, w, sp, x0, seed] of ROWS) {
    if (base < top || base - h > bot) continue;
    const fill = mixHex('#4a72c8', '#1d3475', sstep(1100, 3300, base));
    for (let x = x0, k = 0; x < W + 100; x += sp, k++) crest(g, x + ((seed * 7 + k * 31) % 90) - 45, base + ((k * 37) % 40), w * (.88 + ((seed + k * 13) % 25) / 100), h * (.9 + ((seed + k * 7) % 20) / 100), seed + k, lw, fill);
  }
  // deep water: currents and bubbles
  for (const d of DEEP) {
    if (d.y > bot || d.y + d.len < top) continue;
    if (d.bub) { g.strokeStyle = PAL.indigoL; g.lineWidth = 5 * lw; g.beginPath(); g.arc(d.x, d.y, d.rad, 0, TAU); g.stroke(); g.fillStyle = PAL.indigoL; g.beginPath(); g.arc(d.x - d.rad * .35, d.y - d.rad * .35, d.rad * .16, 0, TAU); g.fill(); }
    else { const pts = []; for (let j = 0; j <= 14; j++) { const t = j / 14; pts.push([d.x + Math.sin(t * 3.2 + d.ph) * d.amp, d.y + t * d.len]); } cut(g, pts, 10 * lw, PAL.indigoM); }
  }
  g.restore();
}
// zone helper for the chisel marks: marks are black on the pale sky/mountain zone, cream on the sea
export const isLightZone = wy => wy < 930;
