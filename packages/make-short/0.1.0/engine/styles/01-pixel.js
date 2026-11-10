// styles/01-pixel.js: KIT for the pixel-RPG look (generic: palette, hallway wall + floor, door, hero sprite raster, hearts, pixel font, ring edge).
// 320x320 indexed buffer (32-colour palette), x6 nearest = 1920 master. The camera is applied NATIVELY: every world coordinate goes through
// the camera into the low-res grid and the hero is rasterised at the zoomed scale, so pixels stay square and crisp at any zoom.
// The story lives in scenes/<story>/pixel.js (door: scenes/door/pixel.js); render() delegates to it. Not time-aware: scenes read scene(f).
import { clamp } from '../core/util.js';

const BW = 320, K = 6, T = 255, INK = 25;
const HEX = 'be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e 124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569'.split(' ');
const PAL = HEX.map(h => [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)));
const BAY = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
export const bay = (x, y) => BAY[y & 3][x & 3];
const hash = n => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
// sprite palette: exact PAL entries so the mode filter never invents colours. Red (8/7) = the scarf / stand-in tunic = the film's continuity red.
const SPR = { skin: '#e8b796', skin2: '#c28569', blush: '#f6757a', hair: '#3e2731', hair2: '#733e39', eyeW: '#ffffff', pupil: '#181425', shine: '#ffffff', brow: '#3e2731', mouth: '#733e39', tongue: '#f6757a', teeth: '#ffffff',
  tunic: '#3a4466', tunic2: '#262b44', trim: '#5a6988', mitten: '#feae34', legs: '#262b44', boots: '#733e39', sole: '#3e2731', scarf: '#e43b44', scarf2: '#a22633',
  wood: '#d77643', wood2: '#b86f50', metal: '#c0cbdc', pencil: '#fee761', eraser: '#f6757a' };   // hero2d keys -> exact PAL entries; scarf red (8/7) is the continuity red
// 4-6 px proportional pixel font (only the letters the film needs)
const GL = { O: ['.##.', '#..#', '#..#', '#..#', '#..#', '.##.'], N: ['#..#', '##.#', '##.#', '#.##', '#.##', '#..#'], E: ['###', '#..', '##.', '#..', '#..', '###'], D: ['###.', '#..#', '#..#', '#..#', '#..#', '###.'],
  R: ['###.', '#..#', '#..#', '###.', '#.#.', '#..#'], T: ['###', '.#.', '.#.', '.#.', '.#.', '.#.'], W: ['#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'], L: ['#..', '#..', '#..', '#..', '#..', '###'],
  S: ['.###', '#...', '.##.', '...#', '...#', '###.'], P: ['###.', '#..#', '#..#', '###.', '#...', '#...'], U: ['#..#', '#..#', '#..#', '#..#', '#..#', '.##.'], '.': ['.', '.', '.', '.', '.', '#'], ' ': ['..', '..', '..', '..', '..', '..'] };
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];

let api, H, fb, spr, lut, low, lctx, img, hi, hctx, scn, QB = [];                                                               // QB: text boxes for the QA text check (pixel font is rectangles)
const R = 100, Z = 4;
let cam = { x: 960, y: 960, z: 1 };

const px = (x, y, c) => { if (x >= 0 && y >= 0 && x < BW && y < BW) fb[y * BW + x] = c; };
const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
const X = x => Math.round(((x - cam.x) * cam.z + 960) / K), Y = y => Math.round(((y - cam.y) * cam.z + 960) / K);             // world -> low-res (camera applied)
const WX = i => ((i * K + K / 2) - 960) / cam.z + cam.x, WY = j => ((j * K + K / 2) - 960) / cam.z + cam.y;                      // low-res -> world
const wrect = (x0, y0, x1, y1, c) => rect(X(x0), Y(y0), Math.max(1, X(x1) - X(x0)), Math.max(1, Y(y1) - Y(y0)), c);
const glyph = ch => GL[ch] || GL[' '];
function ptext(s, x, y, sc, c, sh = INK, alpha = 1) {                                                                            // low-res px; shadow + outline for legibility; alpha = ordered-dither dissolve
  const dot = (i, j, col) => { if (alpha >= .999 || bay(i, j) / 16 < alpha) px(i, j, col); };
  const draw = (ox, oy, col) => { let cx = x + ox; for (const ch of s) { const g = glyph(ch); g.forEach((row, r) => { for (let q = 0; q < row.length; q++) if (row[q] === '#') for (let b = 0; b < sc; b++) for (let a = 0; a < sc; a++) dot(cx + q * sc + a, y + oy + r * sc + b, col); }); cx += (g[0].length + 1) * sc; } };
  if (sh >= 0) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) draw(ox, oy, sh);
  draw(0, 0, c);
  QB.push([s, x * K, y * K, (x + textW(s, sc)) * K, (y + 6 * sc) * K]);
}
const textW = (s, sc) => [...s].reduce((a, ch) => a + (glyph(ch)[0].length + 1) * sc, -sc);

