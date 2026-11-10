// styles/11-sheet.js: world 11, the STORYBOARD SHEET (integrator). Generic look code only (exported as `kit`): warm paper texture, white veil, framed
// panels backed by a mip pyramid of cached key frames, pencil note lines, a chunky "approve" button, a mouse cursor. The door story's content
// (which frames, where, when) is scenes/<story>/sheet.js, which reads core/scene.js (scene.sheet) and calls this kit; render() delegates to it.
// The panel pictures are PRE-RENDERED by `node render.mjs --panels` into out/door-panels/pNN.png (the engine's own frames), so the sheet is
// deterministic and panel 0 can be pixel-identical to frame 0. A missing file falls back to a plain hatched placeholder (no text).
import { mulberry32, clamp, lerp, ease } from '../core/util.js';

const W = 1920, TAU = Math.PI * 2;
export const palette = {
  paper: '#f1ece0', ink: '#23252c', pencil: 'rgba(52,50,58,.40)', pencilSoft: 'rgba(52,50,58,.20)', shadow: 'rgba(58,44,22,.32)',
  btn: '#fffdf6', green: '#22b573', greenDeep: '#13794f', glow: 'rgba(34,181,115,.38)',
};
const P = palette;
const sm = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };

// ---------------------------------------------------------------- paper (built once, seeded: deterministic)
let PAPER = null;
function makePaper(seed = 11) {
  const c = document.createElement('canvas'); c.width = c.height = W; const g = c.getContext('2d'), R = mulberry32(seed);
  g.fillStyle = P.paper; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 240; i++) {                                                       // soft mottling: big faint warm and light clouds
    const x = R() * W, y = R() * W, r = 90 + R() * 260, a = .02 + R() * .035, dark = R() < .55, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, dark ? `rgba(128,104,58,${a})` : `rgba(255,255,250,${a * 1.5})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 5600; i++) {                                                      // fibres: short bent hairlines, dark and light
    const x = R() * W, y = R() * W, a = R() * TAU, l = 5 + R() * 22, b = (R() - .5) * 9, lt = R() < .42, ca = Math.cos(a), sa = Math.sin(a);
    g.strokeStyle = lt ? `rgba(255,255,252,${.22 + R() * .2})` : `rgba(112,90,52,${.05 + R() * .08})`; g.lineWidth = .6 + R() * .8;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + ca * l / 2 + b * sa, y + sa * l / 2 - b * ca, x + ca * l, y + sa * l); g.stroke();
  }
  for (let i = 0; i < 900; i++) { const x = R() * W, y = R() * W; g.fillStyle = `rgba(96,74,40,${.05 + R() * .1})`; g.beginPath(); g.arc(x, y, .5 + R() * 1.1, 0, TAU); g.fill(); }   // specks
  const d = g.getImageData(0, 0, W, W), px = d.data, R2 = mulberry32(seed + 1);          // fine grain
  for (let i = 0; i < px.length; i += 4) { const n = (R2() - .5) * 8; px[i] += n; px[i + 1] += n; px[i + 2] += n * .9; }
  g.putImageData(d, 0, 0);
  const v = g.createRadialGradient(W / 2, W / 2, W * .28, W / 2, W / 2, W * .78);        // light falls off toward the corners
  v.addColorStop(0, 'rgba(255,252,244,.0)'); v.addColorStop(1, 'rgba(120,96,56,.16)'); g.fillStyle = v; g.fillRect(0, 0, W, W);
  return c;
}
export const paper = () => PAPER || (PAPER = makePaper());

// ---------------------------------------------------------------- white veil: pure white at r = 1, clears from the centre outward as r -> 0
export function veil(g, r) {
  if (r <= 0) return;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  if (r >= 1) { g.fillStyle = '#fff'; g.fillRect(0, 0, W, W); g.restore(); return; }
  const F = 560, RR = 2300, e = lerp(-F, 1560, 1 - r), gr = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, RR);
  gr.addColorStop(0, `rgba(255,255,255,${clamp(-e / F)})`);
  if (e > 0) gr.addColorStop(clamp(e / RR), 'rgba(255,255,255,0)');
  gr.addColorStop(clamp((e + F) / RR), 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(0, 0, W, W); g.restore();
}

// ---------------------------------------------------------------- panels: key-frame pictures as a mip pyramid (1920 kept for the loop panel only)
const hatch = (g, s, i) => { g.fillStyle = '#cfc9ba'; g.fillRect(0, 0, s, s); g.strokeStyle = 'rgba(60,56,48,.35)'; g.lineWidth = s / 60; g.beginPath(); for (let k = -s; k < s * 2; k += s / 8) { g.moveTo(k, 0); g.lineTo(k - s, s); } g.stroke(); };
export async function loadPanels(urls, { full = 0 } = {}) {
  return Promise.all(urls.map(async (u, i) => {
    const img = await new Promise(r => { const m = new Image(); m.onload = () => r(m); m.onerror = () => r(null); m.src = u; });
    const mk = (src, s) => { const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; if (src) g.drawImage(src, 0, 0, s, s); else hatch(g, s, i); return c; };
    const lv = []; let src = img;
    for (const s of (i === full ? [1920, 960, 480, 240] : [960, 480, 240])) { const c = mk(src, s); lv.push(c); src = c; }   // each level from the one above (a 2x box-ish downscale)
    return { lv: lv.reverse(), ok: !!img };           // ascending sizes
  }));
}
// draw panel p into (x, y, w, h) in the CURRENT transform: picks the smallest level that is not (much) smaller than what lands on screen
export function drawPanel(g, p, x, y, w, h = w) {
  const m = g.getTransform(), target = w * Math.hypot(m.a, m.b), c = p.lv.find(l => l.width >= target * .9) || p.lv[p.lv.length - 1];
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(c, x, y, w, h);
}
// the full-size picture of panel p (exact 1:1 copy of the cached key frame)
export const full = p => p.lv[p.lv.length - 1];

// ink border drawn OUTSIDE the picture rect, 3 px on screen whatever the zoom k (so it never covers the picture)
export function frame(g, x, y, w, h, k = 1, a = 1) {
  if (a <= 0) return; const b = 3 / k;
  g.save(); g.globalAlpha *= a; g.strokeStyle = P.ink; g.lineWidth = b; g.lineJoin = 'miter'; g.strokeRect(x - b / 2, y - b / 2, w + b, h + b); g.restore();
}
export function notes(g, x, y, w, a = 1) {                                               // two pencil note lines under a panel
  g.save(); g.globalAlpha *= a; g.strokeStyle = P.pencilSoft; g.lineWidth = 1.7; g.lineCap = 'round'; g.beginPath();
  for (const dy of [24, 45]) { g.moveTo(x + 2, y + dy); g.lineTo(x + w - 2, y + dy); } g.stroke(); g.restore();
}

// ---------------------------------------------------------------- text + button + cursor
export function text(g, str, x, y, size, color = P.ink, o = {}) {
  g.save(); g.font = `${o.weight || 700} ${size}px Inter, sans-serif`; g.textBaseline = 'alphabetic'; g.textAlign = o.align || 'left'; if ('letterSpacing' in g) g.letterSpacing = (o.ls ?? 0) + 'px';
  g.fillStyle = color; g.fillText(str, x, y); g.restore();
}
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
const mix = (a, b, t) => { const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`; };

