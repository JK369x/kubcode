// transitions/t1-measure-wipe.js: pixel -> blueprint. A cyan dimension line (end ticks + live measurement tag) sweeps UP the frame.
// Below the line = B (blueprint), above = A (pixel). In the band just above the line, A is re-read and redrawn as paper-blue linework
// (Sobel edges) with glitch slices, so you watch pixels turn into drawn lines. Ease in/out over the 15 transition frames.
import { clamp, lerp, hash, ease } from '../core/util.js';

const W = 1920, X0 = 440, X1 = 1480, BH = 150, PAPER = [18, 52, 104], CY = '#8fecff';
let band, bg, img;

export default {
  id: 't1',
  render(g, A, B, p, s) {
    if (!band) { band = document.createElement('canvas'); band.width = W; band.height = BH; bg = band.getContext('2d'); img = bg.createImageData(W, BH); }
    const e = lerp(p, ease.io(p), .3), yl = lerp(W + 24, -24, e), f = s.f, vis = ease.io(clamp(p / .07)) * ease.io(clamp((1 - p) / .07));   // near-linear: most frames sweep the crop
    g.drawImage(A, 0, 0);
    if (yl < W) { g.save(); g.beginPath(); g.rect(0, yl, W, W - yl); g.clip(); g.drawImage(B, 0, 0); g.restore(); }
    // ---- band above the line: pixels redrawn as linework, with horizontal glitch slices
    const y0 = Math.max(0, Math.floor(yl - BH)), y1 = Math.min(W, Math.ceil(yl)), h = y1 - y0;
    if (h > 1) {
      const d = A.getContext('2d').getImageData(0, y0, W, h).data, o = img.data, L = new Float32Array(W * h), D = 2;
      for (let i = 0, j = 0; j < W * h; i += 4, j++) L[j] = .3 * d[i] + .59 * d[i + 1] + .11 * d[i + 2];
      for (let y = 0; y < h; y++) {
        const t = clamp((y + y0 - (yl - BH)) / BH), m = Math.pow(t, 1.5) * vis, ya = Math.max(0, y - D) * W, yb = Math.min(h - 1, y + D) * W;
        for (let x = 0; x < W; x++) {
          const j = y * W + x, i = j * 4, mag = Math.abs(L[y * W + Math.min(W - 1, x + D)] - L[y * W + Math.max(0, x - D)]) + Math.abs(L[yb + x] - L[ya + x]), a = clamp(mag / 42);
          o[i] = d[i] + (lerp(PAPER[0], 214, a) - d[i]) * m; o[i + 1] = d[i + 1] + (lerp(PAPER[1], 240, a) - d[i + 1]) * m; o[i + 2] = d[i + 2] + (lerp(PAPER[2], 255, a) - d[i + 2]) * m; o[i + 3] = 255;
        }
      }
      bg.putImageData(img, 0, 0);
      for (let sy = 0, k = 0; sy < h; k++) {
        const sh = Math.min(h - sy, 4 + Math.floor(hash(k * 5.7 + f) * 12)), t = clamp((sy + y0 - (yl - BH)) / BH);
        const dx = (hash(k * 9.1 + f * 3.3) - .5) * 2 * 46 * t * t * vis * (hash(k * 2.3 + f) > .4 ? 1 : .2);
        g.drawImage(band, 0, sy, W, sh, dx, y0 + sy, W, sh); sy += sh;
      }
      const tint = g.createLinearGradient(0, yl - BH, 0, yl); tint.addColorStop(0, 'rgba(90,225,255,0)'); tint.addColorStop(1, `rgba(90,225,255,${(.28 * vis).toFixed(3)})`); g.fillStyle = tint; g.fillRect(0, y0, W, h);
      g.fillStyle = `rgba(210,248,255,${(.9 * vis).toFixed(3)})`;
      for (let k = 0; k < 26; k++) { const x = hash(k * 4.1 + f * .7) * W, y = yl - 4 - Math.pow(hash(k * 6.3 + f * 1.3), 2) * 90, q = 4 + Math.floor(hash(k * 2.7 + f) * 3) * 3; g.fillRect(Math.round(x / 6) * 6, Math.round(y / 6) * 6, q, q); }   // pixel dust
    }
    // ---- light spilling from the line into the sheet below
    if (yl < W + 40) {
      g.save(); g.globalAlpha = vis; const gl = g.createLinearGradient(0, yl, 0, yl + 110); gl.addColorStop(0, 'rgba(120,232,255,.34)'); gl.addColorStop(1, 'rgba(120,232,255,0)'); g.fillStyle = gl; g.fillRect(0, yl, W, 110); g.restore();
      // ---- the dimension line: hairline full width, heavy between the end ticks, extension lines, ticks
      g.save(); g.globalAlpha = vis; g.lineCap = 'butt'; g.shadowColor = '#4fdcff'; g.shadowBlur = 22;
      g.strokeStyle = 'rgba(160,242,255,.85)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, yl); g.lineTo(W, yl); g.stroke();
      g.strokeStyle = CY; g.lineWidth = 8; g.beginPath(); g.moveTo(X0, yl); g.lineTo(X1, yl); g.stroke();
      g.lineWidth = 7; g.beginPath(); g.moveTo(X0, yl - 52); g.lineTo(X0, yl + 52); g.moveTo(X1, yl - 52); g.lineTo(X1, yl + 52); g.stroke();
      g.lineWidth = 6; g.beginPath(); g.moveTo(X0 - 26, yl + 26); g.lineTo(X0 + 26, yl - 26); g.moveTo(X1 - 26, yl + 26); g.lineTo(X1 + 26, yl - 26); g.stroke();
      g.shadowBlur = 0; g.setLineDash([22, 14]); g.lineWidth = 3; const ex = g.createLinearGradient(0, yl + 52, 0, yl + 330); ex.addColorStop(0, 'rgba(150,240,255,.8)'); ex.addColorStop(1, 'rgba(150,240,255,0)');
      g.strokeStyle = ex; g.beginPath(); g.moveTo(X0, yl + 60); g.lineTo(X0, yl + 330); g.moveTo(X1, yl + 60); g.lineTo(X1, yl + 330); g.stroke(); g.setLineDash([]);
      g.restore();
      // ---- measurement tag riding on the line: distance swept so far
      const txt = `${Math.round(clamp(W - yl, 0, W))} PX`;
      g.save(); g.globalAlpha = vis * clamp((yl - 410) / 60) * clamp((1510 - yl) / 60); g.font = '500 74px JBM, monospace'; g.textBaseline = 'alphabetic'; const tw = g.measureText(txt).width, bx = X1 - tw - 52, by = yl - 118;
      g.fillStyle = 'rgba(6,28,66,.94)'; g.strokeStyle = CY; g.lineWidth = 4; g.beginPath(); g.roundRect(bx, by, tw + 36, 92, 8); g.fill(); g.stroke();
      g.fillStyle = '#d8f8ff'; g.fillText(txt, bx + 18, by + 70); g.restore();
    }
  },
};