// ---------------------------------------------------------------- hallway: ceiling, crown, wallpaper, chair rail, wainscot, baseboard, floor
const LIGHTER = { 22: 21, 21: 20, 23: 22, 24: 23, 20: 19, 4: 3, 5: 4, 3: 2 };
function wallPix(x, y, i, j, lights) {
  let c;
  if (y < 1350) {
    if (y < 190) c = (y > 120 && bay(i, j) / 16 < (y - 120) / 70) ? 23 : 24;
    else if (y < 232) c = y < 195 ? 20 : y < 214 ? 21 : y < 226 ? 22 : 23;
    else if (y < 1034) { c = (((x % 64) + 64) % 64 < 6) ? 21 : 22; if (y > 760 && bay(i, j) / 16 < (y - 760) / 560) c = ((((x % 64) + 64) % 64 < 6)) ? 22 : 23; }
    else if (y < 1058) c = y < 1040 ? 20 : y < 1052 ? 21 : 24;
    else if (y < 1318) {
      const lx = ((x % 250) + 250) % 250, ly = y - 1058; c = 23;
      if (lx > 30 && lx < 220 && ly > 30 && ly < 250) c = (lx < 38 || ly < 38) ? 24 : (lx > 212 || ly > 242) ? 22 : (bay(i, j) / 16 < .25 ? 22 : 23);
    } else c = y < 1324 ? 3 : y < 1340 ? 4 : 5;
    if (y > 232 && y < 1318) for (const L of lights) { const d = Math.hypot(x - L[0], (y - L[1]) * 1.15); if (d < 300 && bay(i, j) / 16 < (1 - d / 300) * .95 && LIGHTER[c] != null) c = LIGHTER[c]; }
  } else {
    const d = y - 1350, ry = Math.floor(d / 64), ly = d % 64;
    c = (ry & 1) ? 4 : 3;
    if (ly < 6) c = 6; else if (((x + ry * 173) % 420 + 420) % 420 < 6) c = 6;
    else if (d < 30) c = 5;
    else if (bay(i, j) / 16 < Math.min(.9, d / 560)) c = LIGHTER[c] != null && c === 3 ? 4 : c === 4 ? 5 : c;
    if (d > 6 && d < 160) for (const L of lights) { const dd = Math.hypot(x - L[0], d * 3.2); if (dd < 320 && bay(i, j) / 16 < (1 - dd / 320) * .6 && c === 4) c = 3; }
  }
  return c;
}