// The button: a pill with a solid underside. st = {w, h, label, hover 0..1, press 0..1, ok 0..1 (flips to green), pop (scale), alpha, check (0..1.2 pop of the tick), burst (0..1 pop lines)}
export function button(g, cx, cy, st) {
  const { w = 436, h = 104, label = 'APPROVE', hover = 0, press = 0, ok = 0, pop = 1, alpha = 1, check = 0, burst = 0 } = st;
  if (alpha <= 0 || pop <= 0) return;
  const lip = 11, dy = -4 * hover + (lip - 3) * press, ink = P.ink, body = mix(P.btn, P.green, ok), under = mix(ink, P.greenDeep, ok);
  g.save(); g.globalAlpha *= alpha; g.translate(cx, cy); g.scale(pop, pop); g.lineJoin = 'round';
  g.save(); g.shadowColor = 'rgba(40,30,10,.30)'; g.shadowBlur = 26 + 14 * hover; g.shadowOffsetY = 20 - 8 * press; g.fillStyle = under; rr(g, -w / 2, -h / 2 + lip, w, h, h / 2); g.fill(); g.restore();   // underside + soft shadow
  g.fillStyle = under; g.strokeStyle = ink; g.lineWidth = 4.5; rr(g, -w / 2, -h / 2 + lip, w, h, h / 2); g.fill(); g.stroke();
  if (hover > 0 && ok < 1) { g.strokeStyle = P.glow; g.lineWidth = 12 * hover; rr(g, -w / 2 - 3, -h / 2 + dy - 3, w + 6, h + 6, h / 2 + 3); g.stroke(); }
  g.fillStyle = body; g.strokeStyle = ink; g.lineWidth = 4.5; rr(g, -w / 2, -h / 2 + dy, w, h, h / 2); g.fill(); g.stroke();                                           // the face
  const size = 54, ls = 3, circ = 34;                                                    // label + tick circle, centred as one group
  g.font = `700 ${size}px Inter, sans-serif`; if ('letterSpacing' in g) g.letterSpacing = ls + 'px';
  const tw = g.measureText(label).width, gap = 26, gw = tw + gap + circ * 2, x0 = -gw / 2, ccx = x0 + tw + gap + circ, ty = dy + size * .364;
  text(g, label, x0, ty, size, ok > .7 ? '#ffffff' : ink, { ls });
  g.save(); g.translate(ccx, dy);
  g.lineWidth = 4; g.strokeStyle = ok > .5 ? '#ffffff' : 'rgba(35,37,44,.38)'; g.fillStyle = `rgba(255,255,255,${clamp(ok)})`; g.beginPath(); g.arc(0, 0, circ - 3, 0, TAU); g.fill(); g.stroke();
  if (check > 0) {                                                                       // the tick pops (overshoots), drawn as a path, not a glyph
    g.save(); g.scale(check, check); g.strokeStyle = P.green; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-13, 2); g.lineTo(-4, 12); g.lineTo(14, -11); g.stroke(); g.restore();
  }
  if (burst > 0 && burst < 1) {                                                          // pop lines around the circle
    g.strokeStyle = P.green; g.lineWidth = 5; g.lineCap = 'round'; g.globalAlpha *= 1 - burst;
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + .2, r0 = circ + 8 + 16 * burst, r1 = r0 + 14 * (1 - burst) + 6; g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke(); }
  }
  g.restore(); g.restore();
}
export function ripple(g, x, y, t, a = 1) {                                              // click ripple, t 0..1
  if (t <= 0 || t >= 1) return; g.save(); g.strokeStyle = P.green; g.globalAlpha *= a * (1 - t) * .8; g.lineWidth = 7 * (1 - t) + 2; g.beginPath(); g.arc(x, y, 12 + 70 * ease.o(t), 0, TAU); g.stroke(); g.restore();
}
// mouse arrow, tip at (x, y); press 0..1 squeezes it
export function cursor(g, x, y, press = 0, alpha = 1) {
  if (alpha <= 0) return; const pts = [[0, 0], [0, 25], [5.7, 19.7], [9.7, 28.7], [13.8, 26.9], [9.9, 18.2], [17.8, 18.2]], k = 1.95 * (1 - .13 * press);
  g.save(); g.globalAlpha *= alpha; g.translate(x, y + 2 * press); g.scale(k, k); g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath();
  g.shadowColor = 'rgba(30,22,8,.38)'; g.shadowBlur = 10; g.shadowOffsetY = 5; g.fillStyle = '#ffffff'; g.fill(); g.shadowColor = 'transparent';
  g.strokeStyle = '#16171b'; g.lineWidth = 2.1; g.stroke(); g.restore();
}

export const kit = { palette, paper, veil, loadPanels, drawPanel, full, frame, notes, text, button, ripple, cursor, sm };

// ---------------------------------------------------------------- style wrapper: the active scene (timeline.json "story", default "door") draws the sheet
let SCENE = null;
export default {
  id: 'sheet', kind: '2d',
  async init(api) {
    let story = 'door'; try { const tl = await (await fetch(new URL('../timeline.json', import.meta.url))).json(); story = tl.story || 'door'; } catch (e) { /* default */ }
    SCENE = (await import(`../scenes/${story}/sheet.js`)).default; if (SCENE.init) await SCENE.init(api, kit);
  },
  render(out, s) { SCENE.render(out, s, kit); },
};
