// styles/04-ascii.js: KIT for the amber-phosphor CRT look (own code; grammar from opuscar ascii-crt STYLE.md).
// Everything that is picture is a REAL JetBrains Mono glyph on a character grid. Two grids, like a terminal with a picture in it:
//   background grid 10x20 cells: hallway wall, wainscot, floor, door, sconces (fine, dim, texture)
//   hero grid       16x32 cells: the hero (COARSER than the background so outline, the two eyes and the scarf read): soldier2d/hero2d -> luminance negative
//                                -> per-cell average + local contrast -> density ramp measured from the font; silhouette edge cells get / \ | _ - glyphs.
//                                The scarf cells are drawn in RED glyphs: the one second colour, the continuity anchor.
// Crisp overlay text (real font, not through the grid): PULL plate (inverse video), hearts as <3, terminal lines. CRT post: bloom, soft scanlines,
// rolling hum bar, strip barrel warp, vignette/bezel, flicker, faint noise. The story lives in scenes/<story>/ascii.js; render() delegates to it.
import { TAU, clamp, hash, noise } from '../core/util.js';

const W = 1920;
const BC = 10, BR = 20, BFS = BC / .6, BBASE = 15, BCOLS = W / BC, BROWS = W / BR;                 // background grid (JBM advance = 0.6 em)
const HC = 16, HR = 32, HFS = HC / .6, HBASE = 24;                                                  // hero grid, coarser
const HX0 = 352, HY0 = 352, HNC = 76, HNR = 38, SX = 4, SY = 8;                                     // hero window (master px 352..1568), samples per hero cell
const COL = ['#542204', '#8c3a06', '#c45c08', '#f08008', '#ffa410', '#ffc440', '#ffe8aa'];           // phosphor ramp: deep orange -> amber -> overexposed
const RCOL = ['#52090f', '#7e0e18', '#a7131f', '#c8182a', '#da1d2e', '#e6222f', '#f0293a'];          // the scarf's red, same ramp of brightness
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const LUM = { skin: '#6e6e6e', skin2: '#585858', blush: '#666666', hair: '#303030', hair2: '#404040', eyeW: '#ffffff', pupil: '#000000', shine: '#ffffff', brow: '#d8d8d8', mouth: '#d8d8d8', tongue: '#909090', teeth: '#ffffff',
  tunic: '#808080', tunic2: '#606060', trim: '#cccccc', mitten: '#f2f2f2', legs: '#6c6c6c', boots: '#808080', sole: '#505050', scarf: '#e0e0e0', scarf2: '#c0c0c0', wood: '#a4a4a4', wood2: '#848484', metal: '#e4e4e4', pencil: '#f2f2f2', eraser: '#c4c4c4' };
