// core/soldier2d.js: the clean vector soldier. Draws from a pose() object. Local frame: origin = bbox centre,
// y down, 380 px tall at scale 1, faces +x (3/4 view), L = far limb (behind), R = near limb (front).
// drawSoldier(ctx, p, opts)  opts: {stroke:true|false|'#colour' (default PALETTE.outline), strokeWidth:5,
//   fill:{key|group:'#colour'} palette override, scale:1 (about the soldier), at:[x,y] (draw elsewhere), noPlank, parts:[groups]}
// drawPartMasks(p, opts) -> {cap,tunic,belt,skin,trousers,boots,face,plank,all} white-on-transparent canvases for per-part styling
//   opts: {size:[1920,1920], scale, at, color:'#fff'}. Part groups: see GROUPS.
// drawBang(ctx, p, opts) draws the "!" bubble above the head (use while p.bang).
import { TAU, clamp } from './util.js';
import { FEET } from './pose.js';

export const PALETTE = {
  skin: '#f3c29b', skin2: '#d99f78', strap: '#3a2d2f',
  tunic: '#d23a36', tunic2: '#a82a2c', belt: '#f4f0e6', buckle: '#f0b93a', glove: '#f4f0e6',
  trousers: '#2d3558', boots: '#2a2127',
  cap: '#2c4c88', capBand: '#f0b93a', visor: '#1f2d55',
  eyeW: '#ffffff', pupil: '#1d1b24', brow: '#4a2f22', mouth: '#5b2a2a', tongue: '#d9605a',
  plank: '#cb9158', plank2: '#9c6a38', nail: '#e8dcc0', outline: '#1e1a24',
};
export const GROUPS = {
  cap: ['cap', 'capBand', 'visor'], tunic: ['tunic', 'tunic2'], belt: ['belt', 'buckle', 'glove'], skin: ['skin', 'skin2', 'strap'],
  trousers: ['trousers'], boots: ['boots'], face: ['eyeW', 'pupil', 'brow', 'mouth', 'tongue'], plank: ['plank', 'plank2', 'nail'],
};
const GROUP_OF = {}; for (const g in GROUPS) for (const k of GROUPS[g]) GROUP_OF[k] = g;
const dir = a => [Math.sin(a), Math.cos(a)];
const HEAD = [8, -104], HR = 54, CAPBASE = [12, -150];

