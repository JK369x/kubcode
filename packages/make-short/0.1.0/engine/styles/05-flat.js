// styles/05-flat.js: style 5, flat 2D cartoon (E-max look). This file is the KIT only (look code); the door story's content lives in
// scenes/door/flat.js and render() delegates to it (BUILD-SPEC-DOOR.md "Kit and scene split").
//   kit = { INK, C, GEO, setBoil, shape, line, hallway(g,o), door(g,rect,state), hero(g,p,f,o), hearts(g,n,heartFx), text(g,str,x,y,size), bonk(g,im,age), poof(g,x,y,t), finish(g,f,amt), ringEdge }
// Look: flat pastel fills, ink as two offset passes (thick on the shadow side, thin on the light side = tapered), line boil on twos (4 offsets),
// hue-shifted violet rim shade, paper grain stepped per 2 f, violet vignette.
import { clamp, lerp, ease, mulberry32 } from '../core/util.js';
import { mk, greyTile, TAU } from './b3-common.js';
import * as H from '../core/hero2d.js';
import { DOOR, FLOOR, HEARTS, HOME } from '../core/scene.js';

let API = null, SCENE = null;
export const INK = '#2a1d31';
// scene constants from BUILD-SPEC-DOOR.md (the real core/scene.js may export the same; the numbers are the contract)
export const GEO = { floor: FLOOR, door: { x0: DOOR.x0, x1: DOOR.x1, y0: DOOR.y0, y1: DOOR.y1 }, plate: { x0: 1060, x1: 1190, y0: 906, y1: 972 }, handle: DOOR.handle, hinges: DOOR.hinges, handleY: DOOR.handle.y, home: HOME, hearts: { cx: HEARTS.x, y: HEARTS.y, dx: HEARTS.gap } };   // numbers come from core/scene.js (plate drawn a little larger so PULL reads)
export const C = { wall: '#f8dcb8', dot: '#f1c79a', wain: '#9fd0c8', wainD: '#7fb8b0', rail: '#fff1d8', base: '#bd7f55', floor: '#dea475', floorL: '#cb8a5c', door: '#3fa59f', doorD: '#2d827f', doorL: '#6fc9bf', frame: '#fff1d8', brass: '#f2b948', metal: '#5a4a68',
  rug: '#ec8f8c', rugL: '#f8c7b6', wood: '#a46646', woodD: '#7c4a34', cream: '#fff4e0', leaf: '#5bb06e', leafD: '#3c8b57', pot: '#dc7a4e', heart: '#ec4f5a', heartD: '#b8283a', shade: 'rgba(108,66,150,.22)' };
const BO = [[0, 0], [1.5, -1.2], [-1.3, 1.4], [1, 1.7]];
let bo = BO[0];
export const setBoil = f => { bo = BO[(Math.floor(f) >> 1) & 3]; };
const rrect = (x, y, w, h, r) => g => { g.beginPath(); g.roundRect(x, y, w, h, r); };

// flat shape: fill, hue-shifted rim shade (lower right), ink as two offset passes = tapered, boiling line
export function shape(g, fill, path, w = 8, shade = false) {
  if (fill) { g.fillStyle = fill; path(g); g.fill(); }
  if (shade) { g.save(); path(g); g.clip(); g.translate(-15, -17); path(g); g.lineWidth = 36; g.strokeStyle = C.shade; g.stroke(); g.restore(); }
  g.lineJoin = g.lineCap = 'round'; g.strokeStyle = INK;
  g.save(); g.translate(bo[0] + 1.3, bo[1] + 1.8); path(g); g.lineWidth = w; g.stroke(); g.restore();
  g.save(); g.translate(bo[0] - .9, bo[1] - 1.2); path(g); g.lineWidth = w * .55; g.stroke(); g.restore();
}
export const line = (g, pts, w, col = INK) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = g.lineJoin = 'round'; g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q[0] + bo[0] * .6, q[1] + bo[1] * .6) : g.moveTo(q[0] + bo[0] * .6, q[1] + bo[1] * .6)); g.stroke(); };

