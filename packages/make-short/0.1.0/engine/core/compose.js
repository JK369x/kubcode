// core/compose.js: timeline, handles, transition dispatch, debug overlay.
//   const C = await createComposer({THREE, canvas});  C.renderFrame(f, {debug});  C.tl
//   Style  : { id, kind:'2d'|'webgl', async init(api), render(outCanvas, s) }   s = {f, u, fl, dur, p /*pose*/, tl}
//            u = (f-start)/(end-start), may leave 0..1 inside the 8-frame handles; fl = f-start (local frame).
//   Transition: { id, render(outCtx, A, B, p, s) }  A/B = canvases of the two styles, p = raw 0..1 over frames b-8..b+7,
//            s = {f, fl:f-(b-8), dur:15, p:pose, pose, tp:p, A:idA, B:idB, b, tl}.
//   A style or transition that throws is replaced by a red fallback and reported once as [style-error] on the console.
import * as soldier2d from './soldier2d.js';
import * as soldier3d from './soldier3d.js';
import * as hero2d from './hero2d.js';
import * as hero3d from './hero3d.js';
import { pose } from './pose.js';
import { scene, punch } from './scene.js';
import { mulberry32, ease, noise, noise2, clamp } from './util.js';

// CHIP overlay (integrator, Short only): the small dark pill "Claude coded every frame" from f90 to the end, inside the safe square near y 1440.
// On with `?chip=1` in the page URL (render.mjs sets it for CHIP=1) or renderFrame(f, {chip:true}); window.__chipOver(f) draws it over the canvas as it
// stands (render.mjs uses that to get the chip crop from the same capture pass). It eases in over 12 f and fades out over the last 14 f, so the loop
// (749 -> 0) closes on a chip-free frame 0. Cap height 32 px (Inter 700 at 44 px).
const CHIP = { text: 'Claude coded every frame', from: 90, fin: 12, fout: 14, y: 1440, size: 44, padX: 44, h: 86 };
const CHIP_ON = typeof location !== 'undefined' && /[?&]chip=1(&|$)/.test(location.search);
function drawChip(g, f, N) {
  const a = ease.io(clamp((f - CHIP.from) / CHIP.fin)) * ease.io(clamp((N - 1 - f) / CHIP.fout)); if (a <= 0) return;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.setLineDash([]); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.globalAlpha = a;
  g.font = `700 ${CHIP.size}px Inter, sans-serif`; if ('letterSpacing' in g) g.letterSpacing = '0px';
  const tw = g.measureText(CHIP.text).width, w = tw + 2 * CHIP.padX, x = 960 - w / 2, cy = CHIP.y + (1 - a) * 12, y = cy - CHIP.h / 2;
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 18; g.shadowOffsetY = 6; g.fillStyle = 'rgba(22,23,28,.93)'; g.beginPath(); g.roundRect(x, y, w, CHIP.h, CHIP.h / 2); g.fill();
  g.shadowColor = 'transparent'; g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#fff'; g.fillText(CHIP.text, x + CHIP.padX, cy + CHIP.size * .364);
  g.restore();
}

