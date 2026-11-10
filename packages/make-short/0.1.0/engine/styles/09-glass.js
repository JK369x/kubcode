// styles/09-glass.js: STAINED GLASS look kit + style wrapper. Generic look code only (exported as `kit`); the door story lives in scenes/<story>/glass.js,
// which imports the kit and reads scene(f). render() delegates to the active scene (timeline.json "story", default "door").
// Look: cut glass in thick dark lead came, every piece textured (thickness gradient, streaks, aged edge, seeds), grisaille painting for faces and
// lettering, backlight bloom that bleeds into the lead, coloured light spilling on stone, additive shafts, a mirrored colour patch on the floor.
// The hero is cut from the same glass: same lead, same grain, same backlight, no outline sticker and no drop shadow.
import { drawHero } from '../core/hero2d.js';

const W = 1920, TAU = Math.PI * 2, LEAD = '#0a0710', LW = 4.5;   // LW: lead half-width of the figure came (about 9 px, same as the window)
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const hash = (a, b = 0, c = 0) => { const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + 19.19) * 43758.5453; return n - Math.floor(n); };
export const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export const PAL = {
  cobalt: ['#1d4cc0', '#2a63e0', '#173f9f', '#3779ee'], ruby: ['#b3102f', '#cf1b3f', '#920b28', '#de2f50'], emerald: ['#0f7a5a', '#17966d', '#0b6049', '#27b384'],
  amber: ['#e8981a', '#f6b52b', '#c8780a', '#ffd25c'], violet: ['#5e2192', '#7b33b5', '#451572', '#9a4bd6'], sky: ['#6db3e8', '#8bc8f1', '#4e93d1', '#a7dcf6'],
  straw: ['#e9d27a', '#f2e093', '#d4b858', '#f6e9ad'], orange: ['#d1700f', '#e0841a', '#b05a08', '#ea9628'], teal: ['#0d6f7a', '#168a94', '#0a5760', '#25a6b0'],
};
// glass colour per hero palette key (soldier stand-in keys now, hero keys later): flesh stays darker than you think, tunic cool-dark, scarf ruby
const SG_OLD = { skin: '#f0b48c', skin2: '#c98763', strap: '#4a2a1a', tunic: '#2a4cb0', tunic2: '#1f3a8c', belt: '#f2b01e', buckle: '#ffe08a', glove: '#fff0b8', trousers: '#5a3a9a', boots: '#2a2060',
  cap: '#f7ab1a', capBand: '#c3162f', visor: '#c4720f', eyeW: '#fffbe4', pupil: '#2b1609', brow: '#3b2012', mouth: '#4c2412', tongue: '#a8473b', scarf: '#d2143c', plank: '#c27a22', plank2: '#8c5314', nail: '#f3e7b8' };