// ---------------------------------------------------------------- sprite: soldier2d/hero2d at the zoomed scale -> mode filter -> 1 px ink outline
function drawSprite(p, opts) {
  spr.fill(T);
  let cy = p.y; if (H.anchors) { const A = H.anchors(p); cy = (A.top[1] + Math.max(A.feet[0][1], A.feet[1][1])) / 2; }        // window centre = middle of the kid (origin is the pelvis)
  const sx = X(p.x), sy = Y(cy), x0 = sx - R, y0 = sy - R, k = Z / K * cam.z;
  hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.clearRect(0, 0, hi.width, hi.height);
  H.drawHero(hctx, p, { stroke: false, fill: SPR, scale: k, at: [R * Z - 0, R * Z - (cy - p.y) * k], noPlank: true, ...opts });
  const d = hctx.getImageData(0, 0, hi.width, hi.height).data, W4 = hi.width, cnt = new Uint16Array(32);
  for (let j = 0; j < 2 * R; j++) for (let i = 0; i < 2 * R; i++) {
    cnt.fill(0); let op = 0;
    for (let b = 0; b < Z; b++) for (let a = 0; a < Z; a++) { const o = ((j * Z + b) * W4 + i * Z + a) * 4; if (d[o + 3] < 128) continue; cnt[lut[((d[o] >> 3) << 10) | ((d[o + 1] >> 3) << 5) | (d[o + 2] >> 3)]]++; op++; }
    if (op * 2 < Z * Z) continue;
    let best = 0, bc = -1; for (let c = 0; c < 32; c++) if (cnt[c] > bc) { bc = cnt[c]; best = c; }
    if (x0 + i >= 0 && y0 + j >= 0 && x0 + i < BW && y0 + j < BW) spr[(y0 + j) * BW + x0 + i] = best;
  }
  const o = new Uint8Array(spr);
  for (let y = 0; y < BW; y++) for (let x = 0; x < BW; x++) {
    if (spr[y * BW + x] !== T) continue;
    if ((x > 0 && spr[y * BW + x - 1] !== T) || (x < BW - 1 && spr[y * BW + x + 1] !== T) || (y > 0 && spr[(y - 1) * BW + x] !== T) || (y < BW - 1 && spr[(y + 1) * BW + x] !== T)) o[y * BW + x] = INK;
  }
  for (let i = 0; i < BW * BW; i++) if (o[i] !== T) fb[i] = o[i];
  return { sx, sy };
}