const EYES = { eyeW: '#ffffff', pupil: '#000000', shine: 'rgba(0,0,0,0)', brow: 'rgba(0,0,0,0)', mouth: 'rgba(0,0,0,0)', tongue: 'rgba(0,0,0,0)', teeth: 'rgba(0,0,0,0)' };      // face layer: only sclera (white) and pupils (black)
let api, H, ramp, neg, ng, neg2, ng2, neg3, ng3, scr, sg, crt, cg, tmp, tg, b1, b1g, b2, b2g, b3, b3g, mask, noiseTile, scanPat, scn;
let bch, blv, hch, hlv, hred, OV = [];
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function makeRamp() {                                   // density ramp from the font's own measured ink coverage at the HERO cell size ("=" is kept for the floor line)
  const c = mk(HC, HR), g = c.getContext('2d', { willReadFrequently: true });
  g.font = `500 ${HFS}px JBM, monospace`; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff';
  const cov = [];
  for (const k of `.,'\`:;~-^"+*xoX%#&@`) { g.clearRect(0, 0, HC, HR); g.fillText(k, 0, HBASE); const d = g.getImageData(0, 0, HC, HR).data; let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i]; cov.push([k, s / (HC * HR * 255)]); }
  cov.sort((a, b) => a[1] - b[1]);
  const step = cov[cov.length - 1][1] / 11, out = [' ']; let last = 0;
  for (const [k, v] of cov) if (v >= last + step * .85) { out.push(k); last = v; }
  return out;
}
function makeMask() {                                   // static glass: vignette, rounded dark bezel, faint reflection
  const c = mk(W, W), g = c.getContext('2d');
  const v = g.createRadialGradient(960, 960, 560, 960, 960, 1400); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(.7, 'rgba(0,0,0,.2)'); v.addColorStop(1, 'rgba(0,0,0,.7)'); g.fillStyle = v; g.fillRect(0, 0, W, W);
  g.save(); g.beginPath(); g.rect(-100, -100, W + 200, W + 200); g.roundRect(26, 26, W - 52, W - 52, 190); g.shadowColor = '#000'; g.shadowBlur = 50; g.fillStyle = '#000'; g.fill('evenodd'); g.restore();
  const r = g.createLinearGradient(0, 0, W * .7, W * .7); r.addColorStop(0, 'rgba(255,225,170,.06)'); r.addColorStop(.35, 'rgba(255,225,170,0)'); g.fillStyle = r; g.fillRect(0, 0, W, W);
  return c;
}
const put = (c, r, ch, l) => { if (c >= 0 && c < BCOLS && r >= 0 && r < BROWS) { const i = r * BCOLS + c; bch[i] = ch; blv[i] = l; } };
const puts = (s, c, r, l) => { for (let k = 0; k < s.length; k++) put(c + k, r, s[k], l); };
const box = (c0, r0, c1, r1, l, ch = ['+', '-', '|']) => { for (let c = c0 + 1; c < c1; c++) { put(c, r0, ch[1], l); put(c, r1, ch[1], l); } for (let r = r0 + 1; r < r1; r++) { put(c0, r, ch[2], l); put(c1, r, ch[2], l); } put(c0, r0, ch[0], l); put(c1, r0, ch[0], l); put(c0, r1, ch[0], l); put(c1, r1, ch[0], l); };