// ---------------------------------------------------------------- geometry helpers
function clipHalf(poly, a, b) {
  const nx = b[0] - a[0], ny = b[1] - a[1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, d = q => (q[0] - mx) * nx + (q[1] - my) * ny, out = [];
  for (let i = 0; i < poly.length; i++) { const P = poly[i], Q = poly[(i + 1) % poly.length], dp = d(P), dq = d(Q); if (dp <= 0) out.push(P); if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { const t = dp / (dp - dq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); } }
  return out;
}
export function voronoi(box, seeds, relax = 2) {
  let S = seeds.map(s => s.slice()), cells;
  for (let it = 0; it <= relax; it++) {
    cells = S.map((s, i) => { let poly = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]; for (let j = 0; j < S.length && poly.length; j++) if (j !== i) poly = clipHalf(poly, s, S[j]); return poly; });
    if (it < relax) S = cells.map((c, i) => { if (!c.length) return S[i]; let x = 0, y = 0; for (const q of c) { x += q[0]; y += q[1]; } return [x / c.length, y / c.length]; });
  }
  return cells;
}
const jitterSeeds = (box, nx, ny, seed, amp = .35) => { const o = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) o.push([box[0] + (i + .5 + (hash(i, j, seed) - .5) * 2 * amp) * (box[2] - box[0]) / nx, box[1] + (j + .5 + (hash(i, j, seed + 5) - .5) * 2 * amp) * (box[3] - box[1]) / ny]); return o; };
export function lattice(seed, w, h, dx = 128, dy = 188) {      // jittered diamond quarries with shared vertices
  const V = (a, b) => [a * dx / 2 + (hash(a, b, seed) - .5) * 15, b * dy / 2 + (hash(a, b, seed + 9) - .5) * 15], out = [];
  for (let b = -2; b <= Math.ceil(2 * h / dy) + 2; b++) for (let a = -2; a <= Math.ceil(2 * w / dx) + 2; a++) {
    if ((a + b) & 1) continue;
    const q = [V(a - 1, b), V(a, b - 1), V(a + 1, b), V(a, b + 1)], xs = q.map(t => t[0]), ys = q.map(t => t[1]);
    if (Math.max(...xs) < 0 || Math.min(...xs) > w || Math.max(...ys) < 0 || Math.min(...ys) > h) continue;
    out.push({ pts: q, a, b });
  }
  return out;
}
const path = (g, pts) => { g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); };
export function pane(g, pts, col, seed) {                      // one piece of glass: base colour, thickness gradient, streaks, seeds, aged edge
  path(g, pts); g.fillStyle = col; g.fill(); g.save(); g.clip();
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const lg = g.createLinearGradient(x0, y0, x1, y1); lg.addColorStop(0, 'rgba(255,255,255,.24)'); lg.addColorStop(.5, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(0,0,20,.28)'); g.fillStyle = lg; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.lineWidth = 1.5; const ang = (hash(seed) - .5) * 1.2 - .5;
  for (let i = 0; i < 5; i++) { const t = (i + hash(seed, i)) / 5; g.strokeStyle = i & 1 ? 'rgba(255,255,255,.15)' : 'rgba(0,0,30,.12)'; g.beginPath(); g.moveTo(x0 + (x1 - x0) * t - 60 * Math.sin(ang), y0 - 40); g.lineTo(x0 + (x1 - x0) * t + 120 * Math.sin(ang), y1 + 40); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x0 + hash(seed, 10 + i) * (x1 - x0), y0 + hash(seed, 20 + i) * (y1 - y0), 1 + hash(seed, 30 + i) * 1.6, 0, TAU); g.fill(); }   // seeds (bubbles)
  path(g, pts); g.lineWidth = 20; g.strokeStyle = 'rgba(20,0,20,.28)'; g.stroke(); g.restore();
}
export const leadPoly = (g, pts, w = 8) => { path(g, pts); g.lineWidth = w; g.strokeStyle = LEAD; g.lineJoin = 'round'; g.stroke(); };
export const circPts = (cx, cy, r, n = 36, a0 = 0) => Array.from({ length: n }, (_, i) => [cx + Math.cos(a0 + TAU * i / n) * r, cy + Math.sin(a0 + TAU * i / n) * r]);
const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

