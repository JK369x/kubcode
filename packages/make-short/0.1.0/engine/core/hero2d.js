// core/hero2d.js: the kid (big round head, HUGE eyes, mittens, cool-dark tunic, long RED two-tailed scarf). Draws from pose().
// drawHero(ctx, p, opts)   opts: {stroke:true|false|'#hex' (default PALETTE.outline), strokeWidth:6, fill:{key|group:'#hex'}, scale:1, at:[x,y], parts:[groups], noScarf, noProp}
// drawHeroMasks(p, opts) -> {head,hair,face,tunic,hands,legs,boots,scarf,prop,all} white-on-transparent canvases (opts: {size:[w,h], scale, at, color})
// anchors(p) -> world points {hand:{L,R}, head, top, front, eyes:[far,near], mouth, feet:[far,near], knot, pelvis}
// The scarf red is the continuity anchor: keep PALETTE.scarf in every style (restyle its outline/texture, not its hue).
import { TAU, clamp, lerp } from './util.js';
import { HERO, heroLocal, heroPoints } from './pose.js';
import { FLOOR } from './scene.js';

export const PALETTE = {
  skin: '#f7c9a3', skin2: '#eaa886', blush: '#f2968a',
  hair: '#3a2925', hair2: '#55403a',
  eyeW: '#ffffff', pupil: '#1c1a2c', shine: '#ffffff', brow: '#3a2925', mouth: '#6b2a34', tongue: '#e4676b', teeth: '#ffffff',
  tunic: '#2f3f60', tunic2: '#243150', trim: '#4a5d86', mitten: '#e9a93a',
  legs: '#22293b', boots: '#5b3c2c', sole: '#3a271b',
  scarf: '#e0352b', scarf2: '#b0261f',
  wood: '#c8955a', wood2: '#8d6538', metal: '#c3ccd6', pencil: '#f3c64f', eraser: '#f08a9a',
  outline: '#1d1a27',
};
export const GROUPS = {
  head: ['skin', 'skin2', 'blush'], hair: ['hair', 'hair2'], face: ['eyeW', 'pupil', 'shine', 'brow', 'mouth', 'tongue', 'teeth'],
  tunic: ['tunic', 'tunic2', 'trim'], hands: ['mitten'], legs: ['legs'], boots: ['boots', 'sole'], scarf: ['scarf', 'scarf2'],
  prop: ['wood', 'wood2', 'metal', 'pencil', 'eraser'],
};
const GROUP_OF = {}; for (const g in GROUPS) for (const k of GROUPS[g]) GROUP_OF[k] = g;
export const anchors = p => heroPoints(p);

