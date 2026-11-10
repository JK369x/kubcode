// qa-text.mjs: safe-area text check. Renders the frames in headless Chrome and records where every piece of text lands
// on the final frame, then fails if readable text sticks out of the safe area (it would be cut by the 9:16 or 16:9 crop,
// or hidden under the Shorts buttons). Nothing is written into the project.
//
//   node qa-text.mjs --root D:\shorts\sky-is-blue
//   node qa-text.mjs --root .  --from 0 --to 300 --step 2
//
// --root DIR       the short's folder (the one with index.html, render.mjs, timeline.json); default: current folder
// --from/--to N    frame range (default: the whole timeline);  --step N  check every Nth frame (default 3 = 10 per second)
// --rect x0,y0,x1,y1   safe area in master pixels (default 420,420,1500,1500 = the square both crops keep)
// --min-h 24       text shorter than this (px, master frame) is reported as "small" but does not fail the check
// How it sees text: every canvas fillText/strokeText of a word (2+ letters/digits, mostly letters/digits, so ASCII-art rows of
// symbols are skipped), followed through drawImage onto the output
// canvas. Text drawn as pixels/rectangles or inside WebGL is invisible to it; such code can report a box itself with
//   globalThis.QA_TEXT?.(ctx, 'LABEL', x0, y0, x1, y1)   (box in that ctx's current coordinates).
// Exit code: 0 pass, 1 text outside the safe area (or page errors), 2 error.
import fs from 'node:fs'; import path from 'node:path';
import { openEngine } from './lib/page.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };

function instrument() {          // runs inside the page before the engine loads
  let frame = 0;
  const rec = new WeakMap();      // canvas -> { frame, boxes: [{ t, x0, y0, x1, y1 }] } = text currently painted on it
  const touch = cv => { let r = rec.get(cv); if (!r) rec.set(cv, r = { frame, boxes: [], keys: new Set() }); if (r.frame !== frame) { r.frame = frame; r.boxes = []; r.keys = new Set(); } return r; };
  const add = (r, b) => {           // de-duplicated and capped: blur/bloom passes copy canvases back and forth many times per frame
    const k = `${b.t}|${Math.round(b.x0)}|${Math.round(b.y0)}|${Math.round(b.x1)}|${Math.round(b.y1)}`;
    if (!r.keys.has(k) && r.boxes.length < 1000) { r.keys.add(k); r.boxes.push(b); }
  };
  const map = (M, x0, y0, x1, y1) => {
    const p = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f]);
    return { x0: Math.min(...p.map(q => q[0])), y0: Math.min(...p.map(q => q[1])), x1: Math.max(...p.map(q => q[0])), y1: Math.max(...p.map(q => q[1])) };
  };
  for (const C of [window.CanvasRenderingContext2D, window.OffscreenCanvasRenderingContext2D]) {
    if (!C) continue;
    const P = C.prototype;
    for (const name of ['fill', 'stroke', 'putImageData']) {
      const o = P[name]; if (o) P[name] = function () { touch(this.canvas); return o.apply(this, arguments); };
    }
    // painting over the whole canvas (reset, clearRect, or an opaque plain fillRect) wipes the text under it, even mid-frame
    const wipes = (ctx, x, y, w, h) => { const b = map(ctx.getTransform(), x, y, x + w, y + h); return b.x0 <= 0 && b.y0 <= 0 && b.x1 >= ctx.canvas.width && b.y1 >= ctx.canvas.height; };
    const wipe = r => { r.boxes = []; r.keys = new Set(); };
    const rs = P.reset; if (rs) P.reset = function () { wipe(touch(this.canvas)); return rs.apply(this, arguments); };
    const cr = P.clearRect; P.clearRect = function (x, y, w, h) { const r = touch(this.canvas); if (wipes(this, x, y, w, h)) wipe(r); return cr.apply(this, arguments); };
    const fr = P.fillRect; P.fillRect = function (x, y, w, h) {
      const r = touch(this.canvas);
      if (this.globalAlpha === 1 && this.globalCompositeOperation === 'source-over' && typeof this.fillStyle === 'string' && this.fillStyle[0] === '#' && wipes(this, x, y, w, h)) wipe(r);   // '#rrggbb' = opaque
      return fr.apply(this, arguments);
    };
    for (const name of ['fillText', 'strokeText']) {
      const o = P[name];
      P[name] = function (text, x, y, maxW) {
        const r = touch(this.canvas), s = String(text).trim(), al = (s.match(/[\p{L}\p{N}]/gu) || []).length;
        if (al >= 2 && al * 2 >= s.length) {          // words, not ASCII-art rows of symbols
          const m = this.measureText(String(text)), k = maxW !== undefined && m.width > maxW && m.width > 0 ? maxW / m.width : 1;
          add(r, { t: s, ...map(this.getTransform(), x - m.actualBoundingBoxLeft * k, y - m.actualBoundingBoxAscent, x + m.actualBoundingBoxRight * k, y + m.actualBoundingBoxDescent) });
        }
        return o.apply(this, arguments);
      };
    }
    const di = P.drawImage;
    P.drawImage = function (img, ...a) {
      const dst = touch(this.canvas), src = img && rec.get(img);
      if (src && src.boxes.length) {
        let sx = 0, sy = 0, sw = img.width, sh = img.height, dx, dy, dw = sw, dh = sh;
        if (a.length === 2) [dx, dy] = a; else if (a.length === 4) [dx, dy, dw, dh] = a; else [sx, sy, sw, sh, dx, dy, dw, dh] = a;
        const M = this.getTransform(), kx = dw / sw, ky = dh / sh;
        for (const b of [...src.boxes]) {
          const x0 = Math.max(b.x0, sx), x1 = Math.min(b.x1, sx + sw), y0 = Math.max(b.y0, sy), y1 = Math.min(b.y1, sy + sh);
          if (x1 > x0 && y1 > y0) add(dst, { t: b.t, ...map(M, dx + (x0 - sx) * kx, dy + (y0 - sy) * ky, dx + (x1 - sx) * kx, dy + (y1 - sy) * ky) });
        }
      }
      return di.call(this, img, ...a);
    };
  }
  globalThis.QA_TEXT = (ctx, t, x0, y0, x1, y1) => add(touch(ctx.canvas), { t: String(t), ...map(ctx.getTransform(), x0, y0, x1, y1) });
  window.__qaFrame = f => {
    frame++; window.setF(f, {});
    const cv = document.getElementById('out') || document.querySelector('canvas'), r = rec.get(cv), out = [];
    const ov = (a, b) => { const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); return w > 0 && h > 0 ? w * h / Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0)) : 0; };
    for (const b of (r && r.frame === frame ? r.boxes : [])) {         // same text drawn twice in one place (stroke + fill, shake copy) counts once
      const i = out.findIndex(o => o.t === b.t && ov(o, b) > .5);
      if (i >= 0) out[i] = b; else out.push(b);
    }
    return out.filter(b => b.x1 > 0 && b.y1 > 0 && b.x0 < cv.width && b.y0 < cv.height);   // off-canvas text is not visible
  };
}