// ---------------------------------------------------------------- static world pieces (painted once, cached by the scene)
export function quarryField(g, rect, scheme, seed, dx = 150, dy = 220, bias = null) {       // leaded diamond quarries clipped to rect
  const [rx, ry, rw, rh] = rect; g.save(); g.beginPath(); g.rect(rx, ry, rw, rh); g.clip(); g.translate(rx, ry);
  const Q = lattice(seed, rw, rh, dx, dy);
  for (const q of Q) { const r = hash(q.a, q.b, seed), pal = PAL[r < (bias ?? .72) ? scheme[0] : scheme[1]]; pane(g, q.pts, pal[Math.floor(hash(q.a, q.b, seed + 3) * 4)], seed * 100 + q.a * 7 + q.b); }
  for (const q of Q) leadPoly(g, q.pts, 8);
  g.fillStyle = 'rgba(60,30,10,.32)'; for (const q of Q) if (((q.a + q.b) >> 1) % 3 === 0) { const cx = q.pts.reduce((s, t) => s + t[0], 0) / 4, cy = q.pts.reduce((s, t) => s + t[1], 0) / 4; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(cx + Math.cos(k * 2.09 - 1.57) * 11, cy + Math.sin(k * 2.09 - 1.57) * 11, 8, 0, TAU); g.fill(); } }   // grisaille trefoil
  g.restore();
}
export function plankField(g, rect, scheme, seed) {              // leaded floor planks: rows get taller toward the viewer, staggered joints
  const [rx, ry, rw, rh] = rect; g.save(); g.beginPath(); g.rect(rx, ry, rw, rh); g.clip();
  let y = ry, r = 0, h = 54;
  while (y < ry + rh) {
    let x = rx - hash(r, seed) * 260, k = 0;
    while (x < rx + rw) { const w = 220 + hash(r, k, seed) * 200, pts = rectPts(x, y, w, h), pal = PAL[hash(r, k, seed + 2) < .7 ? scheme[0] : scheme[1]]; pane(g, pts, pal[Math.floor(hash(r, k, seed + 4) * 4)], seed * 50 + r * 9 + k); leadPoly(g, pts, 9); x += w; k++; }
    y += h; h *= 1.16; r++;
  }
  g.restore();
}
export function stoneTile(w = W, h = 1040, base = '#6b655c') {   // warm grey ashlar, running bond
  const cv = mk(w, h), g = cv.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let r = 0; r < h / 130; r++) { let x = -((r * 97) % 260); const y = r * 130; while (x < w) { const bw = 210 + hash(r, x) * 150, tone = .8 + hash(x, r, 3) * .35; g.fillStyle = `rgb(${Math.round(112 * tone)},${Math.round(104 * tone)},${Math.round(94 * tone)})`; g.fillRect(x, y, bw, 130); g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(x, y + 100, bw, 30); g.strokeStyle = 'rgba(14,10,8,.85)'; g.lineWidth = 6; g.strokeRect(x, y, bw, 130); x += bw; } }
  for (let i = 0; i < 2600; i++) { g.fillStyle = hash(i, 1) < .5 ? 'rgba(0,0,0,.16)' : 'rgba(255,240,210,.07)'; g.fillRect(hash(i, 2) * w, hash(i, 3) * h, 2 + hash(i, 4) * 6, 2 + hash(i, 5) * 4); }
  return cv;
}