// ---------------------------------------------------------------- hallway (everything except the door panel); o = {f, gap (door gap px)}
export function hallway(g, o = {}) {
  const { gap = 24 } = o, D = GEO.door, F = GEO.floor;
  g.fillStyle = C.wall; g.fillRect(-10, -10, 1940, F + 10);
  g.fillStyle = C.dot;
  for (let r = 0; r <= 9; r++) for (let c = 0; c <= 18; c++) { const x = c * 110 + (r & 1 ? 55 : 0), y = r * 110 + 30; if (y > 950) continue; g.beginPath(); g.moveTo(x, y - 13); g.lineTo(x + 10, y); g.lineTo(x, y + 13); g.lineTo(x - 10, y); g.closePath(); g.fill(); }
  // wainscot panelling + chair rail, baseboard, floor
  g.fillStyle = C.wain; g.fillRect(-10, 1030, 1940, F - 1030);
  g.fillStyle = C.wainD; for (let x = 60; x < 1920; x += 250) { g.fillRect(x, 1082, 190, 170); }
  g.strokeStyle = INK; g.lineWidth = 5; for (let x = 60; x < 1920; x += 250) { g.strokeRect(x + bo[0] * .5, 1082 + bo[1] * .5, 190, 170); }
  g.fillStyle = C.rail; g.fillRect(-10, 1018, 1940, 20); line(g, [[-10, 1018], [1930, 1018]], 5); line(g, [[-10, 1038], [1930, 1038]], 5);
  g.fillStyle = C.base; g.fillRect(-10, 1290, 1940, 60); line(g, [[-10, 1290], [1930, 1290]], 5);
  g.fillStyle = C.floor; g.fillRect(-10, F, 1940, 600);
  g.fillStyle = C.floorL; for (const dy of [0, 70, 150, 245, 360, 500]) g.fillRect(-10, F + dy, 1940, 6);
  g.fillStyle = INK; g.fillRect(-10, F - 3, 1940, 7);
  g.fillStyle = C.shade; g.fillRect(-10, F + 4, 1940, 24);
  // runner rug leading to the door
  g.fillStyle = C.rug; g.beginPath(); g.moveTo(420, F + 40); g.lineTo(1560, F + 40); g.lineTo(1640, F + 190); g.lineTo(340, F + 190); g.closePath(); g.fill(); g.strokeStyle = C.rugL; g.lineWidth = 12; g.stroke(); g.strokeStyle = INK; g.lineWidth = 6; g.stroke();
  // decoration: two pictures above his head, a sconce, a window and a plant in the 16:9 bleed
  for (const [x, y, w, h, c] of [[520, 580, 150, 190, '#8fb8e0'], [700, 620, 110, 140, '#f2b948']]) { shape(g, C.wood, rrect(x - 16, y - 16, w + 32, h + 32, 8), 8); shape(g, c, rrect(x, y, w, h, 3), 5); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x + w * .7, y + h * .3, w * .16, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(255,214,120,.22)'; g.beginPath(); g.ellipse(930, 760, 150, 190, 0, 0, TAU); g.fill();
  shape(g, '#f2b948', g => { g.beginPath(); g.moveTo(900, 790); g.lineTo(960, 790); g.lineTo(946, 730); g.lineTo(914, 730); g.closePath(); }, 7, true);
  shape(g, '#a9dcf2', rrect(110, 540, 260, 420, 16), 9); line(g, [[240, 540], [240, 960]], 8); line(g, [[110, 750], [370, 750]], 8);
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(180, 650, 50, 22, 0, 0, TAU); g.ellipse(228, 636, 38, 24, 0, 0, TAU); g.fill();
  shape(g, '#e98ba0', rrect(70, 520, 70, 460, 22), 8, true); shape(g, '#e98ba0', rrect(340, 520, 70, 460, 22), 8, true);
  const lv = [[-70, -300, -.6], [60, -330, .5], [-30, -420, -.15], [95, -230, 1.0], [-100, -190, -1.0]];
  for (const [dx, dy, a] of lv) shape(g, C.leaf, g => { g.save(); g.translate(1640, 1240); g.rotate(a); g.beginPath(); g.ellipse(dx * .35, dy * .5, 46, Math.abs(dy) * .55, 0, 0, TAU); g.restore(); }, 7, true);
  shape(g, C.pot, g => { g.beginPath(); g.moveTo(1580, 1232); g.lineTo(1702, 1232); g.lineTo(1682, 1336); g.lineTo(1600, 1336); g.closePath(); }, 8, true);
  // the gap under the door: dark space behind it
  g.fillStyle = '#241a2c'; g.fillRect(D.x0, D.y1 - gap, D.x1 - D.x0, gap); g.fillStyle = 'rgba(255,214,120,.18)'; g.fillRect(D.x0, D.y1 - 8, D.x1 - D.x0, 8);
}
// the door: casing, panel, two raised panels, vertical bar handle, 3 hinges on the RIGHT edge, PULL plate. state {open, glowPlate, glowHinge}; opts {gap}
export function door(g, rect = GEO.door, state = {}, o = {}) {
  const { x0, x1, y0 } = rect, gap = o.gap ?? 24, y1 = rect.y1 - gap, P = GEO.plate, gl = state.glowPlate || 0;
  shape(g, C.frame, rrect(x0 - 26, y0 - 26, x1 - x0 + 52, 26, 6), 8, true); shape(g, C.frame, rrect(x0 - 26, y0 - 26, 26, rect.y1 - y0 + 26, 6), 8, true); shape(g, C.frame, rrect(x1, y0 - 26, 26, rect.y1 - y0 + 26, 6), 8, true);   // casing: top + two sides, the gap stays open
  shape(g, C.door, rrect(x0, y0, x1 - x0, y1 - y0, 4), 9, true);
  shape(g, C.doorD, rrect(x0 + 34, y0 + 40, x1 - x0 - 68, 250, 14), 6); shape(g, C.doorD, rrect(x0 + 34, y0 + 330, x1 - x0 - 68, 220, 14), 6);
  shape(g, C.doorD, rrect(x0 + 34, y0 + 610 - 0, x1 - x0 - 68, Math.max(60, y1 - y0 - 650), 14), 6);
  // hinges on the RIGHT edge (our side), horizontal bar handle on the left edge
  for (const h of GEO.hinges) { shape(g, state.glowHinge ? '#ffe08a' : C.metal, rrect(h.x - 18, h.y - 40, 36, 80, 8), 6); g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(h.x - 8, h.y - 32, 6, 64); }
  const hb = GEO.handle; shape(g, C.brass, rrect(hb.x0, hb.y - 11, hb.x1 - hb.x0, 22, 11), 6); shape(g, C.brass, rrect(hb.x0 + 4, hb.y - 24, 16, 48, 6), 5); shape(g, C.brass, rrect(hb.x1 - 20, hb.y - 24, 16, 48, 6), 5);
  shape(g, gl > 0 ? '#fff2b0' : C.cream, rrect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0, 8), 7);
  if (gl > 0) { g.save(); g.globalAlpha = .5 * gl; g.fillStyle = '#ffe9a0'; g.beginPath(); g.ellipse((P.x0 + P.x1) / 2, (P.y0 + P.y1) / 2, 150, 90, 0, 0, TAU); g.fill(); g.restore(); }
  text(g, 'PULL', (P.x0 + P.x1) / 2, P.y1 - 16, 45, { align: 'center', col: '#c8283a', stroke: INK });
}
// text in this idiom: bold rounded sans, ink outline. o = {align, col, stroke}
export function text(g, str, x, y, size, o = {}) {
  g.save(); g.font = `700 ${size}px Inter, sans-serif`; g.textAlign = o.align || 'left'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  if (o.stroke !== false) { g.strokeStyle = o.stroke || INK; g.lineWidth = Math.max(4, size * .13); g.strokeText(str, x + bo[0] * .5, y + bo[1] * .5); }
  g.fillStyle = o.col || C.cream; g.fillText(str, x, y); g.restore();
}
const heartPath = (cx, cy, s) => g => { g.beginPath(); g.moveTo(cx, cy + s * .95); g.bezierCurveTo(cx - s * 1.55, cy - s * .1, cx - s * .95, cy - s * 1.25, cx, cy - s * .45); g.bezierCurveTo(cx + s * .95, cy - s * 1.25, cx + s * 1.55, cy - s * .1, cx, cy + s * .95); g.closePath(); };
// 10 hearts centred on x 960, y ~465, 60 px apart. n = hearts left, fx = scene.heartFx (0..1 over 20 f since the last bonk): the lost heart shakes 8 f, then drops
export function hearts(g, n, fx = 1) {
  const Hh = GEO.hearts, age = fx * 20;
  for (let i = 0; i < 10; i++) {
    const cx = Hh.cx + (i - 4.5) * Hh.dx; let cy = Hh.y, a = 1, rot = 0, dx = 0;
    if (i >= n) {
      if (i === n && fx < 1) { if (age < 8) { dx = Math.sin(age * 2.6) * 5 * (1 - age / 8); cy += Math.cos(age * 3.1) * 2; } else { const t = age - 8; cy += .5 * 2.6 * t * t * .5; rot = t * .08; a = clamp(1 - t / 12); } }
      else { g.save(); g.globalAlpha = .55; g.strokeStyle = INK; g.lineWidth = 3; g.setLineDash([4, 5]); heartPath(cx, cy, 17)(g); g.stroke(); g.restore(); continue; }
    }
    g.save(); g.globalAlpha = a; g.translate(cx + dx, cy); g.rotate(rot); g.translate(-cx - dx, -cy);
    shape(g, C.heart, heartPath(cx + dx, cy, 17), 6, true); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(cx + dx - 8, cy - 7, 4, 7, -.6, 0, TAU); g.fill(); g.restore();
  }
}
// cartoon impact: star burst + pow lines at the point of impact, age in frames (0..10)
export function bonk(g, im, age) {
  if (age < 0 || age > 10) return; const t = age / 10, R = 40 + 90 * ease.o(t), a = 1 - t * t;
  g.save(); g.globalAlpha = a; g.translate(im.x, im.y);
  const star = gg => { gg.beginPath(); for (let i = 0; i < 16; i++) { const an = i / 16 * TAU + .2, r = i % 2 ? R * .52 : R; gg.lineTo(Math.cos(an) * r, Math.sin(an) * r); } gg.closePath(); };
  shape(g, '#ffe27a', star, 7); g.restore();
}
export function poof(g, x, y, t) {            // dust cloud cluster, t 0..1
  const r = 15 + 22 * ease.o(t), a = 1 - t; g.save(); g.globalAlpha = a;
  for (const [ox, oy, k] of [[-r * .9, 0, 1], [r * .8, -r * .5, .85], [r * .5, r * .55, .75], [-r * .2, -r * .9, .8]]) { g.fillStyle = C.cream; g.beginPath(); g.arc(x + ox, y + oy - 30 * t, r * k, 0, TAU); g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke(); }
  g.restore();
}
// ---------------------------------------------------------------- the hero, inked
let T1 = null;
const GROUPS = () => Object.keys(H.GROUPS || { cap: 1, tunic: 1, belt: 1, skin: 1, trousers: 1, boots: 1, face: 1, plank: 1 });
const allFill = c => { const o = {}; for (const k of GROUPS()) o[k] = c; return o; };
export function hero(g, p, f, o = {}) {
  const sc = o.scale || 1, at = o.at || [p.x, p.y + (o.dy || 0)], b = BO[(Math.floor(f) >> 1) & 3], ink = allFill(INK), base = { scale: sc, noPlank: true };
  g.save(); if (o.alpha != null) g.globalAlpha = o.alpha;
  H.drawHero(g, p, { ...base, fill: ink, stroke: INK, strokeWidth: 11, at: [at[0] + 4 + b[0], at[1] + 5 + b[1]] });       // heavy ink on the shadow side
  H.drawHero(g, p, { ...base, fill: ink, stroke: INK, strokeWidth: 7, at: [at[0] - 1 + b[0] * .5, at[1] - 1.5 + b[1] * .5] }); // thin ink on the light side
  H.drawHero(g, p, { ...base, stroke: INK, strokeWidth: 4.5, at });                                                           // flat colour + inner contour lines
  const R = 600; T1 ||= mk(1200, 1200); const t = T1.g; t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, 1200, 1200);
  H.drawHero(t, p, { ...base, fill: allFill('#fff'), stroke: false, at: [R, R] });                                           // hue-shifted crescent shade, lower right, inside the silhouette
  t.globalCompositeOperation = 'destination-out'; t.drawImage(T1, -14 * sc, -16 * sc);
  t.globalCompositeOperation = 'source-in'; t.fillStyle = '#5a3a96'; t.fillRect(0, 0, 1200, 1200);
  g.globalAlpha = (o.alpha ?? 1) * .30; g.drawImage(T1, at[0] - R, at[1] - R);
  g.restore();
}
// paper grain (stepped per 2 f), soft blotches, violet vignette
let grain = null, blot = null;
export function finish(g, f, amt = 1) {
  grain ||= greyTile(512, 7, 120); blot ||= greyTile(96, 3, 70);
  const r = mulberry32(((Math.floor(f) >> 1) * 977 + 13) >>> 0), ox = (r() * 512) | 0, oy = (r() * 512) | 0;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = .38 * amt; g.fillStyle = g.createPattern(grain, 'repeat'); g.translate(-ox, -oy); g.fillRect(0, 0, 1920 + 512, 1920 + 512); g.translate(ox, oy);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = .45 * amt; g.imageSmoothingEnabled = true; g.drawImage(blot, 0, 0, 1920, 1920);
  const v = g.createRadialGradient(960, 960, 560, 960, 960, 1500); v.addColorStop(0, 'rgba(80,36,110,0)'); v.addColorStop(1, `rgba(80,36,110,${.46 * amt})`);
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 1; g.fillStyle = v; g.fillRect(0, 0, 1920, 1920);
  g.restore();
}
// ring seam edge (called by transitions/ring.js after B was drawn inside the circle): a thick boiling ink line, cream highlight inside, violet shadow outside
export function ringEdge(g, r, cx, cy, s = {}) {
  const f = s.f ?? 0, b = BO[(Math.floor(f) >> 1) & 3], n = 96, pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU, w = 1 + .006 * Math.sin(a * 5 + f * .9) + .004 * Math.sin(a * 11 + f * 1.7); pts.push([cx + Math.cos(a) * r * w + b[0], cy + Math.sin(a) * r * w + b[1]]); }
  const path = gg => { gg.beginPath(); pts.forEach((q, i) => i ? gg.lineTo(q[0], q[1]) : gg.moveTo(q[0], q[1])); gg.closePath(); };
  g.save(); g.lineJoin = 'round';
  g.strokeStyle = 'rgba(108,66,150,.28)'; g.lineWidth = 22; g.save(); g.translate(5, 6); path(g); g.stroke(); g.restore();
  g.strokeStyle = INK; g.lineWidth = 10; path(g); g.stroke();
  g.strokeStyle = C.cream; g.lineWidth = 3; g.save(); g.translate(-1.5, -2); path(g); g.stroke(); g.restore();
  g.restore();
}
export const kit = { INK, C, GEO, setBoil, shape, line, hallway, door, hero, hearts, text, bonk, poof, finish, ringEdge, allFill, rrect, heartPath, get api() { return API; } };

async function loadScene(id, api) {
  let story = 'door'; try { story = (await (await fetch(new URL('../timeline.json', import.meta.url))).json()).story || 'door'; } catch (e) {}
  const m = await import(new URL(`../scenes/${story}/${id}.js`, import.meta.url).href), sc = m.default; if (sc.init) await sc.init(api, kit); return sc;
}
export default {
  id: 'flat', kind: '2d', kit, ringEdge,
  async init(api) { API = api; SCENE = await loadScene('flat', api); },
  render(out, s) { SCENE.render(out, s, kit); },
};
