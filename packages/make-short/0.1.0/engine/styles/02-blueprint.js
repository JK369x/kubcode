// styles/02-blueprint.js: KIT for the cyanotype blueprint look (own code; grammar from opuscar blueprint STYLE.md).
// Generic only: procedural Prussian-blue paper + grid, the hallway in elevation (crown, rail, wainscot, baseboard, floor hatch, sconces), the door drawn as a
// dimensioned elevation, white line-art hero (outline + hatch/solid fills for occlusion), line hearts, JBM lettering, pencil draw-on helpers, ring edge.
// One non-blue colour: the scarf red (the film's continuity anchor). The story lives in scenes/<story>/blueprint.js; render() delegates to it.
import { TAU, clamp, lerp, hash, mulberry32 } from '../core/util.js';

const W = 1920;
const INK = '#eaf5ff', RED = '#e0352b', PITCH = 72;                // RED = hero2d PALETTE.scarf: the one non-blue colour
const BG0 = [10, 31, 73], BG1 = [27, 68, 130];
const BLEED_TEXT = false;                   // side-bleed notes/title block text (off: only the empty ruled boxes remain)
let api, H, paper, panels, FILL, scn;

// ---------------------------------------------------------------- paper (built once)
function makePaper() {
  const N = W, S = 480, mk = n => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
  const small = mk(S), sg = small.getContext('2d'), im = sg.createImageData(S, S), d = im.data;
  const vn = (x, y, cx, cy, py, seed) => {
    const gx = x / cx, gy = y / cy, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const h = (a, b) => hash(a * 57.3 + (((b % py) + py) % py) * 131.9 + seed * 17.1), sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(h(ix, iy), h(ix + 1, iy), sx), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), sx), sy);
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const m = .5 * vn(x, y, 120, 120, 4, 1) + .27 * vn(x, y, 60, 60, 8, 2) + .15 * vn(x, y, 30, 30, 16, 3) + .08 * vn(x, y, 15, 15, 32, 4), st = vn(x, y, 160, 3, 160, 5);
    const t = clamp((m - .5) * 2.2 + .5 + (st - .5) * .17), o = (y * S + x) * 4;
    d[o] = lerp(BG0[0], BG1[0], t); d[o + 1] = lerp(BG0[1], BG1[1], t); d[o + 2] = lerp(BG0[2], BG1[2], t); d[o + 3] = 255;
  }
  sg.putImageData(im, 0, 0);
  const P = mk(N), g = P.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(small, 0, 0, N, N);
  const r = mulberry32(42); g.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = r() * N, y = r() * N, a = r() * TAU, l = 14 + r() * 70, bend = (r() - .5) * 30, light = r() < .72;
    g.strokeStyle = light ? `rgba(170,210,255,${.035 + r() * .06})` : `rgba(3,14,44,${.05 + r() * .07})`; g.lineWidth = .8 + r() * 1.1;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l / 2 + bend, y + Math.sin(a) * l / 2, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < 700; i++) { g.fillStyle = r() < .5 ? 'rgba(215,238,255,.22)' : 'rgba(2,10,34,.28)'; g.beginPath(); g.arc(r() * N, r() * N, .7 + r() * 1.2, 0, TAU); g.fill(); }
  const id = g.getImageData(0, 0, N, N), pd = id.data; let sd = 12345;
  for (let i = 0; i < pd.length; i += 4) { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; const n = ((sd >>> 24) - 128) * .05; pd[i] += n; pd[i + 1] += n; pd[i + 2] += n * 1.1; }
  g.putImageData(id, 0, 0);
  return P;
}
function makeHatch(kind) {
  const T = 14, c = document.createElement('canvas'); c.width = c.height = T; const g = c.getContext('2d');
  if (kind === 'tunic') { g.fillStyle = '#0d2e64'; g.fillRect(0, 0, T, T); g.strokeStyle = 'rgba(234,245,255,.9)'; g.lineWidth = 2.3; g.lineCap = 'square'; g.beginPath(); for (const o of [0, T, 2 * T]) { g.moveTo(-1, o + 1); g.lineTo(o + 1, -1); } g.stroke(); }
  else { g.fillStyle = '#0a2552'; g.fillRect(0, 0, T, T); g.strokeStyle = 'rgba(190,225,255,.55)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(T / 2, 0); g.lineTo(T / 2, T); g.stroke(); }
  return c.getContext('2d').createPattern(c, 'repeat');
}
function makePanels() {                                                     // static 16:9 side bleed: darkened paper copy + rule lines + empty title-block cells
  const c = document.createElement('canvas'); c.width = c.height = W; const g = c.getContext('2d');
  for (const [x0, x1] of [[0, 420], [1500, W]]) { g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, W); g.clip(); g.drawImage(paper, 0, 0); g.fillStyle = 'rgba(2,12,38,.55)'; g.fillRect(x0, 0, x1 - x0, W); g.restore(); }
  if (BLEED_TEXT) return c;
  g.strokeStyle = 'rgba(234,245,255,.45)'; g.lineWidth = 2;
  g.strokeRect(1524, 900, 360, 560); for (const y of [1070, 1190, 1310, 1390]) { g.beginPath(); g.moveTo(1524, y); g.lineTo(1884, y); g.stroke(); } g.beginPath(); g.moveTo(1704, 1070); g.lineTo(1704, 1390); g.stroke();
  g.strokeRect(1534, 502, 340, 330); for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(1534, 502 + i * 55); g.lineTo(1874, 502 + i * 55); g.stroke(); } g.beginPath(); g.moveTo(1594, 502); g.lineTo(1594, 832); g.stroke();
  g.strokeRect(36, 500, 356, 400); for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(36, 500 + i * 50); g.lineTo(392, 500 + i * 50); g.stroke(); }
  return c;
}