// ---------------------------------------------------------------- hearts, text, door (pieces of the kit the scene composes)
const heartPts = (cx, cy, s) => { const o = []; for (let i = 0; i < 28; i++) { const t = TAU * i / 28, x = 16 * Math.pow(Math.sin(t), 3), y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)); o.push([cx + x * s, cy + y * s + 2 * s]); } return o; };
export function hearts(g, n, lost = null, y = 465, x0 = 960, pitch = 60, total = 10) {   // leaded ruby hearts; lit ones glow (bloom), spent ones are dark glass
  const bx = x0 - (total - 1) * pitch / 2 - 40, bw = (total - 1) * pitch + 80, bar = [[bx, y - 38], [bx + bw, y - 38], [bx + bw, y + 38], [bx, y + 38]]; pane(g, bar, '#1a1030', 900); leadPoly(g, bar, 10);
  for (let i = 0; i < total; i++) {
    const cx = x0 + (i - (total - 1) / 2) * pitch; let dx = 0, dy = 0, alpha = 1, lit = i < n, rot = 0;
    if (lost && lost.i === i) { const t = lost.t; lit = t < .35; if (t < .35) dx = Math.sin(t * 90) * 5 * (1 - t / .35); else { const u = (t - .35) / .65; if (u < 1) { g.save(); g.globalAlpha = 1 - u; g.translate(cx, y + 1400 * u * u); g.rotate(u * .9); const fp = heartPts(0, 0, 1.55); pane(g, fp, '#e21a45', 700 + i); leadPoly(g, fp, 7); g.restore(); } } }
    g.save(); g.globalAlpha = alpha; g.translate(cx + dx, y + dy); g.rotate(rot); const pts = heartPts(0, 0, 1.55);
    pane(g, pts, lit ? '#e21a45' : '#3a1a2c', 700 + i); if (lit) { g.fillStyle = 'rgba(255,200,190,.5)'; g.beginPath(); g.ellipse(-8, -8, 5, 3, -.6, 0, TAU); g.fill(); } leadPoly(g, pts, 7); g.restore();
  }
}
export function text(g, str, x, y, size, o = {}) {              // grisaille lettering: dark brown paint on glass, a faint wash behind
  g.save(); g.font = `${o.weight || 700} ${size}px Inter, sans-serif`; g.textAlign = o.align || 'center'; g.textBaseline = 'alphabetic';
  g.fillStyle = 'rgba(60,30,10,.22)'; g.fillText(str, x + 2, y + 2); g.fillStyle = o.color || '#2e1708'; g.fillText(str, x, y); g.restore();
}
export function door(g, D, st = {}) {                            // leaded door leaf, jamb, 3 hinges (right), bar handle (left), PULL plate; D = scene DOOR geometry
  const { x0, y0, x1, y1 } = D, w = x1 - x0, h = y1 - y0;
  g.fillStyle = '#17141a'; g.fillRect(x0 - 38, y0 - 34, w + 76, h + 34);                      // stone jamb
  const panels = [[x0, y0, w, 190, 'amber', 'straw'], [x0, y0 + 190, w, 540, 'ruby', 'violet'], [x0, y0 + 730, w, h - 730, 'ruby', 'cobalt']];
  panels.forEach(([x, y, pw, ph, a, b], k) => { const Q = lattice(40 + k, pw, ph, k ? 190 : 126, k ? 270 : 190); g.save(); g.beginPath(); g.rect(x, y, pw, ph); g.clip(); g.translate(x, y); for (const q of Q) pane(g, q.pts, PAL[hash(q.a, q.b, k) < .7 ? a : b][Math.floor(hash(q.a, q.b, k + 3) * 4)], 60 + k * 40 + q.a * 3 + q.b); for (const q of Q) leadPoly(g, q.pts, 7); g.restore(); });
  for (const y of [y0 + 190, y0 + 730]) { g.fillStyle = LEAD; g.fillRect(x0, y - 7, w, 14); }
  g.strokeStyle = LEAD; g.lineWidth = 16; g.strokeRect(x0 + 8, y0 + 8, w - 16, h - 16);
  const gl = st.glowHinge || 0;                                                                // hinges on the RIGHT edge: iron leaf + barrel + rivets, glow = accent through the glass
  for (const hg of D.hinges) { const y = hg.y; g.fillStyle = gl > 0 ? `rgb(${Math.round(60 + 195 * gl)},${Math.round(40 + 90 * gl)},${Math.round(30 + 10 * gl)})` : '#2a2630'; g.fillRect(x1 - 62, y - 8, 56, 16); g.fillRect(x1 - 24, y - 52, 22, 104); g.strokeStyle = LEAD; g.lineWidth = 4; g.strokeRect(x1 - 62, y - 8, 56, 16); g.strokeRect(x1 - 24, y - 52, 22, 104); g.fillStyle = '#d8d0c0'; for (const rx of [x1 - 52, x1 - 36]) { g.beginPath(); g.arc(rx, y, 3.5, 0, TAU); g.fill(); } }
  const H = D.handle; g.fillStyle = '#e8e0c4'; g.fillRect(H.x0, H.y - 9, H.x1 - H.x0, 18); g.strokeStyle = LEAD; g.lineWidth = 5; g.strokeRect(H.x0, H.y - 9, H.x1 - H.x0, 18); g.fillStyle = '#b8b09a'; for (const px of [H.x0 + 6, H.x1 - 6]) { g.beginPath(); g.arc(px, H.y, 6, 0, TAU); g.fill(); g.stroke(); }   // horizontal bar on standoffs
  const P = D.plate, pg = st.glowPlate || 0, pw = P.x1 - P.x0, ph = P.y1 - P.y0;
  g.fillStyle = pg > 0 ? `rgb(${Math.round(244 + 11 * pg)},${Math.round(236 - 60 * pg)},${Math.round(190 - 120 * pg)})` : '#f4eac0'; g.fillRect(P.x0, P.y0, pw, ph); g.strokeStyle = LEAD; g.lineWidth = 6; g.strokeRect(P.x0, P.y0, pw, ph);
  text(g, 'PULL', P.x0 + pw / 2, P.y0 + ph - 14, 40, { color: '#2e1708' });
}