export const kit = {
  id: 'pixel', accent: '#ffffff', K, BW, px, rect, X, Y, WX, WY, wrect, ptext, textW, bay, hash,
  init(a, hero) {
    api = a; H = hero;
    fb = new Uint8Array(BW * BW); spr = new Uint8Array(BW * BW); lut = new Uint8Array(32768);
    for (let i = 0; i < 32768; i++) { const r = ((i >> 10) << 3) + 4, g = (((i >> 5) & 31) << 3) + 4, b = ((i & 31) << 3) + 4; let bd = 1e9, bi = 0; PAL.forEach((q, k) => { const e = (q[0] - r) ** 2 + (q[1] - g) ** 2 + (q[2] - b) ** 2; if (e < bd) { bd = e; bi = k; } }); lut[i] = bi; }
    low = document.createElement('canvas'); low.width = low.height = BW; lctx = low.getContext('2d'); img = lctx.createImageData(BW, BW);
    hi = document.createElement('canvas'); hi.width = hi.height = 2 * R * Z; hctx = hi.getContext('2d', { willReadFrequently: true });
  },
  begin(c) { cam = { x: c.x, y: c.y, z: c.zoom || c.z || 1 }; QB = []; },                                           // camera in master px; applied natively to everything drawn in world coordinates
  wall(lights = [[490, 790], [1700, 790]]) {
    for (let j = 0; j < BW; j++) for (let i = 0; i < BW; i++) fb[j * BW + i] = wallPix(WX(i), WY(j), i, j, lights);
    for (const L of lights) {                                                                                  // sconces
      wrect(L[0] - 10, L[1] - 40, L[0] + 10, L[1] - 24, 5); wrect(L[0] - 26, L[1] - 24, L[0] + 26, L[1] + 22, 10); wrect(L[0] - 26, L[1] - 24, L[0] + 26, L[1] - 14, 11); wrect(L[0] - 26, L[1] + 12, L[0] + 26, L[1] + 22, 9); wrect(L[0] - 8, L[1] + 22, L[0] + 8, L[1] + 40, 11);
    }
  },
  door(r, st = {}) {                                                                                           // r = {x, y, w, h, hinges[{x,y}], handle{x0,x1,y}, plate{x0,y0,x1,y1}} master px (hinges RIGHT, horizontal bar handle + PULL plate left)
    const x0 = r.x, x1 = r.x + r.w, y0 = r.y, y1 = r.y + r.h, open = clamp(st.open || 0);
    wrect(x0 - 26, y0 - 26, x1 + 26, y1, 5); wrect(x0 - 20, y0 - 20, x1 + 20, y1, 4); wrect(x0 - 20, y0 - 20, x1 + 20, y0 - 8, 3); wrect(x0 - 26, y0 - 26, x1 + 26, y0 - 20, 6);
    if (open > .02) {                                                                                          // doorway light + foreshortened leaf hinged on the right
      wrect(x0, y0, x1, y1, 19); wrect(x0 + 40, y0 + 40, x1 - 40, y1, 11);
      const wl = Math.max(14, r.w * (1 - open)); wrect(x1 - wl, y0, x1, y1, 1); wrect(x1 - wl, y0, x1 - wl + 8, y1, 5); return;
    }
    wrect(x0, y0, x1, y1, 1);
    for (let i = X(x0); i < X(x1); i++) if (hash(i * 7.1) < .5) {                                              // vertical wood grain streaks
      let j = Y(y0) + Math.floor(hash(i * 3.9) * 20);
      while (j < Y(y1)) { const len = 3 + Math.floor(hash(i * 1.3 + j) * 10), col = hash(i * 5.7 + j * .3) < .6 ? 4 : 3; for (let q = 0; q < len; q++) px(i, j + q, col); j += len + 3 + Math.floor(hash(i + j * .7) * 14); }
    }
    wrect(x0, y0, x0 + 12, y1, 3); wrect(x1 - 18, y0, x1, y1, 4); wrect(x1 - 6, y0, x1, y1, 5); wrect(x0, y0, x1, y0 + 8, 3);
    const panel = (a, b, c, d) => { wrect(a, b, c, d, 5); wrect(a + 7, b + 7, c - 7, d - 7, 4); wrect(a + 7, b + 7, c - 7, b + 14, 5); wrect(a + 7, b + 7, a + 14, d - 7, 5); wrect(a + 14, d - 14, c - 7, d - 7, 3); wrect(c - 14, b + 14, c - 7, d - 7, 3); };
    panel(x0 + 44, y0 + 50, x1 - 56, y0 + .38 * r.h); panel(x0 + 44, y0 + .66 * r.h, x1 - 56, y1 - 60);
    for (const h of (r.hinges || [.145, .5, .855].map(f => ({ x: x1, y: y0 + f * r.h })))) {                      // 3 hinges on the right edge, visible on our side
      const hy = h.y, hx = h.x, glow = st.glowHinge || 0;
      if (glow > .05) wrect(hx - 52, hy - 54, hx + 14, hy + 54, bay(1, 1) / 16 < glow ? 11 : 10);
      wrect(hx - 38, hy - 34, hx - 6, hy + 34, 24); wrect(hx - 38, hy - 34, hx - 30, hy + 34, 21); wrect(hx - 38, hy - 34, hx - 6, hy - 26, 20);
      for (const k of [-16, 0, 16]) wrect(hx - 38, hy + k, hx - 6, hy + k + 6, 25); wrect(hx - 26, hy - 30, hx - 18, hy + 30, 22);
    }
    const hd = r.handle || { x0: x0 + 18, x1: x0 + 118, y: y0 + .59 * r.h }, hy = hd.y;                         // horizontal bar handle on the left edge, two posts
    for (const px0 of [hd.x0 - 6, hd.x1 - 10]) { wrect(px0, hy - 22, px0 + 16, hy + 22, 21); wrect(px0, hy - 22, px0 + 16, hy - 16, 20); wrect(px0 + 10, hy - 22, px0 + 16, hy + 22, 22); }
    wrect(hd.x0, hy - 12, hd.x1, hy + 12, 24); wrect(hd.x0, hy - 9, hd.x1, hy + 9, 20); wrect(hd.x0, hy - 9, hd.x1, hy - 3, 19); wrect(hd.x0, hy + 4, hd.x1, hy + 9, 22);
    const pl = r.plate || { x0: x0 + 25, y0: y0 + .476 * r.h, x1: x0 + 145, y1: y0 + .476 * r.h + 55 }, glow = st.glowPlate || 0;      // PULL plate (spec: about 120 x 55)
    if (glow > .05) for (let k = 3; k > 0; k--) if (bay(2, 2) / 16 < glow) wrect(pl.x0 - k * 14, pl.y0 - k * 14, pl.x1 + k * 14, pl.y1 + k * 14, k === 1 ? 11 : 10);
    wrect(pl.x0 - 5, pl.y0 - 5, pl.x1 + 5, pl.y1 + 5, 6); wrect(pl.x0, pl.y0, pl.x1, pl.y1, 10); wrect(pl.x0, pl.y0, pl.x1, pl.y0 + 6, 11); wrect(pl.x0, pl.y1 - 6, pl.x1, pl.y1, 9);
    const sc = 1, tx = Math.round((X(pl.x0) + X(pl.x1)) / 2 - textW('PULL', sc) / 2), ty = Math.round((Y(pl.y0) + Y(pl.y1)) / 2 - 3);
    ptext('PULL', tx, ty, sc, 6, -1);
  },
  hero(p, opts) { return drawSprite(p, opts); },
  hearts(n, lost) {                                                                                           // screen-space HUD, 10 slots 60 px apart centred on x 960, y 465
    const heart = (cx, cy, fadeT = 0) => {
      for (let r = 0; r < 6; r++) for (let q = 0; q < 7; q++) if (HEART[r][q] === '#' && !(fadeT > 0 && bay(q + cx, r + cy) / 16 < fadeT)) {
        const c = (r === 1 && q === 1) ? 29 : (r >= 3 || q >= 5) ? 7 : 8;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!(HEART[r + oy] && HEART[r + oy][q + ox] === '#')) px(cx + q + ox, cy + r + oy, INK);
        px(cx + q, cy + r, c);
      }
    };
    const at = i => ({ x: Math.round((960 + (i - 4.5) * 60) / K) - 3, y: Math.round(465 / K) - 3 });
    for (let i = 0; i < Math.floor(n); i++) { const a = at(i); heart(a.x, a.y); }
    if (lost) {                                                                                                // shake, then drop and dissolve
      const a = at(lost.i), t = lost.t, shake = t < .3 ? ((Math.floor(t * 26) % 2) ? 1 : -1) : 0, drop = t < .3 ? 0 : Math.pow((t - .3) / .7, 2) * 70;
      heart(a.x + shake, a.y + Math.round(drop), t < .55 ? 0 : (t - .55) / .45);
    }
  },
  text(str, x, y, size, c = 19, alpha = 1) {                                                                   // screen-space pixel text; size = cap height in master px; (x, y) = left, baseline
    const sc = Math.max(1, Math.round(size / 36)), tx = Math.round(x / K), ty = Math.round(y / K) - 6 * sc;
    ptext(str, tx, ty, sc, c, INK, alpha);
  },
  ringEdge(g, r, cx, cy) {                                                                                     // 6 px stepped ring in white on the output canvas
    g.save(); g.fillStyle = '#ffffff'; const n = Math.max(24, Math.ceil(TAUc * r / 5));
    for (let k = 0; k < n; k++) { const a = k / n * TAUc, x = Math.round((cx + r * Math.cos(a)) / K) * K, y = Math.round((cy + r * Math.sin(a)) / K) * K; g.fillRect(x - 3, y - 3, K, K); }
    g.restore();
  },
  present(out) {
    for (let i = 0; i < BW * BW; i++) { const c = PAL[fb[i]], o = i * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255; }
    lctx.putImageData(img, 0, 0); const g = out.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(low, 0, 0, BW * K, BW * K);
    if (globalThis.QA_TEXT) for (const b of QB) globalThis.QA_TEXT(g, b[0], b[1], b[2], b[3], b[4]);
  },
};
const TAUc = Math.PI * 2;
export const ringEdge = kit.ringEdge;

async function storyOf(a) { if (a.story) return a.story; try { return (await (await fetch(new URL('../timeline.json', import.meta.url))).json()).story || 'door'; } catch (e) { return 'door'; } }   // s.tl.story: timeline.json says which scenes/<story>/ folder to use

export default {
  id: 'pixel', kind: '2d', kit, ringEdge: kit.ringEdge, nativeCam: true,                                       // nativeCam: compose skips the camera zoom; the pixel grid applies s.cam itself and stays crisp
  async init(a) {
    kit.init(a, a.hero2d || await import('../core/hero2d.js').catch(() => null) || { drawHero: (c, p, o) => a.soldier2d.drawSoldier(c, p, o), drawHeroMasks: (p, o) => a.soldier2d.drawPartMasks(p, o) });
    scn = (await import(`../scenes/${await storyOf(a)}/pixel.js`)).default; if (scn.init) await scn.init(a, kit);                     // scene contract: { init?(api, kit), render(out, s, kit) }, api first like every style
  },
  render(out, s) { scn.render(out, s, kit); },
};