// ---------------------------------------------------------------- drawing helpers (exported through the kit for scenes)
function arrow(g, x, y, ang, len = 22, wid = 8) { const c = Math.cos(ang), s = Math.sin(ang); g.beginPath(); g.moveTo(x, y); g.lineTo(x - c * len - s * wid, y - s * len + c * wid); g.lineTo(x - c * len + s * wid, y - s * len - c * wid); g.closePath(); g.fill(); }
function partial(g, pts, t) {                                               // stroke the first t of a polyline; returns the nib position
  if (t <= 0) return null;
  const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tg = c[c.length - 1] * Math.min(1, t); let head = pts[0];
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    if (c[i] <= tg) { g.lineTo(pts[i][0], pts[i][1]); head = pts[i]; }
    else { const k = (tg - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]); head = [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)]; g.lineTo(head[0], head[1]); break; }
  }
  g.stroke(); return head;
}
function pencil(g, pts, t, w = 3, seed = 1, col = INK) {                    // main stroke + fainter offset graphite pass + a nib while drawing
  if (t <= 0) return;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([]); g.strokeStyle = col; g.lineWidth = w; const head = partial(g, pts, t);
  g.save(); g.translate(.9 * (hash(seed) - .5) * 2, .9 * (hash(seed + 1) - .5) * 2); g.globalAlpha = .4; g.lineWidth = w * .55; partial(g, pts, t); g.restore();
  if (t < 1 && head) { g.fillStyle = '#ffffff'; g.shadowColor = '#bfe9ff'; g.shadowBlur = 16; g.beginPath(); g.arc(head[0], head[1], 5.5, 0, TAU); g.fill(); }
  g.restore();
}
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
function line(g, x0, y0, x1, y1, w = 2, a = 1) { g.save(); g.globalAlpha = a; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.restore(); }
function heartPath(g, cx, cy, s) { g.beginPath(); g.moveTo(cx, cy + s * .95); g.bezierCurveTo(cx - s * 1.55, cy - s * .1, cx - s * .95, cy - s * 1.15, cx, cy - s * .38); g.bezierCurveTo(cx + s * .95, cy - s * 1.15, cx + s * 1.55, cy - s * .1, cx, cy + s * .95); g.closePath(); }