export function buildOps(p) {
  const ops = [], add = o => (ops.push(o), o);
  const poly = (key, fn, x = {}) => add({ t: 'p', key, fn, ...x });
  const line = (key, pts, w, x = {}) => add({ t: 'l', key, pts, w, ...x });
  const circ = (key, x, y, r, e) => poly(key, c => c.arc(x, y, r, 0, TAU), e);
  const ell = (key, x, y, rx, ry, e) => poly(key, c => c.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), 0, 0, TAU), e);
  const limb = (root, a1, l1, a2, l2) => { const d1 = dir(a1), E = [root[0] + d1[0] * l1, root[1] + d1[1] * l1], d2 = dir(a2); return { E, W: [E[0] + d2[0] * l2, E[1] + d2[1] * l2], d2 }; };
  const arm = (S, a, el) => { const L = limb(S, a, 50, a + el, 46); line('tunic', [S, L.E, L.W], 23); circ('glove', L.W[0] + L.d2[0] * 8, L.W[1] + L.d2[1] * 8, 13); };
  const leg = (H, a, kn) => {
    const L = limb(H, a, 60, a - kn, 60); line('trousers', [H, L.E, L.W], 33);
    poly('boots', c => { c.moveTo(-15, -10); c.lineTo(15, -10); c.lineTo(17, 4); c.quadraticCurveTo(44, 6, 44, 14); c.quadraticCurveTo(44, 19, 37, 19); c.lineTo(-13, 19); c.quadraticCurveTo(-18, 19, -18, 12); c.closePath(); }, { tf: { x: L.W[0], y: L.W[1], r: -(a - kn) } });
  };
  // ---- order: far arm, legs, torso, [plank if carried], head, face, cap, near arm, [plank if loose]
  arm([-8, -46], p.armL, p.elbowL);
  leg([-8, 52], p.legL, p.kneeL); leg([8, 52], p.legR, p.kneeR);
  poly('tunic', c => { c.moveTo(-36, -46); c.quadraticCurveTo(-38, -60, -20, -60); c.lineTo(30, -60); c.quadraticCurveTo(49, -57, 49, -38); c.lineTo(47, -8); c.quadraticCurveTo(52, 22, 43, 42); c.lineTo(46, 66); c.quadraticCurveTo(6, 74, -36, 66); c.lineTo(-40, 30); c.quadraticCurveTo(-46, -8, -36, -46); c.closePath(); });
  line('belt', [[-22, -58], [35, 40]], 14, { ol: false }); line('belt', [[38, -56], [-26, 40]], 14, { ol: false });
  poly('belt', c => c.roundRect(-40, 34, 90, 16, 5)); poly('buckle', c => c.roundRect(24, 33, 16, 18, 4)); circ('buckle', 7, -11, 8);
  const plank = () => add({ t: 'plank', key: 'plank', world: true });
  if (p.plank.carried) plank();
  poly('skin', c => c.roundRect(HEAD[0] - 14, -66, 28, 24, 8));
  circ('skin', HEAD[0], HEAD[1], HR); circ('skin2', -22, -96, 10, { ol: false }); circ('skin', 60, -98, 9, { ol: false });
  line('strap', [[-36, -126], [-34, -92], [-10, -58], [30, -52]], 5, { ol: false });
  // ---- face
  const wide = p.eyes === 'wide', lidv = p.eyes === 'closed' ? 1 : (p.lid || 0), kx = wide ? 1.2 : 1, ky = wide ? 1.25 : 1;
  const [lx, ly] = p.look || [0, 0];
  for (const [ex, rx, ry, pr] of [[6, 11, 15, 6], [40, 13, 18, 7.5]]) {
    const ey = -108, RX = rx * kx, RY = ry * ky;
    if (lidv >= .85) { line('brow', [[ex - RX, ey], [ex, ey + 6], [ex + RX, ey]], 6, { ol: false }); }
    else {
      const eyeP = c => c.ellipse(ex, ey, RX, Math.max(1.5, RY * (1 - lidv)), 0, 0, TAU);
      poly('eyeW', eyeP); const cl = { clip: eyeP };
      circ('pupil', ex + lx * RX * .45 + 2, ey + ly * RY * .4 + (lidv > 0 ? RY * lidv * .5 : 0), wide ? pr * .72 : pr, cl);
      circ('eyeW', ex + lx * RX * .45 - 0.5, ey + ly * RY * .4 - 3, 2.2, cl);
    }
    const b = p.brows, by = ey - (26 + 15 * b) * (wide ? 1.05 : 1) - (lidv > .3 ? lidv * 4 : 0), sl = (b - .4) * 9;
    line('brow', [[ex - RX, by + sl], [ex, by - 2 - 3 * b], [ex + RX, by - sl]], 7, { ol: false });
  }
  const mx = 30, my = -72;
  if (p.mouth === 'o') { ell('mouth', mx, my + 3, 9, 12, { ol: false }); ell('tongue', mx, my + 9, 5, 4, { ol: false }); }
  else if (p.mouth === 'smirk') line('mouth', [[mx - 14, my + 3], [mx + 2, my + 3], [mx + 15, my - 5]], 6, { ol: false });
  else line('mouth', [[mx - 14, my], [mx, my + 1], [mx + 14, my]], 6, { ol: false });
  // ---- cap (lags the head)
  const cp = p.cap, ct = { x: CAPBASE[0] + cp.dx, y: CAPBASE[1] + cp.dy, r: cp.rot };
  poly('cap', c => { c.moveTo(-50, 2); c.bezierCurveTo(-52, -24, -40, -42, -18, -42); c.lineTo(28, -42); c.bezierCurveTo(50, -42, 56, -20, 54, 2); c.closePath(); }, { tf: ct });
  poly('capBand', c => c.roundRect(-52, -9, 108, 13, 5), { tf: ct });
  poly('visor', c => { c.moveTo(34, -1); c.quadraticCurveTo(84, -6, 88, 9); c.quadraticCurveTo(60, 15, 30, 9); c.closePath(); }, { tf: ct });
  add({ t: 'p', key: 'capBand', fn: c => c.arc(12, -26, 7, 0, TAU), tf: ct });
  arm([10, -46], p.armR, p.elbowR);
  if (!p.plank.carried) plank();
  return ops;
}