try {
  const root = path.resolve(opt('root', '.')), tl = JSON.parse(fs.readFileSync(path.join(root, 'timeline.json'), 'utf8'));
  const F0 = +opt('from', 0), F1 = +opt('to', tl.frames - 1), step = Math.max(1, +opt('step', 3)), minH = +opt('min-h', 24);
  const [rx0, ry0, rx1, ry1] = String(opt('rect', '420,420,1500,1500')).split(',').map(Number), slack = 2;
  console.log(`TEXT  ${root}  frames ${F0}-${F1} every ${step}, safe area x ${rx0}-${rx1}, y ${ry0}-${ry1}`);
  const P = await openEngine(root, { init: instrument }), t0 = Date.now(), seen = new Map();
  try {
    for (let f = F0; f <= F1; f += step) {
      for (const b of await P.pg.evaluate(f => window.__qaFrame(f), f)) {
        const out = b.x0 < rx0 - slack || b.y0 < ry0 - slack || b.x1 > rx1 + slack || b.y1 > ry1 + slack, h = b.y1 - b.y0;
        const key = b.t + (out ? ' !' : ''), s = seen.get(key) || { t: b.t, out, f0: f, f1: f, h: 0, box: b, n: 0 };
        s.f1 = f; s.n++; if (h > s.h) { s.h = h; s.box = b; } seen.set(key, s);
      }
      if ((f - F0) % 90 < step && f > F0) console.log(`  ...frame ${f} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
  } finally { await P.close(); }
  const px = v => Math.round(v), list = [...seen.values()];
  const bad = list.filter(s => s.out && s.h >= minH), small = list.filter(s => s.out && s.h < minH), good = list.filter(s => !s.out);
  for (const s of bad) {
    const b = s.box, side = [b.x0 < rx0 && `left ${px(rx0 - b.x0)}`, b.x1 > rx1 && `right ${px(b.x1 - rx1)}`, b.y0 < ry0 && `top ${px(ry0 - b.y0)}`, b.y1 > ry1 && `bottom ${px(b.y1 - ry1)}`].filter(Boolean).join(', ');
    console.log(`  FAIL  "${s.t.slice(0, 40)}"  f${s.f0}-${s.f1}  box x ${px(b.x0)}-${px(b.x1)} y ${px(b.y0)}-${px(b.y1)}  sticks out: ${side} px`);
  }
  for (const s of small.slice(0, 12)) console.log(`  small "${s.t.slice(0, 40)}"  f${s.f0}-${s.f1}  ${px(s.h)} px tall, outside the safe area (fine only if it is decoration)`);
  if (small.length > 12) console.log(`  ...and ${small.length - 12} more small texts outside`);
  const tiny = good.filter(s => s.h >= 8 && s.h < minH);   // under 8 px is texture, not text
  console.log(`  inside: ${good.length} texts` + (good.length ? ': ' + good.slice(0, 10).map(s => `"${s.t.slice(0, 24)}" ${px(s.h)}px`).join(', ') + (good.length > 10 ? ', ...' : '') : ''));
  if (tiny.length) console.log(`  note: ${tiny.length} text(s) inside are under ${minH} px tall and hard to read on a phone: ${tiny.slice(0, 6).map(s => `"${s.t.slice(0, 20)}"`).join(', ')}`);
  if (P.errors.length) console.log(`  page errors (${P.errors.length}): ${P.errors.slice(0, 3).join(' | ')}`);
  const ok = !bad.length && !P.errors.length;
  console.log(ok ? `PASS: all readable text stays in the safe area (${((Date.now() - t0) / 1000).toFixed(0)} s)` : `FAIL: ${bad.length} text(s) outside the safe area${P.errors.length ? ', page errors' : ''}`);
  process.exit(ok ? 0 : 1);
} catch (e) { console.error('ERROR: ' + e.message); process.exit(2); }
