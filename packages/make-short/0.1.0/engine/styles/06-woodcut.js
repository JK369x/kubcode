// styles/06-woodcut.js: style 6, CARVED RELIEF PRINT: black key block + indigo block on cream paper, ONE red (the scarf / hearts), colour blocks printed a few px off the key line.
// KIT only (look code); the door story's content is scenes/door/woodcut.js and render() delegates to it.
//   kit = { PAL, GEO, build, overlays, cut, gouge, carve, hatch, bundles, keyPoly, rectPts, hallway(g,{gap,door}), door(g,rect,state,{gap}), hero(g,p,f,o), hearts(g,n,fx), text(g,str,x,y,size,o), bonk(g,im,age), ringEdge }
// Look rules: every surface is carved (wall = dark indigo block with vertical gouge cuts, door + wainscot = black block with cream grain cuts, floor = cream paper with horizontal ink gouges),
// shadows are hatching only (never a tint), light = bare paper / cream cuts, the hero is printed the same way (key line + hatching, no smooth fills), paper fibres + specks over everything.
import { clamp, ease, mulberry32, noise2 } from '../core/util.js';
import { mk, greyTile, taper, nick, TAU } from './b3-common.js';
import * as H from '../core/hero2d.js';
import { DOOR, FLOOR, HEARTS, HOME } from '../core/scene.js';

let API = null, SCENE = null, FIB = null, SPK = null, BLOT = null;
export const PAL = { ink: '#14101a', indigo: '#27479b', indigoD: '#14275c', indigoM: '#3b61b6', indigoL: '#93a8d4', cream: '#efe3c8', red: '#cf3a2c' };
export const GEO = { floor: FLOOR, door: { x0: DOOR.x0, x1: DOOR.x1, y0: DOOR.y0, y1: DOOR.y1 }, plate: { x0: 1060, x1: 1190, y0: 906, y1: 972 }, handle: DOOR.handle, hinges: DOOR.hinges, handleY: DOOR.handle.y, home: HOME, hearts: { cx: HEARTS.x, y: HEARTS.y, dx: HEARTS.gap } };   // numbers come from core/scene.js
const RX = 3, RY = 2.2;                                                  // colour blocks are printed this far off the key line