export async function createComposer({ THREE, canvas, root = new URL('../', import.meta.url).href }) {
  const tl = await (await fetch(root + 'timeline.json')).json();
  const { W, H } = tl, handle = tl.handle || 8, SQ = { x: 420, y: 420, s: 1080 };
  const canv = new Map();
  const styleCanvas = id => {
    if (id === '__main') return canvas;
    if (!canv.has(id)) { const c = document.createElement('canvas'); c.width = W; c.height = H; canv.set(id, c); }
    return canv.get(id);
  };
  const api = { W, H, SQ, THREE, rng: mulberry32, ease, noise, noise2, soldier2d, soldier3d, hero2d, hero3d, scene: f => scene(f, tl), styleCanvas, story: tl.story };
  const failed = new Set();
  const fail = (what, e) => { if (!failed.has(what)) { failed.add(what); console.error(`[style-error] ${what}: ${e && e.stack || e}`); } };
  const load = async (file, what) => {
    try { const m = (await import(root + file)).default; if (m.init) await m.init(api); return m; }
    catch (e) { fail(what + ' (load)', e); return null; }
  };
  const S = [], byId = {}, T = [];                                  // copies carry the loaded module; tl itself stays plain JSON
  for (const s of tl.styles) { const e = { ...s, mod: await load(s.file, s.id) }; S.push(e); byId[s.id] = e; }
  for (const t of tl.transitions) T.push({ ...t, mod: await load(t.file, t.id) });

  const black = (c) => { const g = c.getContext('2d'); if (g.reset) g.reset(); else { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.shadowBlur = 0; g.setLineDash([]); } g.fillStyle = '#000'; g.fillRect(0, 0, W, H); return g; };
  const bad = (c, what, e) => { fail(what, e); const g = c.getContext('2d'); g.fillStyle = '#b3123a'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.font = '700 90px Inter,sans-serif'; g.fillText('FAILED: ' + what, 460, 700); };
  const renderStyle = (s, c, f, p, sc) => {
    black(c);
    const dur = s.end - s.start, st = { f, u: (f - s.start) / dur, fl: f - s.start, dur, p, tl, sc, cam: sc.cam };   // sc = scene(f): all world timing
    if (!s.mod) return bad(c, s.id, 'module did not load');
    try { s.mod.render(c, st); } catch (e) { bad(c, s.id, e); }
  };
  const primary = f => S.find(s => f >= s.start && f < s.end) || (f < S[0].start ? S[0] : S[S.length - 1]);
  const transAt = f => T.find(t => f >= t.boundary - handle && f <= t.boundary + handle - 1);

  function renderFrame(f, o = {}) {
    const p = pose(f, tl), sc = scene(f, tl), g = canvas.getContext('2d'), t = transAt(f);
    if (t) {
      const A = byId[t.from], B = byId[t.to], f0 = t.boundary - handle, pr = clamp((f - f0) / (2 * handle - 1));
      renderStyle(A, styleCanvas(A.id), f, p, sc); renderStyle(B, styleCanvas(B.id), f, p, sc);
      black(canvas);
      try {
        if (!t.mod) throw new Error('module did not load');
        t.mod.render(g, styleCanvas(A.id), styleCanvas(B.id), pr, { f, fl: f - f0, dur: 2 * handle, p, pose: p, tp: pr, A: A.id, B: B.id, b: t.boundary, tl, sc, cam: sc.cam });
      } catch (e) { bad(canvas, t.id, e); }
    } else renderStyle(primary(f), canvas, f, p, sc);
    // camera list (animator): scene().cam (f0 face zoom 1.35 -> 1 by f14, teardown push 1 -> 1.06) x bonk punches (scene.punch, ones).
    // A style with `nativeCam: true` applies s.cam itself (pixel, to stay crisp); compose then adds only the punch.
    const k = punch(f, tl), native = (t ? [byId[t.from], byId[t.to]] : [primary(f)]).every(s => s.mod && s.mod.nativeCam), cam = native ? { x: W / 2, y: H / 2, zoom: 1 } : sc.cam;
    const Z = cam.zoom * k.zoom;
    if (Math.abs(Z - 1) > 1e-4 || Math.abs(cam.x - W / 2) + Math.abs(cam.y - H / 2) + Math.abs(k.dx) + Math.abs(k.dy) > .4) {
      const tmp = styleCanvas('__shake'), tg = tmp.getContext('2d'); tg.reset ? tg.reset() : tg.setTransform(1, 0, 0, 1, 0, 0); tg.drawImage(canvas, 0, 0);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.translate(W / 2 + k.dx, H / 2 + k.dy); g.scale(Z, Z); g.translate(-cam.x, -cam.y); g.drawImage(tmp, 0, 0); g.restore();
    }
    if (o.chip ?? CHIP_ON) drawChip(g, f, tl.frames);
    if (o.debug) overlay(g, f, p, t);
    return p;
  }

  function overlay(g, f, p, t) {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.shadowBlur = 0; g.textAlign = 'left';
    g.fillStyle = 'rgba(255,40,60,.20)'; g.fillRect(420, 0, 1080, 250); g.fillRect(420, 1570, 1080, 350);     // 9:16 Shorts UI bands
    g.lineWidth = 3; g.setLineDash([]);
    g.strokeStyle = '#ff3355'; g.beginPath(); g.moveTo(420, 250); g.lineTo(1500, 250); g.moveTo(420, 1570); g.lineTo(1500, 1570); g.stroke();
    g.strokeStyle = '#ff2bd6'; g.strokeRect(420, 0, 1080, 1920);                                            // 9:16 crop
    g.strokeStyle = '#18e0ff'; g.strokeRect(0, 420, 1920, 1080);                                            // 16:9 crop
    g.strokeStyle = '#7dff3a'; g.lineWidth = 4; g.setLineDash([22, 14]); g.strokeRect(420, 420, 1080, 1080); g.setLineDash([]);   // safe square
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(940, 960); g.lineTo(980, 960); g.moveTo(960, 940); g.lineTo(960, 980); g.stroke();   // centre
    for (const h of [300, 430]) { g.beginPath(); g.moveTo(426, 960 - h / 2); g.lineTo(450, 960 - h / 2); g.moveTo(426, 960 + h / 2); g.lineTo(450, 960 + h / 2); g.stroke(); }   // 28-40% soldier height ticks
    const txt = `f${String(Math.round(f)).padStart(3, '0')}  ${p.seg} u=${p.u.toFixed(2)}  ${p.st}${t ? '  ' + t.id : ''}`;
    g.font = '500 26px JBM, monospace'; g.textBaseline = 'top';
    const w = g.measureText(txt).width; g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(430, 428, w + 16, 36);
    g.fillStyle = '#fff'; g.fillText(txt, 438, 433);
    g.restore();
  }
  globalThis.__chipOver = f => drawChip(canvas.getContext('2d'), f, tl.frames);
  return { tl, api, renderFrame, styleCanvas };
}