// ops: {key, w?(stroke width) | fill, fn(ctx) path builder, ol (outline), world (draw in master px), clip}
function buildOps(p) {
  const ops = [], add = o => (ops.push(o), o), t = Math.min(1, Math.abs(p.turn ?? 1)), L = heroLocal(p), hd = L.head, R = HERO.HR;
  const fill = (key, fn, x = {}) => add({ key, fn, ...x }), line = (key, pts, w, x = {}) => add({ key, w, fn: c => pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])), ...x });
  const circ = (key, x, y, r, e) => fill(key, c => c.arc(x, y, r, 0, TAU), e), ell = (key, x, y, rx, ry, e) => fill(key, c => c.ellipse(x, y, Math.max(.5, rx), Math.max(.5, ry), 0, 0, TAU), e);
  // scarf tails (world space, behind everything): twisting ribbons, angled cut ends
  if (p.scarf) for (const k of ['b', 'a']) {
    const pts = p.scarf[k]; if (!pts || pts.length < 2) continue;
    const ph = (p.f || 0) / 4.2 + (k === 'a' ? 0 : 1.9), Lft = [], Rgt = [];
    pts.forEach((q, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const w = (k === 'a' ? 17 : 15) * (1 - .18 * i / pts.length) * (.55 + .45 * Math.abs(Math.cos(ph - i * .9)));
      Lft.push([q[0] - dy / l * w, q[1] + dx / l * w]); Rgt.push([q[0] + dy / l * w, q[1] - dx / l * w]);
    });
    const e = Rgt.length - 1; Rgt[e] = [Rgt[e][0] + (pts[e][0] - pts[e - 1][0]) * .35, Rgt[e][1] + (pts[e][1] - pts[e - 1][1]) * .35];   // slanted cut
    fill(k === 'a' ? 'scarf' : 'scarf2', c => { Lft.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); for (let i = Rgt.length - 1; i >= 0; i--) c.lineTo(Rgt[i][0], Rgt[i][1]); c.closePath(); }, { world: true });
  }
  const arm = s => {
    const A = L['arm' + s], [mx, my] = A.M, a = Math.atan2(A.d[1], A.d[0]), side = s === 'L' ? -1 : 1;
    line('tunic', [A.S, A.E, A.W], 27);
    const tx = mx - A.d[1] * 17 * side - A.d[0] * 4, ty = my + A.d[0] * 17 * side - A.d[1] * 4;
    fill('mitten', c => { c.ellipse(mx, my, 27, 23, a, 0, TAU); c.moveTo(tx + 10 * Math.cos(a), ty + 10 * Math.sin(a)); c.ellipse(tx, ty, 10, 13, a, 0, TAU); });   // one path: no inner ring
  };
  const leg = s => {
    const G = L['leg' + s]; line('legs', [G.H, G.K, G.A], 32);
    fill('boots', c => { c.ellipse(G.A[0] + 12, G.A[1] + 9, 30, 16, 0, 0, TAU); }); fill('sole', c => c.roundRect(G.A[0] - 18, G.A[1] + 17, 62, 7, 3), { ol: false });
  };
  arm('L'); leg('L'); leg('R');
  // tunic: a rounded trapezoid, hem band
  const wt = lerp(52, 44, t), wb = lerp(66, 56, t);
  fill('tunic', c => { c.moveTo(-wt, -132); c.quadraticCurveTo(0, -150, wt, -132); c.quadraticCurveTo(wt + 14, -60, wb, 14); c.quadraticCurveTo(0, 30, -wb, 14); c.quadraticCurveTo(-wt - 14, -60, -wt, -132); c.closePath(); });
  fill('tunic2', c => { c.moveTo(-wb + 2, 2); c.quadraticCurveTo(0, 16, wb - 2, 2); c.lineTo(wb, 14); c.quadraticCurveTo(0, 30, -wb, 14); c.closePath(); }, { ol: false });
  line('trim', [[lerp(0, 30, t) - 2, -128], [lerp(0, 30, t) + 2, -10]], 5, { ol: false });
  // head
  circ('skin', hd[0], hd[1], R);
  const fx = hd[0] + 40 * t, ey = hd[1] + 4;
  const face0 = ops.length;
  ell('blush', fx - lerp(52, 34, t), ey + 52, 20, 11, { ol: false, alpha: .55 }); ell('blush', fx + lerp(52, 40, t), ey + 52, 18 * lerp(1, .9, t), 11, { ol: false, alpha: .55 });
  // hair: dark cap over the top/back, cowlick
  const hair0 = ops.length;
  fill('hair', c => {
    const hx = hd[0], hy = hd[1];
    c.moveTo(hx - R - 4, hy + lerp(-10, 40, t)); c.lineTo(hx - R - 4, hy - R - 6); c.lineTo(hx + R + 4, hy - R - 6); c.lineTo(hx + R + 4, hy - lerp(30, 58, t));
    c.bezierCurveTo(hx + R * .6, hy - lerp(80, 104, t), fx + 10, hy - 100, fx - 10, hy - 104);
    c.bezierCurveTo(fx - 40, hy - lerp(100, 84, t), hx - R * .55, hy - lerp(96, 40, t), hx - R - 4, hy + lerp(-10, 40, t)); c.closePath();
  }, { clip: c => c.arc(hd[0], hd[1], R, 0, TAU) });
  fill('hair', c => { const x = hd[0] - 6, y = hd[1] - R + 4; c.moveTo(x - 22, y + 4); c.quadraticCurveTo(x - 30, y - 34, x + 2, y - 46); c.quadraticCurveTo(x - 6, y - 22, x + 18, y - 30); c.quadraticCurveTo(x + 14, y - 8, x + 22, y + 4); c.closePath(); });
  const hair1 = ops.length;
  // eyes: huge white sclera, big pupils, shine, lids
  const lid = p.eyes === 'closed' ? 1 : (p.lid || 0), sq = p.squint || 0, wide = p.eyes === 'wide' ? 1.08 : 1, [lx, ly] = p.look || [0, 0];
  const pain = (p.mouth === 'grit' || p.mouth === 'scream');
  const EYES = [[fx - lerp(46, 30, t), lerp(34, 26, t), 44, -1], [fx + lerp(46, 36, t), 34, 45, 1]];
  for (const [ex, rx0, ry0, side] of EYES) {
    const rx = rx0 * wide, ry = ry0 * wide;
    if (lid >= .85) {
      if (pain) line('brow', [[ex - side * rx * .7, ey - 14], [ex + side * rx * .55, ey], [ex - side * rx * .7, ey + 14]], 9, { ol: false });   // squeezed > <
      else line('brow', [[ex - rx, ey - 2], [ex - rx * .4, ey + 10], [ex + rx * .4, ey + 10], [ex + rx, ey - 2]], 8, { ol: false });
    } else {
      const eyeP = c => c.ellipse(ex, ey, rx, ry, 0, 0, TAU), cl = { clip: eyeP };
      fill('eyeW', eyeP);
      const pr = 19 * (p.pupil || 1) * (wide > 1 ? .85 : 1), px = ex + lx * rx * .42, py = ey + ly * ry * .36;
      circ('pupil', px, py, pr, cl); circ('shine', px + pr * .35, py - pr * .45, Math.max(3, pr * .32), cl); circ('shine', px - pr * .35, py + pr * .3, Math.max(1.5, pr * .13), cl);
      if (lid > .02) fill('skin', c => c.rect(ex - rx - 2, ey - ry - 2, 2 * rx + 4, 2 * ry * lid + 2), { ...cl, ol: false });
      if (sq > .02) fill('skin', c => c.rect(ex - rx - 2, ey + ry - ry * sq * .9, 2 * rx + 4, ry * sq * .9 + 2), { ...cl, ol: false });
      if (lid > .05) line('brow', [[ex - rx * .96, ey - ry + 2 * ry * lid], [ex + rx * .96, ey - ry + 2 * ry * lid]], 5, { ol: false, clip: eyeP });
    }
    // brows: height + tilt (+ worried: inner end up; - angry: inner end down). inner = toward the face centre
    const b = p.brows ?? .5, tl = p.browTilt || 0, by = ey - ry - 8 - 24 * b, inner = side < 0 ? 1 : -1, bw = rx * .9;
    const y1 = by - (inner < 0 ? tl * 13 : -tl * 5), y2 = by - (inner > 0 ? tl * 13 : -tl * 5);
    line('brow', [[ex - bw, y1], [ex, by - 4], [ex + bw, y2]], 12, { ol: false });
  }
  ell('skin2', fx + 16 * t, ey + 44, 10, 8, { ol: false });                                     // tiny nose
  // mouth
  const mx = fx + 4 * t, my = hd[1] + 78, op = p.mouthOpen || 0;
  switch (p.mouth) {
    case 'smile': line('mouth', [[mx - 22, my - 4], [mx - 10, my + 8], [mx + 10, my + 8], [mx + 22, my - 4]], 7, { ol: false, curve: true }); break;
    case 'grin': fill('mouth', c => { c.moveTo(mx - 28, my - 6); c.quadraticCurveTo(mx, my - 2, mx + 28, my - 6); c.quadraticCurveTo(mx + 22, my + 30, mx, my + 30); c.quadraticCurveTo(mx - 22, my + 30, mx - 28, my - 6); c.closePath(); });
      fill('teeth', c => c.rect(mx - 24, my - 6, 48, 9), { ol: false, clip: c => { c.moveTo(mx - 28, my - 6); c.quadraticCurveTo(mx, my - 2, mx + 28, my - 6); c.quadraticCurveTo(mx + 22, my + 30, mx, my + 30); c.quadraticCurveTo(mx - 22, my + 30, mx - 28, my - 6); } }); break;
    case 'o': ell('mouth', mx, my + 6, 10 + 6 * op, 12 + 10 * op); ell('tongue', mx, my + 12 + 6 * op, 6 + 3 * op, 4 + 2 * op, { ol: false }); break;
    case 'scream': ell('mouth', mx, my + 10, 20 + 4 * op, 18 + 14 * op); ell('tongue', mx, my + 20 + 10 * op, 12, 7, { ol: false }); fill('teeth', c => c.rect(mx - 16, my - 8 - 10 * op, 32, 7), { ol: false }); break;
    case 'frown': line('mouth', [[mx - 20, my + 8], [mx - 8, my - 2], [mx + 8, my - 2], [mx + 20, my + 8]], 7, { ol: false, curve: true }); break;
    case 'grit': fill('teeth', c => c.roundRect(mx - 24, my - 4, 48, 18, 6)); line('mouth', [[mx - 22, my + 5], [mx + 22, my + 5]], 3, { ol: false });
      for (const dx of [-12, 0, 12]) line('mouth', [[mx + dx, my - 3], [mx + dx, my + 13]], 2.5, { ol: false }); break;
    case 'smirk': line('mouth', [[mx - 20, my + 4], [mx, my + 6], [mx + 20, my - 6]], 7, { ol: false, curve: true }); break;
    case 'wobble': line('mouth', [[mx - 20, my + 4], [mx - 10, my - 2], [mx, my + 4], [mx + 10, my - 2], [mx + 20, my + 4]], 6, { ol: false }); break;
    default: line('mouth', [[mx - 18, my + 2], [mx + 18, my + 2]], 7, { ol: false });
  }
  for (let i = face0; i < ops.length; i++) if (i < hair0 || i >= hair1) ops[i].face = true;
  // scarf wrap + knot (over the chin line), near arm, props
  const sw = lerp(70, 62, t), kx = hd[0] - lerp(46, 52, t);
  fill('scarf', c => c.roundRect(-sw, -172, 2 * sw, 46, 22));
  line('scarf2', [[-sw + 14, -150], [sw - 14, -150]], 4, { ol: false, alpha: .6 });
  circ('scarf', kx, -146, 20);
  arm('R');
  const prop = (name, A) => {
    if (!name || name === 'cube') return; const [x, y] = A.M, a = Math.atan2(A.d[1], A.d[0]);
    const T = (fn) => ({ tf: { x, y, r: a } , fn });
    if (name === 'pencil') { add({ key: 'pencil', ...T(c => c.roundRect(-20, -8, 92, 16, 4)) }); add({ key: 'eraser', ...T(c => c.roundRect(-30, -8, 14, 16, 4)) }); add({ key: 'wood2', ...T(c => { c.moveTo(72, -8); c.lineTo(94, 0); c.lineTo(72, 8); c.closePath(); }) }); }
    if (name === 'mallet') { add({ key: 'wood', ...T(c => c.roundRect(-14, -7, 96, 14, 5)) }); add({ key: 'wood2', ...T(c => c.roundRect(74, -30, 40, 60, 8)) }); }
    if (name === 'chisel' || name === 'chisel-snapped') { add({ key: 'wood', ...T(c => c.roundRect(-30, -9, 46, 18, 6)) }); if (name === 'chisel') add({ key: 'metal', ...T(c => { c.moveTo(16, -6); c.lineTo(76, -5); c.lineTo(86, 0); c.lineTo(76, 5); c.lineTo(16, 6); c.closePath(); }) }); }
  };
  prop(p.prop2, L.armL); prop(p.prop, L.armR);
  return ops;
}