function eyeBlocks(p, SCa, PUa) {                       // eyes = two bright inverse-video blocks (3x3 cells, 2-4 wide) with a dark pupil glyph cell, always one empty column between them
  const A = H.anchors && H.anchors(p); if (!A || !A.eyes) return;
  const E = A.eyes.map(e => [(e[0] - HX0) / HC, (e[1] - HY0) / HR]), K = [[], []];                         // eye centres in fractional cell coordinates
  const c0 = Math.floor(Math.min(E[0][0], E[1][0]) - 5), c1 = Math.ceil(Math.max(E[0][0], E[1][0]) + 5), r0 = Math.floor(Math.min(E[0][1], E[1][1]) - 3), r1 = Math.ceil(Math.max(E[0][1], E[1][1]) + 3);
  for (let r = Math.max(0, r0); r <= Math.min(HNR - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(HNC - 1, c1); c++) {   // split the eye cells between the two eyes by nearest anchor (the sclerae nearly touch in 3/4 view)
    const i = r * HNC + c; if (SCa[i] + PUa[i] < .25) continue;
    const d0 = Math.hypot((c + .5 - E[0][0]) * HC, (r + .5 - E[0][1]) * HR), d1 = Math.hypot((c + .5 - E[1][0]) * HC, (r + .5 - E[1][1]) * HR);
    K[d0 <= d1 ? 0 : 1].push([c, r, i]);
  }
  const B = K.map((cells, k) => {
    if (!cells.length) return { shut: true, c: Math.round(E[k][0] - .5), r: Math.round(E[k][1] - .5), x: HX0 + E[k][0] * HC, y: HY0 + E[k][1] * HR, side: E[k][0] <= E[1 - k][0] ? -1 : 1 };   // lid shut (or no eye drawn)
    let mc = 0, mr = 0, lo = 999, hi = -1, tlo = 999, thi = -1, pw = 0, pc = 0, pr = 0;
    for (const [c, r, i] of cells) { mc += c; mr += r; lo = Math.min(lo, c); hi = Math.max(hi, c); tlo = Math.min(tlo, r); thi = Math.max(thi, r); pw += PUa[i]; pc += c * PUa[i]; pr += r * PUa[i]; }
    mc /= cells.length; mr /= cells.length;
    const w = clamp(hi - lo + 1, 2, 4), h = clamp(thi - tlo + 1, 1, 3);
    return { w, h, c: Math.round(mc + .5 - w / 2), r: Math.round(mr + .5 - h / 2), pc: pw > .05 ? pc / pw : null, pr: pw > .05 ? pr / pw : null };
  });
  const [a, b] = E[0][0] <= E[1][0] ? [B[0], B[1]] : [B[1], B[0]];
  if (!a.shut && !b.shut) for (let n = 0; n < 8 && b.c < a.c + a.w + 1; n++) {                              // one empty column between the blocks: narrow first, then push apart
    if (a.w > 3) a.w--; else if (b.w > 3) b.w--; else if (n & 1) b.c++; else a.c--;
  }
  const pain = p.mouth === 'grit' || p.mouth === 'scream';                                                                // hero2d squeezes the shut eyes into < > when it hurts
  OV.push(g => {
    g.save(); g.font = `500 ${HFS}px JBM, monospace`; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    for (const e of B) {
      if (e.shut) {
        g.fillStyle = COL[6];
        if (pain) { g.font = `500 ${HFS * 3.4}px JBM, monospace`; g.textAlign = 'center'; g.strokeStyle = COL[6]; g.lineWidth = 5; g.lineJoin = 'miter'; g.strokeText(e.side < 0 ? '<' : '>', e.x, e.y + 30); g.fillText(e.side < 0 ? '<' : '>', e.x, e.y + 30); g.font = `500 ${HFS}px JBM, monospace`; g.textAlign = 'left'; }   // real big glyphs, same direction as the 2D face
        else { g.beginPath(); g.roundRect(e.x - 1.5 * HC, e.y - 5, 3 * HC, 10, 5); g.fill(); }                                      // plain shut eye: a lid bar
        continue;
      }
      const x = HX0 + e.c * HC, y = HY0 + e.r * HR, w = e.w * HC, h = e.h * HR;
      g.fillStyle = COL[6]; g.beginPath(); g.roundRect(x + 1, y + 2, w - 2, h - 4, Math.min(22, h / 3)); g.fill();    // bright sclera block (inverse video)
      if (e.h < 2) continue;
      const pw = e.w >= 3 ? 2 : 1;                                                                                  // pupil = 2 cells wide on a 3-4 wide block (the sprite's pupil is ~60% of the eye), 1 on a 2-wide one
      const pc = clamp(Math.round((e.pc ?? (e.c + (e.w - 1) / 2)) + .5 - pw / 2), e.c, e.c + e.w - pw), pr = clamp(Math.round(e.pr ?? (e.r + (e.h - 1) / 2)), e.r, e.r + e.h - 1);
      g.fillStyle = '#120803'; g.fillRect(HX0 + pc * HC + 1, HY0 + pr * HR + 3, pw * HC - 2, HR - 6);                // pupil cells: dark, with a dim glyph in each
      g.fillStyle = COL[2]; for (let k = 0; k < pw; k++) g.fillText('@', HX0 + (pc + k) * HC, HY0 + pr * HR + HBASE);
    }
    g.restore();
  });
}
function heroCells(p) {                                 // hero2d -> negative -> per-cell luminance -> glyph (coarse hero grid)
  const k = SX / HC, at = [(p.x - HX0) * k, (p.y - HY0) * k], NWd = neg.width;
  ng.setTransform(1, 0, 0, 1, 0, 0); ng.clearRect(0, 0, neg.width, neg.height);
  H.drawHero(ng, p, { stroke: '#fff', strokeWidth: 7, fill: LUM, scale: k, at, noPlank: true });
  const redParts = (H.GROUPS && H.GROUPS.scarf) ? ['scarf'] : ['tunic'];            // the red thing: the scarf (stand-in soldier: the tunic)
  ng2.setTransform(1, 0, 0, 1, 0, 0); ng2.clearRect(0, 0, neg.width, neg.height);
  H.drawHero(ng2, p, { parts: redParts, stroke: false, fill: { tunic: '#fff', scarf: '#fff' }, scale: k, at, noPlank: true });   // red layer: hero2d's scarf group
  ng3.setTransform(1, 0, 0, 1, 0, 0); ng3.clearRect(0, 0, neg.width, neg.height);
  H.drawHero(ng3, p, { parts: ['face'], stroke: false, fill: EYES, scale: k, at, noPlank: true });
  const d3 = ng3.getImageData(0, 0, neg.width, neg.height).data;
  const d = ng.getImageData(0, 0, neg.width, neg.height).data, d2 = ng2.getImageData(0, 0, neg.width, neg.height).data, N = SX * SY;
  const V = new Float32Array(HNC * HNR), Cv = new Float32Array(HNC * HNR), Rd = new Float32Array(HNC * HNR), SCa = new Float32Array(HNC * HNR), PUa = new Float32Array(HNC * HNR);
  for (let cy = 0; cy < HNR; cy++) for (let cx = 0; cx < HNC; cx++) {
    let s = 0, a = 0, q = 0, sc = 0, pu = 0;
    for (let y = 0; y < SY; y++) for (let x = 0; x < SX; x++) { const o = ((cy * SY + y) * NWd + cx * SX + x) * 4, al = d[o + 3] / 255; s += (.3 * d[o] + .59 * d[o + 1] + .11 * d[o + 2]) / 255 * al; a += al; q += d2[o + 3] / 255; const a3 = d3[o + 3] / 255, l3 = d3[o] / 255; sc += a3 * l3; pu += a3 * (1 - l3); }
    V[cy * HNC + cx] = s / N; Cv[cy * HNC + cx] = a / N; Rd[cy * HNC + cx] = q / N; SCa[cy * HNC + cx] = sc / N; PUa[cy * HNC + cx] = pu / N;
  }
  const n = ramp.length, cvAt = (x, y) => (x >= 0 && x < HNC && y >= 0 && y < HNR) ? Cv[y * HNC + x] : 0;
  for (let cy = 0; cy < HNR; cy++) for (let cx = 0; cx < HNC; cx++) {
    const i = cy * HNC + cx; if (Cv[i] < .2) continue;
    let m = 0, c = 0; for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) { const yy = cy + y, xx = cx + x; m += (yy >= 0 && yy < HNR && xx >= 0 && xx < HNC) ? V[yy * HNC + xx] : 0; c++; }
    const v = clamp(V[i] + .6 * (V[i] - m / c) + (BAYER[cy & 3][cx & 3] / 16 - .5) * .05), gl = Math.round(Math.pow(v, .8) * (n - 1)); if (gl < 1) continue;
    hch[i] = ramp[gl]; hlv[i] = clamp(Math.round(2.3 + Math.pow(v, .8) * 4.4), 3, 6); hred[i] = Rd[i] > .3 ? 1 : 0;
    if (SCa[i] + PUa[i] > .25) { hch[i] = ' '; hlv[i] = 0; hred[i] = 0; continue; }                          // eye regions are cleared; eyeBlocks() draws the round eyes on top
    const gx = cvAt(cx + 1, cy) - cvAt(cx - 1, cy), gy = cvAt(cx, cy + 1) - cvAt(cx, cy - 1), ax = Math.abs(gx), ay = Math.abs(gy);
    if (Cv[i] < .92 && Math.hypot(gx, gy) > .5 && v > .3) { hch[i] = ax > 2.2 * ay ? '|' : ay > 2.2 * ax ? (gy > 0 ? '-' : '_') : gx * gy > 0 ? '/' : '\\'; hlv[i] = 6; }
  }
  eyeBlocks(p, SCa, PUa);
}
function drawGrids(g) {
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  for (let L = 0; L < 7; L++) {
    g.fillStyle = COL[L]; g.font = `${L >= 3 ? 500 : 400} ${BFS}px JBM, monospace`;
    for (let r = 0; r < BROWS; r++) { let s = '', any = false; for (let c = 0; c < BCOLS; c++) { const i = r * BCOLS + c; if (blv[i] === L && bch[i] !== ' ') { s += bch[i]; any = true; } else s += ' '; } if (any) g.fillText(s, 0, r * BR + BBASE); }
    g.font = `500 ${HFS}px JBM, monospace`;
    for (const red of [0, 1]) {
      g.fillStyle = red ? RCOL[L] : COL[L];
      for (let r = 0; r < HNR; r++) { let s = '', any = false; for (let c = 0; c < HNC; c++) { const i = r * HNC + c; if (hlv[i] === L && hch[i] !== ' ' && hred[i] === red) { s += hch[i]; any = true; } else s += ' '; } if (any) g.fillText(s, HX0, HY0 + r * HR + HBASE); }
    }
  }
}
function barrel(dst, src, k) {                          // two strip passes approximate the glass bulge
  const S = 3, c = W / 2; tg.setTransform(1, 0, 0, 1, 0, 0); tg.fillStyle = '#000'; tg.fillRect(0, 0, W, W);
  for (let y = 0; y < W; y += S) { const ny = (y + S / 2 - c) / c, sx = 1 + k * ny * ny; tg.drawImage(src, 0, y, W, S, c - c / sx, y, W / sx, S); }
  dst.fillStyle = '#000'; dst.fillRect(0, 0, W, W);
  for (let x = 0; x < W; x += S) { const nx = (x + S / 2 - c) / c, sy = 1 + k * nx * nx; dst.drawImage(tmp, x, 0, S, W, x, c - c / sy, S, W / sy); }
}