// ---------------------------------------------------------------- the leaded hero: core/hero2d.drawHero runs through a glass context, so EVERY piece it draws
// (sleeves, torso, hair, mittens, boots, each scarf segment) becomes cut glass: thick lead came, thickness gradient, streaks, seeds, aged edge, Voronoi cells in
// the tunic; what hero2d draws as face paint (eyes, brows, mouth, blush, nose, trim) stays grisaille: no lead, painted on the glass.
const HERO_GLASS = { skin: '#e3a47c', skin2: '#c8805c', blush: '#d9685c', hair: '#2a1830', hair2: '#4a2c4a', eyeW: '#fffbe4', pupil: '#2b1609', shine: '#ffffff', brow: '#3b2012', mouth: '#4c2412', tongue: '#a8473b', teeth: '#fff4d8',
  tunic: '#2c4aa8', tunic2: '#20367e', trim: '#6f8fe8', mitten: '#fff0b8', legs: '#4a3290', boots: '#8a5424', sole: '#2a1a10', scarf: '#e0352b', scarf2: '#b0261f', wood: '#c8955a', wood2: '#8d6538', metal: '#c3ccd6', pencil: '#f3c64f', eraser: '#f08a9a' };
const lc = c => String(c).toLowerCase();
const PAINT = new Set(['skin2', 'blush', 'eyeW', 'pupil', 'shine', 'brow', 'mouth', 'tongue', 'teeth', 'tunic2', 'trim', 'sole'].map(k => lc(HERO_GLASS[k])));
const TORSO_CELLS = voronoi([-72, -158, 72, 36], jitterSeeds([-72, -158, 72, 36], 3, 4, 3), 2);
function glassContext(g, state) {
  const glassFill = () => {
    const col = lc(g.fillStyle);
    if (PAINT.has(col)) { g.fill(); if (col === lc(HERO_GLASS.eyeW) && g.globalAlpha > .9) { g.save(); g.lineWidth = 5; g.strokeStyle = 'rgba(58,31,16,.85)'; g.lineJoin = 'round'; g.stroke(); g.restore(); } return; }
    const n = state.n++, tun = col === lc(HERO_GLASS.tunic);
    g.save(); g.lineJoin = 'round'; g.lineWidth = 2 * LW; g.strokeStyle = LEAD; g.stroke(); g.fill(); g.clip();                   // lead came, then the glass, then everything below is clipped to the piece
    if (tun) { TORSO_CELLS.forEach((c, i) => { if (c.length < 3) return; path(g, c); g.fillStyle = (i + n) % 3 === 0 ? 'rgba(255,200,170,.14)' : (i + n) % 3 === 1 ? 'rgba(40,0,30,.2)' : 'rgba(255,255,255,.08)'; g.fill(); });
      g.lineWidth = 7; g.strokeStyle = LEAD; TORSO_CELLS.forEach(c => { if (c.length < 3) return; path(g, c); g.stroke(); }); }
    g.setTransform(1, 0, 0, 1, 0, 0); const cx = state.cx, cy = state.cy;                                                       // glaze in master px around the hero
    const lg = g.createLinearGradient(cx - 220, cy - 460, cx + 220, cy + 200); lg.addColorStop(0, 'rgba(255,255,255,.26)'); lg.addColorStop(.45, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(10,0,30,.28)'); g.fillStyle = lg; g.fillRect(cx - 700, cy - 700, 1400, 1400);
    g.lineWidth = 1.8; for (let i = 0; i < 5; i++) { const t = (hash(n, i) - .5) * 520; g.strokeStyle = i & 1 ? 'rgba(255,255,255,.17)' : 'rgba(0,0,30,.13)'; g.beginPath(); g.moveTo(cx + t - 30, cy - 420); g.lineTo(cx + t + 90, cy + 260); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.4)'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx + (hash(n, 50 + i) - .5) * 360, cy + (hash(n, 60 + i) - .5) * 520, 1.4 + hash(n, 70 + i) * 1.8, 0, TAU); g.fill(); }
    g.restore();
    g.save(); g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = 'rgba(25,0,20,.24)'; g.clip(); g.stroke(); g.restore();      // aged edge inside the lead
  };
  const glassStroke = () => {
    const col = lc(g.strokeStyle), w = g.lineWidth;
    if (PAINT.has(col)) { g.stroke(); return; }
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = w + 2 * LW; g.strokeStyle = LEAD; g.stroke();
    g.lineWidth = w; g.strokeStyle = col; g.stroke(); g.lineWidth = Math.max(2, w - 12); g.strokeStyle = 'rgba(255,255,255,.12)'; g.stroke();                // lighter core: light passes through the middle
    g.restore();
  };
  return new Proxy(g, {
    get(t, k) { if (k === 'fill') return glassFill; if (k === 'stroke') return glassStroke; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
export function hero(g, p, o = {}) {
  const state = { n: 0, cx: p.x, cy: p.y };
  drawHero(glassContext(g, state), p, { stroke: false, fill: HERO_GLASS, noProp: o.noProp, ...(o.opts || {}) });
}

// ---------------------------------------------------------------- impact cracks (shared with the shatter seam)
const FRS = new Map();
export function fracture(cx, cy) {
  const key = Math.round(cx) + ':' + Math.round(cy); if (FRS.has(key)) return FRS.get(key);
  const NR = 18, rings = [0, 64, 150, 270, 440, 680, 1000, 1400, 1850, 2400], P = [];
  for (let i = 0; i < NR; i++) { const a = TAU * (i + (hash(i, 1) - .5) * .5) / NR + .2; P.push(rings.map((r, j) => { if (!j) return [cx, cy]; const rr = r * (1 + (hash(i, j, 2) - .5) * .22), tt = (hash(i, j, 3) - .5) * r * .12; return [cx + Math.cos(a) * rr - Math.sin(a) * tt, cy + Math.sin(a) * rr + Math.cos(a) * tt]; })); }
  const cells = [], edges = [];
  for (let i = 0; i < NR; i++) { const n = (i + 1) % NR; for (let j = 0; j < rings.length - 1; j++) { cells.push({ pts: j ? [P[i][j], P[n][j], P[n][j + 1], P[i][j + 1]] : [P[i][0], P[n][1], P[i][1]], ring: j, i }); edges.push({ a: P[i][j], b: P[i][j + 1], r: rings[j] }); if (j) edges.push({ a: P[i][j], b: P[n][j], r: rings[j] }); } }
  const F = { P, cells, edges, rings, cx, cy }; FRS.set(key, F); return F;
}
export function crack(g, cx, cy, t) {                            // white-hot cracks racing out of the impact; dark gap under them so they read on bright glass
  if (t <= 0) return; const R = t * 2300, fr = fracture(cx, cy);
  g.save(); g.lineCap = 'round';
  for (const pass of [0, 1]) for (const e of fr.edges) {
    if (e.r > R) continue; const k = clamp((R - e.r) / 260), ex = e.a[0] + (e.b[0] - e.a[0]) * k, ey = e.a[1] + (e.b[1] - e.a[1]) * k;
    if (!pass) { g.strokeStyle = 'rgba(8,4,12,.55)'; g.lineWidth = 9; g.shadowBlur = 0; } else { g.strokeStyle = `rgba(255,250,232,${.6 + .4 * k})`; g.lineWidth = 3.2; g.shadowColor = 'rgba(255,255,255,.9)'; g.shadowBlur = 14; }
    g.beginPath(); g.moveTo(e.a[0], e.a[1]); g.lineTo(ex, ey); g.stroke();
  }
  g.restore();
}
export function ringEdge(ctx, r, cx, cy) {                       // the ring seam's rim in glass: warm light, a lead came, a bright inner lip
  ctx.save(); ctx.lineJoin = 'round';
  for (const [w, c, rr] of [[26, 'rgba(255,190,100,.28)', r], [10, LEAD, r], [2.5, 'rgba(255,238,175,.85)', r - 6]]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, Math.max(.5, rr), 0, TAU); ctx.stroke(); }
  ctx.restore();
}

let IMPACT = { x: 1040, y: 930 };
export const lastImpact = () => IMPACT;
const setImpact = i => { IMPACT = i; };
export const kit = { setImpact, PAL, mk, hash, pane, lattice, leadPoly, circPts, quarryField, plankField, stoneTile, hearts, text, door, hero, voronoi, fracture, crack, ringEdge };

// ---------------------------------------------------------------- style wrapper: delegates to the active story's scene
let SCENE = null;
export default {
  id: 'glass', kind: '2d',
  async init(api) {
    let story = 'door'; try { const tl = await (await fetch(new URL('../timeline.json', import.meta.url))).json(); story = tl.story || 'door'; } catch (e) { /* default story */ }
    SCENE = (await import(`../scenes/${story}/glass.js`)).default; if (SCENE.init) await SCENE.init(api, kit);
  },
  render(out, s) { SCENE.render(out, s, kit); },
  ringEdge,
};