function paintOp(ctx, op, pal, sw, outline) {
  ctx.save();
  if (op.tf) { ctx.translate(op.tf.x, op.tf.y); if (op.tf.r) ctx.rotate(op.tf.r); }
  if (op.clip) { ctx.beginPath(); op.clip(ctx); ctx.clip(); }
  if (op.alpha != null && !pal._mask) ctx.globalAlpha *= op.alpha;
  const col = pal[op.key]; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath(); op.fn(ctx);
  if (op.w) {
    if (outline && op.ol !== false) { ctx.lineWidth = op.w + sw * 2; ctx.strokeStyle = outline; ctx.stroke(); }
    ctx.lineWidth = op.w; ctx.strokeStyle = col; ctx.stroke();
  } else {
    if (outline && op.ol !== false) { ctx.lineWidth = sw * 2; ctx.strokeStyle = outline; ctx.stroke(); }
    ctx.fillStyle = col; ctx.fill();
  }
  ctx.restore();
}

function palette(over) {
  const pal = { ...PALETTE };
  if (over) for (const k in over) if (GROUPS[k]) GROUPS[k].forEach(n => pal[n] = over[k]);
  if (over) for (const k in over) if (!GROUPS[k]) pal[k] = over[k];
  return pal;
}

function run(ctx, p, opts, pal, sw, outline, onlyGroup) {
  const k = opts.scale || 1, ox = opts.at ? opts.at[0] : p.x, oy = opts.at ? opts.at[1] : p.y, base = ctx.getTransform();
  const fc = (p.turn ?? 1) < 0 ? -1 : 1, sq = p.squash || 1;
  for (const op of buildOps(p)) {
    const g = GROUP_OF[op.key];
    if (onlyGroup ? g !== onlyGroup : (opts.parts && !opts.parts.includes(g))) continue;
    if ((opts.noScarf && g === 'scarf' && op.world) || (opts.noProp && g === 'prop')) continue;
    ctx.save(); ctx.setTransform(base);
    ctx.translate(ox, oy); ctx.scale(k, k); ctx.translate(-p.x, -p.y);                     // opts.at / opts.scale re-place the whole figure
    if (!op.world) {
      if (p.flat) { ctx.translate(p.x, FLOOR); ctx.scale(1 + .15 * p.flat, 1 - .8 * p.flat); ctx.translate(-p.x, -FLOOR); }
      ctx.translate(p.x, p.y); ctx.scale(fc, 1); ctx.rotate(p.rot || 0); ctx.scale(p.scale || 1, p.scale || 1);
      ctx.translate(0, HERO.SOLE); ctx.scale(1 / sq, sq); ctx.translate(0, -HERO.SOLE);
    }
    paintOp(ctx, op, pal, sw, outline);
    ctx.restore();
  }
}