export function build() {
  if (FIB) return; const r = mulberry32(21); FIB = mk(1920, 1920); SPK = mk(1920, 1920); const f = FIB.g, s = SPK.g; f.lineCap = 'round';
  for (let i = 0; i < 4200; i++) {                                                                          // paper fibres
    const x = r() * 1920, y = r() * 1920, l = 14 + r() * 46, a = r() * TAU, dk = r() < .6;
    f.strokeStyle = dk ? `rgba(110,82,44,${.05 + r() * .10})` : `rgba(255,248,230,${.09 + r() * .14})`; f.lineWidth = .7 + r() * 1.1;
    f.beginPath(); f.moveTo(x, y); f.quadraticCurveTo(x + Math.cos(a + .8) * l * .5, y + Math.sin(a + .8) * l * .5, x + Math.cos(a) * l, y + Math.sin(a) * l); f.stroke();
  }
  for (let i = 0; i < 4200; i++) { s.fillStyle = `rgba(239,227,200,${.35 + r() * .5})`; s.beginPath(); s.arc(r() * 1920, r() * 1920, .8 + r() * r() * 3.2, 0, TAU); s.fill(); }   // goma-zuri: ink that did not take
  for (let i = 0; i < 400; i++) { s.fillStyle = `rgba(22,17,27,${.25 + r() * .3})`; s.beginPath(); s.arc(r() * 1920, r() * 1920, .6 + r() * 1.4, 0, TAU); s.fill(); }
  BLOT = greyTile(64, 5, 90);
  buildFields();
}
export function overlays(g) {
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.drawImage(FIB, 0, 0); g.drawImage(SPK, 0, 0);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = .55; g.imageSmoothingEnabled = true; g.drawImage(BLOT, 0, 0, 1920, 1920);
  const v = g.createRadialGradient(960, 960, 620, 960, 960, 1450); v.addColorStop(0, 'rgba(60,40,20,0)'); v.addColorStop(1, 'rgba(60,40,20,.34)');
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 1; g.fillStyle = v; g.fillRect(0, 0, 1920, 1920);
  g.restore();
}
// ---------------------------------------------------------------- carving helpers
export function cut(g, pts, w, col = PAL.cream) { taper(g, pts, w); g.fillStyle = col; g.fill(); }                 // a tapered cut along a polyline
export function gouge(g, x, y, len, w, ang = Math.PI / 2, col = PAL.cream, r = 1) { g.fillStyle = col; nick(g, x, y, ang, len, w, r); g.fill(); }
// gouge marks over a rect R = {x,y,w,h}: axis 'v' = columns of vertical cuts, 'h' = rows of horizontal cuts. o = {col, step (across), len [min,max] cut length, gap, w [a,b] width, jit, dens(x,y)->0..1, seed}
export function carve(g, R, o = {}) {
  const { col = PAL.cream, axis = 'v', step = 22, len = [50, 200], gap = 40, w = [4, 8], jit = .05, dens = () => 1, seed = 1 } = o, r = mulberry32(seed), V = axis === 'v';
  const a0 = V ? R.x : R.y, a1 = V ? R.x + R.w : R.y + R.h, b0 = V ? R.y : R.x, b1 = V ? R.y + R.h : R.x + R.w;
  g.fillStyle = col;
  for (let a = a0; a < a1; a += step) {
    let b = b0 + r() * gap;
    while (b < b1) {
      const L = len[0] + r() * (len[1] - len[0]), aa = a + (r() - .5) * step * .6, x = V ? aa : b, y = V ? b : aa, d = dens(x, y);
      if (r() < d) { nick(g, x, y, (V ? Math.PI / 2 : 0) + (r() - .5) * 2 * jit, L * (.5 + .5 * d), w[0] + r() * (w[1] - w[0]) * (.6 + .4 * d)); g.fill(); }
      b += L * .85 + r() * gap;
    }
  }
}
// parallel hatching (many short cuts on a grid) over a rect: shadows are drawn with this, never with a tint
export function hatch(g, R, o = {}) {
  const { col = PAL.cream, dx = 30, dy = 44, len = [26, 46], w = [4, 6.5], ang = Math.PI / 2, jit = .09, dens = () => 1, seed = 1 } = o, r = mulberry32(seed);
  for (let y = R.y; y < R.y + R.h; y += dy) for (let x = R.x + ((Math.round((y - R.y) / dy) & 1) ? dx / 2 : 0); x < R.x + R.w; x += dx) {
    const d = dens(x, y), k = r(); if (k > d) continue;
    const L = len[0] + r() * (len[1] - len[0]), W = w[0] + r() * (w[1] - w[0]), a = ang + (r() - .5) * 2 * jit;
    gouge(g, x + (r() - .5) * dx * .5, y + (r() - .5) * dy * .4, L * (.6 + .6 * d), W, a, col);
  }
}
// bundles of long parallel cuts (shading by carved lines): kept for scenes that want them
export function bundles(g, R, o = {}) {
  const { col = PAL.indigo, step = [150, 170], n = [4, 7], gap = 9, len = [90, 210], w = [3, 5], ang = Math.PI / 2, dens = () => 1, seed = 1 } = o, r = mulberry32(seed);
  for (let y = R.y; y < R.y + R.h; y += step[1]) for (let x = R.x + (((y - R.y) / step[1]) & 1 ? step[0] / 2 : 0); x < R.x + R.w; x += step[0]) {
    const cx = x + (r() - .5) * step[0] * .6, cy = y + (r() - .5) * step[1] * .5, d = dens(cx, cy); if (r() > d) continue;
    const m = Math.round(n[0] + r() * (n[1] - n[0]) * (.5 + .5 * d)), L0 = len[0] + r() * (len[1] - len[0]), a = ang + (r() - .5) * .12;
    for (let i = 0; i < m; i++) { const L = L0 * (.55 + .45 * r()), ox = (i - m / 2) * gap * Math.cos(a - Math.PI / 2), oy = (i - m / 2) * gap * Math.sin(a - Math.PI / 2), sx = cx + ox, sy = cy + oy + (r() - .5) * 26; cut(g, [[sx, sy], [sx + Math.cos(a) * L * .5 + (r() - .5) * 3, sy + Math.sin(a) * L * .5], [sx + Math.cos(a) * L, sy + Math.sin(a) * L]], w[0] + r() * (w[1] - w[0]), col); }
  }
}
// bold key line along a polygon with a little hand wobble; fill (colour block) is printed RX,RY off the line
export function keyPoly(g, pts, lw, o = {}) {
  const { col = PAL.ink, amp = 1.6, seed = 3, fill = null, closed = true } = o, r = mulberry32(seed), out = [];
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if (!closed && i === pts.length - 1) { out.push(a); break; } const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 60)); for (let k = 0; k < n; k++) { const t = k / n; out.push([a[0] + (b[0] - a[0]) * t + (r() - .5) * 2 * amp, a[1] + (b[1] - a[1]) * t + (r() - .5) * 2 * amp]); } }
  const path = () => { g.beginPath(); out.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); if (closed) g.closePath(); };
  if (fill) { g.save(); g.translate(RX, RY); g.fillStyle = fill; path(); g.fill(); g.restore(); }
  if (lw > 0) { g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = col; g.lineWidth = lw; path(); g.stroke(); g.restore(); }
}
export const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const n2 = (x, y) => noise2(x / 260, y / 260, 4);