export const kit = {
  id: 'blueprint', accent: INK, INK, RED, arrow, partial, pencil, rectPts, line, heartPath,
  init(a, hero) {
    api = a; H = hero; paper = makePaper(); panels = makePanels();
    const hT = makeHatch('tunic'), hV = makeHatch('legs');
    FILL = { skin: '#78aee6', skin2: '#8cbcee', blush: '#9cc6f2', hair: '#081c42', hair2: '#0d2a5c', eyeW: '#f4faff', pupil: '#081c42', shine: '#ffffff', brow: INK, mouth: INK, tongue: '#8fc8ff', teeth: '#ffffff',
      tunic: hT, tunic2: '#0a2552', trim: INK, mitten: INK, legs: hV, boots: '#081c42', sole: INK, scarf: RED, scarf2: '#b02730', wood: '#cfe3f7', wood2: '#9fbfe0', metal: INK, pencil: INK, eraser: '#ffb0b8' };
  },
  wall(g) {                                                                 // paper, grid, and the hallway in elevation (same layout as every other world)
    g.drawImage(paper, 0, 0);
    g.save(); g.lineWidth = 1.2; g.strokeStyle = 'rgba(190,225,255,.08)'; g.beginPath();
    for (let x = 0; x <= W; x += PITCH) { g.moveTo(x, 0); g.lineTo(x, W); } for (let y = 0; y <= W; y += PITCH) { if (y % (PITCH * 5)) { g.moveTo(0, y); g.lineTo(W, y); } } g.stroke();
    g.strokeStyle = 'rgba(200,232,255,.2)'; g.lineWidth = 2; g.beginPath(); for (let y = 0; y <= W; y += PITCH * 5) { g.moveTo(0, y); g.lineTo(W, y); } g.stroke(); g.restore();
    g.save(); g.strokeStyle = INK; g.fillStyle = INK;
    for (const [y, w, a] of [[190, 2, .5], [232, 2.4, .55], [1034, 2, .55], [1058, 2, .55], [1318, 2, .55], [1350, 4.2, 1]]) line(g, 0, y, W, y, w, a);       // crown, chair rail, baseboard, FLOOR LINE
    g.lineWidth = 1.8; g.globalAlpha = .5; for (let x = -250 + 30; x < W; x += 250) g.strokeRect(x, 1088, 190, 220);                                 // wainscot panels
    g.globalAlpha = .55; g.lineWidth = 1.6; g.beginPath(); for (let x = -40; x < W + 20; x += 18) { g.moveTo(x + 14, 1352); g.lineTo(x, 1392); } g.stroke();    // ground hatch under the floor line
    g.globalAlpha = .22; g.lineWidth = 1.4; g.beginPath(); for (let y = 1414; y < W; y += 64) { g.moveTo(0, y); g.lineTo(W, y); } g.stroke(); g.globalAlpha = 1;      // plank seams
    for (const lx of [490, 1700]) {                                                                                                               // sconces as drawing symbols
      g.lineWidth = 2.6; g.beginPath(); g.moveTo(lx - 24, 812); g.lineTo(lx + 24, 812); g.lineTo(lx + 14, 790); g.lineTo(lx - 14, 790); g.closePath(); g.stroke();
      g.beginPath(); g.arc(lx, 762, 16, Math.PI, 0); g.stroke(); line(g, lx, 746, lx, 730, 2.4); g.beginPath(); g.arc(lx, 810, 6, 0, TAU); g.stroke();
      g.setLineDash([10, 8]); g.lineWidth = 1.4; g.globalAlpha = .5; for (let k = -2; k <= 2; k++) line(g, lx + k * 18, 820, lx + k * 36, 880, 1.4); g.setLineDash([]); g.globalAlpha = 1;
    }
    g.restore();
  },
  door(g, r, st = {}) {                                                     // elevation drawing. r = {x, y, w, h, hinges[{x,y}], handle{x0,x1,y}, plate{x0,y0,x1,y1}}: hatched casing, leaf, panels, 3 hinges (right), bar handle + PULL plate (left), centre line, dimensions
    const x0 = r.x, x1 = r.x + r.w, y0 = r.y, y1 = r.y + r.h; g.save(); g.strokeStyle = INK; g.fillStyle = INK; g.lineJoin = 'round';
    g.save(); g.beginPath(); g.rect(x0 - 30, y0 - 30, r.w + 60, r.h + 30); g.rect(x0 - 14, y0 - 14, r.w + 28, r.h + 14); g.clip('evenodd'); g.fillStyle = 'rgba(3,14,44,.4)'; g.fillRect(x0 - 30, y0 - 30, r.w + 60, r.h + 30);   // casing hatch
    g.lineWidth = 1.6; g.globalAlpha = .6; g.beginPath(); for (let k = -r.h; k < r.w + 120; k += 17) { g.moveTo(x0 - 30 + k, y1); g.lineTo(x0 - 30 + k + r.h + 30, y0 - 30); } g.stroke(); g.restore();
    g.lineWidth = 3.4; g.strokeRect(x0 - 30, y0 - 30, r.w + 60, r.h + 30); g.lineWidth = 2; g.strokeRect(x0 - 14, y0 - 14, r.w + 28, r.h + 14);
    g.fillStyle = 'rgba(3,14,44,.32)'; g.fillRect(x0, y0, r.w, r.h); g.lineWidth = 3.4; g.strokeRect(x0, y0, r.w, r.h);
    const panel = (a, b, c, d) => { g.lineWidth = 2.6; g.strokeRect(a, b, c - a, d - b); g.lineWidth = 1.6; g.strokeRect(a + 12, b + 12, c - a - 24, d - b - 24); };
    panel(x0 + 44, y0 + 50, x1 - 56, y0 + .38 * r.h); panel(x0 + 44, y0 + .66 * r.h, x1 - 56, y1 - 60);
    for (const h of (r.hinges || [.145, .5, .855].map(f => ({ x: x1, y: y0 + f * r.h })))) {              // hinges, right edge
      const hy = h.y, hx = h.x; g.lineWidth = 2.8; g.strokeRect(hx - 40, hy - 34, 34, 68); for (const k of [-17, 0, 17]) line(g, hx - 40, hy + k, hx - 6, hy + k, 2); g.beginPath(); g.arc(hx - 23, hy, 5, 0, TAU); g.stroke();
      if (st.glowHinge > .05) { g.save(); g.shadowColor = '#bfe9ff'; g.shadowBlur = 30 * st.glowHinge; g.lineWidth = 4; g.strokeRect(hx - 44, hy - 38, 42, 76); g.restore(); }
    }
    const hd = r.handle || { x0: x0 + 18, x1: x0 + 118, y: y0 + .59 * r.h }, pl = r.plate || { x0: x0 + 25, y0: y0 + .476 * r.h, x1: x0 + 145, y1: y0 + .476 * r.h + 55 };
    g.lineWidth = 3; g.strokeRect(hd.x0, hd.y - 11, hd.x1 - hd.x0, 22); g.lineWidth = 2.4; g.strokeRect(hd.x0 - 6, hd.y - 20, 16, 40); g.strokeRect(hd.x1 - 10, hd.y - 20, 16, 40);        // horizontal bar handle with posts
    g.fillStyle = 'rgba(3,14,44,.55)'; g.fillRect(pl.x0, pl.y0, pl.x1 - pl.x0, pl.y1 - pl.y0); g.lineWidth = 3.4; g.strokeRect(pl.x0, pl.y0, pl.x1 - pl.x0, pl.y1 - pl.y0);
    if (st.glowPlate > .05) { g.save(); g.shadowColor = '#bfe9ff'; g.shadowBlur = 36 * st.glowPlate; g.lineWidth = 5; g.strokeRect(pl.x0 - 4, pl.y0 - 4, pl.x1 - pl.x0 + 8, pl.y1 - pl.y0 + 8); g.restore(); }
    g.fillStyle = INK; g.font = '500 46px JBM, monospace'; g.textBaseline = 'alphabetic'; g.textAlign = 'center'; g.fillText('PULL', (pl.x0 + pl.x1) / 2, pl.y1 - 11);
    g.setLineDash([46, 10, 7, 10]); g.lineWidth = 1.8; g.globalAlpha = .6; line(g, (x0 + x1) / 2, y0 - 60, (x0 + x1) / 2, y1 + 40, 1.8); g.setLineDash([]); g.globalAlpha = 1;       // centre line
    g.lineWidth = 2; const dy = y1 + 74, dx = x1 + 58;                                                      // width (under the floor) and height dimensions, no figures: the film only allows PULL as text
    line(g, x0, y1 + 8, x0, dy + 14, 1.6, .8); line(g, x1, y1 + 8, x1, dy + 14, 1.6, .8); line(g, x0, dy, x1, dy, 2, 1); arrow(g, x0, dy, Math.PI, 22, 8); arrow(g, x1, dy, 0, 22, 8);
    line(g, x1 + 30, y0, dx + 14, y0, 1.6, .8); line(g, x1 + 30, y1, dx + 14, y1, 1.6, .8); line(g, dx, y0, dx, y1, 2, 1); arrow(g, dx, y0, -Math.PI / 2, 22, 8); arrow(g, dx, y1, Math.PI / 2, 22, 8);
    g.restore();
  },
  hero(g, p, opts) { H.drawHero(g, p, { stroke: INK, strokeWidth: 4.2, fill: FILL, noPlank: true, ...opts }); },
  hearts(g, n, lost) {                                                      // outline hearts, 10 slots 60 px apart centred on x 960, y 465
    g.save(); g.strokeStyle = INK; g.lineWidth = 3; g.lineJoin = 'round';
    for (let i = 0; i < Math.floor(n); i++) { heartPath(g, 960 + (i - 4.5) * 60, 466, 17); g.stroke(); g.save(); g.clip(); g.globalAlpha = .5; g.lineWidth = 1.4; g.beginPath(); for (let k = -30; k < 40; k += 8) { g.moveTo(960 + (i - 4.5) * 60 + k, 490); g.lineTo(960 + (i - 4.5) * 60 + k + 22, 440); } g.stroke(); g.restore(); }
    if (lost) {
      const t = lost.t, shake = t < .3 ? ((Math.floor(t * 26) % 2) ? 5 : -5) : 0, drop = t < .3 ? 0 : Math.pow((t - .3) / .7, 2) * 420;
      g.globalAlpha = t < .6 ? 1 : 1 - (t - .6) / .4; heartPath(g, 960 + (lost.i - 4.5) * 60 + shake, 466 + drop, 17); g.stroke();
    }
    g.restore();
  },
  text(g, str, x, y, size) { g.save(); g.fillStyle = INK; g.font = `500 ${size / .73}px JBM, monospace`; g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillText(str, x, y); g.restore(); },
  impact(g, x, y, t, avoid) {                                               // drafting-style impact ticks (hit-stop 3 f, then they fly out); never over the PULL plate (avoid rect)
    g.save(); g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round'; const k = Math.max(0, t - 3);
    for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 - .95 + i * .27, d0 = 40 + k * 22, d1 = d0 + 34 - k * 2; if (avoid) { const cx = x - 24 + Math.cos(a) * (d0 + d1) / 2, cy = y + Math.sin(a) * (d0 + d1) / 2; if (cx > avoid.x0 - 30 && cx < avoid.x1 + 30 && cy > avoid.y0 - 30 && cy < avoid.y1 + 30) continue; } g.globalAlpha = Math.max(0, 1 - t / 9); g.beginPath(); g.moveTo(x + Math.cos(a) * d0 - 24, y + Math.sin(a) * d0); g.lineTo(x + Math.cos(a) * d1 - 24, y + Math.sin(a) * d1); g.stroke(); }
    g.restore();
  },
  vignette(g) { const v = g.createRadialGradient(960, 960, 560, 960, 960, 1380); v.addColorStop(0, 'rgba(1,8,30,0)'); v.addColorStop(1, 'rgba(1,8,30,.55)'); g.fillStyle = v; g.fillRect(0, 0, W, W); },
  sides(g) { g.drawImage(panels, 0, 0); },
  ringEdge(g, r, cx, cy) {                                                  // drafting compass circle: 6 px line, inner hairline, degree ticks
    g.save(); g.strokeStyle = INK; g.shadowColor = '#9fdcff'; g.shadowBlur = 12; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); g.shadowBlur = 0;
    g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r - 14, 0, TAU); g.stroke();
    g.lineWidth = 2.4; g.beginPath(); const n = Math.min(240, Math.max(24, Math.round(r / 5)));
    for (let k = 0; k < n; k++) { const a = k / n * TAU, l = k % 5 === 0 ? 18 : 9; g.moveTo(cx + Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4)); g.lineTo(cx + Math.cos(a) * (r + 4 + l), cy + Math.sin(a) * (r + 4 + l)); } g.stroke();
    g.restore();
  },
};
export const ringEdge = kit.ringEdge;

async function storyOf(a) { if (a.story) return a.story; try { return (await (await fetch(new URL('../timeline.json', import.meta.url))).json()).story || 'door'; } catch (e) { return 'door'; } }   // timeline.json "story" picks scenes/<story>/

export default {
  id: 'blueprint', kind: '2d', kit, ringEdge: kit.ringEdge,
  async init(a) {
    kit.init(a, a.hero2d || await import('../core/hero2d.js').catch(() => null) || { drawHero: (c, p, o) => a.soldier2d.drawSoldier(c, p, o), drawHeroMasks: (p, o) => a.soldier2d.drawPartMasks(p, o) });
    scn = (await import(`../scenes/${await storyOf(a)}/blueprint.js`)).default; if (scn.init) await scn.init(a, kit);                     // scene contract: { init?(api, kit), render(out, s, kit) }, api first like every style
  },
  render(out, s) { scn.render(out, s, kit); },
};