export const kit = {
  id: 'ascii', accent: COL[5], COL, RCOL, put, puts, box, BC, BR,
  init(a, hero) {
    api = a; H = hero; ramp = makeRamp();
    neg = mk(HNC * SX, HNR * SY); ng = neg.getContext('2d', { willReadFrequently: true }); neg2 = mk(HNC * SX, HNR * SY); ng2 = neg2.getContext('2d', { willReadFrequently: true }); neg3 = mk(HNC * SX, HNR * SY); ng3 = neg3.getContext('2d', { willReadFrequently: true });
    scr = mk(W, W); sg = scr.getContext('2d'); crt = mk(W, W); cg = crt.getContext('2d'); tmp = mk(W, W); tg = tmp.getContext('2d');
    b1 = mk(480, 480); b1g = b1.getContext('2d'); b2 = mk(480, 480); b2g = b2.getContext('2d'); b3 = mk(160, 160); b3g = b3.getContext('2d'); mask = makeMask();
    noiseTile = mk(256, 256); { const g = noiseTile.getContext('2d'), id = g.createImageData(256, 256); let sd = 99; for (let i = 0; i < id.data.length; i += 4) { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; const v = sd >>> 24; id.data[i] = 255; id.data[i + 1] = 180; id.data[i + 2] = 80; id.data[i + 3] = v > 232 ? (v - 232) * 6 : 0; } g.putImageData(id, 0, 0); }
    const sc = mk(1, 8), s2 = sc.getContext('2d'); for (let y = 0; y < 8; y++) { s2.fillStyle = `rgba(0,0,0,${(.42 * (.5 - .5 * Math.cos(TAU * (y + .5) / 8))).toFixed(3)})`; s2.fillRect(0, y, 1, 1); } scanPat = sc.getContext('2d').createPattern(sc, 'repeat');
    bch = new Array(BCOLS * BROWS); blv = new Uint8Array(BCOLS * BROWS); hch = new Array(HNC * HNR); hlv = new Uint8Array(HNC * HNR); hred = new Uint8Array(HNC * HNR);
  },
  begin() { bch.fill(' '); blv.fill(0); hch.fill(' '); hlv.fill(0); hred.fill(0); OV = []; },
  wall() {                                                                           // hallway in glyphs: wallpaper dots, crown, chair rail, wainscot panels, baseboard, floor line + planks, sconces
    for (let r = 0; r < BROWS; r++) {
      const y = r * BR + 10;
      if (y < 1318) { if (y > 232 && y < 1034) for (let c = 0; c < BCOLS; c += 4) put(c, r, (r & 1) ? ':' : '.', 1); }
      else if (y > 1360 && r % 3 === 0) for (let c = 0; c < BCOLS; c++) { put(c, r, '-', 2); const j = ((c * BC + Math.floor(r / 3) * 173) % 420 + 420) % 420; if (j < BC) put(c, r + 1, '|', 2); }
    }
    for (let c = 0; c < BCOLS; c++) { put(c, 10, '=', 2); put(c, 11, '-', 1); put(c, 52, '-', 3); put(c, 66, '_', 3); put(c, 67, '=', 4); }
    for (let x = 30; x < W; x += 250) { const c0 = Math.round(x / BC), c1 = Math.round((x + 190) / BC); box(c0, 54, c1, 65, 2); for (let r = 56; r < 64; r += 2) for (let c = c0 + 2; c < c1 - 1; c += 3) put(c, r, ':', 1); }
    for (const lx of [490, 1700]) {
      const c = Math.round(lx / BC), r = 40;
      for (let dr = -6; dr <= 6; dr++) for (let dc = -14; dc <= 14; dc++) if (Math.hypot(dc / 2.2, dr) < 5.4 && hash(dc * 7.1 + dr * 3.3 + lx) < .32) put(c + dc, r + dr, '.', 1);
      puts(' _/^\\_ ', c - 3, r - 2, 3); puts('(  *  )', c - 3, r - 1, 3); put(c, r - 1, '*', 6); puts(' \\___/ ', c - 3, r, 3); put(c, r + 1, '|', 3);
    }
  },
  door(r, st = {}) {                                                                 // r = {x, y, w, h}: hinges RIGHT (3), bar handle + PULL plate left. Glyph outline, crisp inverse-video plate on top.
    const c0 = Math.round(r.x / BC), c1 = Math.round((r.x + r.w) / BC), r0 = Math.round(r.y / BR), r1 = Math.floor((r.y + r.h) / BR);
    for (let rr = r0 - 2; rr < r1; rr++) for (let c = c0 - 2; c <= c1 + 1; c++) { const edge = c < c0 || c >= c1; if (edge || rr < r0) put(c, rr, '#', 3); }
    for (let rr = r0; rr < r1; rr++) for (let c = c0; c < c1; c++) put(c, rr, ((c + rr * 2) % 4 === 0) ? ':' : ' ', 1);
    for (let rr = r0; rr < r1; rr++) { put(c0, rr, '|', 5); put(c1 - 1, rr, '|', 5); } for (let c = c0; c < c1; c++) put(c, r0, '-', 5);
    const pan = (ya, yb) => { const a = Math.round(ya / BR), b = Math.round(yb / BR); box(c0 + 4, a, c1 - 6, b, 3); for (let rr = a + 2; rr < b - 1; rr += 2) for (let c = c0 + 7; c < c1 - 8; c += 3) put(c, rr, '.', 1); };
    pan(r.y + 50, r.y + .38 * r.h); pan(r.y + .66 * r.h, r.y + r.h - 60);
    const gh = clamp(st.glowHinge || 0);
    for (const h of (r.hinges || [.145, .5, .855].map(f => ({ x: r.x + r.w, y: r.y + f * r.h })))) { const hr = Math.round(h.y / BR), hc = Math.round(h.x / BC) - 5; for (let dr = -1; dr <= 1; dr++) puts(dr === 0 ? '[8]' : '[#]', hc, hr + dr, gh > .3 ? 6 : 5); }
    const hd = r.handle || { x0: r.x + 18, x1: r.x + 118, y: r.y + .59 * r.h }, hrw = Math.round(hd.y / BR), hca = Math.round(hd.x0 / BC), hcb = Math.round(hd.x1 / BC);       // horizontal bar handle with end posts
    for (let c = hca; c <= hcb; c++) { put(c, hrw, '=', 6); put(c, hrw - 1, '_', 4); put(c, hrw + 1, '-', 4); } put(hca - 1, hrw, 'O', 6); put(hcb + 1, hrw, 'O', 6);
    const pl = r.plate || { x0: r.x + 25, y0: r.y + .476 * r.h, x1: r.x + 145, y1: r.y + .476 * r.h + 55 }, gp = clamp(st.glowPlate || 0);
    OV.push(g => {                                                                   // PULL plate: inverse video, crisp
      if (gp > .05) { g.save(); g.shadowColor = '#ffe8aa'; g.shadowBlur = 40 * gp; g.fillStyle = '#ffe8aa'; g.fillRect(pl.x0 - 8, pl.y0 - 8, pl.x1 - pl.x0 + 16, pl.y1 - pl.y0 + 16); g.restore(); }
      g.fillStyle = '#060302'; g.fillRect(pl.x0 - 6, pl.y0 - 6, pl.x1 - pl.x0 + 12, pl.y1 - pl.y0 + 12);
      g.fillStyle = COL[gp > .3 ? 6 : 5]; g.fillRect(pl.x0, pl.y0, pl.x1 - pl.x0, pl.y1 - pl.y0);
      g.fillStyle = '#100803'; g.font = '700 44px JBM, monospace'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText('PULL', (pl.x0 + pl.x1) / 2, pl.y1 - 10); g.textAlign = 'left';
    });
  },
  hero(p) { heroCells(p); },
  hearts(n, lost) {                                                                  // <3 glyphs, real text, 10 slots 60 px apart centred on x 960, y 465
    OV.push(g => {
      g.font = '700 40px JBM, monospace'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = COL[5];
      g.shadowColor = 'rgba(255,170,30,.8)'; g.shadowBlur = 14;
      for (let i = 0; i < Math.floor(n); i++) g.fillText('<3', 960 + (i - 4.5) * 60, 478);
      if (lost) { const t = lost.t, sh = t < .3 ? ((Math.floor(t * 26) % 2) ? 5 : -5) : 0, dr = t < .3 ? 0 : Math.pow((t - .3) / .7, 2) * 420; g.globalAlpha = t < .6 ? 1 : 1 - (t - .6) / .4; g.fillText('<3', 960 + (lost.i - 4.5) * 60 + sh, 478 + dr); }
      g.shadowBlur = 0; g.globalAlpha = 1; g.textAlign = 'left';
    });
  },
  pane(x, y, w, h) { OV.push(g => { g.fillStyle = 'rgba(6,3,2,.92)'; g.fillRect(x, y, w, h); g.strokeStyle = COL[3]; g.lineWidth = 3; g.strokeRect(x, y, w, h); g.lineWidth = 1.5; g.strokeRect(x + 7, y + 7, w - 14, h - 14); }); },
  text(str, x, y, size, o = {}) {                                                    // crisp terminal text: size = cap height in master px, (x, y) = left, baseline; o.lvl brightness, o.cursor, o.blink
    OV.push(g => {
      g.font = `500 ${size / .73}px JBM, monospace`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.shadowColor = 'rgba(255,160,20,.9)'; g.shadowBlur = 16;
      const pr = str.startsWith('> '); const w2 = g.measureText('> ').width;
      if (pr && !o.plain) { g.fillStyle = COL[4]; g.fillText('> ', x, y); g.fillStyle = COL[o.lvl || 6]; g.fillText(str.slice(2), x + w2, y); } else { g.fillStyle = COL[o.lvl || 6]; g.fillText(str, x, y); }
      if (o.cursor) { const tw = g.measureText(str).width; g.globalAlpha = typeof o.cursor === 'number' ? o.cursor : 1; g.fillStyle = COL[6]; g.fillRect(x + tw + 6, y - size - 2, size * .62, size + 10); g.globalAlpha = 1; }       // cursor alpha: phosphor fade, no hard toggle
      g.shadowBlur = 0;
    });
  },
  impact(x, y, t, avoid) {                                                           // glyph burst: * + x thrown off the impact point (3 f hit-stop, then they fly); never over the PULL plate (avoid rect)
    const k = Math.max(0, t - 3);
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 - 1.3 + i * .33, d = 40 + k * 28 + (i % 2) * 20, wx = x - 40 + Math.cos(a) * d, wy = y + Math.sin(a) * d; if (avoid && wx > avoid.x0 - 30 && wx < avoid.x1 + 30 && wy > avoid.y0 - 30 && wy < avoid.y1 + 30) continue; put(Math.round((x - 40 + Math.cos(a) * d) / BC), Math.round((y + Math.sin(a) * d) / BR), i % 3 === 0 ? '*' : i % 3 === 1 ? '+' : 'x', t > 6 ? 4 : 6); }
  },
  ringEdge(g, r, cx, cy) {                                                           // phosphor ring: 7 px amber line with glow and a dashed hot inner line
    g.save(); g.strokeStyle = COL[5]; g.shadowColor = '#ff9a10'; g.shadowBlur = 26; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); g.shadowBlur = 0;
    g.strokeStyle = COL[6]; g.lineWidth = 2; g.setLineDash([14, 8]); g.beginPath(); g.arc(cx, cy, r - 8, 0, TAU); g.stroke(); g.restore();
  },
  present(out, f) {
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalAlpha = 1; sg.shadowBlur = 0; sg.fillStyle = '#060302'; sg.fillRect(0, 0, W, W);
    drawGrids(sg); for (const fn of OV) { sg.save(); fn(sg); sg.restore(); }
    b1g.clearRect(0, 0, 480, 480); b1g.drawImage(scr, 0, 0, 480, 480);
    b2g.clearRect(0, 0, 480, 480); b2g.filter = 'blur(4px)'; b2g.drawImage(b1, 0, 0); b2g.filter = 'none';
    b3g.clearRect(0, 0, 160, 160); b3g.filter = 'blur(3px)'; b3g.drawImage(scr, 0, 0, 160, 160); b3g.filter = 'none';
    cg.setTransform(1, 0, 0, 1, 0, 0); cg.globalAlpha = 1; cg.globalCompositeOperation = 'source-over'; cg.drawImage(scr, 0, 0);
    cg.globalCompositeOperation = 'lighter'; cg.globalAlpha = .75; cg.drawImage(b2, 0, 0, W, W); cg.globalAlpha = .5; cg.drawImage(b3, 0, 0, W, W);
    cg.globalCompositeOperation = 'source-over'; cg.globalAlpha = 1; cg.fillStyle = scanPat; cg.fillRect(0, 0, W, W);
    const bar = ((f * 7) % (W + 500)) - 400, bg = cg.createLinearGradient(0, bar, 0, bar + 400); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(.5, 'rgba(0,0,0,.14)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
    cg.fillStyle = bg; cg.fillRect(0, bar, W, 400);
    const g = out.getContext('2d'); barrel(g, crt, .03);
    g.save(); g.globalAlpha = .08; const nf = Math.floor(f / 6); g.translate((hash(nf * 1.7) * 256) | 0, (hash(nf * 3.1) * 256) | 0); g.fillStyle = g.createPattern(noiseTile, 'repeat'); g.fillRect(-256, -256, W + 512, W + 512); g.restore();
    g.drawImage(mask, 0, 0);
    const fl = .035 * (.5 + .5 * noise(f * 1.9, 5)); g.fillStyle = `rgba(0,0,0,${fl.toFixed(3)})`; g.fillRect(0, 0, W, W);
  },
};
export const ringEdge = kit.ringEdge;

async function storyOf(a) { if (a.story) return a.story; try { return (await (await fetch(new URL('../timeline.json', import.meta.url))).json()).story || 'door'; } catch (e) { return 'door'; } }   // timeline.json "story" picks scenes/<story>/

export default {
  id: 'ascii', kind: '2d', kit, ringEdge: kit.ringEdge,
  async init(a) {
    kit.init(a, a.hero2d || await import('../core/hero2d.js').catch(() => null) || { drawHero: (c, p, o) => a.soldier2d.drawSoldier(c, p, o), drawHeroMasks: (p, o) => a.soldier2d.drawPartMasks(p, o) });
    scn = (await import(`../scenes/${await storyOf(a)}/ascii.js`)).default; if (scn.init) await scn.init(a, kit);                     // scene contract: { init?(api, kit), render(out, s, kit) }, api first like every style
  },
  render(out, s) { scn.render(out, s, kit); },
};