// ---------------------------------------------------------------- the hallway (static; the scene caches it). gap = the gap under the door
export function hallway(g, o = {}) {
  const { gap = 22 } = o, F = GEO.floor, W = 1920;
  g.fillStyle = PAL.cream; g.fillRect(0, 0, W, 1920);
  // 1. wall: a deep indigo block carved with long vertical cuts; the cuts are dense where the lantern lights the wall and sparse in the corners
  g.save(); g.translate(RX, RY); g.fillStyle = PAL.indigoD; g.fillRect(-20, -20, W + 40, 1060); g.restore();
  const lit = (x, y) => clamp(1.15 - Math.hypot((x - 930) / 760, (y - 650) / 560) + .18 * n2(x, y + 40));
  g.save(); g.beginPath(); g.rect(-10, -10, W + 20, 1050); g.clip();
  carve(g, { x: -10, y: -10, w: W + 20, h: 1050 }, { col: PAL.indigo, axis: 'v', step: 24, len: [40, 130], gap: 14, w: [8, 15], jit: .05, seed: 8, dens: () => .95 });                          // second block: mid-tone cuts
  carve(g, { x: -10, y: -10, w: W + 20, h: 1050 }, { col: PAL.cream, axis: 'v', step: 27, len: [30, 120], gap: 24, w: [3.4, 8.2], jit: .06, seed: 9, dens: (x, y) => clamp(.1 + 1.0 * lit(x, y)) }); // bare-paper cuts = light
  carve(g, { x: -10, y: -10, w: W + 20, h: 400 }, { col: PAL.ink, axis: 'v', step: 24, len: [40, 140], gap: 14, w: [9, 16], jit: .05, seed: 10, dens: (x, y) => clamp(.95 - y / 440) });                    // ceiling shadow: black cuts, hatching only
  g.restore();
  // lantern (hanging from a chain): rays of light carved around it, then the cage
  for (let i = 0; i < 34; i++) { const an = i / 34 * TAU + .1, r0 = 70, L = 130 + 150 * (.5 + .5 * Math.sin(i * 2.3)) * (1 - Math.abs(Math.sin(an)) * .25); cut(g, [[930 + Math.cos(an) * r0, 650 + Math.sin(an) * r0], [930 + Math.cos(an) * (r0 + L * .5), 650 + Math.sin(an) * (r0 + L * .5)], [930 + Math.cos(an) * (r0 + L), 650 + Math.sin(an) * (r0 + L)]], 13, PAL.cream); }
  cut(g, [[930, -10], [931, 230], [930, 470]], 9, PAL.cream); for (let y = 20; y < 470; y += 40) cut(g, [[918, y], [942, y + 6]], 6, PAL.ink);
  keyPoly(g, [[900, 540], [960, 540], [986, 640], [960, 720], [900, 720], [874, 640]], 8, { fill: PAL.cream, seed: 77 });
  keyPoly(g, [[915, 560], [945, 560], [962, 640], [945, 700], [915, 700], [898, 640]], 4, { amp: .6, seed: 78 });
  cut(g, [[930, 560], [930, 700]], 6, PAL.ink); cut(g, [[900, 628], [960, 628]], 6, PAL.ink);
  g.fillStyle = PAL.ink; g.beginPath(); g.moveTo(930, 600); g.quadraticCurveTo(948, 640, 930, 666); g.quadraticCurveTo(912, 640, 930, 600); g.fill();
  // arched window (left, 16:9 bleed + 9:16 left edge): night sky carved with horizontal cuts, a crescent, a cross mullion, a stone sill
  { const x0 = 470, x1 = 640, y0 = 560, y1 = 900, arch = gg => { gg.beginPath(); gg.moveTo(x0, y1); gg.lineTo(x0, y0 + 90); gg.quadraticCurveTo(x0, y0, (x0 + x1) / 2, y0); gg.quadraticCurveTo(x1, y0, x1, y0 + 90); gg.lineTo(x1, y1); gg.closePath(); };
    g.save(); g.translate(RX, RY); g.fillStyle = PAL.ink; arch(g); g.fill(); g.restore();
    g.save(); arch(g); g.clip(); carve(g, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, { col: PAL.indigoM, axis: 'h', step: 17, len: [50, 130], gap: 14, w: [4, 7], jit: .02, seed: 41 });
    g.fillStyle = PAL.cream; g.beginPath(); g.arc(560, 660, 34, 0, TAU); g.fill(); g.fillStyle = PAL.ink; g.beginPath(); g.arc(574, 652, 30, 0, TAU); g.fill();
    cut(g, [[(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1]], 11, PAL.cream); cut(g, [[x0, 770], [x1, 770]], 11, PAL.cream); g.restore();
    g.lineJoin = 'round'; g.strokeStyle = PAL.ink; g.lineWidth = 10; arch(g); g.stroke();
    keyPoly(g, rectPts(x0 - 22, y1, x1 - x0 + 44, 34), 7, { fill: PAL.cream, seed: 43 }); for (let x = x0 - 10; x < x1 + 10; x += 22) gouge(g, x, y1 + 6, 22, 4.5, Math.PI / 2, PAL.ink); }
  // coat rack (right bleed): rail, hooks, a hat and a long coat, all carved
  { keyPoly(g, rectPts(1545, 790, 210, 26), 7, { fill: PAL.cream, seed: 51 }); for (const hx of [1578, 1650, 1722]) { cut(g, [[hx, 816], [hx, 846], [hx + 22, 862]], 9, PAL.cream); cut(g, [[hx, 816], [hx, 846], [hx + 22, 862]], 3, PAL.ink); }
    keyPoly(g, [[1625, 850], [1680, 850], [1698, 1090], [1650, 1120], [1610, 1090]], 8, { fill: PAL.ink, seed: 52 });
    for (let k = 0; k < 9; k++) cut(g, [[1632 + k * 6, 868 + (k % 3) * 18], [1634 + k * 7, 960 + k * 10], [1632 + k * 6, 1060 + (k % 2) * 14]], 4.5, PAL.cream);
    keyPoly(g, [[1545, 840], [1580, 826], [1612, 840], [1604, 862], [1552, 862]], 7, { fill: PAL.ink, seed: 53 }); cut(g, [[1556, 852], [1600, 852]], 5, PAL.cream); }
  // wainscot: a black block with a cream chair rail and carved panels
  g.save(); g.translate(RX, RY); g.fillStyle = PAL.ink; g.fillRect(-20, 1040, W + 40, F - 1040); g.restore();
  g.save(); g.beginPath(); g.rect(-10, 1040, W + 20, F - 1040); g.clip();
  carve(g, { x: -10, y: 1040, w: W + 20, h: F - 1040 }, { col: PAL.indigo, axis: 'v', step: 17, len: [60, 200], gap: 26, w: [4, 8], jit: .03, seed: 12, dens: () => .5 });
  for (let x = 60; x < W; x += 250) {
    g.save(); g.fillStyle = PAL.ink; g.fillRect(x, 1086, 190, 168); g.restore();
    carve(g, { x, y: 1086, w: 190, h: 168 }, { col: PAL.cream, axis: 'h', step: 15, len: [22, 80], gap: 16, w: [3, 5.6], jit: .03, seed: x, dens: (xx, yy) => clamp(.3 + .8 * (1 - (yy - 1086) / 168)) });   // panel: carved lines, denser at the top (light from above)
    keyPoly(g, rectPts(x, 1086, 190, 168), 5, { col: PAL.cream, amp: .8, seed: x + 1 }); keyPoly(g, rectPts(x - 8, 1078, 206, 184), 3, { col: PAL.cream, amp: .8, seed: x + 2 });
  }
  g.restore();
  keyPoly(g, rectPts(-20, 1010, W + 40, 30), 7, { fill: PAL.cream, seed: 13 }); for (let x = 0; x < W; x += 36) gouge(g, x + 6, 1016, 20, 4.5, Math.PI / 2, PAL.ink);
  keyPoly(g, rectPts(-20, 1290, W + 40, 60), 6, { fill: PAL.ink, seed: 14 }); for (let x = 0; x < W; x += 50) gouge(g, x + 8, 1306, 28, 5, Math.PI / 2, PAL.cream);
  // floor: bare paper carved with long horizontal ink cuts, rows get wider apart and heavier toward the viewer
  g.fillStyle = PAL.ink; g.fillRect(-10, F - 2, W + 20, 8);
  { let y = F + 14, k = 0, sp = 15; while (y < 1930) { carve(g, { x: -20, y: y - 6, w: W + 40, h: 12 }, { col: PAL.ink, axis: 'h', step: 40, len: [70 + k * 10, 230 + k * 14], gap: 18 + k * 3, w: [4 + k * .5, 7.5 + k * .8], jit: .006, seed: 100 + k, dens: () => 1 }); y += sp; sp *= 1.2; k++; } }
  // the door
  if (o.door !== false) door(g, GEO.door, {}, { gap });
}
// ---------------------------------------------------------------- the door: a black block, cream wood-grain cuts, indigo-hatched panels, cream casing. state {glowPlate, glowHinge}, o {gap}
export function door(g, rect = GEO.door, state = {}, o = {}) {
  const { gap = 22 } = o, D = rect, r = mulberry32(31), x0 = D.x0, x1 = D.x1, y0 = D.y0, y1 = D.y1 - gap, W = x1 - x0;
  keyPoly(g, rectPts(x0 - 26, y0 - 26, W + 52, D.y1 - y0 + 26), 8, { fill: PAL.cream, seed: 21 });                          // casing (cream block)
  for (let y = y0 - 10; y < D.y1 - 20; y += 34) { gouge(g, x0 - 20, y, 22, 4.2, Math.PI / 2, PAL.ink); gouge(g, x1 + 6, y + 8, 22, 4.2, Math.PI / 2, PAL.ink); }
  keyPoly(g, rectPts(x0, y0, W, y1 - y0), 9, { fill: PAL.ink, seed: 22 });                                                 // slab (black block)
  g.save(); g.beginPath(); g.rect(x0 + 3, y0 + 3, W - 6, y1 - y0 - 6); g.clip();
  for (let k = 0; k < 96; k++) { const x = x0 + 8 + (k * 4.1) % (W - 16), L = 150 + r() * 380, y = y0 + 14 + r() * (y1 - y0 - L); cut(g, [[x, y], [x + (r() - .5) * 8, y + L * .5], [x + (r() - .5) * 6, y + L]], 3 + r() * 5.5, r() < .62 ? PAL.cream : PAL.indigoM); }   // wood grain: long cuts
  g.restore();
  for (const [py, ph] of [[y0 + 40, 250], [y0 + 330, 220], [y0 + 610, y1 - y0 - 650]]) {                                      // raised panels: indigo hatching on black, cream double line
    g.save(); g.beginPath(); g.rect(x0 + 34, py, W - 68, ph); g.clip(); g.fillStyle = PAL.ink; g.fillRect(x0 + 34, py, W - 68, ph);
    carve(g, { x: x0 + 30, y: py, w: W - 60, h: ph }, { col: PAL.indigo, axis: 'v', step: 11, len: [40, 120], gap: 10, w: [4, 6], jit: .35, seed: py, dens: (x, y) => clamp(1.05 - (y - py) / ph * .7) });
    g.restore(); keyPoly(g, rectPts(x0 + 34, py, W - 68, ph), 6, { col: PAL.cream, amp: .9, seed: py + 1 }); keyPoly(g, rectPts(x0 + 48, py + 14, W - 96, ph - 28), 3, { col: PAL.cream, amp: .9, seed: py + 2 });
  }
  // hinges on the RIGHT edge (our side), horizontal bar handle on the left edge, PULL plate
  for (const h of GEO.hinges) { keyPoly(g, rectPts(h.x - 18, h.y - 40, 36, 80), 6, { fill: PAL.cream, amp: .8, seed: h.y }); cut(g, [[h.x - 6, h.y - 28], [h.x - 6, h.y - 8]], 4.5, PAL.ink); cut(g, [[h.x - 6, h.y + 8], [h.x - 6, h.y + 28]], 4.5, PAL.ink); }
  { const hb = GEO.handle; keyPoly(g, rectPts(hb.x0, hb.y - 11, hb.x1 - hb.x0, 22), 6, { fill: PAL.cream, amp: .8, seed: 31 }); keyPoly(g, rectPts(hb.x0 + 4, hb.y - 24, 16, 48), 5, { fill: PAL.cream, amp: .6, seed: 32 }); keyPoly(g, rectPts(hb.x1 - 20, hb.y - 24, 16, 48), 5, { fill: PAL.cream, amp: .6, seed: 33 }); }
  const P = GEO.plate; keyPoly(g, rectPts(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0), 7, { fill: PAL.cream, seed: 33 });
  text(g, 'PULL', (P.x0 + P.x1) / 2, P.y1 - 14, 46, { align: 'center', col: PAL.ink, stroke: false });
  g.fillStyle = PAL.ink; g.fillRect(x0, D.y1 - gap, W, gap);                                                                  // the gap under the door: black
  // glowing parts (door.glowPlate / door.glowHinge): carved rays in the paper colour fan out of the plate / the hinges
  const gl = state.glowPlate || 0, gh = state.glowHinge || 0;
  if (gl > .02) { const cx = (P.x0 + P.x1) / 2, cy = (P.y0 + P.y1) / 2; for (let i = 0; i < 16; i++) { const an = i / 16 * TAU, r0 = 96 + (i % 2) * 14, r1 = r0 + 36 + 70 * gl * (1 - (i % 3) * .2); cut(g, [[cx + Math.cos(an) * r0 * 1.15, cy + Math.sin(an) * r0 * .8], [cx + Math.cos(an) * (r0 + r1) / 2 * 1.15, cy + Math.sin(an) * (r0 + r1) / 2 * .8], [cx + Math.cos(an) * r1 * 1.15, cy + Math.sin(an) * r1 * .8]], 7 * gl + 2, PAL.cream); } }
  if (gh > .02) for (const h of GEO.hinges) for (let i = 0; i < 8; i++) { const an = Math.PI * (.55 + i * .13), r0 = 46, r1 = r0 + 26 + 40 * gh; cut(g, [[h.x + Math.cos(an) * r0, h.y + Math.sin(an) * r0 * 1.3], [h.x + Math.cos(an) * r1, h.y + Math.sin(an) * r1 * 1.3]], 5 * gh + 1.5, PAL.cream); }
}
// block letters, carved: o = {align, col (fill), stroke (key colour or false)}
export function text(g, str, x, y, size, o = {}) {
  g.save(); g.font = `800 ${size}px Inter, sans-serif`; g.textAlign = o.align || 'left'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  if (o.stroke !== false) { g.strokeStyle = o.stroke || PAL.ink; g.lineWidth = Math.max(5, size * .16); g.strokeText(str, x, y); }
  g.fillStyle = o.col || PAL.ink; g.fillText(str, x + (o.stroke === false ? 0 : RX * .5), y + (o.stroke === false ? 0 : RY * .5));
  g.restore();
}
const heartPath = (cx, cy, s) => g => { g.beginPath(); g.moveTo(cx, cy + s * .95); g.bezierCurveTo(cx - s * 1.55, cy - s * .1, cx - s * .95, cy - s * 1.25, cx, cy - s * .45); g.bezierCurveTo(cx + s * .95, cy - s * 1.25, cx + s * 1.55, cy - s * .1, cx, cy + s * .95); g.closePath(); };
// 10 hearts on a cream cartouche (thick + thin border); fx = scene.heartFx (0..1 over 20 f): the lost heart shakes 8 f, then drops
export function hearts(g, n, fx = 1) {
  const Hh = GEO.hearts, age = fx * 20, x0 = Hh.cx - 5.2 * Hh.dx, w = 10.4 * Hh.dx;
  keyPoly(g, rectPts(x0, Hh.y - 36, w, 72), 7, { fill: PAL.cream, seed: 41 }); keyPoly(g, rectPts(x0 + 8, Hh.y - 28, w - 16, 56), 2.5, { amp: .6, seed: 42 });
  for (let i = 0; i < 10; i++) {
    const cx = Hh.cx + (i - 4.5) * Hh.dx; let cy = Hh.y, a = 1, rot = 0, dx = 0;
    if (i >= n) {
      if (i === n && fx < 1) { if (age < 8) { dx = Math.sin(age * 2.6) * 5 * (1 - age / 8); cy += Math.cos(age * 3.1) * 2; } else { const t = age - 8; cy += 1.3 * t * t * .5; rot = t * .08; a = clamp(1 - t / 12); } }
      else { g.save(); g.strokeStyle = PAL.indigo; g.lineWidth = 3; g.setLineDash([5, 6]); heartPath(cx, cy, 16)(g); g.stroke(); g.restore(); continue; }
    }
    g.save(); g.globalAlpha = a; g.translate(cx + dx, cy); g.rotate(rot); g.translate(-cx - dx, -cy);
    g.save(); g.translate(RX, RY); g.fillStyle = PAL.red; heartPath(cx + dx, cy, 16)(g); g.fill(); g.restore();
    g.strokeStyle = PAL.ink; g.lineWidth = 5; g.lineJoin = 'round'; heartPath(cx + dx, cy, 16)(g); g.stroke();
    cut(g, [[cx + dx - 12, cy - 5], [cx + dx - 9, cy - 11], [cx + dx - 3, cy - 13]], 4, PAL.cream); g.restore();
  }
}
// impact: carved radial gouges (cream with a black underlay, readable on any surface); age 0..10
export function bonk(g, im, age) {
  if (age < 0 || age > 10) return; const t = age / 10, R = 70 + 110 * ease.o(t), a = 1 - t * t; g.save(); g.globalAlpha = a; g.translate(im.x, im.y);
  for (const [w, col, dr] of [[17, PAL.ink, 0], [9, PAL.cream, 0]]) for (let i = 0; i < 14; i++) { const an = i / 14 * TAU + .15, r0 = R * .5 + dr, r1 = R * (.9 + .25 * ((i * 7) % 3) / 3) + dr * 2; cut(g, [[Math.cos(an) * r0, Math.sin(an) * r0], [Math.cos(an) * (r0 + r1) / 2, Math.sin(an) * (r0 + r1) / 2], [Math.cos(an) * r1, Math.sin(an) * r1]], w, col); }
  g.restore();
}

// ---------------------------------------------------------------- the hero, printed from the block: key line + carved hatching, no smooth fills
// 1. a cream halo (the white knife line), 2. paper-filled line art with the true draw order (hidden lines removed), 3. hatching fields clipped to per-part masks:
// indigo cuts on cloth and legs, black dense cuts only in the shadow band (lower right of every part), cream gouge highlights on the hair, the scarf = the ONE red printed a few px off the line with cream cuts.
const HW = 900, HHt = 700, HX = 450, HY = 500;                           // local canvas: pelvis at (450, 500); 900 x 700 px covers the raised mallet, the lying poses and the boots
const C = { PAPER: 0, SKIN: 1, HAIR: 2, CLOTH: 3, LEGS: 4, BOOT: 5, SCARF: 6, MITT: 7, PROP: 8, INK: 9 };
const CLS_OF = { skin: C.SKIN, skin2: C.SKIN, blush: C.SKIN, hair: C.HAIR, hair2: C.HAIR, eyeW: C.PAPER, shine: C.PAPER, teeth: C.PAPER, tongue: C.PAPER, pupil: C.INK, brow: C.INK, mouth: C.INK,
  tunic: C.CLOTH, tunic2: C.CLOTH, trim: C.CLOTH, mitten: C.MITT, legs: C.LEGS, boots: C.BOOT, sole: C.BOOT, scarf: C.SCARF, scarf2: C.SCARF, wood: C.PROP, wood2: C.PROP, metal: C.PROP, pencil: C.PROP, eraser: C.PROP };
const A_FILL = { skin: PAL.cream, skin2: PAL.cream, blush: PAL.cream, hair: PAL.ink, hair2: PAL.ink, eyeW: PAL.cream, shine: PAL.cream, teeth: PAL.cream, tongue: PAL.cream, pupil: PAL.ink, brow: PAL.ink, mouth: PAL.ink,
  tunic: PAL.cream, tunic2: PAL.cream, trim: PAL.cream, mitten: PAL.cream, legs: PAL.cream, boots: PAL.ink, sole: PAL.ink, scarf: PAL.cream, scarf2: PAL.cream, wood: PAL.cream, wood2: PAL.cream, metal: PAL.cream, pencil: PAL.cream, eraser: PAL.cream };
let FLD = null, HC = null, HIMG = null, HMC = null, HTMP = null, HIDS = null;
function field(ang, sp, len, w, seed, gap = [4, 9]) {                      // a static field of short tapered cuts (white on transparent), rows at angle `ang` (deg)
  const c = mk(HW, HHt), g = c.g, r = mulberry32(seed), a = ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), D = Math.hypot(HW, HHt), cx = HW / 2, cy = HHt / 2;
  g.fillStyle = '#fff';
  for (let v = -D / 2; v < D / 2; v += sp * (.85 + r() * .3)) for (let u = -D / 2 + r() * 40; u < D / 2;) {
    const L = len[0] + r() * (len[1] - len[0]), x = cx + ca * u - sa * v, y = cy + sa * u + ca * v; if (x > -80 && x < HW + 80 && y > -80 && y < HHt + 80) { nick(g, x, y, a, L, w[0] + r() * (w[1] - w[0])); g.fill(); } u += L + gap[0] + r() * (gap[1] - gap[0]);
  }
  return c;
}
function buildFields() {
  if (FLD) return;
  FLD = { A: field(58, 11, [30, 62], [3, 4.4], 1), C: field(58, 6.6, [34, 74], [3.4, 5.2], 2, [3, 6]), B: field(-34, 6.4, [30, 60], [3.4, 4.8], 6, [3, 6]), E: field(72, 13, [20, 48], [3.4, 5.6], 3), S: field(66, 19, [26, 44], [2.8, 3.8], 5, [12, 26]) };
  HC = mk(HW, HHt, true); HTMP = mk(HW, HHt);
  HIMG = [0, 1, 2, 3, 4].map(() => new ImageData(HW, HHt)); HMC = HIMG.map(() => mk(HW, HHt, true));
  HIDS = {}; for (const k in CLS_OF) HIDS[k] = `rgb(${10 + CLS_OF[k] * 20},0,0)`;
}
const SHX = 13, SHY = 15;                                                // shadow band = where the pixel down-right of this one belongs to another part
export function hero(g, p, f, o = {}) {
  const sc = o.scale || 1, at = o.at || [p.x, p.y], ox = Math.round(at[0] - HX), oy = Math.round(at[1] - HY), N = HW * HHt;
  // id draw: one colour per part class, the true draw order resolves occlusion
  const lc = HC.g; lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(0, 0, HW, HHt);
  H.drawHero(lc, p, { fill: { ...HIDS, _mask: true }, stroke: false, at: [HX, HY], scale: sc });
  const px = lc.getImageData(0, 0, HW, HHt).data, cls = new Uint8Array(N).fill(255);
  for (let i = 0; i < N; i++) if (px[i * 4 + 3] >= 110) cls[i] = Math.max(0, Math.min(9, Math.round((px[i * 4] - 10) / 20)));
  // layer masks (alpha on white): 0 indigo base cuts (cloth, legs), 1 black dense cuts in the shadow band, 2 cream highlights on the hair, 3 scarf red, 4 scarf cream cuts
  for (const im of HIMG) im.data.fill(0);
  const d0 = HIMG[0].data, d1 = HIMG[1].data, d2 = HIMG[2].data, d3 = HIMG[3].data, d4 = HIMG[4].data;
  for (let y = 0; y < HHt; y++) for (let x = 0; x < HW; x++) {
    const i = y * HW + x, c = cls[i]; if (c === 255) continue; const q = i * 4;
    if (c === C.CLOTH || c === C.LEGS) { d0[q] = d0[q + 1] = d0[q + 2] = 255; d0[q + 3] = 255; }
    if (c === C.HAIR) { d2[q] = d2[q + 1] = d2[q + 2] = 255; d2[q + 3] = 255; }
    if (c === C.SCARF) { d3[q] = d3[q + 1] = d3[q + 2] = 255; d3[q + 3] = 255; d4[q] = d4[q + 1] = d4[q + 2] = 255; d4[q + 3] = 255; }
    if (c === C.SKIN || c === C.CLOTH || c === C.LEGS || c === C.MITT || c === C.PROP) { const j = (y + SHY < HHt && x + SHX < HW) ? cls[i + SHY * HW + SHX] : 255; if (j !== c) { d1[q] = d1[q + 1] = d1[q + 2] = 255; d1[q + 3] = 255; } }
  }
  HIMG.forEach((im, k) => HMC[k].g.putImageData(im, 0, 0));
  const lay = (fieldC, mask, color) => { const t = HTMP.g; t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, HW, HHt); if (fieldC) t.drawImage(fieldC, 0, 0); else { t.fillStyle = '#fff'; t.fillRect(0, 0, HW, HHt); } t.globalCompositeOperation = 'destination-in'; t.drawImage(mask, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = color; t.fillRect(0, 0, HW, HHt); t.globalCompositeOperation = 'source-over'; return HTMP; };
  const allCream = {}; for (const k in CLS_OF) allCream[k] = PAL.cream;
  g.save(); if (o.alpha != null) g.globalAlpha = o.alpha;
  H.drawHero(g, p, { fill: allCream, stroke: PAL.cream, strokeWidth: 17, at, scale: sc });               // 1. the paper-white knife halo
  H.drawHero(g, p, { fill: A_FILL, stroke: PAL.ink, strokeWidth: 6.5, at, scale: sc });                  // 2. line art on paper, hair / boots / pupils / brows solid ink
  g.globalCompositeOperation = 'multiply';
  g.drawImage(lay(FLD.C, HMC[0], PAL.indigo), ox + 3, oy + 2);                                           // 3a. indigo cuts: the cloth and legs (second block, off register)
  g.globalCompositeOperation = 'source-over';
  g.drawImage(lay(FLD.B, HMC[1], PAL.ink), ox, oy);                                                      // 3b. dense black cuts: shadows are hatching only
  g.drawImage(lay(FLD.E, HMC[2], PAL.cream), ox, oy);                                                    // 3c. carved highlights in the black hair
  g.globalCompositeOperation = 'multiply'; g.drawImage(lay(null, HMC[3], PAL.red), ox + 5, oy + 4);       // 3d. the one red, printed off the key line
  g.globalCompositeOperation = 'source-over'; g.drawImage(lay(FLD.S, HMC[4], PAL.cream), ox + 5, oy + 4);// 3e. cream cuts carved out of the red
  g.restore();
}
// ring seam edge: bold black key band, a cream gap, a thin black line outside; little gouge ticks on the band
export function ringEdge(g, r, cx, cy, s = {}) {
  const n = 120, pts = []; for (let i = 0; i < n; i++) { const a = i / n * TAU, w = 1 + .004 * Math.sin(a * 7 + 1) + .003 * Math.sin(a * 13); pts.push([cx + Math.cos(a) * r * w, cy + Math.sin(a) * r * w]); }
  const path = gg => { gg.beginPath(); pts.forEach((q, i) => i ? gg.lineTo(q[0], q[1]) : gg.moveTo(q[0], q[1])); gg.closePath(); };
  g.save(); g.lineJoin = 'round'; g.strokeStyle = PAL.ink; g.lineWidth = 3; path(g); g.stroke();
  g.strokeStyle = PAL.ink; g.lineWidth = 11; g.beginPath(); g.arc(cx, cy, r - 9, 0, TAU); g.stroke();
  g.strokeStyle = PAL.cream; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, r - 1.5, 0, TAU); g.stroke();
  const rg = mulberry32(((s.f || 0) * 7 + 5) >>> 0); for (let i = 0; i < 46; i++) { const a = rg() * TAU, rr2 = r - 9; cut(g, [[cx + Math.cos(a) * (rr2 - 12), cy + Math.sin(a) * (rr2 - 12)], [cx + Math.cos(a) * (rr2 - 24), cy + Math.sin(a) * (rr2 - 24)]], 4, PAL.cream); }
  g.restore();
}
export const kit = { PAL, GEO, build, overlays, cut, gouge, carve, hatch, bundles, keyPoly, rectPts, hallway, door, text, hearts, bonk, hero, ringEdge, heartPath, get api() { return API; } };

async function loadScene(id, api) {
  let story = 'door'; try { story = (await (await fetch(new URL('../timeline.json', import.meta.url))).json()).story || 'door'; } catch (e) {}
  const m = await import(new URL(`../scenes/${story}/${id}.js`, import.meta.url).href), sc = m.default; if (sc.init) await sc.init(api, kit); return sc;
}
export default {
  id: 'woodcut', kind: '2d', kit, ringEdge,
  async init(api) { API = api; build(); SCENE = await loadScene('woodcut', api); },
  render(out, s) { SCENE.render(out, s, kit); },
};