function paintPlank(ctx, p, pal, sw, outline) {
  const L = p.plank.len, H = 30;
  ctx.save(); ctx.translate(p.plank.x, p.plank.y); ctx.rotate(p.plank.rot);
  ctx.beginPath(); ctx.roundRect(-L / 2, -H / 2, L, H, 4);
  if (outline) { ctx.lineWidth = sw * 2; ctx.lineJoin = 'round'; ctx.strokeStyle = outline; ctx.stroke(); }
  ctx.fillStyle = pal.plank; ctx.fill();
  if (!pal._mask) {
    ctx.fillStyle = pal.plank2; ctx.fillRect(-L / 2 + 8, -H / 2 + 8, L * .55, 4); ctx.fillRect(-L * .1, H / 2 - 12, L * .42, 4);
    ctx.fillStyle = pal.nail; ctx.beginPath(); ctx.arc(-L / 2 + 14, 0, 4, 0, TAU); ctx.arc(L / 2 - 14, 0, 4, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function paintOp(ctx, op, pal, sw, outline) {
  ctx.save();
  if (op.tf) { ctx.translate(op.tf.x, op.tf.y); if (op.tf.r) ctx.rotate(op.tf.r); }
  if (op.clip) { ctx.beginPath(); op.clip(ctx); ctx.clip(); }
  const col = pal[op.key]; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (op.t === 'p') {
    ctx.beginPath(); op.fn(ctx);
    if (outline && op.ol !== false) { ctx.lineWidth = sw * 2; ctx.strokeStyle = outline; ctx.stroke(); }
    ctx.fillStyle = col; ctx.fill();
  } else {
    ctx.beginPath(); op.pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
    if (outline && op.ol !== false) { ctx.lineWidth = op.w + sw * 2; ctx.strokeStyle = outline; ctx.stroke(); }
    ctx.lineWidth = op.w; ctx.strokeStyle = col; ctx.stroke();
  }
  ctx.restore();
}

function palette(over) {
  const pal = { ...PALETTE };
  if (over) for (const k in over) { if (GROUPS[k]) GROUPS[k].forEach(n => pal[n] = over[k]); }
  if (over) for (const k in over) if (!GROUPS[k]) pal[k] = over[k];
  return pal;
}

function run(ctx, p, opts, pal, sw, outline, onlyGroup) {
  const k = opts.scale || 1, ox = opts.at ? opts.at[0] : p.x, oy = opts.at ? opts.at[1] : p.y;
  const base = ctx.getTransform();
  const sq = p.squash || 1;
  for (const op of buildOps(p)) {
    const g = op.t === 'plank' ? 'plank' : GROUP_OF[op.key];
    if (onlyGroup ? g !== onlyGroup : (opts.parts && !opts.parts.includes(g))) continue;
    if (op.t === 'plank' && opts.noPlank) continue;
    ctx.save(); ctx.setTransform(base);
    ctx.translate(ox, oy); ctx.scale(k, k); ctx.translate(-p.x, -p.y);
    if (op.t === 'plank') { paintPlank(ctx, p, pal, sw, outline); ctx.restore(); continue; }
    ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(p.scale, p.scale);
    ctx.translate(0, FEET); ctx.scale(1 / sq, sq); ctx.translate(0, -FEET);
    paintOp(ctx, op, pal, sw, outline);
    ctx.restore();
  }
}

export function drawSoldier(ctx, p, opts = {}) {
  const outline = opts.stroke === false ? null : (typeof opts.stroke === 'string' ? opts.stroke : PALETTE.outline);
  run(ctx, p, opts, palette(opts.fill), opts.strokeWidth ?? 5, outline, null);
}

export function drawPartMasks(p, opts = {}) {
  const [w, h] = opts.size || [1920, 1920], out = {}, col = opts.color || '#fff';
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const pal = {}; for (const k in PALETTE) pal[k] = col; pal._mask = true;
  const all = mk(); out.all = all;
  for (const g of Object.keys(GROUPS)) {
    out[g] = mk(); run(out[g].getContext('2d'), p, opts, pal, 0, null, g);
    all.getContext('2d').drawImage(out[g], 0, 0);
  }
  return out;
}

export function drawBang(ctx, p, opts = {}) {
  const k = (opts.scale || 1) * p.scale, hx = p.x + 66 * k, hy = p.y - 232 * k;
  ctx.save(); ctx.translate(hx, hy); ctx.scale(k, k); ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.roundRect(-34, -48, 68, 84, 16); ctx.moveTo(-14, 34); ctx.lineTo(-30, 56); ctx.lineTo(4, 34);
  ctx.fillStyle = opts.fill || '#fff'; ctx.strokeStyle = opts.stroke || PALETTE.outline; ctx.lineWidth = 7; ctx.stroke(); ctx.fill();
  ctx.fillStyle = opts.mark || '#d82b3a'; ctx.beginPath(); ctx.roundRect(-8, -34, 16, 42, 6); ctx.fill(); ctx.beginPath(); ctx.arc(0, 21, 8.5, 0, TAU); ctx.fill();
  ctx.restore();
}