export function drawHero(ctx, p, opts = {}) {
  const outline = opts.stroke === false ? null : (typeof opts.stroke === 'string' ? opts.stroke : PALETTE.outline);
  run(ctx, p, opts, palette(opts.fill), opts.strokeWidth ?? 6, outline, null);
}

export function drawHeroMasks(p, opts = {}) {
  const [w, h] = opts.size || [1920, 1920], out = {}, col = opts.color || '#fff';
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const pal = {}; for (const k in PALETTE) pal[k] = col; pal._mask = true;
  const all = mk(); out.all = all;
  for (const g of Object.keys(GROUPS)) { out[g] = mk(); run(out[g].getContext('2d'), p, opts, pal, 0, null, g); all.getContext('2d').drawImage(out[g], 0, 0); }
  return out;
}

// faceCanvas(p, size=1024) -> a size x size/2 canvas: equirect skin texture with the current 2D face (eyes, lids, brows, nose,
// blush, mouth) centred at u .5. On a three.js SphereGeometry (default UVs) u .5 faces +x, the rig's facing, so the 3D head shows
// exactly the 2D expression. One canvas per size, redrawn on every call (set texture.needsUpdate = true after).
const FACE_CANVAS = new Map();
export function faceCanvas(p, size = 1024) {
  let c = FACE_CANVAS.get(size); if (!c) { c = document.createElement('canvas'); c.width = size; c.height = size / 2; FACE_CANVAS.set(size, c); }
  const g = c.getContext('2d'), q = { ...p, turn: 0, headRot: 0, headDx: 0, headDy: 0 }, hd = heroLocal(q).head, k = size / 1024 * 1.29;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = PALETTE.skin; g.fillRect(0, 0, c.width, c.height);
  g.translate(size / 2, size / 4); g.scale(k, k); g.translate(-hd[0], -hd[1]);
  const pal = palette(null); for (const op of buildOps(q)) if (op.face) paintOp(g, op, pal, 5, PALETTE.outline);
  return c;
}
